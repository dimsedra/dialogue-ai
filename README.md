# Dialogue

**A sovereign, agent-native productivity workspace.**

Dialogue is built on a simple premise: **your AI should work *for* you, not just respond *to* you.**

Most modern productivity tools treat artificial intelligence as a marketing feature—a chat bubble bolted onto a traditional database, or a text summarizer floating beside a calendar. In these setups, you are still the manual coordinate executor. You read the AI's suggestions, copy-paste the text, create the task rows, and schedule the calendar events.

Dialogue inverts this entire paradigm. Here, the AI agent is the **core runtime engine**. Your tasks, calendar events, workspaces, and memories are not just database entries—they are the agent's native toolset. When you tell Dialogue what is happening in your life, the agent directly interacts with your database, building your schedule, logging task progress, updating its own memory of your preferences, and morphing the user interface dynamically in front of your eyes.

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

## Core Features & Why They Matter

Instead of dumping raw developer specs, here is why each core feature was built and what it means for your daily productivity:

### 1. Living Chronological Task & Event Journals

* **What it does**: Instead of overwriting your notes, Dialogue appends timestamped logs (`[2026-05-19 22:45] Started layout...`) whenever you update a task or event's progress. It also auto-generates a one-sentence "Status Hook" for quick glance dashboards.
* **Why we built it**: Traditional to-do apps are black holes of history. Once a task is done or updated, the contextual journey—the struggles, decisions, and micro-milestones—is lost.
* **What it means for you**: You get an automated, searchable "developer diary" of your life. If you forget how you resolved a bug last Tuesday, or when a specific detail changed, you can simply ask Dialogue. It reads the entire ledger for you.

### 2. Collapsible Checkmark Archive & Pruning

* **What it does**: Tasks completed within the last 7 days are neatly grouped in a collapsible, restorable checkmark list. Older completed items are automatically tucked away from your screen and the AI's instant context window.
* **Why we built it**: A cluttered dashboard breeds mental anxiety. But deleting old tasks makes you lose progress records. Furthermore, feeding thousands of old completed tasks to an AI slows down its response time and eats up compute power.
* **What it means for you**: A clean, focused workspace every single morning. You only see what matters *now*. Your historical achievements are kept safe and searchable, but they won't clutter your visual space or slow down the agent's thinking.

### 3. Background Semantic Memory

* **What it does**: Dialogue runs quiet background checks on your conversations, summarizing your work style, preference patterns, and goals, and storing them as a persistent memory layer.
* **Why we built it**: Standard AI assistants suffer from "amnesia." Every time you open a new chat session, you have to re-explain who you are, how you work, and what your preferences are.
* **What it means for you**: Dialogue learns and grows with you. If you prefer deep work in the mornings, code in short sprints, or hate meeting overlaps, the agent naturally suggests schedules and tones that align with your style. The app adapts to you—not the other way around.

### 4. Multimodal & Web Ingestion

* **What it does**: Drag and drop documents (PDFs, images, Word docs) directly into your chat, while the agent issues parallel, real-time web searches to fact-check or research complex questions.
* **Why we built it**: Modern knowledge work is scattered. You are constantly jumping between reading manuals, googling resources, and updating your calendar.
* **What it means for you**: Zero friction. Hand Dialogue a messy meeting brief PDF, and it will read it, search the web for context, and offer to schedule the follow-up meeting in one go. You have a unified researcher and action-taker in a single chat bubble.

### 5. Interactive Periodic Reflections

* **What it does**: Dialogue periodically synthesizes your tasks, milestones, and notes into visual weekly, monthly, and yearly summaries—reminiscent of a "Spotify Wrapped" for your productivity.
* **Why we built it**: Standard productivity tools are great at tracking what you need to do, but terrible at celebrating what you actually did. Without reflection, productivity feels like an endless treadmill.
* **What it means for you**: You get an emotional, gamified summary of your wins and learning patterns. It transforms checklist compliance into a satisfying journey of self-reflection and milestone tracking.

### 6. Context-Aware Smart Notifications

* **What it does**: Delivers dynamic browser push notifications that understand what you're working on, why it's important, and the exact context surrounding it.
* **Why we built it**: "Dumb" notifications (e.g. *Task X is due in 10 minutes*) are easily dismissed and lead to notification fatigue. Reminders are only useful if they provide context.
* **What it means for you**: Instead of generic alerts, you get smart nudges that remind you of the bigger picture (e.g. *"Time for meeting with team. Don't forget the slides you finished yesterday are saved in the Workspace context."*) with instant shortcuts to take action.

### 7. Context-Isolated Workspaces & Universal Space (Global Command Center)

* **What it does**: Silos chat sessions, tasks, calendar entries, and agent memory context into independent project containers (e.g. "Work", "Personal"), while providing a **Universal Chat Space** that aggregates all workspaces into a single global view.
* **Why we built it**: Standard productivity tools either force you into one massive, unstructured list or silo projects so deeply that you lose the big picture. Dialogue balances focus and synthesis.
* **What it means for you**: You get the best of both worlds. Switch into a specific workspace to eliminate distractions and let the agent work with isolated context. When you need a bird's-eye view, hop into the **Universal Space**—your command center where the agent coordinates your entire day, schedules across project boundaries, and summarizes your overall productivity.

---

## Agent Capability Library (Tools & Skills)

The Dialogue agent interacts with your workspace by executing specific, permission-gated actions. Here is the full library of tools available to the agent:

### 1. Task Management Suite

* **`addTask`**: Creates a single task with custom priority, category, progress, and initial status hooks.
* **`batchAddTasks`**: Groups multiple task creations into a single instant database transaction (e.g. when dumping a checklist).
* **`updateTask`**: Updates task details, progress percentage, and attaches resource references (external URLs or document storage IDs) by appending standardized markdown asset logs chronologically to the task ledger.
* **`completeTask`**: Safely signs off on completed tasks, placing them in the 7-day archive.
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
