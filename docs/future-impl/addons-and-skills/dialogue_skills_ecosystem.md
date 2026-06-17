# The Dialogue Skills Ecosystem

This document outlines the architecture, shipping strategy, and integration workflows for **Dialogue Skills** (Phase 2.4b and Phase 3c of the [project timeline](../../PROJECT_TIMELINE.md)). It defines the first-party skills shipped out-of-the-box, the community skill integration model, and the standards for writing skill outputs back to the local vault.

---

## 1. The Workspace Skills Engine

Dialogue's workspace agent integrates the [Agent Skills Open Standard](https://agentskills.io). A "Skill" is a self-contained folder placed inside Dialogue's skills directories:
*   **Global Skills**: Located at `vault/system/skills/` (accessible across all workspaces).
*   **Workspace Skills**: Located at `vault/workspaces/[Workspace-Name]/skills/` (isolated to that workspace).

### Directory Layout of a Skill
```
skills/last30days/
├── SKILL.md          <--- Markdown instructions, system prompt extensions, tool schemas
├── manifest.json     <--- Version, author, execution runtime requirements
└── scripts/          <--- Executable scripts (Python, Node, Shell) run in sandboxed terminal
```

### Dynamic Tool Registration
On startup, the workspace scans these directories. For each skill found:
1.  **Instructions Ingestion**: It appends the rules in `SKILL.md` to the agent's workspace system prompt.
2.  **Tool Generation**: It generates dynamic executor tools (e.g., `execute_skill_script(skillName, scriptName, args)`) allowing the agent to run the skill's scripts in a sandboxed shell and receive the output.

---

## 2. First-Party Skills (Shipped Out-of-the-Box)

Dialogue ships with four core first-party skills to handle system operations, collaboration, research, and troubleshooting:

### A. `dialogue-core` (System Foundation — Shipped Active)
*   **Purpose**: Teaches the agent Dialogue's vault ecosystem conventions.
*   **Instructions**: Details directory layout, YAML frontmatter schemas (tasks, events, notes, research), memory ingestion pipelines, and SQLite graph edge wiring.
*   **Benefit**: Ensures that any raw data retrieved by other tools or community skills is formatted and stored correctly within Dialogue's filesystem before being presented to the user.

### B. `dialogue-web-research` (Information Retrieval — Shipped Active)
*   **Purpose**: Equips the agent to conduct targeted web scraping and research.
*   **Integrations**: Exposes tools for Google/Bing search API, Playwright-based page rendering, and markdown HTML conversion.
*   **Output**: Dynamically compiles findings into structured research files (`vault/research/YYYY-MM-DD-topic.md`) with inline citations and sources.

### C. `dialogue-git-collaboration` (Version Control & Sync — Shipped Active)
*   **Purpose**: Enables offline-first, peer-to-peer workspace synchronization using Git.
*   **Instructions**: Instructs the agent how to run git status, stage vault file changes, generate semantic commit messages (e.g. `docs: update user profile`), and pull/push to remote repositories.
*   **Benefit**: Serves as the primary engine for zero-cloud collaboration. The agent handles merge conflicts and synchronizes tasks/notes behind the scenes.

### D. `dialogue-playbook-helper` (Autodidactic Execution — Shipped Active)
*   **Purpose**: Helps the agent and user compile execution playbooks for repetitive CLI or development tasks.
*   **Instructions**: Watches terminal exit codes and command histories. When a task succeeds, it prompts the user to compile the steps into `vault/playbooks/`. When a task fails, it retrieves matching playbooks to suggest troubleshooting steps.

---

## 3. Featured Community Skills (Installable on Demand)

Users can install third-party skills using a command-line installer `npx skills add <skill-name>` or the settings interface. Key featured skills include:

| Skill | Source | Capability | Runtime |
|---|---|---|---|
| **`last30days`** | `community/last30days` | Crawls Reddit, X, HackerNews, and YouTube to build a social engagement pulse on any tech/topic. | Python 3.11+ |
| **`gptr-researcher`** | `community/gpt-researcher` | Runs a multi-agent deep research pipeline to output highly detailed, cited reports. | Python 3.10+ |
| **`obsidian-importer`** | `community/obsidian-import` | Migrates folders, tags, and internal wiki-links from Obsidian vaults into Dialogue notes. | Node.js |

---

## 4. Integration Rule: Vault-First Writes

Community skills typically return raw text briefs or JSON data. To prevent Dialogue from becoming a dumping ground for raw LLM text, **all skills must follow the Vault-First Write Rule**:

```
[Execute Skill (e.g., last30days)]
                │
                ▼ (Raw JSON / Text output)
[dialogue-core checks schemas]
                │
                ▼ (Validate frontmatter)
[Write to Vault (e.g. vault/research/)]
                │
                ▼ (File Watcher detects file write)
[Auto-index to memories.md & SQLite Cache]
                │
                ▼
[Present synthesized response to User with file links]
```

1.  **Format and Persist First**: The agent must write the raw output of a skill into a vault Markdown file (`vault/research/`, `vault/notes/`, or task notes) *before* talking to the user.
2.  **Auto-Index**: The sync engine automatically detects the write, hashes the file, embeds it using local Xenova models, and caches it in `memories.md` and the SQLite database.
3.  **Link and Present**: The agent replies to the user with a concise summary, appending a clickable local file link (e.g., `[Research Brief](file:///path/to/report.md)`) so the user owns the persistent record.
