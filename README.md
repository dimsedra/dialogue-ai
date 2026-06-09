# Dialogue

> *Let your personal growth be assisted.*

Most productivity tools are built around a flawed assumption: that what you need is a better system to manage your life.

You don't. You need someone in your corner.

Dialogue is not a smarter todo list. It is not a calendar with AI features. It is an AI companion that learns who you are, remembers what matters to you, and shows up every day ready to help you grow — on your terms, with your data, on your own machine.

The difference is not in the features. It is in the relationship.

> **Current operating mode: feature freeze** (until the PocketBase migration lands). Bug fixes, security patches, migration work, and migration-debt-reducing refactors only. See [ADR-011](docs/decisions/011-feature-freeze-during-pb-migration.md) for the full policy and the one carve-out (Mastra 1.0 Observational Memory in Phase 2).

---

## What Makes Dialogue Different

Every productivity app puts you in the same position: you open it, you do the work, you close it. The app is passive. You are the operator.

Dialogue inverts this. The agent is active. It notices when a habit streak is at risk. It remembers that you mentioned feeling overwhelmed last Tuesday. It knows your thesis deadline is approaching and that you tend to work better with buffer time. It asks how you are doing before you ask it anything.

This is not automation. The agent never acts without your confirmation. It does not reschedule your meetings or delete your tasks on its own. What it does is pay attention — and use that attention to be genuinely useful, not just responsive.

The longer you use Dialogue, the better it knows you. Not because it was trained on your data, but because it remembers your conversations, tracks your patterns, and builds a real picture of who you are and how you work.

---

## On Automation

The industry is racing to build AI that does things for you. We ask: **what's the point of being able to do things for the user if the user doesn't grow as a person?**

The agent in Dialogue can research, draft, schedule, and organize. But the goal is not to offload your thinking. The goal is to give you back the time and attention to do the thinking that actually matters. The bookkeeping is the means. Your growth is the end.

---

## A Partner That Works With You

The agent doesn't just understand you. It works with you — across your whole life, not just your task list.

Tell it *"find me three articles on retrieval-augmented generation, summarize the tradeoffs, and add the best one as a resource to my thesis project"* — it runs the searches, reads the results, drafts a comparison, and attaches the right link to the right task. Tell it *"I have a paper due Friday — set up a habit to write 500 words a day until then"* — it creates the habit with the right cadence, sets the streak, and starts tracking. Tell it *"draft a project brief for the new client based on my last three meetings with them"* — it pulls context from your semantic memory, references the right work, writes a first draft, and waits for you to revise.

The agent has the toolkit of a general-purpose personal assistant — research, drafting, scheduling, organizing, summarizing, and more. It can chain these tools together: a single request can touch three or four of them in sequence, with the agent orchestrating the workflow end to end. It uses this toolkit through **Mastra**, an open-source agent orchestration library, with a strict consent gate: **the agent proposes, you confirm, then it acts.** It never deletes, modifies, or sends anything without showing you the plan first.

This is not automation. It is collaboration. The agent handles the orchestration — research, drafting, scheduling, organizing — so you can stay focused on the actual thinking.

---

## Core Features

### Vault-Backed Workspaces
Every workspace in Dialogue is a folder on your disk. Tasks, events, notes, and memories are all plain Markdown files with YAML frontmatter. The agent works directly from these files — there is no hidden database you cannot see. Share a workspace folder via Dropbox or Syncthing and two instances of Dialogue stay in sync with zero cloud infrastructure.

### Auditable Memory
The agent remembers facts about you — your preferences, your projects, your working style — and writes them to `vault/system/memories.md`. You can open this file at any time and see everything the agent knows about you. Delete a line and the agent forgets it. Edit a line and the agent corrects itself instantly. Memories are automatically deduplicated and time-decayed so the most relevant ones surface first.

### Dynamic Agent Personas
Personas are Markdown files in `vault/personas/`. You can edit them directly to change how the agent behaves, or tell the agent to update them. Each persona has a strict character cap — when new preferences are added, the agent consolidates and compresses the prompt rather than stacking bullet points. Workspaces can have their own personas for context-isolated behavior.

### Daily Logs & Behavioral Synthesis
Dialogue replaces abstract personality scoring (OCEAN, etc.) with something simpler: a daily log file at `vault/daily-logs/YYYY-MM-DD.md` that tracks your habits, reflections, and activity. Every few days, the agent synthesizes these logs into a compact startup profile — concrete observations about how you work and what matters to you, not numbers on a psychometric scale. This runs on app open, not on a server schedule. No always-on infrastructure required.

### Self-Improving Playbooks
When the agent completes a complex multi-step task, it compiles its tool calls, CLI commands, errors, and successful configuration into a reusable Playbook — stored as a Markdown file in `vault/playbooks/`. The next time a similar task appears, the agent retrieves the relevant playbook via vector search and uses it as a template. The more you use Dialogue, the sharper its execution gets — and you can edit or delete any playbook at any time.

### Periodic Reflections
At the end of the week, the month, and the year, Dialogue synthesizes your completed tasks, habit consistency, and daily logs into a narrative summary — something closer to a personal retrospective than a dashboard. It celebrates what you accomplished and surfaces patterns worth examining. Think Spotify Wrapped, but for your actual life.

---

## Supporting Capabilities

* **Filesystem Vault** — All data lives in `vault/` as plain Markdown files. Tasks, events, notes, memories, personas, playbooks, and daily logs are all readable and editable in any text editor. No proprietary format, no vendor lock-in.
* **Zero-Cloud Collaboration** — Workspaces are folders. Share `vault/My-Project/` via Dropbox, iCloud, Syncthing, or Git. Two instances of Dialogue can watch the same folder and stay in sync with no central server.
* **Native File Watcher** — Changes made outside the app (editing a task file in VS Code, dropping a note into a workspace folder) are detected instantly by a background sync engine and reflected in the database cache.
* **Multimodal Ingestion & Web Research** — Drop a PDF, image, or document into the conversation. The agent reads it and can act on it — scheduling follow-ups from a meeting brief, comparing two reports, answering questions from a manual. Real-time web search is available for anything that needs current information.
* **Context-Aware Smart Notifications** — Reminders that know what they are reminding you about. Instead of "Task due in 15 minutes," you get "Lab 5 in 15 minutes — last you mentioned you had two questions left." Delivered natively on your machine.
* **Scope Pinning** — Click any task or event to pin it to the chat. The agent loads its full context and history into the conversation, so you can say "reschedule this" or "what's blocking this" without further explanation.
* **Context-Isolated Workspaces** — Each workspace is a completely isolated vault folder: its own tasks, events, notes, specialized memories, and agent persona. Switch between them without bleed. Step into the Universal Space for a cross-workspace view of your entire day.
* **Task & Event Resource Tray** — Attach links, files, and documents directly to tasks and events via conversation. They appear as a visual tray when you open that item — your references, one click away.

---

## How the Agent Knows You

Dialogue uses three memory systems that work together to give the agent a complete picture of who you are. All three are stored as plain Markdown files in your vault — you can open, edit, or delete them in any text editor.

| System | What it holds | Where it lives | How it works |
|---|---|---|---|
| **Startup Profile** | Your identity, working style, communication preferences, standing instructions | `vault/system/user_profile.md` | Refined every N daily logs. Always loaded at session start. Versioned for rollback. |
| **Auditable Memory** | Explicit facts — preferences, projects, context, technical details | `vault/system/memories.md` | Vector search retrieves what is relevant to the current conversation. Edit the file to correct a memory. Delete a line to make the agent forget. |
| **Behavioral Understanding** | Patterns — how you work, what drains you, how you respond to pressure | Synthesized from your conversation and daily logs | Generated from daily log analysis when you open the app. Free-form observations, not scored numbers. Gets more accurate over time. |

These three systems answer different questions. The profile answers who you are. Auditable memory answers what the agent knows about your life. Behavioral understanding answers how you actually operate.

Together, they mean the agent on day 365 knows you far better than the agent on day 1 — without you having to do anything except use it.

---

## Ownership & Privacy

This is not a privacy feature. It is the architecture.

* **Runs on your machine.** Dialogue is a desktop application. Your data does not pass through our servers. There is no subscription, no telemetry, no vendor with access to your conversations.
* **Bring your own API keys.** Connect whichever AI provider you prefer — Gemini, OpenAI, Anthropic, or a local model running on your own machine via Ollama or LM Studio. Switch providers at any time.
* **Local embeddings.** All memory embedding uses a lightweight 384-dimension model that runs entirely on your device. No embedding API key required. No data leaves your machine for this step.
* **Filesystem source of truth.** Every task, event, note, memory, persona, and playbook is a plain Markdown file in your vault. You can open them with any text editor, back them up with any tool, and share them through any file sync service. The database cache is a performance optimization — the files are the real record.
* **Self-host with one binary.** Dialogue's backend runs on PocketBase — a single executable file. Download it, run it, and you have a fully functional local server. No cloud account required, no complex deployment, no always-on VPS. Open the app and it works.

The agent learns deeply personal things about you. That information should belong to you.

---

## Technical Architecture

Dialogue is packaged as a Tauri desktop application. The Tauri shell (Rust) spawns and supervises three child processes on startup, then opens a webview pointed at the local Next.js server.

| Process | Role |
|---|---|
| **Tauri shell (Rust)** | Lifecycle, system tray, OS notifications, on-open reminder scan, port coordination. The single binary the user downloads. |
| **Sync Engine** | Filesystem file watcher (via `notify` crate), Markdown parser with YAML frontmatter extraction, SHA-256 change tracking, embedding generation, desync reconciliation on startup. Bridges vault files to the database cache. |
| **PocketBase (Go)** | Cached store, reactive subscriptions, auth, file storage, on-device DB. Single executable, no Docker. |
| **Next.js (Node)** | UI, Mastra agent, embedding model loader (Xenova multilingual-e5-small), chat API, periodic reflection jobs. |

### Why this stack

* **Filesystem source of truth** — every task, event, memory, persona, and playbook is a Markdown file on disk. The database is a cache, not the primary record. You own your data in a format you can open in any text editor.
* **Sync engine over direct database writes** — changes made outside the app (editing a note in VS Code, dropping a file into a workspace folder) are detected by the file watcher and synced automatically. No import step, no manual reconciliation.
* **PocketBase over cloud databases** — runs offline, no account, no subscription, data stays on the user's disk. Single binary, single port (`localhost:8090`).
* **Server-side embeddings, not browser-side** — the embedding model loads once in the Next.js process. The webview is lightweight, no ~120MB model in the browser bundle.
* **In-process vector search** — embeddings and cosine similarity search run inside PocketBase/SQLite. Brute-force is fast at personal scale (sub-50ms for 10K memories). No separate vector service to install.
* **No always-on scheduler** — periodic work (weekly reflection, daily log synthesis, behavioral profile refinement) runs on app open, not on a server clock. The relationship is present when the user is present.
* **Native OS notifications** — Tauri uses the system notification API and a system tray icon. No web push subscription required for the desktop app.

### Memory architecture

Dialogue unifies all memory writes through a single vault-first contract. The source of truth is a Markdown file on disk — the database cache is a derived index for fast retrieval:

1. The agent writes or updates `vault/system/memories.md` (or `vault/workspaces/[Name]/workspace_memories.md` for workspace-scoped memories).
2. The sync engine's file watcher detects the change and computes a SHA-256 hash of each memory chunk.
3. Each changed chunk is embedded by a local Xenova model (multilingual-e5-small, 384 dimensions, L2-normalized) and upserted into the database cache alongside the hash and file path.
4. Hash comparison prevents redundant embedding. Stale entries are deleted when chunks are removed from the file.
5. At retrieval time, results are ranked by a combined score of cosine similarity and recency — recent memories naturally gain presence. Near-duplicate results (cosine > 0.80) are deduplicated to keep context clean.

---

## Technical Stack

| Layer | Technology |
|---|---|
| **Desktop shell** | Tauri (Rust) |
| **Framework** | Next.js 16, React 19 |
| **Source of truth** | Local filesystem vault (Markdown files with YAML frontmatter) |
| **Sync engine** | Tauri file watcher (`notify` crate), AST parser, SHA-256 change tracking |
| **Database cache** | PocketBase (single Go binary, on-device) |
| **AI orchestration** | Mastra (agent workflows, tool calling) |
| **AI providers** | Vercel AI SDK — Gemini, OpenAI, Anthropic, Cohere, DeepSeek, Groq, Mistral, xAI, plus local models via Ollama / LM Studio |
| **Vector search** | In-process (PocketBase/SQLite, cosine similarity, 384d) |
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

Dialogue is a long-term project. The current build is the foundation — the vault architecture, the sync engine, the three memory systems, the on-device stack. Things being built toward:

* **Vault-First Internals** — migrating all data to the filesystem vault model (tasks, events, memories, personas, playbooks, daily logs as Markdown files), with the database as a derived cache. Every piece of user data becomes an openable, editable, backuppable file.
* **Workspace-Centric Collaboration** — zero-cloud workspace sharing via folder sync (Dropbox, Syncthing, Git). Two users sharing a workspace folder can collaborate on tasks and notes with no central server.
* **Self-Improving Playbooks** — the agent compiles multi-step tasks into reusable playbooks, stored as Markdown files, retrieved via vector search when similar tasks appear. The agent gets sharper with every execution.
* **Daily Log Synthesis** — each day gets a habit tracker and reflection log. The agent synthesizes N logs into a compact behavioral profile on app open. No background server, no psychometric scoring.
* **Proactive Agent** — the agent notices unlogged habits, approaching deadlines, follow-ups from three days ago. Surfaces them as observations, not commands.

See `docs/MIGRATION_POCKETBASE.md` for the technical roadmap (the move to a Tauri-packaged PocketBase backend is currently in progress).

---

## License

Dialogue is open source. Your conversations, calendar entries, tasks, memories, personas, playbooks, and daily logs are all stored as plain Markdown files in your local vault. No usage data, telemetry, or personal information is transmitted to any third party.

The agent learns deeply personal things about you. That information should belong to you.
