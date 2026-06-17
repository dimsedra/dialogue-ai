const http = require('http');
const url = require('url');

let getLlama = null;
let LlamaChatSession = null;
let defineChatSessionFunction = null;

async function initNodeLlamaCpp() {
  if (getLlama) return;
  try {
    const nodeLlamaCpp = await import('node-llama-cpp');
    getLlama = nodeLlamaCpp.getLlama;
    LlamaChatSession = nodeLlamaCpp.LlamaChatSession;
    defineChatSessionFunction = nodeLlamaCpp.defineChatSessionFunction;
  } catch (e) {
    console.error('[LLM Runner] Failed to import node-llama-cpp dynamically:', e);
    throw e;
  }
}

let llama = null;
let model = null;
let context = null;
let session = null;

let idleTimer = null;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  idleTimer = setTimeout(() => {
    if (runnerStatus.status === 'ready') {
      console.log("[LLM Runner] Model idle for 10 minutes. Auto-unloading to free memory.");
      unloadModel().catch(err => {
        console.error("[LLM Runner] Auto-unload failed:", err);
      });
    }
  }, IDLE_TIMEOUT_MS);
}

const runnerStatus = {
  status: "unloaded", // unloaded, loading, ready, error
  modelPath: null,
  contextSize: 4096,
  gpuLayers: 99,
  threads: 4,
  error: null
};

function pathsEqual(p1, p2) {
  if (!p1 || !p2) return false;
  const n1 = String(p1).replace(/\\/g, '/').toLowerCase();
  const n2 = String(p2).replace(/\\/g, '/').toLowerCase();
  return n1 === n2;
}

async function unloadModel() {
  try {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (session) {
      session = null;
    }
    if (context) {
      await context.dispose();
      context = null;
    }
    if (model) {
      await model.dispose();
      model = null;
    }
    runnerStatus.status = "unloaded";
    runnerStatus.modelPath = null;
    runnerStatus.error = null;
    console.log("[LLM Runner] Model unloaded successfully.");

    if (global.gc) {
      global.gc();
      console.log("[LLM Runner] Forced garbage collection complete.");
    }
  } catch (err) {
    runnerStatus.status = "error";
    runnerStatus.error = err.message || String(err);
    console.error("[LLM Runner] Error during unload:", err);
  }
}

async function loadModel({ modelPath, contextSize = 4096, gpuLayers = 99, threads = 4 }) {
  await initNodeLlamaCpp();

  try {
    console.log(`[LLM Runner] Starting load: ${modelPath}`);
    await unloadModel();

    runnerStatus.status = "loading";
    runnerStatus.modelPath = modelPath;
    runnerStatus.contextSize = contextSize;
    runnerStatus.gpuLayers = gpuLayers;
    runnerStatus.threads = threads;
    runnerStatus.error = null;

    if (!llama) {
      llama = await getLlama();
    }

    model = await llama.loadModel({
      modelPath: modelPath,
      gpuLayers: gpuLayers
    });

    context = await model.createContext({
      contextSize: contextSize,
      threads: threads
    });

    session = new LlamaChatSession({
      contextSequence: context.getSequence()
    });

    runnerStatus.status = "ready";
    console.log(`[LLM Runner] Model loaded successfully on ready status.`);
    resetIdleTimer();
  } catch (err) {
    runnerStatus.status = "error";
    runnerStatus.error = err.message || String(err);
    console.error("[LLM Runner] Failed to load model:", err);
  }
}

function convertOpenAiHistoryToLlama(messages) {
  if (!messages || !Array.isArray(messages)) return [];
  
  const history = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      history.push({ type: 'system', text: msg.content || '' });
    } else if (msg.role === 'user') {
      history.push({ type: 'user', text: msg.content || '' });
    } else if (msg.role === 'assistant') {
      let text = msg.content || '';
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          text += `\n[Call Tool: ${tc.function?.name || 'unknown'} with args ${tc.function?.arguments || '{}'}]`;
        }
      }
      history.push({ type: 'model', response: [text] });
    } else if (msg.role === 'tool') {
      history.push({ type: 'system', text: `[Tool Result for call ID ${msg.tool_call_id || 'unknown'}]: ${msg.content || ''}` });
    }
  }
  return history;
}

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);

  if (parsedUrl.pathname === '/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runnerStatus));
    return;
  }

  if (parsedUrl.pathname === '/unload' && req.method === 'POST') {
    unloadModel()
      .then(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, ...runnerStatus }));
      })
      .catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  if (parsedUrl.pathname === '/load' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const params = JSON.parse(body);
        if (!params.modelPath) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: "Missing modelPath" }));
          return;
        }

        const isSameModel = pathsEqual(runnerStatus.modelPath, params.modelPath) &&
                            runnerStatus.contextSize === Number(params.contextSize || 4096) &&
                            runnerStatus.gpuLayers === Number(params.gpuLayers ?? 99) &&
                            runnerStatus.threads === Number(params.threads || 4);

        console.log("[LLM Runner] /load comparing configs:", {
          runner: {
            modelPath: runnerStatus.modelPath,
            contextSize: runnerStatus.contextSize,
            gpuLayers: runnerStatus.gpuLayers,
            threads: runnerStatus.threads,
            status: runnerStatus.status
          },
          incoming: {
            modelPath: params.modelPath,
            contextSize: params.contextSize,
            gpuLayers: params.gpuLayers,
            threads: params.threads
          },
          isSameModel
        });

        if (isSameModel && (runnerStatus.status === 'ready' || runnerStatus.status === 'loading')) {
          console.log(`[LLM Runner] Model already loaded/loading with same config: ${params.modelPath}`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: runnerStatus.status, modelPath: runnerStatus.modelPath }));
          return;
        }

        // Respond immediately that we are loading
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: "loading", modelPath: params.modelPath }));

        // Perform load asynchronously
        loadModel(params).catch(err => {
          console.error("[LLM Runner] Async load failed:", err);
        });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: "Invalid JSON body: " + err.message }));
      }
    });
    return;
  }

  if (parsedUrl.pathname === '/v1/chat/completions' && req.method === 'POST') {
    if (runnerStatus.status !== 'ready' || !session) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Local LLM is not ready. Status: ${runnerStatus.status}` }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      resetIdleTimer();
      try {
        const payload = JSON.parse(body);
        const messages = payload.messages || [];
        if (messages.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: "Messages array cannot be empty" }));
          return;
        }

        const userMsgObj = messages[messages.length - 1];
        const userPrompt = userMsgObj.content || '';
        const history = convertOpenAiHistoryToLlama(messages.slice(0, -1));

        session.setChatHistory(history);

        const toolCallsTriggered = [];
        const functions = {};

        if (payload.tools && Array.isArray(payload.tools)) {
          for (const t of payload.tools) {
            if (t.type === 'function' && t.function) {
              const fName = t.function.name;
              functions[fName] = defineChatSessionFunction({
                description: t.function.description || '',
                params: t.function.parameters || { type: 'object', properties: {} },
                handler(params) {
                  toolCallsTriggered.push({
                    id: 'call_' + Math.random().toString(36).substring(2, 11),
                    type: 'function',
                    function: {
                      name: fName,
                      arguments: JSON.stringify(params)
                    }
                  });
                  throw new Error('__TOOL_CALL_ABORT__');
                }
              });
            }
          }
        }

        const stream = !!payload.stream;
        const temperature = payload.temperature ?? 0.7;
        const topP = payload.top_p ?? 0.9;
        const maxTokens = payload.max_tokens ?? 2048;

        if (stream) {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
        }

        try {
          let textBuffer = '';
          await session.prompt(userPrompt, {
            functions: Object.keys(functions).length > 0 ? functions : undefined,
            temperature: temperature,
            topP: topP,
            maxTokens: maxTokens,
            onTextChunk(chunk) {
              if (stream) {
                res.write(`data: ${JSON.stringify({
                  choices: [{
                    delta: { content: chunk },
                    finish_reason: null,
                    index: 0
                  }]
                })}\n\n`);
              } else {
                textBuffer += chunk;
              }
            }
          });

          // Finished successfully
          if (stream) {
            res.write(`data: ${JSON.stringify({
              choices: [{
                delta: {},
                finish_reason: "stop",
                index: 0
              }]
            })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              choices: [{
                message: { role: 'assistant', content: textBuffer },
                finish_reason: 'stop',
                index: 0
              }]
            }));
          }
        } catch (promptErr) {
          if (promptErr.message === '__TOOL_CALL_ABORT__' || promptErr.message.includes('__TOOL_CALL_ABORT__')) {
            // Function call triggered
            if (stream) {
              res.write(`data: ${JSON.stringify({
                choices: [{
                  delta: {
                    tool_calls: toolCallsTriggered.map((tc, idx) => ({
                      index: idx,
                      id: tc.id,
                      type: 'function',
                      function: tc.function
                    }))
                  },
                  finish_reason: "tool_calls",
                  index: 0
                }]
              })}\n\n`);
              res.write('data: [DONE]\n\n');
              res.end();
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: toolCallsTriggered
                  },
                  finish_reason: 'tool_calls',
                  index: 0
                }]
              }));
            }
          } else {
            throw promptErr;
          }
        }
      } catch (err) {
        console.error("[LLM Runner] completions error:", err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message || String(err) }));
        } else {
          res.end();
        }
      } finally {
        resetIdleTimer();
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: "Not found" }));
});

let port = 11430;
function startServer() {
  server.listen(port, '127.0.0.1', () => {
    console.log(`[LLM Runner] LISTENING ON PORT ${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[LLM Runner] Port ${port} in use, trying next...`);
      port++;
      startServer();
    } else {
      console.error("[LLM Runner] Server startup error:", err);
    }
  });
}

startServer();
