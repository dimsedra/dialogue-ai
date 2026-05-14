interface LMToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface LMMessage {
  role: string;
  content: string | null;
  tool_calls?: LMToolCall[];
}

export async function processLocalLLMRequest({
  systemInstruction,
  recentMessages,
  userText,
}: {
  systemInstruction: string;
  recentMessages: { author: string; text: string }[];
  userText: string;
}) {
  const openAiTools = [
    {
      type: "function",
      function: {
        name: "addTask",
        description: "Adds a new task to the user's list with optional priority, category, and notes.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The task description" },
            dueDate: { type: "string", description: "Optional due date or time (e.g. 'tomorrow 10pm')" },
            priority: { type: "string", enum: ["low", "medium", "high"], description: "Optional priority" },
            category: { type: "string", description: "Optional category" },
            notes: { type: "string", description: "Optional extra notes or context" },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "completeTask",
        description: "Marks a task as finished/completed by its ID.",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "The ID of the task to complete" },
          },
          required: ["taskId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deleteTask",
        description: "PERMANENTLY removes a task from the user's list by its ID.",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "The ID of the task to delete" },
          },
          required: ["taskId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "addEvent",
        description: "Schedules a new event with start and end times. Events are time-blocks on a calendar.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "The event title" },
            startTime: { type: "string", description: "ISO-8601 start time" },
            endTime: { type: "string", description: "ISO-8601 end time" },
            location: { type: "string", description: "Optional location" },
            notes: { type: "string", description: "Optional extra notes or context" },
          },
          required: ["title", "startTime", "endTime"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "deleteEvent",
        description: "Removes a scheduled event by its ID.",
        parameters: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "The ID of the event to delete" },
          },
          required: ["eventId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "updateMemory",
        description: "Updates the long-term memory/bio of the user.",
        parameters: {
          type: "object",
          properties: {
            bio: { type: "string", description: "The updated bio/personality summary" },
          },
          required: ["bio"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "searchWeb",
        description: "Call this for real-time info or broad research. You can perform multiple searches in one turn if needed.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
          },
          required: ["query"],
        },
      },
    },
  ];

  const messages = [
    { role: "system", content: systemInstruction },
    ...recentMessages.map(m => ({
      role: m.author === "AI" ? "assistant" : "user",
      content: m.text,
    })),
    { role: "user", content: userText }
  ];

  try {
    const res = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_LM_API_TOKEN || "lm-studio"}` 
      },
      body: JSON.stringify({
        model: "local-model",
        messages,
        tools: openAiTools,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      throw new Error(`LM Studio API Error: ${res.statusText}`);
    }

    const data = await res.json();
    const message: LMMessage = data.choices[0].message;
    let aiText = message.content || "";
    let toolCall = null;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCalls: LMToolCall[] = message.tool_calls;
      const searchCalls = toolCalls.filter((c: LMToolCall) => c.function.name === "searchWeb");
      const otherCall = toolCalls.find((c: LMToolCall) => c.function.name !== "searchWeb");

      if (otherCall || searchCalls.length > 0) {
        const primaryCall = otherCall || searchCalls[0];
        toolCall = {
          name: primaryCall.function.name,
          args: JSON.parse(primaryCall.function.arguments)
        };
      }

      if (searchCalls.length > 0) {
        const tavilyKey = process.env.NEXT_PUBLIC_TAVILY_API_KEY;
        const searchResults = await Promise.all(searchCalls.map(async (call: LMToolCall) => {
          const callArgs = JSON.parse(call.function.arguments);
          let content = "Search failed.";
          if (tavilyKey) {
            try {
              const tvlyRes = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_key: tavilyKey, query: callArgs.query, include_answer: true }),
              });
              const tvlyData = await tvlyRes.json();
              content = tvlyData.answer || (tvlyData.results ? tvlyData.results.map((r: { content: string }) => r.content).join("\n") : "No results found.");
            } catch {
              content = `Error searching for "${callArgs.query}"`;
            }
          }
          return {
            role: "tool",
            tool_call_id: call.id,
            name: "searchWeb",
            content
          };
        }));

        const feedbackRes = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.NEXT_PUBLIC_LM_API_TOKEN || "lm-studio"}` 
          },
          body: JSON.stringify({
            model: "local-model",
            messages: [
              ...messages,
              message,
              ...searchResults
            ],
            temperature: 0.7,
          }),
        });

        if (feedbackRes.ok) {
          const feedbackData = await feedbackRes.json();
          aiText = feedbackData.choices[0].message.content || "";
        }
      }
      
      if (!aiText) {
        aiText = "I've processed that for you.";
      }
    }

    return { aiText, toolCall };
  } catch (error) {
    console.error("Local LLM Request failed:", error);
    throw error;
  }
}
