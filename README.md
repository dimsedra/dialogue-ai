# Dialogue

**A sovereign, agent-native productivity workspace.**

Dialogue is built on a simple premise: **your AI should work *for* you, not just respond *to* you.**

Most modern productivity tools treat artificial intelligence as a marketing feature—a chat bubble bolted onto a traditional database, or a text summarizer floating beside a calendar. In these setups, you are still the manual coordinate executor. You read the AI's suggestions, copy-paste the text, create the task rows, and schedule the calendar events.

Dialogue inverts this entire paradigm. Here, the AI agent is the **core runtime engine**. Your tasks, calendar events, workspaces, and memories are not just database entries—they are the agent's native toolset. When you tell Dialogue what is happening in your life, the agent directly interacts with your database, building your schedule, logging task progress, updating its own memory of your preferences, and morphing the user interface dynamically in front of your eyes.

---

## Core Features & System Capabilities

### Core Productivity Pillars (Primary Engines)

#### Living Chronological Journals
Traditional to-do list apps are static black holes where history goes to die. Once a task is completed, the struggles, decisions, and micro-milestones that got you there are lost forever. Dialogue turns this on its head by capturing a timestamped stream of your active consciousness. Every struggle, shift in scope, or design choice is appended as a live cognitive node. Because the agent understands the context of *how* you do things, it can resume paused tasks, trace technical blockers, and act as an automated developer diary that grows with you.

#### Native Habits & Routine Tracking
Checked off your habits twenty days in a row? Standard checklists break down when forced to manage repeating daily and weekly identities—they lack streak math, consistency grids, and agent intelligence. Dialogue treats habits as first-class schemas distinct from one-off tasks. The agent silently monitors your routines, updates streaks without blocking you with authorization cards, handles timezone-aware plan-approved skips (streak freezes), and automatically links routine trends directly to your reflections.

#### Background Semantic Memory
Standard AI assistants suffer from total amnesia—requiring you to re-introduce yourself, your goals, and your work style at the start of every new chat session. Dialogue runs quiet background evaluations to synthesize your workspace activity, storing your workflow patterns, preferences, and long-term milestones in a vector-indexed memory layer. The next time you open a thread, the agent already knows you prefer deep-work mornings, short code sprints, and clean boundaries.

#### Interactive Periodic Reflections
Productivity isn't just about crossing items off a list; it is about recognizing your growth. Dialogue periodically aggregates your task velocity, habit streaks, and journaled milestones, compiling them into a visual, gamified summary—a "Spotify Wrapped" for your life. By reflecting on your output, the agent helps you celebrate wins and identify cognitive bottlenecks, transforming checklist compliance into a satisfying journey of self-reflection.

---

### Supporting Workspace Mechanics (Secondary Layer)

* **Multimodal Ingestion & Web Research**: Drag PDFs, images, or briefs directly into your chat. The agent reads the content and launches real-time web searches to fact-check, synthesize, and execute schedule updates in a single turn.
* **Context-Aware Smart Notifications**: No more dismissible, timezone-broken reminders. Dialogue fires browser notifications packed with active workspace context, giving you instant shortcuts to the exact resources and designs you need.
* **Context-Isolated Workspaces & Universal Center**: Silo chats, tasks, and memory context into dedicated project workspaces (e.g. "Work", "Sovereign"). Then, step back into the **Universal Space**—a global control center where the agent coordinates tasks across boundaries.
* **Task & Event Resource Tray**: A clean visual panel that aggregates external links, Figma specs, and PDF documents attached directly to your chronological logs, putting your active references a single click away.

---

## Three Sovereign Pillars

### 1. Agent-Native Architecture

* **What it means**: Instead of just returning text formatting, the Dialogue agent has full read/write database tool capabilities. The agent can build complex workflows, insert batched tasks, resolve conflicts in calendar schedules, and organize workspaces directly. You talk to Dialogue like a colleague, and the app mutates its state in real-time.

### 2. Dual-Pane Reactive Workspace

* **What it means**: Dialogue rejects static layouts in favor of a cohesive, real-time reactive workspace. The UI is built as a dual-pane workstation that updates instantly via reactive Convex subscriptions:
  * **Interactive Left Rail (`WorkspaceRail`)**: Quick navigation between colored workspace contexts and user silos.
  * **Session Controller Sidebar (`SessionSidebar`)**: Manages conversational threads, pinned sessions, and houses the hot-swap toggle for the AI provider engine.
  * **Consent-Gated Chat Feed (`MessageStream` & `ToolCard`)**: Streams multi-turn conversations. When the agent triggers a tool mutation, it renders an inline glassmorphic `ToolCard` (e.g. for `addTask` or `addEvent`), letting you approve or modify plans with a physical click directly in the chat bubble sequence.
  * **Collapsible Companion Pane (`TaskPanel`)**: The right side of the screen houses the structural view of your workspace, seamlessly hosting the living checklist (**`TaskList`**) and visual schedule grid (**`CalendarView`**).
  * **Aesthetic Language**: Fully styled using translucent backdrops, border rings, and dark mode filters, wrapped in Framer Motion micro-animations to make the interface feel alive.

### 3. Absolute Ownership (Private & BYOK)

* **What it means**: Your data belongs to you. Dialogue operates under a Bring-Your-Own-Keys (BYOK) model. All chat histories, task logs, calendar details, and vector-indexed semantic memories are stored directly in your own private Convex instance. No vendor lock-in, no silent telemetry tracking, and no centralized databases harvesting your daily routines.

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

* **`updateMemory`**: Refines and updates the user's permanent biography summary based on behavioral insights.
* **`searchHistoricalEntities`**: Allows keyword and date range searches across completed tasks and past meetings, giving the agent a backward-looking historical perspective.
* **`listWorkspaces`**: Reads all active workspaces to help users route, organize, and categorize items.

### 4. Real-Time Research

* **`searchWeb`**: Executes parallel search queries across Tavily or Serper, feeding live internet search results directly into the conversation.

### 5. Periodic Reflections

* **`triggerReflection`**: Aggregates workspace metrics (completed tasks, streaks, active categories) and invokes the LLM to generate an engaging, Spotify-Wrapped style narrative summary and stats card for a given period (weekly, monthly, or yearly).

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
* **`memories`**: Vector-indexed memory fragments for semantic search retrieval.
* **`reflections`**: Periodic summary logs containing the synthesized weekly, monthly, and yearly summaries, compiled focus statistics, and optional user feedback comments.
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
