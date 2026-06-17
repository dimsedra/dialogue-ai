# Mastra Agent Orchestration Upgrade

This document summarizes Mastra platform capabilities available for the next phase of Dialogue's agent orchestration. Referenced from https://mastra.ai/docs/ (June 2026).

---

## Current State

- Single `dialogueAgent` with 19 tools, constructed dynamically per-request with user context injected into `instructions`
- No workflows, no Workspace integration, no MCP, no Editor, no Browser
- Mastra instance created fresh per request (never reused)
- Chat via `handleChatStream` from `@mastra/ai-sdk`; cron via `.generate()`

---

## Upgrade Paths

### 1. Workflows (`createWorkflow` + `createStep`)

For tasks with a defined multi-step execution order. Steps have typed `inputSchema`/`outputSchema`, cross-step `stateSchema`, and can call agents/tools.

**Relevant for Dialogue:**
- **Daily log synthesis** — a workflow: fetch logs → summarize → write profile → archive digest
- **Playbook generation** — a workflow: collect trace → LLM synthesis → write `.md` + vector index
- **Task execution loops** — compound operations (e.g., "research + draft + attach to task") as explicit pipelines instead of agent tool-chaining

All steps get built-in observability, time-travel replay, suspend/resume.

### 2. Editor (`@mastra/editor`)

Versioned CMS for agent instructions, prompts, and tools. Non-developers can iterate on agent behavior via Studio without touching code.

**Relevant for Dialogue:**
- Could replace the custom `createDialogueAgent(...)` factory by storing per-user instruction overrides in the Editor
- `source: 'code'` mode writes overrides to deterministic JSON files (trackable in git) — fits the vault philosophy
- Draft/publish lifecycle + version targeting per request/user
- Automated experimentation loop: run dataset → score → LLM proposes instruction changes → apply via editor API → re-run

### 3. MCP (`@mastra/mcp`)

**MCPClient** — connect to external MCP servers (Wikipedia, weather, GitHub, composio integrations). Static or dynamic (per-request) tool configuration.

**MCPServer** — expose Dialogue's agents, tools, and workflows as an MCP server for external AI clients.

**Relevant for Dialogue:**
- Replace ad-hoc `fetchUrlTool`/`searchWebTool` with dedicated MCP servers
- Expose Dialogue agent as MCPServer so it can be called from Cursor, Claude Desktop, etc.
- Dynamic toolsets for multi-tenant/multi-workspace isolation

### 4. Workspace (`@mastra/core/workspace`)

Persistent agent environment with filesystem, sandbox (shell commands), LSP inspection, search (BM25/vector/hybrid), and skills.

**Relevant for Dialogue:**
- Maps directly onto the vault architecture — `LocalFilesystem` pointed at `vault/` gives the agent file read/write/list/grep tools
- `LocalSandbox` for CLI execution (npm, git, etc.)
- Output truncation (tail + token cap) and read-before-write safety built in
- Per-agent or per-request workspace isolation via resolver functions
- Skills = reusable instruction blocks, analogous to the vault's persona + playbook system

### 5. Browser (`@mastra/agent-browser`, `@mastra/stagehand`)

Playwright-based or AI-powered (Stagehand) browser automation. Screencast to Studio.

**Relevant for Dialogue:**
- Could replace the naive `fetchUrlTool` with a real browser agent for JS-rendered SPAs
- Form filling, authenticated sessions, multi-step web workflows

### 6. Structured Agents (beyond the current pattern)

- **Agent approval** — human-in-the-loop before tool execution
- **Processors** — intercept/transform messages before and after generation
- **Guardrails** — safety constraints on agent output
- **Voice** — STT/TTS for voice chat
- **Channels** — Slack, Discord, Telegram adapters
- **Background tasks** — agent continues work after streaming completes
- **Supervisor agents** — multi-agent orchestration (router, delegator patterns)

---

## Dependency Installation

```bash
npm install @mastra/editor @mastra/mcp @mastra/agent-browser
```

Current installed: `@mastra/core@^1.37.1`, `@mastra/ai-sdk@^1.4.3`, `mastra@^1.10.2`.

---

## Notes

- The **Workspace** feature (`@mastra/core/workspace` added in `@mastra/core@1.1.0`) is the most natural fit for the vault architecture — it directly replaces the need for custom file/sandbox tools
- The **Editor** could eliminate the per-request agent factory pattern by storing user personas as versioned overrides
- The **MCPServer** enables Dialogue to become an orchestration hub that other AI tools can call into

---

## Future Considerations (Post-Vault-Solidity)

### Optional Always-On Infrastructure (VPS / PaaS)

The current architecture is local-first: all periodic work (reflections, digest synthesis, habit reminders) runs on app open. This is by design — no always-on server needed.

For users with a VPS or PaaS deployment, these could become optional background services:

| Service | What it would run | Infrastructure |
|---|---|---|
| **Scheduler cron** | Daily log synthesis, weekly digest, N-log profile refinement, habit reminder dispatch | Electron currently polls `GET /api/jobs/scheduler/poll` every 60s. A VPS could replace this with a real cron daemon poking the same endpoint. |
| **Workflow runners** | Long-running agent workflows that shouldn't block the UI | Mastra workflow runners (Inngest integration mentioned in docs) — only meaningful if deployed to an always-on host. |
| **Push notifications** | Web push for devices that aren't running the desktop app | Requires a public HTTPS endpoint + VAPID keys. Currently only local OS notifications via Electron. |
| **Agent background tasks** | Post-stream processing (playbook generation, memory consolidation) | Mastra `Agent.streamUntilIdle()` keeps the stream open until background tasks complete. On a VPS this could run without a connected client. |

**Design principle**: All of these should be **strictly opt-in and additive**. The local-first experience must never regress — the vault is the source of truth, the desktop app is the primary interface, and everything works offline. Always-on features are a deployment choice, not an architectural dependency.
