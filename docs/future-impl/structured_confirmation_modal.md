# Future Implementation: Step-by-Step Confirmation Modal

- **Status**: Planned
- **Priority**: Medium
- **Scoped to**: `addTask` and `addEvent` only (updates are too contextual)

---

## 1. Problem Statement

When creating a task or event, the agent currently dumps all confirmation questions in a single text message:

> *"I'll create this. What priority? Category? Due date? Any notes? Please confirm."*

The user reads through the list, types answers for each, and the agent parses the response. This is:

1. **Overwhelming** — multiple questions at once, easy to miss one
2. **Fragile** — agent must parse free-text answers from a multi-part user response
3. **Slow** — user scrolls up to re-read the questions if they forgot

---

## 2. Proposed UX

### 2.1. Agent Decides When to Use

The agent has discretion. For simple requests:

> *"Add buy milk"* → agent creates immediately with defaults (no modal)

For detail-rich requests where confirmation is needed:

> *"Add a task for the Q2 Planning project"* → agent says:

> *"Let me ask you a few questions so I can get this straight:"*

Then the **step-by-step modal** appears.

### 2.2. One Question at a Time — Pure Free Text

No pre-filled choices, no radio buttons. Each question is a simple prompt with a text input:

```
┌───────────────────────────────────────────┐
│  Adding Task: "Q2 Planning"              │
│  ─────────────────────────────             │
│                                           │
│  Step 1 of 4                              │
│                                           │
│  ❓ What priority?                        │
│                                           │
│  ┌───────────────────────────────────┐   │
│  │ [_____________________________]  │   │
│  └───────────────────────────────────┘   │
│                                           │
│           [Skip]          [Next →]         │
└───────────────────────────────────────────┘
```

Key properties:
- **One question at a time** — no cognitive overload
- **Free text input** — user types naturally in their own language
- **Agent provides context** — for categories, the agent lists existing relevant categories and suggests the best match
- **Pre-filled suggestion** — input starts with the agent's best guess, user can edit or overwrite
- **Skip button** — optional fields can be skipped
- **Progress indicator** — "Step 2 of 4" so users know what's left

### 2.3. Question Sets

For tasks (in order):
1. **Priority?** (skippable — defaults to medium)
2. **Category?** (skippable — defaults to General. Agent lists existing relevant categories from the user's task history, pre-fills the best match as a suggestion)
3. **Due date?** (skippable — no due date)
4. **Notes?** (skippable — no notes)
5. **Resources?** (skippable — the agent reports what it found: "I see you uploaded a spreadsheet — link it?" with a quick confirm)

For events (in order):
1. **Event type?** — "interval" for duration events, "point" for momentary
2. **Start time?**
3. **End time?** (only if interval)
4. **Location?** (skippable)
5. **Recurrence?** (skippable — one-time)

### 2.4. No Summary Screen

After the last question, the system immediately creates the entity. The agent responds with the standard tool card as confirmation. No extra review step — the user answered each question one at a time, no surprises.

However, if the modal detects conflicting or ambiguous answers, it shows one final confirmation:

```
┌───────────────────────────────────────────┐
│  ⚠️ You said priority "urgent highest"   │
│  but available values are: low, medium,  │
│  high. I'll set it to "high" instead.    │
│                                           │
│  [Edit]              [Looks Good ✓]       │
└───────────────────────────────────────────┘
```

### 2.5. After Submission

1. Client fires `addTask`/`addEvent` mutation with the collected values
2. Client normalizes values (e.g., "urgent" → "high", "next Friday" → timestamp)
3. Agent sees the tool card result and responds naturally:
   > *"Task created! Q2 Planning with high priority. I've set the category to Work and due next Friday. Need any adjustments?"*

---

## 3. Technical Approach

### 3.1. Agent Communication

The agent calls a `proposeTask` or `proposeEvent` tool when it judges the user needs guidance:

```typescript
// Agent calls proposeTask with what it already knows
{
  name: "proposeTask",
  args: {
    text: "Q2 Planning",
    knownFields: {
      priority: "medium",
      category: "Work",
    }
  }
}
```

`knownFields` contains whatever the agent already understood from the conversation. The client skips questions for fields the agent already knows.

### 3.2. Client-Side Lifecycle

```
Agent calls proposeTask({ text: "Q2 Planning", knownFields: { priority: "medium" } })
  ↓
Client receives tool call
  ↓
Client determines missing fields: [category, dueDate, notes]
  ↓
Shows modal: one by one for missing fields only
  ↓
User fills "category: Work", "dueDate: Friday", skips notes
  ↓
Client normalizes values (Friday → timestamp)
  ↓
Client fires addTask with all confirmed values
  ↓
Client resolves the proposeTask tool call with success
  ↓
Agent responds naturally
```

### 3.3. Value Normalization

The client handles normalization to avoid sending raw text to the mutation:

```typescript
function normalizePriority(value: string): "low" | "medium" | "high" {
  const lower = value.toLowerCase();
  if (["high", "urgent", "important", "top"].some(k => lower.includes(k))) return "high";
  if (["low", "minor", "trivial", "someday"].some(k => lower.includes(k))) return "low";
  return "medium";
}
```

If normalization fails (unrecognized value), the modal asks for clarification before proceeding.

### 3.4. Proposed Tool Schema

```typescript
// convex/ai_action.ts — tool definition
{
  name: "proposeTask",
  description: "Call this when you need to confirm task details with the user. Pass whatever you already know in knownFields. The client will ask the user for any missing fields. Does NOT create the task — the client does that after confirmation.",
  parameters: {
    text: { type: SchemaType.STRING },
    knownFields: {
      type: SchemaType.OBJECT,
      properties: {
        priority: { type: SchemaType.STRING },
        category: { type: SchemaType.STRING },
        dueDate: { type: SchemaType.STRING },
        notes: { type: SchemaType.STRING },
        resources: {
          type: SchemaType.ARRAY,
          description: "Any files or URLs the user asked to link. Each includes title, url, and optional summary.",
          items: {
            type: SchemaType.OBJECT,
            properties: {
              type: { type: SchemaType.STRING, description: "'url' or 'document'" },
              title: { type: SchemaType.STRING },
              url: { type: SchemaType.STRING },
              summary: { type: SchemaType.STRING },
            },
            required: ["type", "title", "url"],
          },
        },
      },
    },
  },
  required: ["text"],
}
```

---

## 4. Comparison Table

| Aspect | Current (Text Q&A) | Proposed (Modal) |
|---|---|---|
| Questions delivered | All at once in one message | One at a time |
| User answers | Type everything in one reply | Type per question |
| Agent parsing | Must parse multi-part free text | Receives structured values |
| Overwhelm risk | High | Low |
| Implementation effort | None (current state) | Medium |
| Language support | Natural | Natural |
| Works with any LLM | Yes | Yes (tool-based) |

---

## 5. Implementation Surface

| File | Change |
|---|---|
| `convex/ai_action.ts` | Add `proposeTask` and `proposeEvent` tool definitions |
| `convex/ai.ts` | Add SKILLS_INSTRUCTION for propose tools |
| `src/lib/lmstudio.ts` | Add OpenAI-format propose tool defs |
| `src/components/chat/ProposalModal.tsx` | **New** — step-by-step Q&A modal |
| `src/components/chat/types.ts` | Add propose-related types |
| `src/components/Chat.tsx` | Handle proposeTask/proposeEvent tool calls → open modal, fire mutation on completion |
| `src/components/chat/ToolCard.tsx` | Render propose tool as pending state |

---

## 6. Open Questions

1. **Should the modal always show for new tasks/events, or agent-discretion?** (Recommend: agent discretion — simple tasks skip it)
2. **What about mobile?** Same modal, just full-screen instead of centered.
3. **Should answered questions be editable?** After answering all questions, should user be able to go back? (Recommend: yes, simple back button.)
