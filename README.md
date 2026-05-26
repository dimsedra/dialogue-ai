# Dialogue

**A sovereign, agent-native productivity workspace.**

Dialogue is built on a simple premise: **your AI should work *for* you, not just respond *to* you.**

Most modern productivity tools treat artificial intelligence as a marketing feature—a chat bubble bolted onto a traditional database, or a text summarizer floating beside a calendar. In these setups, you are still the manual coordinate executor. You read the AI's suggestions, copy-paste the text, create the task rows, and schedule the calendar events.

Dialogue inverts this entire paradigm. Here, the AI agent is the **core runtime engine** — not a chatbot with database access, but an autonomous operator that builds your schedule, logs your progress, learns how you work, and adapts its behavior to match your rhythm. The longer you use it, the less you need to tell it. It evolves with you.

---

## Core Features & System Capabilities

### Core Productivity Pillars (Primary Engines)

#### Living Chronological Journals
Traditional to-do list apps are static black holes where history goes to die. Once a task is completed, the struggles, decisions, and micro-milestones that got you there are lost forever. Dialogue turns this on its head by capturing a timestamped stream of your active consciousness. Every struggle, shift in scope, or design choice is appended as a live cognitive node with full chronological context. Because the agent understands the context of *how* you do things, it can resume paused tasks, trace technical blockers, and act as an automated developer diary that grows with you. These journals are the primary input for the behavioral analysis pipeline—see **How Memory Works** below. Your notes become the raw material the agent uses to understand not just what you did, but *how you operate.*

#### Native Habits & Routine Tracking
Checked off your habits twenty days in a row? Standard checklists break down when forced to manage repeating daily and weekly identities—they lack streak math, consistency grids, and agent intelligence. Dialogue treats habits as first-class schemas distinct from one-off tasks. The agent silently monitors your routines, updates streaks without blocking you with authorization cards, handles timezone-aware plan-approved skips (streak freezes), and automatically links routine trends directly to your reflections. It's the difference between a checklist you manage and a routine the agent helps you protect.

#### Semantic Memory (Facts)
Standard AI assistants suffer from total amnesia—requiring you to re-introduce yourself, your goals, and your work style at the start of every new chat session. Dialogue remembers. It stores durable facts about your life, preferences, and technical stack in a vector-indexed memory layer with automatic deduplication and time-decay weighting. Automatic near-duplicate detection prevents contradictions, and a delete tool lets you correct wrong facts on the spot. You shouldn't have to repeat yourself. Ever.

#### Behavioral Notes Pyramid (Patterns)
Facts tell the agent *what* you like. Patterns tell it *who you are*. Dialogue analyzes your task notes, event outcomes, and habit logs across every workspace to understand how you operate under pressure, what drains your energy, and when you do your best work. Raw journal entries are summarized weekly, then monthly, then consolidated into a permanent behavioral profile that refines itself over years of use. The agent reads this profile at every session and adjusts its communication style—verbosity, proactiveness, suggestion frequency—based on the patterns it observes. Unlike semantic memory which accumulates facts, the notes pyramid discards raw data as it's distilled, keeping only the signal. Year 5's agent understands you better than year 1's, without needing more storage.

#### User Bio (Identity)
Your core identity and communication preferences are stored as a single bio text, always loaded at session start. The agent updates it on request, and previous versions are retained for rollback. This is your permanent context—who you are changes slower than what you're doing or how you're feeling.

#### Interactive Periodic Reflections
Productivity isn't just about crossing items off a list; it is about recognizing your growth. Dialogue periodically aggregates your task velocity, habit streaks, journaled milestones, and narrative context from your chronological logs, compiling them into a visual, gamified summary—a "Spotify Wrapped" for your life. By reflecting on your output, the agent helps you celebrate wins and identify cognitive bottlenecks, transforming checklist compliance into a satisfying journey of self-reflection. Each reflection blends statistical breakdowns with a narrative arc drawn directly from the struggles and breakthroughs you recorded in your task and event journals.

---

### Supporting Workspace Mechanics (Secondary Layer)

* **Multimodal Ingestion & Web Research**: Drag PDFs, images, or briefs directly into your chat. The agent reads the content and launches real-time web searches to fact-check, synthesize, and execute schedule updates in a single turn.
* **Context-Aware Smart Notifications**: No more dismissible, timezone-broken reminders. Dialogue fires browser notifications packed with active workspace context, giving you instant shortcuts to the exact resources and designs you need.
* **Context-Isolated Workspaces & Universal Center**: Silo chats, tasks, and memory context into dedicated project workspaces (e.g. "Work", "Sovereign"). Then, step back into the **Universal Space**—a dashboard that aggregates today's tasks, events, and journal summaries across all workspaces in a single view. The Universal Space runs its own neutral agent capable of cross-workspace queries ("what's my day look like?"), inline actions (mark done, reschedule, pin), and weekly reflections that draw from your entire activity, not just one silo. Full isolation when you need focus. Full visibility when you need the big picture.
* **Task & Event Resource Tray**: A clean visual panel that aggregates external links, Figma specs, and PDF documents attached directly to your chronological logs, putting your active references a single click away.

---

## Three Sovereign Pillars

### 1. Agent-Native Architecture

* **What it means**: The agent doesn't just format text responses—it operates your workspace. It creates tasks, schedules events, logs habits, saves memories, and adapts its behavior based on your patterns. You talk to Dialogue like a colleague, and the app responds by doing, not just replying.
* **Why it matters**: Every other productivity tool makes you the operator. Dialogue makes the agent the operator, and you the director. You set priorities, the agent executes.

### 2. Dual-Pane Reactive Workspace

* **What it means**: Dialogue rejects static layouts. The UI is a real-time reactive workstation that updates instantly as the agent works:
  * **Interactive Left Rail**: Quick navigation between colored workspace contexts.
  * **Session Controller Sidebar**: Manages conversational threads and hot-swaps between AI providers mid-conversation.
  * **Consent-Gated Chat Feed**: When the agent triggers an action, it renders an inline glassmorphic card showing what it plans to do. You approve or modify with a click before anything executes.
  * **Collapsible Companion Pane**: Houses the living task list, calendar grid, and habit tracker—all updating in real time as the agent makes changes.
* **Why it matters**: No reloads, no "saving changes," no stale data. The workspace is a live view into the agent's understanding of your life.

### 3. Absolute Ownership (Private & BYOK)

* **What it means**: Dialogue operates under a Bring-Your-Own-Keys model. All chat histories, task logs, calendar details, and memories are stored in your own private Convex instance. No vendor lock-in, no telemetry, no centralized database harvesting your daily routines.
* **Why it matters**: When the agent knows everything about your work and life, that data should belong to you—not to a startup's data center. You bring the API keys, you own the database, you decide what stays private.

---

## How Memory Works: The Agent That Grows With You

Most AI assistants start fresh every conversation. Dialogue is built on a different premise: **the agent should be smarter on day 365 than it was on day 1.** Not because we feed it more data—because we designed three complementary memory systems that see you from different angles.

| Subsystem | What it stores | How it's retrieved | How it grows |
|---|---|---|---|
| **Semantic memory** | Facts — projects, preferences, life context | Vector similarity search (top-5 relevant) | Accumulates indefinitely, time-decayed |
| **Notes pyramid** | Behavioral patterns — mood, energy, workflows | Hierarchical summarization (daily → weekly → monthly → profile) | Discards raw data, distills signal |
| **User bio** | Identity — name, role, communication style | Always loaded at session start | Overwritten with versioned history |

### At session start, the agent loads all three:

1. **Your bio** — who you are
2. **Behavioral profile** — how you operate (distilled from months of journal entries)
3. **Weekly/monthly summaries** — recent patterns
4. **Raw notes from last 7 days** — what literally happened
5. **Top-5 relevant semantic memories** — facts that match the current context

This means the agent understands you from three angles simultaneously: what you've told it (facts), what your behavior reveals (patterns), and who you are (identity). No single system carries the full weight.

### How patterns compound over time

The behavioral profile isn't built by saving every note forever. It's built by hierarchical summarization:

```
Raw journal entries (7 days) → Weekly summary → Monthly summary → Behavioral profile (permanent)
```

At each level, the previous level is discarded. Year 5's agent doesn't read more data than Year 1's — it has a more refined profile. Same storage, better signal. The agent grows with you not by hoarding every detail, but by getting better at knowing what matters.

---

## Technical Architecture & Paradigm

Dialogue is structured around three key engineering decisions designed to put you in control:

### 1. Dual-Engine Inference Model (Cloud / Local)

* **What it is**: Hot-swapping between any standard Cloud LLM provider (such as Google Gemini, OpenAI, or Anthropic) and fully offline local models (via LM Studio, Ollama, etc.) running on your own machine.
* **Why it matters**: You shouldn't be locked into a single AI provider or forced to pay a monthly subscription. If you need hyper-fast, cloud-based reasoning, plug in your preferred API key. If you want absolute, offline privacy for sensitive data, switch to a local model running on your computer with a single click.

### 2. Server-Blind Timezone Architecture

* **What it is**: Storing all temporal values in raw Unix milliseconds and parsing relative dates ("tomorrow at 3 PM") at the client edge using your browser's local timezone offset.
* **Why it matters**: Have you ever set a reminder in an app, traveled to another city, and had all your notifications go off at the wrong hour? Dialogue runs client-blind timezone matching. Your schedule moves with you, automatically calibrating to your local clock, resolving UTC timezone drift permanently.

### 3. Human-in-the-Loop Consent Gate (Verification Protocol)

* **What it is**: A strict rule where the AI must propose a plan before calling database mutations, coupled with secure prompt sanitization.
* **Why it matters**: Autopilot agents are dangerous—they delete files, schedule ghost meetings, and hallucinate tasks. Dialogue builds trust. The agent drafts a plan, and you click "Confirm" on a physical card to execute it. No surprises, no accidental wipes.

---

## Agent Capability Library (Tools & Skills)

The Dialogue agent interacts with your workspace by executing specific, permission-gated actions. Here is the full library of tools available to the agent:

### 1. Task Management Suite

* **`addTask`**: Creates a single task with custom priority, category, progress, and initial status hooks.
* **`batchAddTasks`**: Groups multiple task creations into a single instant database transaction (e.g. when dumping a checklist).
* **`updateTask`**: Updates task details, progress percentage, and attaches resource references (external URLs or document storage IDs) by appending standardized markdown asset logs chronologically to the task ledger.
* **`completeTask`**: Safely signs off on completed tasks, updating their status and storing their completion metadata.
* **`deleteTask`**: Permanently deletes a task.
* **`getTaskNotes`**: Retrieves the full, detailed chronological progress logs of a specific task only when requested, keeping the chat interface fast and lightweight.

### 2. Time & Calendar Scheduling

* **`addEvent`**: Schedules calendar blocks (point-in-time launches or duration-based focus sessions).
* **`updateEvent`**: Modifies event metadata, prep instructions, location details, and summaries.
* **`updateEventOccurrence`**: Targets and reschedules a single occurrence of a repeating event series without breaking the master recurrence pattern.
* **`deleteEvent`**: Deletes calendar bookings.

### 3. Long-Term Memory & Search

* **`saveSemanticMemory`**: Silently records persistent facts about the user (preferences, life context, technical stack, work details) on every turn, building a durable vector-indexed knowledge base that persists across sessions.
* **`deleteMemory`**: Removes a specific fact from the semantic memory store, letting the user correct wrong memories.
* **`updateUserBio`**: Refines and updates the user's permanent biography summary based on behavioral insights. Previous bio versions are retained for rollback via `revertBio`.
* **`recentActivityFeed`**: Reads recent journal entries across all tasks, events, and habits with full entity and workspace context, giving the agent a cross-entity view of the user's recent activity and emotional arc.
* **`searchHistoricalEntities`**: Allows keyword and date range searches across completed tasks and past meetings, giving the agent a backward-looking historical perspective.
* **`listWorkspaces`**: Reads all active workspaces to help users route, organize, and categorize items.

### 4. Real-Time Research

* **`searchWeb`**: Executes parallel search queries across Tavily or Serper, feeding live internet search results directly into the conversation.

### 5. Periodic Reflections

* **`triggerReflection`**: Aggregates workspace metrics (completed tasks, streaks, active categories) and narrative context from your chronological journals, then invokes the LLM to generate an engaging, Spotify-Wrapped style narrative summary for a given period (weekly, monthly, or yearly). Reflections pull from task notes, event outcomes, and habit logs to produce a personal narrative, not just a stats dashboard.

### 6. Native Habits & Routine Tracking

* **`createHabit`**: Creates a new habit routine with custom frequency structures (daily, weekly, specific days) isolated to a workspace context.
* **`logHabit`**: Logs an execution instance (`completed` or `skipped`) for an active habit. This tool is exempt from confirmation gates, running instantly and silently when the user reports routine progress.
* **`getHabitConsistency`**: Queries completion logs, streaks, and focus metrics for active habits across specific date ranges to generate consistency statistics.

---

## Database Schema (Convex)

Dialogue uses a real-time, reactive schema defined in `convex/schema.ts`:

* **`users`**: Manages authenticated profiles.
* **`userProfile`**: Stores user-specific settings, including `preferences` (selected AI provider, search engine configurations, memory sensitivity sliders) and profile bio summaries.
* **`workspaces`**: Silos containing a workspace name, branding color, context details, and user ownership mapping.
* **`chatSessions`**: Conversation containers containing title, pinning status, workspace mapping, and creation stamps.
* **`messages`**: Multi-turn chat message data. Stores text, author, attachments, extracted file contents, and tool call logs.
* **`tasks`**: Task entries containing title (`text`), priority (`low`/`medium`/`high`), category, notes (append-only ledger incorporating chronological links and document storage references), progress percentage (0-100), `statusHook`, and time stamps (`dueDate`, `completedAt`).
* **`events`**: Calendar events. Supports point-in-time entries (`point`) and duration blocks (`interval`). Contains recurrent event series mapping (`recurrence` rule schema) and chronological notes ledger.
* **`memories`**: Vector-indexed fact storage with automatic deduplication, time-decay weighting, and near-duplicate detection. Stores factual knowledge about the user (preferences, life context, tech stack).
* **`reflections`**: Periodic summary logs containing the synthesized weekly, monthly, and yearly summaries, compiled focus statistics, behavioral observations, and optional user feedback comments.
* **`habits`**: Habit definitions including name, workspace configuration mapping, target completion metrics, and cached streak stats.
* **`habitLogs`**: Timezone-adjusted completion logs, recording exact timestamps, skipped/completed states, and contextual progress notes.

---

## Technical Stack

| Layer | Technology |
| --- | --- |
| **Framework** | Next.js 15 (App Router, React 19) |
| **Backend & DB** | Convex (Real-time reactive database, vector search) |
| **Styling** | Tailwind CSS v4 |
| **Animations** | Framer Motion (Glassmorphic cards, slide sheets) |
| **AI Providers** | Any Cloud LLM (Gemini, OpenAI, Anthropic, etc.) & Local LLM (LM Studio, Ollama, etc.) |
| **Integrations** | Tavily / Serper (Web Research), Mammoth (Docx Extraction) |
| **Auth** | Convex Auth (`@convex-dev/auth` for sovereign multi-device auth) |

---

## Development Setup

### Prerequisites

* Node.js v18+
* A Convex developer account

### 1. Project Initialization

```bash
git clone https://github.com/your-username/dialogue-ai.git
cd dialogue-ai
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```env
CONVEX_DEPLOYMENT=your_deployment_name
NEXT_PUBLIC_CONVEX_URL=your_convex_url

# Cloud Inference (Plug in your preferred API key)
GEMINI_API_KEY=your_google_gemini_key
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Local Inference (Optional - supporting LM Studio, Ollama, etc.)
NEXT_PUBLIC_LM_API_TOKEN=lm-studio
LOCAL_LLM_BASE_URL=http://localhost:1234/v1

# Web Search Integration (Optional)
TAVILY_API_KEY=your_tavily_api_key
SERPER_API_KEY=your_serper_api_key
```

### 3. Running Locally

Launch the Convex backend compiler and the Next.js development server:

```bash
# Terminal 1: Starts Convex reactive dev compiler
npx convex dev

# Terminal 2: Starts Next.js client
npm run dev
```

Open `http://localhost:3000` to access your sovereign workspace.

---

## License & Sovereignty

Dialogue is built as an open stack under a "bring-your-own-keys" philosophy. Your conversations, calendar entries, and tasks are completely contained within your private Convex deployment. No usage data, telemetry, or personal information is transmitted to third-party databases.
