import { handleChatStream } from '@mastra/ai-sdk';
import { createUIMessageStreamResponse } from 'ai';
import { Mastra } from '@mastra/core/mastra';
import { createDialogueAgent } from '@/mastra/agents/dialogueAgent';
import { isPbBackend } from '@/pb-compat/env';
import PocketBase from 'pocketbase';
import { pbRequestContext } from '@/lib/pb-server';
import { verifyPbToken } from '@/lib/pb-actions/auth';

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider');
    const modelId = url.searchParams.get('modelId');
    const sessionId = url.searchParams.get('sessionId');
    
    const apiKey = req.headers.get('x-api-key');
    const baseUrl = req.headers.get('x-base-url');
    const timezone = req.headers.get('x-timezone') || 'UTC';
    const authToken = req.headers.get('x-auth-token') || req.headers.get('x-convex-auth-token') || undefined;
    const scopeHeader = req.headers.get('x-active-scope');
    let scope: { type: string; id: string; title: string } | null = null;
    if (scopeHeader) {
      try { scope = JSON.parse(scopeHeader); } catch {}
    }

    const isPb = isPbBackend();

    // Create an authenticated PB client
    let pbClient: PocketBase | null = null;
    if (isPb) {
      pbClient = new PocketBase(process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090");
      if (authToken) {
        const verifiedUser = await verifyPbToken(authToken);
        if (verifiedUser) {
          pbClient.authStore.save(authToken, verifiedUser as any);
        } else {
          pbClient.authStore.save(authToken, null);
        }
      }
    }

    // Fetch user profile and persona from the active backend
    let userName = null;
    let userBio = null;
    let behavioralProfile = null;
    let monthlyDigest = null;
    let latestWeeklyDigest = null;
    let personaName = "Dialogue";
    let personaPrompt = "You build relationships through concrete behaviors, not prescribed tones.";
    
    try {
      if (isPb && pbClient?.authStore.isValid) {
        const userId = pbClient.authStore.record?.id;
        if (userId) {
          const profile = await pbClient.collection('users').getOne(userId);
          userName = profile.name;
          userBio = profile.bio;
          behavioralProfile = profile.behavioralProfile;
          monthlyDigest = profile.monthlyDigest;
          latestWeeklyDigest = profile.latestWeeklyDigest;
        }
      }
    } catch (err) {
      console.warn("Could not fetch user profile for agent context", err);
    }

    // Look up the session's persona
    if (sessionId) {
      try {
        if (isPb && pbClient?.authStore.isValid) {
          const session = await pbClient.collection('chat_sessions').getOne(sessionId as string);
          if (session?.personaName) {
            personaName = session.personaName;
            personaPrompt = session.personaPrompt;
          }
        }
      } catch (err) {
        console.warn("Could not fetch session persona, using default:", err);
      }
    }

    // Create a dynamic agent configured with the user's provider settings, profile, and persona
    const dynamicAgent = createDialogueAgent(
      provider, 
      modelId, 
      apiKey, 
      baseUrl, 
      userName, 
      userBio,
      behavioralProfile,
      monthlyDigest,
      latestWeeklyDigest,
      timezone,
      personaName,
      personaPrompt,
      scope
    );
    
    // Create a temporary Mastra instance for this request
    const tempMastra = new Mastra({
      agents: { dialogueAgent: dynamicAgent },
    });

    // Vercel AI SDK 'useChat' sends the body payload here automatically
    const params = await req.json();
    
    // Inject scope as a system message so the model sees it prominently
    // in the conversation, not just buried in the agent instructions
    if (scope) {
      const scopeMsg = {
        role: 'system' as const,
        content: `[Active Scope Pin]\nThe user has pinned a specific item to this message. When they say "this", "it", "that task", "reschedule it", "mark it done", "add a note to it", etc., they are referring to:\nType: ${scope.type.toUpperCase()}\nTitle: ${scope.title}\nID: ${scope.id}\n\nUse the above ID directly in any tool calls (e.g. updateTask({ taskId: "${scope.id}", ... }), completeTask({ taskId: "${scope.id}" }), deleteTask({ taskId: "${scope.id}" })).`
      };
      params.messages = [scopeMsg, ...(params.messages || [])];
    }
    
    // Run agent execution within the PB authenticated context
    const executeStream = async () => {
      return handleChatStream({
        mastra: tempMastra,
        agentId: 'dialogueAgent',
        sendReasoning: true,
        version: 'v6',
        params: {
          ...params,
          maxSteps: 20,
        },
      });
    };

    let stream;
    if (isPb && pbClient) {
      stream = await pbRequestContext.run(pbClient, executeStream);
    } else {
      stream = await executeStream();
    }
    
    // Return the response back in Vercel AI SDK UI streaming format
    return createUIMessageStreamResponse({ stream: stream as any });
  } catch (error) {
    console.error("Chat API Routing Error:", error);
    return new Response(JSON.stringify({ error: "Agent Orchestration Failed" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
