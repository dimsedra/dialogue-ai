<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# End goal

**`README.md` is the end-goal source of truth.** It defines the product (a relationship-first AI companion), the agentic capabilities, the on-device architecture, and the install story. Read it before making product, UX, or architecture decisions — every change should be measured against the relationship it serves, not the features it adds.

# Workflow Guidelines

- **Implementation Plan**: For any meaningful changes, always ensure there is an implementation plan. Make sure you've mapped out everything you need for the implementation, files to touch, modify, add, delete, or if there's any potential dependencies from another logic/files that may break because of the changes, etc. The plan is your source of truth. So the better it is, the better is for you too at implementing.
- **Friction Resolution**: If any friction arises that needed a resolution (e.g., due to a mismatch/disconnection between the user's intent and the project's Source of Truth), inform the user and present clear options within a discussion.
- **Automated Testing**: For any meaningful changes, always ensure there are automated tests verifying the changes before they are considered valid, official, and functional.
- **Git Operations**: Never commit or push changes without explicit instructions/permission from the user.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
