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

#### Graph-Based Relational Memory (Relationships)
Tabular databases separate your tasks, events, and memories into isolated drawers, forcing the AI to guess how they relate. Dialogue solves this by mapping your entire workspace into a structured, schema-gated knowledge graph. It defines workspaces, tasks, events, habits, and resources as nodes, and maps their relationships (`BLOCKED_BY`, `COLLABORATES_WITH`, `PREREQUISITE_FOR`, `REFERENCES`) as edges. When you query the agent, it runs a spreading activation traversal from semantic entry nodes, assembling a highly contextual, structured briefing of dependencies and connections instantly.

#### Bidirectional OCEAN Processing (Patterns)
Facts tell the agent *what* you like. Patterns tell it *who you are*. Dialogue captures daily activity snapshots across all workspaces and performs a weekly/monthly **Bidirectional Cognitive Processing** compile. It reads the feed backward (**Retrograde Analysis**) to understand context and justify behaviors, and forward (**Anterograde Analysis**) to map user trajectory momentum. It frames these insights using the **Big 5 (OCEAN)** personality model (Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism) with bulleted evidence. The agent reads these digests at session start to optimize prompt context and caching, adapting its coaching tone. Instead of starting fresh, it refines and updates the existing monthly profile, discarding raw details over time to protect storage.

#### User Bio (Identity)
Your core identity and communication preferences are stored as a single bio text, always loaded at session start. The agent updates it on request, and previous versions are retained for rollback. This is your permanent context—who you are changes slower than what you're doing or how you're feeling.

#### Interactive Periodic Reflections
Productivity isn't just about crossing items off a list; it is about recognizing your growth. Dialogue periodically aggregates your task velocity, habit streaks, journaled milestones, and narrative context from your chronological logs, compiling them into a visual, gamified summary—a "Spotify Wrapped" for your life. By reflecting on your output, the agent helps you celebrate wins and identify cognitive bottlenecks, transforming checklist compliance into a satisfying journey of self-reflection. Each reflection blends statistical breakdowns with a narrative arc drawn directly from the struggles and breakthroughs you recorded in your task and event journals.

---

### Supporting Workspace Mechanics (Secondary Layer)

* **Custom Agent Personas**: Mold your AI's personality, behavior, and instructions. Create specific agent profiles (e.g. Tech Lead, Fitness Coach, Life Mentor) with custom system prompt instructions and descriptive summaries managed in a mobile-optimized cards gallery.
* **Multimodal Ingestion & Web Research**: Drag PDFs, images, or briefs directly into your chat. The agent reads the content and launches real-time web searches to fact-check, synthesize, and execute schedule updates in a single turn.
* **Closed-Tab & Context-Aware Smart Notifications**: No more timezone-broken reminders that vanish when you close the tab. Dialogue utilizes background Service Workers and native Web Push APIs to deliver scheduled alerts (tasks, events, habits) even when the browser is shut. Each notification is packed with active workspace shortcuts to jump you directly to the correct tools.
* **Contextual Scope Pinning**: Pin specific Tasks, Events, or Dates to the chat with a single click. Pinning displays a floating badge in the chat input and injects the target's exact metadata and ledger history into the agent's active system prompt, allowing you to run relative commands ("reschedule this," "resolve this blocker") with absolute precision.
* **Context-Isolated Workspaces & Universal Center**: Silo chats, tasks, and memory context into dedicated project workspaces (e.g. "Work", "Sovereign"). Each workspace can be configured with its own default **Agent Persona** that automatically loads for new sessions in that context. Step back into the **Universal Space**—a dashboard that aggregates today's tasks, events, and journal summaries across all workspaces in a single view. The Universal Space runs its own neutral agent capable of cross-workspace queries ("what's my day look like?"), inline actions (mark done, reschedule, pin), and weekly reflections that draw from your entire activity, not just one silo. Full isolation when you need focus. Full visibility when you need the big picture.
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

Most AI assistants start fresh every conversation. Dialogue is built on a different premise: **the agent should be smarter on day 365 than it was on day 1.** Not because we feed it more data—because we designed four complementary, cross-referencing memory systems that see you from different angles: **Identity (User Bio)**, **Behaviors (Bidirectional OCEAN)**, **Facts (Semantic Memory)**, and **Relationships (Graph Memory)**.

| Subsystem | What it stores | Core Retrieval Method | Compounding & Pruning Mechanics |
|---|---|---|---|
| **Stated Identity (User Bio)** | Stated biography, names, communication style, instructions | Loaded globally on every message turn | Manual edit overrides with revision history rollbacks |
| **Observed Patterns (OCEAN)** | Psychometric profile (Big 5), behavior, energy, vector trajectory | Top-of-prompt instruction context (Cache-Optimized) | Daily snapshotting, weekly compile, monthly cascade (prunes weekly digests) |
| **Explicit Facts (Semantic)** | Long-term preferences, technology stacks, static details | Cosine similarity vector search (top-5 matches) | Point deduplication, 30-day recency boost, linear decay |
| **Relational Context (Graph)** | Entity-relationship nodes (Tasks, Events, Habits) and typed, weighted edges | Spreading activation traversal (1-2 degrees of separation) | Node/edge indexing, OCEAN weight scaling, and UserBio policy filtering |

---

### 1. Explicit Facts (Semantic Memory)
When you tell the agent about your preferences ("I prefer writing frontend code in TypeScript") or record details ("Figma design is located at this link"), it is committed to a vector-indexed database. 
- **Point Deduplication**: Every fact is normalized and hashed using SHA-256. If you repeat a fact, the mutation patches the existing document's timestamp rather than writing duplicate rows.
- **Semantic Write Guard**: Before saving, the system performs a similarity search. If a memory matches with a cosine similarity `score > 0.85`, writing is skipped to prevent duplicate clutter.
- **Time-Decay Rescoring**: Older facts decay linearly. Recent facts (under 30 days old) receive a 10% relevance boost: `final_score = vector_score * (1 + 0.1 * recency_factor)`. This keeps active context top-of-mind.
- **Explicit Delete Hook**: The agent has a `deleteSemanticMemory` tool. If a fact changes, the user can explicitly instruct the agent to "forget this," deleting the vector document instantly.

---

### 2. Behavioral Patterns (Bidirectional OCEAN)
Facts only represent what you *tell* the agent. Your actual behavior is a richer dataset. Dialogue compiles a cognitive profile based on the **Big 5 (OCEAN)** traits (Openness, Conscientiousness, Extraversion, Agreeableness, Neuroticism) using a multi-step bidirectional pipeline:
- **Daily Ingestion**: Every night at 23:59 (local timezone), a cron creates a `dailyActivities` record containing all completed tasks, scheduled events, skipped habits, cancelled meetings, and a 2-line agent-synthesized chat reflection. Inactivity is recorded as "No activity".
- **Deletion Interception**: If a task or event is deleted, the mutation intercepts the action and logs its final state to the day's snapshot before purging it, ensuring full activity logs.
- **Retrograde & Anterograde weekly analysis**: Every Monday, the compiler runs two passes:
  - *Retrograde Analysis (Day 7 → Day 1)*: Reads backward to find causal links (e.g. realizing a skipped workout on Tuesday was caused by a late-night coding crunch logged on Monday), eliminating false negative assessments.
  - *Anterograde Analysis (Day 1 → Day 7)*: Reads forward to map your behavioral trajectory (momentum vector) rather than a single static snapshot.
- **No-Bias Inactivity Guard**: Days or weeks with zero activity do not penalize scores. Inactivity is treated as neutral (insufficient data), retaining the baseline scores.
- **OCEAN Percentile Scale**: Behaviors are scored against a standardized scale (Very Low: 0–10% to Very High: 90–100%) and justified with bulleted evidence.
- **Monthly Cascade**: After 4 weeks, the weekly digests are compiled into a Monthly Digest and deleted to preserve storage.
- **Stable Refinement**: The LLM refines the previous monthly summary rather than rewriting it from scratch, keeping the behavioral profile slow-moving and stable.
- **Cache-Optimized Prompt Injection**: The monthly and weekly digests are hoisted to the **very top** of the system prompt. Since these files change slowly, they stay hot in the LLM's prefix cache, dramatically reducing token latency.

---

### 3. Stated Identity (User Bio)
Your stated biography and communication preferences (such as preferred tone, username, or guidelines) are loaded globally. Unlike behavioral patterns (which are *observed*), this is what you *want* the agent to know. Updates overwrite the active bio, but all historic revisions are saved for instant rollbacks.

---

### 4. Relational Context (Graph Memory)
Dialogue maps your entire workspace into a structured, schema-gated knowledge graph. It defines concrete entities (Workspaces, Tasks, Events, Habits, Resources, People) as nodes and typed relationships (`BLOCKED_BY`, `COLLABORATES_WITH`, `PREREQUISITE_FOR`, `REFERENCES`) as edges.
- **Spreading Activation**: Recreates thought association. Locating a node automatically activates neighboring nodes (e.g., matching a person node pulls active tasks and resources connected to them).
- **Sub-Graph Extraction**: Instead of injecting raw lists of all tasks/events, the compiler extracts only the local neighborhood of active nodes, saving context window space.
- **MCP Node Syncing**: Workspace-specific MCP integrations (such as GitHub, Overleaf, or Zotero) dynamically populate the graph with external commit logs, references, and edit states.
- **Causal Warnings**: Graph edges track timeline dependencies in real time, allowing the agent to predict and warn about schedule conflicts (e.g. late coding sessions threatening habit streaks).

### Quad-Triangulation: How the Subsystems Collaborate
At session start, the agent loads your stated **Identity (Bio)**, observes your **Behavioral Patterns (OCEAN Digests)**, fetches matching **Factual Context (Semantic Memory)**, and traverses the **Relational Network (Graph Memory)**. The agent integrates these four signals:
- *Bio* sets global rules, username, and prunes graph paths that violate user constraints.
- *OCEAN* observes behavioral patterns and dynamically tunes graph edge weights (e.g. prioritizing blocker resolution during high-stress periods).
- *Semantic Memory* acts as an entry portal to match query vectors to starting nodes in the graph.
- *Graph Memory* acts as the central connective tissue, walking paths to retrieve related tasks, calendar events, habits, and synced external MCP resources in a clean structural briefing.

---

## Technical Architecture & Paradigm

Dialogue is structured around three key engineering decisions designed to put you in control:

### 1. Unified Inference Model (Cloud / Local via Vercel AI SDK)

* **What it is**: Hot-swapping between any standard Cloud LLM provider (such as Google Gemini, OpenAI, or Anthropic) and fully offline local models (via Ollama, etc.) running on your own machine, all abstracted through **Vercel AI SDK Providers**.
* **Why it matters**: You shouldn't be locked into a single AI provider or forced to maintain custom API fetch logic. Vercel AI SDK standardizes the model interface. If you need hyper-fast, cloud-based reasoning, plug in your preferred API key. If you want absolute, offline privacy for sensitive data, switch to a local model running on your computer with a single line of code change.

### 2. Timezone-Aware Server Architecture (IANA Timezone Sync)

* **What it is**: Synchronizing the user's current browser IANA timezone (e.g., `America/New_York` or `Asia/Tokyo`) with active chat sessions, allowing the Convex backend to dynamically calculate offsets, local hours, and midnight boundaries.
* **Why it matters**: Standard cloud databases calculate days based on UTC, causing daily habits to reset at the wrong time and background crons (like nightly OCEAN activity compilations) to fire in the middle of your workday depending on where you live. Dialogue runs server-side timezone calibration using `convex/timezones.ts`. Your timezone is dynamically synced from the client, ensuring server crons, timezone-locked habit logs, and scheduled push notification jobs update relative to your local clock, resolving UTC timezone drift permanently.

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
* **`getTaskResources`**: Retrieves the linked resources (external web links and file attachments) associated with a specific task.

### 2. Time & Calendar Scheduling

* **`addEvent`**: Schedules calendar blocks (point-in-time launches or duration-based focus sessions).
* **`updateEvent`**: Modifies event metadata, prep instructions, location details, and summaries.
* **`updateEventOccurrence`**: Targets and reschedules a single occurrence of a repeating event series without breaking the master recurrence pattern.
* **`deleteEvent`**: Deletes calendar bookings.
* **`getEventResources`**: Retrieves the linked resources (external web links and file attachments) associated with a specific calendar event.

### 3. Long-Term Memory & Search

* **`saveSemanticMemory`**: Silently records persistent facts about the user (preferences, life context, technical stack, work details) on every turn, building a durable vector-indexed knowledge base that persists across sessions.
* **`deleteSemanticMemory`**: Removes a specific fact from the semantic memory store by its memory ID, letting the user correct wrong memories.
* **`updateUserBio`**: Refines and updates the user's permanent biography summary based on behavioral insights. Previous bio versions are retained for rollback.
* **`searchHistoricalEntities`**: Allows keyword and date range searches across completed tasks and past meetings, giving the agent a backward-looking historical perspective.
* **`listWorkspaces`**: Reads all active workspaces to help users route, organize, and categorize items.

### 4. Real-Time Research & Reading

* **`searchWeb`**: Executes parallel search queries across Tavily or Serper, feeding live internet search results directly into the conversation.
* **`fetchUrl`**: Fetches and parses the text content of a user-shared URL link, letting the agent read articles or documents directly.

### 5. Periodic Reflections

* **`triggerReflection`**: Aggregates workspace metrics (completed tasks, streaks, active categories) and narrative context from your chronological journals, then invokes the LLM to generate an engaging, Spotify-Wrapped style narrative summary for a given period (weekly, monthly, or yearly).

### 6. Native Habits & Routine Tracking

* **`create_habit`**: Creates a new habit routine with custom frequency structures (daily, weekly, specific days) isolated to a workspace context.
* **`log_habit`**: Logs an execution instance (`completed` or `skipped`) for an active habit. This tool is exempt from confirmation gates, running instantly and silently when the user reports routine progress.
* **`get_habit_consistency`**: Queries completion logs, streaks, and focus metrics for active habits across specific date ranges to generate consistency statistics.

### 7. System Notifications & Custom Reminders

* **`list_unread_notifications`**: Retrieves a list of unread notifications, reminders, or system alerts for the active user.
* **`create_custom_reminder`**: Schedules a custom reminder message to trigger as a system notification at a specific future date and time.

---

## Database Architecture (Convex & LadybugDB)

Dialogue uses a dual-database approach to maintain strict separation of concerns between real-time UI state and deep AI memory.

### 1. Convex (Real-time Relational & Sync)
Defined in `convex/schema.ts`, handling all UI reactivity and structured scheduling:
* **`users`**: Manages authenticated profiles.
* **`userProfile`**: Stores user-specific settings, including `preferences` and profile bio summaries.
* **`workspaces`**: Silos containing a workspace name, branding color, default agent persona reference, and context details.
* **`chatSessions`**: Conversation containers mapping active threads to workspaces.
* **`messages`**: Multi-turn chat message data. Stores text, author, tool call logs, and active `scope`.
* **`tasks`**: Task entries containing title, category, progress, chronological notes ledger, and scheduled notification offsets.
* **`events`**: Calendar events (point-in-time and duration blocks), recurrence rules, and notification tracking.
* **`habits`** & **`habitLogs`**: Habit definitions, completion metrics, and timezone-adjusted execution logs.
* **`reflections`** & **`oceanSnapshots`**: Periodic summary logs (weekly/monthly/yearly), compiled focus statistics, and behavioral Big 5 observations tracked over time via CRON jobs.
* **`pushSubscriptions`**: Browser Web Push subscription registration endpoints for closed-tab background alerts.

### 2. LadybugDB (Embedded Graph Memory)
Operating directly on the Next.js server disk, LadybugDB acts as the "Brain's" local storage for vector embeddings and multi-hop relationships via the Cypher query language:
* **`Memories`**: Vector-indexed semantic fact storage with automatic deduplication, time-decay weighting, and near-duplicate detection.
* **`GraphNodes`**: Cypher-queryable entities representing convex IDs (Workspaces, Tasks, Events, People).
* **`GraphEdges`**: Weighted, directed edges (`BLOCKED_BY`, `COLLABORATES_WITH`, `PREREQUISITE_FOR`, `REFERENCES`) allowing Mastra to traverse the knowledge graph instantly without network overhead.

---

## Technical Stack

| Layer | Technology |
| --- | --- |
| **Framework** | Next.js 15 (App Router, React 19) |
| **AI Orchestration** | Mastra (Agent Workflows, Tool Calling, MCP Client Integration) |
| **AI Providers & UI** | Vercel AI SDK Core (`@ai-sdk/openai`, etc.) & UI (`useChat`) |
| **Backend & UI State** | Convex (Real-time reactive database, CRON jobs) |
| **Agentic Graph Memory**| LadybugDB (Embedded C++ Graph & Vector database) |
| **Styling** | Tailwind CSS v4 |
| **Animations** | Framer Motion (Glassmorphic cards, slide sheets) |
| **Supported Models** | Cloud LLMs (Gemini, OpenAI, Anthropic) & Local LLMs (Ollama) via Vercel AI SDK |
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

# Closed-Tab Web Push Notifications (Optional - VAPID keys)
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_CONTACT_EMAIL=mailto:admin@yourdomain.com
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
