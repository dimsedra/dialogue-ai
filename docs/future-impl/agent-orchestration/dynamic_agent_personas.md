# Dynamic Agent Personas & Real-Time Prompt Refinement

This document outlines the architecture for **Dynamic Agent Personas** in Dialogue. It enables the AI agent to update its own persona instructions and system prompts in real time based on user interactions, stored as local-first Markdown files.

---

## 1. Filesystem Directory Layout

Personas are stored as physical `.md` files under a dedicated `personas/` directory in the vault. This allows users to easily share, edit, or back up their custom personas.

```
dialogue-vault/
└── personas/
    ├── dialogue.md          <--- Default Persona
    ├── tech-companion.md    <--- Specialized Coding Persona
    └── therapist.md         <--- Reflective Listening Persona
```

---

## 2. Document Format (YAML Frontmatter + Markdown Body)

Each persona file contains configuration metadata in the frontmatter, and the raw system prompt in the body.

```yaml
---
id: persona-dialogue
name: "Dialogue"
description: "Default relationship-first companion"
max_characters: 2500
updated_at: 2026-06-09
---

You are Dialogue, a relationship-first AI companion. 

## Communication Guidelines
* Keep responses technically precise and concise.
* Omit polite greetings or pleasantries (e.g., do not start responses with "Sure!", "Great!", or "Good morning").
* Present code snippets directly in markdown blocks with custom CSS fallback rules.

## User Preferences
* Call the user "Max" (updated 2026-06-09).
* Prioritize local-first, offline database schemas (SQLite/PocketBase).
```

---

## 3. Feedback-Driven Prompt Refinement Engine

Unlike the user profile (which consolidates analytical traits in the background), the agent's Dynamic Persona is updated **strictly in response to user feedback within the conversation**. It never self-updates from background logs, preventing artificial "personality creep" or incorrect behavioral assumptions.

### The Refinement Triggers
The agent listens for two types of feedback to trigger a persona update:
1.  **Explicit Instructions**: Direct commands from the user about how the agent should talk, format, or behave (e.g. *"Stop using emojis"*, *"Speak in French from now on"*, *"Keep code blocks raw with no explanations"*).
2.  **Implicit Remarks / Feedback**: Remarks indicating user satisfaction, style preferences, or formatting critiques (e.g. *"I like your way of thinking about this"*, *"That explanation was way too wordy"*, *"I love this structured bullet point style"*).

When the agent detects either trigger, it invokes the `updateAgentPersona` tool to refine its system instructions.

### The Refinement Protocol
The tool does not blindly append text; it follows a strict **refinement protocol**:
1.  **Refine, Don't Append**: The agent edits and restructures the existing prompt text rather than stacking new bullet points at the bottom.
2.  **Conflict Resolution**: If new feedback conflicts with an old guideline, the agent replaces the old guideline.
3.  **Strict Character Cap (2000–3000 Characters)**:
    *   The settings enforce a hard cap (configurable, defaulting to `2500` characters).
    *   If the update would push the prompt length over the limit, the agent is instructed to **compress and consolidate** existing guidelines, removing redundant phrasing to free up space.

### Agent Tool Schema

The agent uses the following tool to perform self-updates:

```typescript
updateAgentPersona(args: {
  personaId: string;
  updatedPrompt: string; // The fully consolidated and refined prompt
})
```

---

## 4. In-App Integration Flow

1.  **Detection**: The user says: *"Stop explaining the code blocks, just give me the raw code."*
2.  **Refinement Execution**: The agent reads the current persona prompt, rewrites the "Communication Guidelines" section to include *"Do not explain code blocks; output raw code only"*, and ensures the entire prompt fits under the 2500 character limit.
3.  **Write and Cache Sync**: The agent calls `updateAgentPersona`. The system writes the new content to `vault/personas/dialogue.md`. The local file watcher catches the change and updates the SQLite database cache instantly.
4.  **Next-Turn Load**: On the next user message, the chat route reads the updated prompt from the database cache, and the agent immediately operates under the new instructions.
