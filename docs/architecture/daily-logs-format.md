# Daily Log & Activity Log Formats

This document defines the markdown formats, YAML frontmatter schemas, and layout conventions for the physical files representing Dialogue's daily logs.

---

## 1. Global Daily Log

- **File Path**: `vault/daily-logs/YYYY-MM-DD.md`
- **Purpose**: Tracks global/personal diary entries, habits checklist, and global task/event activities.

```markdown
---
date: YYYY-MM-DD
type: daily-log
---

# Daily Log - YYYY-MM-DD

## Today's Habits
- [ ] Habit Name 1
- [x] Habit Name 2

## Chat Activity & Reflected Thoughts
- **[Global Chat Session Name]**: LLM-generated reflection of the thread's discussion today.

## Tasks Completed Today
- [x] task-id-123: Task Title (Completed at: HH:MM)

## Events Today
- [x] event-id-456: Event Title (Time: HH:MM)
```

---

## 2. Workspace Activity Log

- **File Path**: `vault/workspaces/[slug]-[workspaceId]/activity/YYYY-MM-DD.md`
- **Purpose**: Tracks workspace-specific engineering logs, session logs, and tasks.

```markdown
---
date: YYYY-MM-DD
type: workspace-activity
workspace: workspaceId
---

# Workspace Activity - YYYY-MM-DD

## Chat Activity & Reflected Thoughts
- **[Workspace Session Name]**: LLM-generated reflection of the thread's discussion today.

## Tasks Completed Today
- [x] task-id-789: Workspace Task Title (Completed at: HH:MM)

## Events Today
- [x] event-id-012: Workspace Event Title (Time: HH:MM)
```
