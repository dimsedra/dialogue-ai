# Dialogue AI: Sovereign Workspace Architecture

This document defines the high-level architecture of Dialogue, an AI-powered productivity system built on the principle of a **Sovereign Workspace**.

## 1. Core Philosophy

- **Sovereign Workspace:** You own your data. The system supports full self-hosting and Bring Your Own Keys (BYOK). Your memories and tasks are not siloed in third-party SaaS platforms.
- **Flexible Deployment:** 
  - **The Cloud Way:** Deploy to a stateful server (e.g., Railway, VPS) for a permanent, accessible cloud instance.
  - **The Local Way:** Run entirely on your local machine or as a desktop application for 100% privacy and zero recurring costs.
- **Strict Separation of Concerns:** We decouple real-time structured data (Tasks/Events) from AI intelligence (Orchestration) and semantic relationships (Graph Memory).

---

## 2. Technology Stack & Roles

### 🧠 The Orchestrator: Next.js + Mastra + Vercel AI SDK
- **Next.js:** The host application and user interface.
- **Mastra:** The AI agent framework running within Next.js API routes. It manages workflows, tool execution, context windows, and **acts as the native Model Context Protocol (MCP) client**. It connects the agent seamlessly to external MCP servers (e.g., GitHub, local file systems, Slack) expanding its capabilities without writing custom integration layers.
- **Vercel AI SDK (Core & UI):** 
  - **Providers (`@ai-sdk/openai`, `@ai-sdk/google`, etc.):** Acts as the universal abstraction layer for all LLM models. Replaces manually maintained API fetch requests, ensuring standardized tool calling and hot-swappable model logic.
  - **UI Layer:** Provides the streaming transport layer (`useChat`, `streamText`) to deliver a smooth, modern UI experience.

### 💾 The Real-time Store: Convex
- **Role:** Source of truth for all structured, relational productivity data.
- **Responsibilities:**
  - Storing `Tasks`, `Events`, `Habits`, and user preferences.
  - Pushing real-time reactivity directly to the Next.js frontend.
  - Executing CRON jobs and background scheduling.
- **Deployment:** Can be used via Convex Cloud (Free Plan) or self-hosted entirely.

### 🕸️ The Agentic Memory: LadybugDB
- **Role:** The embedded graph and semantic memory layer.
- **Responsibilities:**
  - Running seamlessly inside the Next.js Node process via `@ladybugdb/core` (C++ native bindings).
  - Storing complex node-edge relationships (e.g., `(:Event)-[:RELATED_TO]->(:Task)`).
  - Managing Vector embeddings and native full-text search.
  - Using the **Cypher** query language for deep multi-hop traversals and graph pattern matching.

---

## 3. Data Flow & Integration

The architecture treats Convex as the ledger of "facts" and LadybugDB as the "web of meaning".

1. **User Interaction (UI):** 
   - Standard CRUD operations for Tasks and Events go directly from the client to **Convex**.
2. **AI Conversation:** 
   - The user chats with the AI via Next.js `/api/chat`.
   - **Mastra** intercepts the prompt, evaluates context, and decides which tools to call.
3. **Linking the Systems:**
   - When the AI detects a relationship (e.g., "Link tomorrow's meeting to my Q3 goal"), Mastra calls a tool.
   - The tool extracts the `id` from Convex and writes a Cypher query to **LadybugDB**:
     ```cypher
     MERGE (e:Event {id: "convex_event_123"})
     MERGE (t:Task {id: "convex_task_456"})
     MERGE (e)-[:BLOCKS]->(t)
     ```
4. **Graph Retrieval:**
   - When asked "What do I need to prepare?", Mastra queries LadybugDB via Cypher to fetch the subgraph of connected Tasks and Events, then retrieves the raw data from Convex to format the final answer.

---

## 4. Deployment Constraints & Solutions

Because **LadybugDB** is an embedded database that persists data to the local disk, **Serverless deployments (like Vercel or AWS Lambda) are strictly prohibited** for the backend API.

### The Cloud Way (Recommended: Railway / VPS)
- **Host:** Railway (Hobby Plan at $5/month) or a DigitalOcean droplet.
- **Execution:** Next.js runs as a long-living Node.js server.
- **Storage:** A Persistent Volume is attached to the server, where LadybugDB stores its `memory.db` file.
- **Convex:** Connected via API URL (Cloud or self-hosted container).

### The Local Way (100% Free)
- **Host:** Local machine (Laptop/Desktop).
- **Execution:** Packaged via Tauri/Electron or run locally via `npm run dev`.
- **Storage:** LadybugDB writes to the local user directory (`~/.dialogue/memory.db`).
- **Convex:** Ran via local development server (`npx convex dev`).

---

## 5. Feature Placements (Where does X go?)

To maintain the strict separation of concerns, here is where specific core Dialogue features reside:

- **Bidirectional OCEAN (Personality & Stats):** 
  - **Storage:** **Convex** (e.g., `oceanSnapshots` table).
  - **Logic:** Convex CRON jobs handle the daily snapshots and weekly compiles. 
  - **Why:** It's highly structured, time-series data that needs to trigger real-time UI updates (e.g., a progress bar changing when a user completes a task).
- **Semantic Memory:** 
  - **Storage:** **LadybugDB**.
  - **Logic:** Mastra extracts semantic facts from conversations and stores them as Nodes/Vectors in LadybugDB.
  - **Why:** Semantic memories require Graph relationships and Vector-based similarity search (RAG) to be useful for the AI, which is LadybugDB's core strength.
- **Reflections (Spotify Wrapped Style):** 
  - **Storage:** **Convex** (Stores the final generated report/UI data).
  - **Logic:** **Mastra + Convex CRON**. A Convex scheduled function triggers Mastra (via an HTTP call) at the end of the year. Mastra reads the year's graph from LadybugDB and the OCEAN snapshots from Convex, generates a highly personalized "Wrapped" summary, and saves the result back to Convex for the UI to display beautifully.
