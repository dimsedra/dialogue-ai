# ADR-010: Dynamic Agent Memory Architecture & Gemini Embedding Model Migration

- **Status**: Accepted
- **Date**: 2026-05-19
- **Authors**: Antigravity & User
- **Domain**: Vector Search, Semantic Memory Retention, LLM Tool Integration & Google Gemini Embedding API Migration

---

## 1. Context & Problem Statement

As "Dialogue" scaled its capabilities, two major memory-related issues and an API deprecation were identified:

1. **Redundancy of Global Memory**: Dialogue struggled to distinguish between the static user persona/identity and granular conversation facts. It frequently overwrote the user's permanent bio/instructions with temporary or minor insights, leading to lost preferences.
2. **Gemini API Deprecation (text-embedding-004)**: The Google Gemini API deprecated and retired the `text-embedding-004` model, leading to `404 Not Found` errors in the Convex backend actions during embedding generation.
3. **Local LLM Synchronization**: Local LLM integrations (like LM Studio) did not have schemas or tool hooks defined for the updated memory architecture, causing tool calls to fail or desynchronize when offline/using fallback models.

How do we construct a clean, decoupled memory system separating User Bio from Granular Semantic Memory, migrate to the modern Gemini embedding model with dimension safety, and sync the local fallback pipelines?

---

## 2. Decision

We resolved these challenges by designing a partitioned memory model, migrating our vector embedding pipeline, implementing L2 normalization, and synchronizing frontend client-side actions.

### 2.1. Separation of Static Profile Bio & Granular Semantic Memory

- **Decoupled System Prompts**: We updated instructions in both `ai.ts` and `ai_action.ts` to clearly demarcate the memory scopes:
  - **User Profile Bio**: Reserved for permanent facts, style rules, name, and identity. Modified only via `updateUserBio`.
  - **Semantic Memory**: Reserved for project context, status, and conversation insights. Modified via `saveSemanticMemory`.
- **Self-Triggered Save Tool**: Added a dedicated `saveSemanticMemory` tool to the agent's toolbox, empowering the LLM to actively decide when to retain granular facts during discussions.

### 2.2. Embedding Model Migration to `gemini-embedding-001`

- **Model Swap**: Migrated all embedding call sites in `convex/ai_action.ts` from the deprecated `text-embedding-004` to `gemini-embedding-001`.
- **Matryoshka Dimension Targeting**: Configured the API payload with `outputDimensionality: 768` to align the vectors with the 768-dimension `by_embedding` index defined in Convex `schema.ts`.
- **Client-side L2 Normalization**: Since Gemini's custom-truncated output vectors are not automatically normalized, we added L2 normalization to guarantee accurate cosine similarity within Convex's `vectorSearch`:

  ```typescript
  async function getEmbedding(genAI: GoogleGenerativeAI, text: string): Promise<number[]> {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const embedRes = await model.embedContent({
      content: { role: "user", parts: [{ text }] },
      outputDimensionality: 768,
    } as any);
    const rawVector = embedRes.embedding.values;
    const sumSq = rawVector.reduce((sum, v) => sum + v * v, 0);
    const magnitude = Math.sqrt(sumSq);
    if (magnitude === 0) return rawVector;
    return rawVector.map(v => v / magnitude);
  }
  ```

### 2.3. Frontend & Local LLM Integration

- **LM Studio Schemas**: Updated `src/lib/lmstudio.ts` to register `updateUserBio` and `saveSemanticMemory` tool definitions, matching the cloud agent schemas.
- **Client-side Action Dispatch**: Configured `src/components/Chat.tsx` to handle the `saveSemanticMemory` tool call, calling the `saveSemanticMemoryAction` Convex action with the generated parameters.

### 2.4. UI Customization

- **Distinct Badge Colors**: Assigned unique badge styling to `updateUserBio` and `saveSemanticMemory` in the Chat UI.
- **Memory Retention Cards**: Created dedicated visual cards in `src/components/chat/ToolCard.tsx` showcasing what memory snippet was written to the vector database.

---

## 3. Rationale & Consequences

### 3.1. Rationale

- **Clean Decoupling**: Partitioning bio and granular memory ensures static user preferences remain untouched and clear, while semantic memory grows incrementally.
- **Vector Search Accuracy**: Normalizing the 768-dimension Matryoshka vectors preserves the mathematical alignment necessary for cosine similarity indexing.
- **System Resilience**: Synchronizing LM Studio schemas ensures that features operate uniformly, regardless of whether Dialogue is running on local fallback models or the cloud API.

### 3.2. Consequences

- **Positive**: Complete resolution of the `text-embedding-004` 404 API error.
- **Positive**: Dialogue no longer compromises user personality bios for minor session notes.
- **Positive**: Improved transparency via clear UI badge and tool card feedback for saved memory logs.

---

## 4. Verification & Grounding

- **Compilation Check**: Validated via `npm run build` with Next.js compiling all pages and TypeScript types successfully.
- **Embedding Accuracy Test**: Verified embedding truncation and normalization via a scratch JS script, confirming L2 normalization scales the output vectors exactly to a magnitude of `1.0`.
- **Convex Reload**: Confirmed functions synced successfully without any runtime schema warnings.
