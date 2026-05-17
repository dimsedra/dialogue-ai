# Dialogue

**A sovereign, agent-native productivity workspace.**

Most AI productivity tools are built the same way: take an existing app (notes, to-dos, calendar), add a chat box, and call it "AI-powered." The AI is an afterthought. It can suggest things, but it cannot *act*.

Dialogue inverts this entirely. The agent is the product. Tasks, events, and memory are its native tools — not wrappers around a pre-existing system.

---

## The Paradigm

Dialogue is built around a single idea: **your AI should work *for* you, not just respond *to* you.**

This means three things in practice:

1. **Agent-first, not AI-featured.** The agent can read your workspace context, cross-reference your schedule, execute mutations on your data, and remember your patterns — all within a single conversation. There is no "switch to the app to actually do the thing."

2. **Sovereign by design.** You bring your own keys. Your data lives in your Convex deployment. You choose your inference provider — cloud (Gemini Pro) or fully local (LM Studio). Nothing phones home. Nothing is monetized. You own the stack.

3. **Human-in-the-loop, not autopilot.** The agent operates on a strict Verification Policy. It will not add a task, schedule an event, or delete anything without first presenting a plan and receiving explicit confirmation. It asks before it assumes. This is not a limitation — it is a design choice for people who care about precision.

---

## What It Does

### Conversational Task and Event Management

Tell Dialogue what you need to do. It will gather the details — priority, category, deadline — confirm the plan, and execute. Changes show up in real time across your workspace.

Tasks support priority levels, category tags, and due dates. Events support both **interval scheduling** (meetings, focus blocks) and **point-in-time tracking** (releases, drops, launches, comebacks) — because not everything has a duration.

### Multi-Workspace Context Isolation

Every workspace is a complete silo: its own conversation history, task list, event calendar, and agent context. The agent knows which workspace it is operating in and calibrates its tone and advice accordingly.

### Semantic Memory

Every 20 messages, Dialogue runs a background reflection pass and synthesizes what it has learned about you — your work style, preferences, patterns — into a persistent memory layer. Future conversations build on this model. It gets more useful the more you use it.

### Multimodal Reasoning

Upload images, PDFs, or Word documents directly into the conversation. The agent reads them, reasons across them, and uses their content to inform its suggestions and actions. Hand it a meeting invite and it will offer to add it to your calendar. Hand it two financial reports and it will compare them.

### Integrated Research Engine

When you need current information, the agent issues real-time web queries through Tavily or Serper — and can run multiple parallel searches in a single turn for complex questions. Results are synthesized directly into its response.

### Sovereign Authentication

Your workspace is protected by **Convex Auth**, providing built-in, secure access across all your devices without compromising the "bring your own keys" philosophy. By using native authentication within your own database deployment, your identity and your data remain truly siloed and sovereign.

### Premium Interaction Surface

Dialogue isn't just a chat box; it's a living interface. It features:

- **Compact Tool Cards**: Visual feedback for every action (tasks, events, searches) designed to support, not dominate, the conversation.
- **Motion-Enabled Feedback**: Fluid animations and a non-intrusive typing indicator that provide a tactile sense of the agent's "thinking" process.
- **Glassmorphism Aesthetic**: A meticulously crafted dark-themed workspace that feels premium, modern, and focused.

---

## What It Is Not

- It is not a SaaS product with a subscription tier.
- It is not a wrapper around someone else's productivity app.
- It is not always listening, always processing, or sending your data anywhere you did not configure.

---

## Technical Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 15 (App Router) |
| Real-time Backend | Convex |
| Styling & Motion | Tailwind CSS + Framer Motion |
| AI Providers | Google Gemini Pro / LM Studio |
| Research | Tavily / Serper |
| Language | TypeScript (strict) |
| Auth | Convex Auth (@convex-dev/auth) |

**Architecture note**: All temporal data is stored as raw Unix timestamps. No server-side timezone inference. All local time rendering happens at the client edge — a pattern we call "Server-Blind" infrastructure.

---

## Setup

1. **Clone**

   ```bash
   git clone https://github.com/your-username/dialogue-ai.git
   cd dialogue-ai
   ```

2. **Install**

   ```bash
   npm install
   ```

3. **Configure environment**

   Create `.env.local`:

   ```env
   CONVEX_DEPLOYMENT=your_deployment_name
   NEXT_PUBLIC_CONVEX_URL=your_convex_url

   # AI provider (at least one required)
   GEMINI_API_KEY=your_google_ai_key

   # Research providers (optional but recommended)
   TAVILY_API_KEY=your_tavily_key
   SERPER_API_KEY=your_serper_key

   # Authentication (Convex Auth)
   # No external keys required; uses your Convex deployment.
   ```

4. **Run**

   ```bash
   # In one terminal
   npx convex dev

   # In another
   npm run dev
   ```

---

## Deployment

Dialogue is optimized for Vercel.

1. Deploy backend functions: `npx convex deploy`
2. Connect the repository to a new Vercel project.
3. Set production environment variables in the Vercel dashboard.

---

*Built with intentionality. Designed to stay out of your way.*
