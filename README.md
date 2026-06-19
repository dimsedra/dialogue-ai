# Dialogue

> *One place for your life. An AI that knows you better every day.*

Notion doesn't know you. Google Calendar doesn't know you. ChatGPT forgets you every session. Every tool out there is powerful — but blind to the person using it.

Dialogue is your life's single source of truth — that actually knows you. One place for your tasks, habits, journals, projects, and conversations, backed by an AI that learns who you are over time, without you having to manually maintain it.

It runs entirely on your machine. Your data never leaves your hardware.

---

## Core Philosophy

1. **It Knows You**: Dialogue is a single AI companion that remembers what matters to you and gets better at it over time. It doesn't switch "modes" or "personas" — it adapts its behavior naturally depending on your active context, like a person would.
2. **Active, Not Passive**: Traditional apps wait for your input. Dialogue pays attention. It notices patterns, tracks habit consistency, and raises observations — always with a strict consent gate: **the agent proposes, you confirm, then it acts.**
3. **Local-First & Offline-First**: Your conversations, memories, tasks, and daily logs live as plain Markdown files on your disk. No cloud dependency. No telemetry. You own everything.

---

## Agentic Capabilities & Workloads

Dialogue equips the agent with a local toolkit to execute complex tasks. The agent orchestrates these capabilities via **Mastra**, running under a strict consent gate: **the agent proposes a plan, and only executes it upon your confirmation.**

* **Deep Web Research**: Search the web, render and scrape pages via Playwright, summarize articles, and compile findings into cited markdown files.
* **Asset Ingestion**: Drop PDFs, images, or document files into the chat. The agent parses the contents to schedule events, write tasks, or answer context-specific questions.
* **Task, Event, & Habit Automation**: Create, update, or reorganize tasks, habits, and calendars. The agent tracks streaks, alerts you to upcoming deadlines, and surfaces blocked dependencies.
* **Git Sync & Peer Collaboration**: Perform offline-first, peer-to-peer workspace sync. The agent can stage files, write semantic commit messages, and push/pull updates.
* **Resource Management**: Attach websites, reference files, or briefs directly to tasks or events, building a visual resource tray for your workspace.

---

## Folio Directory Layout

Dialogue treats your local filesystem as the ultimate source of truth. The database is a derived index for fast retrieval, not the primary record.

```
dialogue-folio/
├── workspaces/
│   ├── personal-ws001/              <--- Default workspace
│   │   ├── .workspace.yaml          <--- Workspace metadata
│   │   ├── CONTEXT.md               <--- Workspace focus & User Notes
│   │   ├── MEMORIES.md              <--- Personal memories
│   │   └── notes/                   <--- Personal free-form notes (BlockNote planned)
│   └── project-x/                   <--- Project workspace
│       ├── .workspace.yaml
│       ├── CONTEXT.md
│       ├── MEMORIES.md              <--- Project-specific memories
│       └── notes/                   <--- Project notes
├── daily-logs/                      <--- The Daily Ledger (daily journals)
│   └── YYYY-MM-DD.md
└── system/                          <--- Auditable Memory & System Profiles
    ├── MEMORIES.md                  <--- Global facts & semantic recall sources
    ├── habits.md                    <--- Global habits registry
    ├── USER.md                      <--- Active N-Line Startup Profile
    └── CORE.md                      <--- Agent's immutable core identity
```

---

## Architectural Pillars

Dialogue's architecture is built around one goal: **an AI that actually knows you — and proves it.**

| Architectural Pillar | Why It Matters |
| :--- | :--- |
| **1. Everything is a Workspace** | Your life has contexts — health, work, study, personal. Each workspace gives the AI the right lens to understand you in that context, instead of treating every conversation the same. |
| **2. Chat vs. Observer Decoupling** | The AI that talks to you should be fully present. It doesn't multitask mid-conversation — a separate Observer handles all the learning and bookkeeping in the background. |
| **3. Memory Tier Differentiation** | What the AI knows about you is stored in plain Markdown files you can read, edit, or delete. No black box. No hidden embeddings you can't inspect. Full transparency. |

---

### 1. Everything is a Workspace
There is no workspace-agnostic mode. Every conversation in Dialogue happens within a workspace (e.g., Personal, Health, Side Project). This ensures that the agent always has macro context (`CONTEXT.md`) and relevant behavioral weights for every interaction.

### 2. Separation of Concerns: Chat vs. Observer
To maximize conversation quality and eliminate agent multitasking:
- **Chat Agent**: Focuses 100% on the conversation. It reads context (`CORE.md`, `USER.md`, `CONTEXT.md`, daily log summary) and responds with **zero side effects** (it writes nothing).
- **Observer Agent**: An asynchronous background process triggered by session transcripts. It handles all bookkeeping:
  - Writes/appends daily log entries from raw transcripts.
  - Extracts facts into PocketBase and audits them to global/workspace `MEMORIES.md`.
  - Synthesizes `CONTEXT.md` milestones and refines `USER.md` behavioral traits.

### 3. Memory System Differentiation
Dialogue splits memory into three distinct tiers to separate chronological history, semantic facts, and behavioral habits:

* **Short-Term Memory**: Transient, in-memory active chat session thread.
* **Mid-Term Memory (Chronological)**: The Daily Ledger (`daily-logs/YYYY-MM-DD.md`) containing tasks, habits, and daily reflections.
* **Long-Term Memory**:
  * **Semantic Memory** (`system/MEMORIES.md` & workspace `MEMORIES.md`): Bulleted facts. This is **fully auditable**—delete a line to make the agent forget, or edit it to correct facts.
  * **Workspace Context** (`CONTEXT.md`): Project trajectory and user-defined notes.
  * **User Profile** (`system/USER.md`): Behavioral patterns synthesized from daily logs (capped at 2,000 characters).


---

## Technical Stack

- **Desktop Shell**: Electron (packaging, native notifications, tray)
- **Framework**: Next.js 16 (React 19)
- **Database Cache**: PocketBase (Go binary, on-device SQLite)
- **Agent Orchestration**: Mastra (workflows, tools, MCP integration)
- **AI Providers**: Vercel AI SDK (Gemini, OpenAI, Anthropic, Ollama, LM Studio, etc.)
- **On-Device Embeddings**: Xenova multilingual-e5-small (runs locally via Next.js)

---

## Development Setup

### Prerequisites
- Node.js v20+
- OS: macOS, Windows, or Linux

### 1. Installation
```bash
git clone https://github.com/your-username/dialogue-ai.git
cd dialogue-ai
npm install
```

### 2. Configure Environment
Copy the environment template and fill in your preferred AI API keys:
```bash
cp .env.example .env.local
```
Generate your `ENCRYPTION_KEY` (must match the key configured in PocketBase):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Run Locally
Start the unified Electron environment (runs PocketBase, Next.js, and the desktop app):
```bash
npm run electron:dev
```
Or for browser-only frontend development:
```bash
# Terminal 1: Database
./pocketbase serve

# Terminal 2: Next.js
npm run dev
```

### 4. Build Release
```bash
npm run electron:build
```

---

## Future Roadmap

Dialogue is built in phased steps (detailed in [`docs/PROJECT_TIMELINE.md`](docs/PROJECT_TIMELINE.md)):
1. **Phase 1 — Folio System**: Filesystem as source of truth, sync engine, and database caching (Complete).
2. **Phase 2 — Mastra Orchestration**: Structured workflows, approval gates, and multi-agent systems (Active).
3. **Phase 3 — Future Extensions**:
   - **Rich Note Editing**: Native integration of [BlockNote](https://www.blocknote.dev/) for workspace notes.
   - **Root-Level Skills (`/skills`)**: Universal AI agent skills, dynamic tool registration, and prompt expansion.
   - **Workspace Sandboxing (`/sandbox`)**: Secure terminal and execution shell isolation inside workspaces.

---

## License & Privacy

Your data belongs to you. Dialogue does not track your usage, collect telemetry, or transmit your conversations to our servers. All processing (except LLM API requests to your chosen provider) happens entirely on your own hardware.
