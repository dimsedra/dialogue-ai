# Dialogue

> *Let your personal growth be assisted.*

Most productivity tools are built around a flawed assumption: that what you need is a better system to manage your life.

You don't. You need someone in your corner.

Dialogue is not a smarter todo list. It is not a calendar with AI features. It is an AI companion that learns who you are, remembers what matters to you, and shows up every day ready to help you grow — on your terms, with your data, on your own machine.

The difference is not in the features. It is in the relationship.

---

## What Makes Dialogue Different

Every productivity app puts you in the same position: you open it, you do the work, you close it. The app is passive. You are the operator.

Dialogue inverts this. The agent is active. It notices when a habit streak is at risk. It remembers that you mentioned feeling overwhelmed last Tuesday. It knows your thesis deadline is approaching and that you tend to work better with buffer time. It asks how you are doing before you ask it anything.

This is not automation. The agent never acts without your confirmation. It does not reschedule your meetings or delete your tasks on its own. What it does is pay attention — and use that attention to be genuinely useful, not just responsive.

The longer you use Dialogue, the better it knows you. Not because it was trained on your data, but because it remembers your conversations, tracks your patterns, and builds a real picture of who you are and how you work.

---

## A Partner That Works With You

The agent doesn't just understand you. It works with you.

Tell it *"schedule a focus block tomorrow morning and add the syllabus readings to my task list"* — it drafts a plan, shows you the proposed events and tasks, and waits for your confirmation. Tell it *"I have a paper due Friday — set up a habit to write 500 words a day until then"* — it creates the habit with the right cadence, sets the streak, and starts tracking. Tell it *"find me three articles on retrieval-augmented generation and add the best one as a resource to my thesis project"* — it runs the searches, reads the results, attaches the right link to the right task.

The agent has the full toolkit of a productivity workspace — task management, calendar scheduling, habit tracking, resource organization, web research, document reading. It uses these tools through **Mastra**, an open-source agent orchestration library, with a strict consent gate: **the agent proposes, you confirm, then it acts.** It never deletes or modifies anything without showing you the plan first.

This is not automation. It is collaboration. The agent does the bookkeeping so you can stay focused on the actual work.

---

## Core Features

### Living Chronological Journals
When you complete a task in a standard app, everything that got you there disappears. The late nights, the blockers, the decisions — gone. Dialogue keeps a running, timestamped ledger attached to every task and event. Every update, struggle, or note is appended in order. The agent reads this history when you return to something, so you never have to re-explain where you left off.

### Native Habits & Routine Tracking
Habits are not tasks. They are identities you are building. Dialogue treats them that way — tracking streaks, handling intentional skips (streak freezes), and monitoring consistency over time. The agent notices when a long streak is about to break and mentions it. Logging a habit takes one message. No confirmation cards, no friction.

### Semantic Memory
The agent remembers facts about you — your preferences, your projects, your working style — and retrieves the ones relevant to your current conversation. You never have to re-introduce yourself. Memories are automatically deduplicated, and you can delete any specific memory if it becomes outdated or incorrect.

### Behavioral Understanding
Every time you open Dialogue, the agent quietly reviews your recent conversations and activity. It notices patterns — when you tend to be most focused, what kinds of tasks drain you, how you respond under pressure — and uses that understanding to inform how it talks to you and what it prioritizes. This synthesis happens on app open, not on a server schedule. No always-on infrastructure required.

### User Bio
Your core identity lives in a persistent bio the agent loads at the start of every session. It captures who you are, how you like to communicate, and any standing instructions you have for the agent. Previous versions are saved so you can roll back if an update goes wrong.

### Periodic Reflections
At the end of the week, the month, and the year, Dialogue synthesizes your completed tasks, habit consistency, and journal entries into a narrative summary — something closer to a personal retrospective than a dashboard. It celebrates what you accomplished and surfaces patterns worth examining. Think Spotify Wrapped, but for your actual life.

---

## Supporting Capabilities

* **Custom Agent Personas** — Each workspace can have its own agent personality and instruction set. Your work workspace can be direct and focused. Your personal workspace can be warmer and more reflective. You define the behavior.
* **Multimodal Ingestion & Web Research** — Drop a PDF, image, or document into the conversation. The agent reads it and can act on it — scheduling follow-ups from a meeting brief, comparing two reports, answering questions from a manual. Real-time web search is available for anything that needs current information.
* **Context-Aware Smart Notifications** — Reminders that know what they are reminding you about. Instead of "Task due in 15 minutes," you get "Lab 5 in 15 minutes — last you mentioned you had two questions left." Delivered natively on your machine.
* **Scope Pinning** — Click any task or event to pin it to the chat. The agent loads its full context and history into the conversation, so you can say "reschedule this" or "what's blocking this" without further explanation.
* **Context-Isolated Workspaces** — Each workspace is a complete silo: its own conversations, tasks, events, habits, and agent memory context. Switch between them without bleed. Step into the Universal Space for a cross-workspace view of your entire day.
* **Task & Event Resource Tray** — Attach links, files, and documents directly to tasks and events via conversation. They appear as a visual tray when you open that item — your references, one click away.

---

## How the Agent Knows You

Dialogue uses three memory systems that work together to give the agent a complete picture of who you are.

| System | What it holds | How it works |
|---|---|---|
| **User Bio** | Your identity, communication preferences, standing instructions | Always loaded. Updated on request. Versioned for rollback. |
| **Semantic Memory** | Explicit facts — preferences, projects, context, technical details | Vector search retrieves what is relevant to the current conversation. Deduplicated automatically. |
| **Behavioral Understanding** | Patterns — how you work, what drains you, how you respond to pressure | Synthesized from your conversation history when you open the app. Free-form, not scored. Gets more accurate over time. |

These three systems answer different questions. The bio answers who you are. Semantic memory answers what the agent knows about your life. Behavioral understanding answers how you actually operate.

Together, they mean the agent on day 365 knows you far better than the agent on day 1 — without you having to do anything except use it.

---

## Ownership & Privacy

This is not a privacy feature. It is the architecture.

* **Runs on your machine.** Dialogue is a desktop application. Your data does not pass through our servers. There is no subscription, no telemetry, no vendor with access to your conversations.
* **Bring your own API keys.** Connect whichever AI provider you prefer — Gemini, OpenAI, Anthropic, or a local model running on your own machine via Ollama or LM Studio. Switch providers at any time.
* **Local embeddings.** Semantic memory uses a lightweight 384-dimension embedding model that runs entirely on your device. No embedding API key required. No data leaves your machine for this step.
* **Self-host with one binary.** Dialogue's backend runs on PocketBase — a single executable file. Download it, run it, and you have a fully functional local server. No cloud account required, no complex deployment, no always-on VPS. Open the app and it works.

The agent learns deeply personal things about you. That information should belong to you.

---

## Technical Architecture

Dialogue is packaged as a Tauri desktop application. The Tauri shell (Rust) spawns and supervises two child processes on startup, then opens a webview pointed at the local Next.js server.

| Process | Role |
|---|---|
| **Tauri shell (Rust)** | Lifecycle, system tray, OS notifications, on-open reminder scan, port coordination. The single binary the user downloads. |
| **PocketBase (Go)** | Primary store, reactive subscriptions, auth, file storage, on-device DB. Single executable, no Docker. |
| **Next.js (Node)** | UI, Mastra agent, embedding model loader (Xenova multilingual-e5-small), chat API, periodic reflection jobs. |
| **LadybugDB (embedded)** | Vector search (384d cosine) and graph store for semantic memory. Local file on disk, queried via Cypher. |

### Why this stack

* **PocketBase over cloud databases** — runs offline, no account, no subscription, data stays on the user's disk. Single binary, single port (`localhost:8090`).
* **Server-side embeddings, not browser-side** — the embedding model loads once in the Next.js process. The webview is lightweight, no ~120MB model in the browser bundle.
* **LadybugDB for vector and graph** — already integrated. Brute-force cosine search is fast at personal scale (sub-50ms for 10K memories). No separate vector service to install.
* **No always-on scheduler** — periodic work (weekly reflection, OCEAN synthesis, habit reminders) runs on app open, not on a server clock. The relationship is present when the user is present.
* **Native OS notifications** — Tauri uses the system notification API and a system tray icon. No web push subscription required for the desktop app.

### Memory architecture

Dialogue unifies all memory writes through a single 384-dimension contract. Every memory is stored in both the primary database (for UI) and the vector store (for retrieval):

1. The text is embedded by a local Xenova model (multilingual-e5-small, 384 dimensions, L2-normalized).
2. The vector is inserted into the primary database alongside the text and a SHA-256 content hash.
3. A mirror write to the vector store enables cosine-similarity retrieval and graph traversal.
4. Hash-based deduplication runs first. If a near-duplicate is found via cosine similarity above 0.85, the write is skipped.

---

## Technical Stack

| Layer | Technology |
|---|---|
| **Desktop shell** | Tauri (Rust) |
| **Framework** | Next.js 16, React 19 |
| **Primary database** | PocketBase (single Go binary, on-device) |
| **AI orchestration** | Mastra (agent workflows, tool calling) |
| **AI providers** | Vercel AI SDK — Gemini, OpenAI, Anthropic, Cohere, DeepSeek, Groq, Mistral, xAI, plus local models via Ollama / LM Studio |
| **Vector + graph store** | LadybugDB (embedded C++ via `@ladybugdb/core`) |
| **Embedding model** | Xenova multilingual-e5-small (384d, runs on-device) |
| **Styling** | Tailwind CSS v4, Framer Motion |
| **Auth** | PocketBase native (email/password) |
| **Notifications** | Tauri OS notifications (system tray) |

---

## Development Setup

### Prerequisites

* Node.js v20+
* Rust toolchain (for Tauri builds)
* macOS, Windows, or Linux

### 1. Project Initialization

```bash
git clone https://github.com/your-username/dialogue-ai.git
cd dialogue-ai
npm install
```

### 2. Environment Configuration

Copy the env template and fill in your AI provider keys. **The encryption key must be set in both `.env.local` and the PocketBase admin panel** — encryption happens on the device, not in the browser.

```bash
cp .env.example .env.local
```

Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

See `.env.example` for the full list of supported variables. The desktop wrapper (Tauri) sets the localhost endpoints automatically — no manual service URLs to configure.

### 3. Running Locally

```bash
npm run tauri dev
```

This single command starts the PocketBase binary, the Next.js dev server with the embedding model loaded, and opens the Tauri webview. Open the app and it works.

For browser-only development (no Tauri shell, useful for UI iteration):

```bash
# Terminal 1: Start PocketBase
./pocketbase serve

# Terminal 2: Start Next.js
npm run dev
```

Then open `http://localhost:3000` and point the app at your local PocketBase instance.

### 4. Building the Desktop App

```bash
npm run tauri build
```

Produces a `.dmg` (macOS), `.exe` (Windows), or `.AppImage` (Linux). The user double-clicks the installer and the app is ready.

---

## Roadmap

Dialogue is a long-term project. The current build is the foundation — the relationship loop, the three memory systems, the on-device architecture. Things being built toward:

* **Daily Conversation Model** — each day gets its own conversation that the agent initiates. It checks in, asks how you are, reflects at the end of the day. History organized by day, not by thread.
* **Proactive Agent** — the agent notices unlogged habits, approaching deadlines, follow-ups from three days ago. Surfaces them as observations, not commands.
* **Edge relationships in the graph** — when a memory is saved, automatically link it to the tasks, events, and habits it references. The graph becomes useful for retrieval, not just storage.

See `docs/MIGRATION_POCKETBASE.md` for the technical roadmap (the move to a Tauri-packaged PocketBase backend is currently in progress).

---

## License

Dialogue is open source. Your conversations, calendar entries, tasks, and memories are completely contained within your local installation. No usage data, telemetry, or personal information is transmitted to any third party.

The agent learns deeply personal things about you. That information should belong to you.
