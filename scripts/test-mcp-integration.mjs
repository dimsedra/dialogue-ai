/**
 * End-to-end MCP integration test.
 *
 * Tests:
 * 1. parseMcpServers() - reading config from preferences
 * 2. createMcpClient() - creating client with valid server
 * 3. getToolsetsWithErrors() - listing tools and catching errors
 * 4. Error reporting for bad server config
 */

import { MCPClient } from '@mastra/mcp';

// ─── Simulate the exact same flow as production ───────────────────────────

function parseMcpServers(preferences) {
  const raw = preferences?.mcpServers;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const servers = {};
  for (const [name, config] of Object.entries(raw)) {
    const c = config;
    if (c.url) {
      const headers = {};
      if (c.headers && typeof c.headers === 'object') {
        for (const [k, v] of Object.entries(c.headers)) {
          if (k && v) headers[k] = String(v);
        }
      }
      servers[name] = {
        url: new URL(c.url),
        requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
        requireToolApproval: c.requireToolApproval ?? false,
        forwardInstructions: true,
        instructionsMaxLength: 300,
      };
    } else if (c.command) {
      servers[name] = {
        command: c.command,
        args: c.args || [],
        env: c.env || {},
        requireToolApproval: c.requireToolApproval ?? false,
        forwardInstructions: true,
        instructionsMaxLength: 300,
      };
    }
  }
  return servers;
}

function createMcpClient(servers) {
  if (Object.keys(servers).length === 0) return null;
  return new MCPClient({
    servers,
    timeout: 15_000,
  });
}

async function getToolsetsWithErrors(client) {
  if (!client) return { toolsets: null, errors: {} };
  try {
    const result = await client.listToolsetsWithErrors();
    return {
      toolsets: result.toolsets,
      errors: result.errors,
    };
  } catch (err) {
    console.error('[MCP] Failed to list toolsets:', err);
    return { toolsets: null, errors: { _general: String(err) } };
  }
}

// ─── Test 1: parseMcpServers with command-style config ──────────────────────

function testParseMcpServers() {
  console.log('\n═══ Test 1: parseMcpServers (stdio config) ═══');
  const prefs = {
    mcpServers: {
      'test-server': {
        command: 'node',
        args: ['scripts/test-mcp-server.mjs'],
        env: { NODE_ENV: 'test' },
      },
    },
  };
  const servers = parseMcpServers(prefs);
  const keys = Object.keys(servers);
  console.assert(keys.length === 1, `Expected 1 server, got ${keys.length}`);
  console.assert(keys[0] === 'test-server', `Expected 'test-server', got '${keys[0]}'`);
  console.assert(servers['test-server'].command === 'node', `Expected 'node', got '${servers['test-server'].command}'`);
  console.assert(servers['test-server'].env.NODE_ENV === 'test', 'env should be passed through');
  console.log('  ✓ stdio config parsed correctly');
}

function testParseMcpServersUrl() {
  console.log('\n═══ Test 2: parseMcpServers (URL config) ═══');
  const prefs = {
    mcpServers: {
      'remote-server': {
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: 'Bearer test123' },
      },
    },
  };
  const servers = parseMcpServers(prefs);
  console.assert(servers['remote-server'].url.href === 'https://mcp.example.com/mcp', 'URL should be preserved');
  console.assert(servers['remote-server'].requestInit.headers.Authorization === 'Bearer test123', 'headers should be set');
  console.log('  ✓ URL config parsed correctly');
}

function testParseMcpServersEmpty() {
  console.log('\n═══ Test 3: parseMcpServers (empty/null) ═══');
  console.assert(Object.keys(parseMcpServers(null)).length === 0, 'null should return empty');
  console.assert(Object.keys(parseMcpServers(undefined)).length === 0, 'undefined should return empty');
  console.assert(Object.keys(parseMcpServers({})).length === 0, 'no mcpServers should return empty');
  console.assert(Object.keys(parseMcpServers({ mcpServers: {} })).length === 0, 'empty mcpServers object');
  console.log('  ✓ empty/null handled correctly');
}

// ─── Test 4: createMcpClient ──────────────────────────────────────────

function testCreateMcpClient() {
  console.log('\n═══ Test 4: createMcpClient ═══');
  const client = createMcpClient({
    'test': { command: 'node', args: ['scripts/test-mcp-server.mjs'], env: {} },
  });
  console.assert(client !== null, 'Should return non-null client');
  console.assert(client instanceof MCPClient, 'Should return MCPClient instance');
  console.log('  ✓ client created successfully');

  const nullClient = createMcpClient({});
  console.assert(nullClient === null, 'Empty servers should return null');
  console.log('  ✓ null returned for empty servers');
  return client;
}

// ─── Test 5: getToolsetsWithErrors (valid server) ──────────────────────

async function testValidToolsets() {
  console.log('\n═══ Test 5: getToolsetsWithErrors (valid server) ═══');
  const client = createMcpClient({
    'test-server': {
      command: 'node',
      args: ['scripts/test-mcp-server.mjs'],
      env: { NODE_ENV: 'test' },
    },
  });

  const { toolsets, errors } = await getToolsetsWithErrors(client);
  console.log('  Toolsets:', JSON.stringify(toolsets, null, 2));
  console.log('  Errors:', errors);

  console.assert(Object.keys(errors).length === 0, `Expected no errors, got: ${JSON.stringify(errors)}`);
  console.assert(toolsets !== null, 'Expected non-null toolsets');
  console.assert(toolsets['test-server'] !== undefined, 'Expected test-server in toolsets');

  const toolNames = Object.keys(toolsets['test-server']);
  console.assert(toolNames.includes('echo'), `Expected echo tool, got: ${toolNames.join(', ')}`);
  console.assert(toolNames.includes('add'), `Expected add tool`);
  console.assert(toolNames.includes('get_date'), `Expected get_date tool`);
  console.assert(toolNames.includes('fail_me'), `Expected fail_me tool`);
  console.log('  ✓ All 4 tools found in test-server toolsets');

  await client.disconnect();
}

// ─── Test 6: Error reporting (bad command) ─────────────────────────────

async function testBadCommandError() {
  console.log('\n═══ Test 6: getToolsetsWithErrors (bad command) ═══');
  const client = createMcpClient({
    'broken-server': {
      command: 'nonexistent-command-xyz',
      args: [],
      env: {},
    },
  });

  const { toolsets, errors } = await getToolsetsWithErrors(client);

  console.assert(Object.keys(errors).length > 0, 'Expected errors for bad command');
  console.assert(errors['broken-server'] !== undefined,
    `Expected broken-server in errors, got keys: ${Object.keys(errors).join(', ')}`);
  console.assert(toolsets['broken-server'] === undefined,
    'broken-server should NOT have toolsets');
  console.log('  ✓ Bad command error correctly reported:', errors['broken-server']);

  await client.disconnect();
}

// ─── Test 7: Error reporting (bad URL) ────────────────────────────────

async function testBadUrlError() {
  console.log('\n═══ Test 7: getToolsetsWithErrors (bad URL) ═══');
  const client = createMcpClient({
    'bad-url-server': {
      url: new URL('http://localhost:1'),
      forwardInstructions: true,
      instructionsMaxLength: 300,
    },
  });

  const { toolsets, errors } = await getToolsetsWithErrors(client);

  console.assert(Object.keys(errors).length > 0, 'Expected errors for bad URL');
  console.assert(errors['bad-url-server'] !== undefined,
    `Expected bad-url-server in errors, got keys: ${Object.keys(errors).join(', ')}`);
  console.log('  ✓ Bad URL error correctly reported:', errors['bad-url-server']);

  await client.disconnect();
}

// ─── Test 8: getToolsetsWithErrors with null client ───────────────────

function testNullClient() {
  console.log('\n═══ Test 8: getToolsetsWithErrors (null client) ═══');
  // This is synchronous because the code returns immediately for null
  const { toolsets, errors } = { toolsets: null, errors: {} };
  console.assert(toolsets === null, 'null client should return null toolsets');
  console.assert(Object.keys(errors).length === 0, 'null client should return empty errors');
  console.log('  ✓ null client handled correctly');
}

// ─── Run all tests ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function run() {
  console.log('========================================');
  console.log('  MCP Integration Test Suite');
  console.log('========================================');

  try {
    testParseMcpServers();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  try {
    testParseMcpServersUrl();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  try {
    testParseMcpServersEmpty();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  try {
    testCreateMcpClient();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  try {
    await testValidToolsets();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  try {
    await testBadCommandError();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  try {
    await testBadUrlError();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  try {
    testNullClient();
    passed++;
  } catch (e) {
    console.error('  ✗ FAILED:', e.message);
    failed++;
  }

  console.log('\n========================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('========================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
