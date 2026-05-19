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
        description: "CRITICAL MANDATE: DO NOT call this tool on the first turn when a user requests to add a task. You MUST ask the user to clarify and confirm the exact details (priority, category, due date) first in conversational text. Only call this tool AFTER the user explicitly says the plan is perfect.",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The task description" },
            dueDate: { type: "string", description: "Mandatory ISO-8601 due date/time (e.g. '2026-05-15T22:00:00'). Use 24-hour format." },
            priority: { type: "string", enum: ["low", "medium", "high"], description: "Optional priority" },
            category: { type: "string", description: "Optional category" },
            notes: { type: "string", description: "Optional extra notes or context" },
            progress: { type: "number", description: "Initial progress (0-100)" },
            statusHook: { type: "string", description: "A single punchy sentence summarizing current state" },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "completeTask",
        description: "Marks a task as finished/completed by its ID. CRITICAL MANDATE: When a user mentions task progress reaches 100%, DO NOT call completeTask immediately. You MUST ask the user for confirmation first in conversational text before calling this tool.",
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
        name: "updateTask",
        description: "Updates an existing task. If updating context/notes, maintain chronological journal format.",
        parameters: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "The ID of the task to update" },
            text: { type: "string", description: "Updated task description" },
            completed: { type: "boolean", description: "Whether the task is finished" },
            dueDate: { type: "string", description: "Updated ISO-8601 due date/time (24-hour, e.g. '2026-05-15T14:00:00')." },
            priority: { type: "string", enum: ["low", "medium", "high"], description: "Updated priority" },
            category: { type: "string", description: "Updated category" },
            notes: { type: "string", description: "Chronological journal of this task's history. When updating, NEVER overwrite previous entries. Always APPEND your new update on a new line starting with today's date and time in brackets [YYYY-MM-DD HH:mm]." },
            progress: { type: "number", description: "Estimated progress 0-100. Infer naturally from conversation — do NOT ask the user 'what percentage is completed?'" },
            statusHook: { type: "string", description: "A single punchy sentence summarizing the latest current state. Used directly for quick UI glances and notifications." },
          },
          required: ["taskId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "addEvent",
        description: "CRITICAL MANDATE: DO NOT call this tool on the first turn when a user requests to schedule an event. You MUST ask the user to clarify and confirm all details (start time, event type, recurrence) first in conversational text. Only call this tool AFTER the user explicitly confirms the plan.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "The event title" },
            description: { type: "string", description: "Optional description" },
            startTime: { type: "string", description: "ISO-8601 start time (24-hour format, e.g. '2026-05-15T11:50:00')" },
            endTime: { type: "string", description: "Optional ISO-8601 end time (24-hour format). Required for interval events; omit for point events." },
            eventType: { type: "string", description: "'interval' for duration events or 'point' for momentary events (deadlines, drops, releases)." },
            location: { type: "string", description: "Optional location" },
            notes: { type: "string", description: "Optional extra notes or context" },
            outcome: { type: "string", description: "Post-event summary or outcome" },
            statusHook: { type: "string", description: "A single punchy sentence summarizing current state" },
          },
          required: ["title", "startTime", "eventType"],
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
        name: "updateEvent",
        description: "Updates an existing scheduled event by its ID. Provide only the fields you want to change.",
        parameters: {
          type: "object",
          properties: {
            eventId: { type: "string", description: "The ID of the event to update" },
            title: { type: "string", description: "The new event title" },
            description: { type: "string", description: "The new description" },
            startTime: { type: "string", description: "ISO-8601 start time (24-hour format, e.g. '2026-05-15T11:50:00')" },
            endTime: { type: "string", description: "ISO-8601 end time (24-hour format, e.g. '2026-05-15T13:00:00')" },
            eventType: { type: "string", description: "'interval' or 'point'" },
            location: { type: "string", description: "Optional new location" },
            notes: { type: "string", description: "Chronological pre-event prep notes or context. Always append with timestamp [YYYY-MM-DD HH:mm]." },
            outcome: { type: "string", description: "Post-event summary: decisions made, action items, key takeaways. Updated after the event concludes." },
            statusHook: { type: "string", description: "A single punchy sentence summarizing the event status or prep state for quick UI glances and notifications." },
          },
          required: ["eventId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "updateEventOccurrence",
        description: "Modifies or reschedules a single detached occurrence of a recurring event series.",
        parameters: {
          type: "object",
          properties: {
            seriesId: { type: "string", description: "The ID of the parent recurring event series" },
            originalStartTime: { type: "string", description: "ISO-8601 timestamp of the specific occurrence being modified (e.g. '2026-05-19T07:00:00')" },
            startTime: { type: "string", description: "Optional new ISO-8601 start time for this single occurrence" },
            endTime: { type: "string", description: "Optional new ISO-8601 end time for this single occurrence" },
            eventType: { type: "string", description: "Optional new event type ('interval' or 'point')" },
            title: { type: "string", description: "Optional new title" },
            location: { type: "string", description: "Optional new location" },
          },
          required: ["seriesId", "originalStartTime"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "updateUserBio",
        description: "Updates the core user profile bio/personality summary and preferences.",
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
        name: "saveSemanticMemory",
        description: "Saves a granular, long-term semantic memory/fact about the user (e.g., technical preferences, project details).",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "The granular fact or preference to remember" },
          },
          required: ["text"],
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
    let toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    if (message.tool_calls && message.tool_calls.length > 0) {
      const rawToolCalls: LMToolCall[] = message.tool_calls;
      
      toolCalls = rawToolCalls.map(c => ({
        name: c.function.name,
        args: JSON.parse(c.function.arguments)
      }));

      if (toolCalls.length > 0) {
        toolCall = toolCalls[0];
      }

      const searchCalls = rawToolCalls.filter((c: LMToolCall) => c.function.name === "searchWeb");

      if (searchCalls.length > 0) {
        const tavilyKey = process.env.NEXT_PUBLIC_TAVILY_API_KEY;
        const searchResults = await Promise.all(searchCalls.map(async (call: LMToolCall) => {
          const callArgs = JSON.parse(call.function.arguments);
          let content = "Search failed.";
          if (tavilyKey) {
            try {
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);
              const tvlyRes = await fetch("https://api.tavily.com/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ api_key: tavilyKey, query: callArgs.query, include_answer: true }),
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              const tvlyData = await tvlyRes.json();
              content = tvlyData.answer || (tvlyData.results ? tvlyData.results.map((r: { content: string }) => r.content).join("\n") : "No results found.");
            } catch (err: unknown) {
              if (err instanceof Error && err.name === "AbortError") {
                content = `Search timed out for "${callArgs.query}"`;
              } else {
                content = `Error searching for "${callArgs.query}"`;
              }
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

    if (aiText) {
      aiText = aiText
        .replace(/^(?:DO NOT|CRITICAL|NOTE|IMPORTANT|INSTRUCTION|RULE|SYSTEM|MANDATORY):?.*\n+/gi, "")
        .trim();
      if (/^[A-Z0-9 _,.\-:"'()]{10,}\n\n/.test(aiText)) {
        aiText = aiText.replace(/^[A-Z0-9 _,.\-:"'()]{10,}\n\n/, "").trim();
      }
    }

    return { aiText, toolCall, toolCalls };
  } catch (error) {
    console.error("Local LLM Request failed:", error);
    throw error;
  }
}
