# Task & Event Resource Hub (Hybrid Ledger Asset Linking)

Dialogue aims to be a cohesive work companion. Rather than storing documents and external research links scattered across chat feeds, Dialogue links these assets directly to specific tasks or events.

To prevent schema and tool bloat, Dialogue avoids rigid database relational arrays or custom mutations. Instead, it leverages the **Living Task Context (Chronological Notes Ledger)**. The agent appends files, links, and documents directly to the task or event's text notes. The Next.js client then parses these references reactively to render a structured **Resource Tray** in the UI.

---

## 1. Paradigm & Asset Linking Mechanics

When a user shares a resource (such as a Figma design link or a PDF attachment) and asks the agent to associate it with a task, the agent appends a structured log line to the `notes` field using the existing `updateTask` or `updateEvent` tools.

### Structured Log Formats

The agent writes logs using standard markdown link syntax with specific prefixes:

* **Web Links**:
  `[2026-05-19 23:25] Linked Asset: [Figma Specs Workspace](https://figma.com/file/xxx)`
* **File Attachments (Convex Storage)**:
  `[2026-05-19 23:26] Attached File: [client_brief.pdf](storage:kg7b8q8e5fd...)`

By wrapping files and links in standard markdown, the notes remain human-readable in plain text, preserving the chronological context of *when* and *why* an asset was added.

---

## 2. Client-Side Parsing & Extraction

The UI client (`src/components/panel/TaskList.tsx` and `CalendarView.tsx`) does not require new database queries. When rendering task details, it parses the task's `notes` string to extract assets on-the-fly.

### Parsing Expression

```typescript
// Regex to extract title, URL or storage ID, and timestamp from notes ledger
const referenceRegex = /\[([\d-]+\s[\d:]+)\]\s(?:Linked Asset|Attached File):\s\[([^\]]+)\]\(([^\s)]+)\)/g;

export interface ExtractedResource {
  timestamp: string;
  title: string;
  url: string;
  type: "url" | "document";
  storageId?: string;
}

export function extractResources(notes?: string): ExtractedResource[] {
  if (!notes) return [];
  const resources: ExtractedResource[] = [];
  let match;
  
  while ((match = referenceRegex.exec(notes)) !== null) {
    const [_, timestamp, title, rawUrl] = match;
    const isStorage = rawUrl.startsWith("storage:");
    
    resources.push({
      timestamp,
      title,
      url: isStorage ? rawUrl.replace("storage:", "") : rawUrl,
      type: isStorage ? "document" : "url",
      storageId: isStorage ? rawUrl.replace("storage:", "") : undefined,
    });
  }
  return resources;
}
```

---

## 3. UI Presentation Layer (`TaskPanel`)

The visual implementation translates parsed text logs into a rich dashboard experience:

1. **Indicator Badges**: Tasks with linked assets display a subtle clip icon (`📎`) beside the task checkbox in the list view.
2. **Interactive Resource Tray**: Clicking on a task details card reveals a dedicated **"Assets & Links"** grid containing glassmorphic buttons labeled with the resource title, icon (Figma, PDF, web page link), and the linking timestamp.
3. **Reactive Storage Resolution**: For resources with type `"document"`, the client uses the Convex file storage resolver hook to fetch the download URL when the button is clicked.
4. **Consent-Gated Attachment Flow**: If a user drags a file or shares a URL during chat, the agent proposes: *"I've uploaded your budget draft. Shall I link it to the 'Q2 Planning' task?"* Upon the user clicking "Confirm" on the verification card, the agent appends the log line via `updateTask`.

---

## Implemented (2026-05-23)

- **Dedicated `resources` field** on tasks/events schema with `type`, `title`, `url`, `summary`, `linkedAt`
- Agent appends structured resources via `updateTask`/`addTask` with optional content summary from chat context
- UI renders resources as clickable chips in expanded task view with paperclip count badge

## Future Enhancement

- **Agent Re-Reading linked files**: Currently only the `summary` survives after linking. The agent cannot re-read the original file content later. A `getTaskResources` tool could return full `extractedText` for storage-linked documents, enabling the agent to answer questions about linked content in later conversations.
