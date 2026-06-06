<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# End goal

**`README.md` is the end-goal source of truth.** It defines the product (a relationship-first AI companion), the agentic capabilities, the on-device architecture, and the install story. Read it before making product, UX, or architecture decisions — every change should be measured against the relationship it serves, not the features it adds.

The current technical work to reach that end goal lives in `docs/MIGRATION_POCKETBASE.md` (Convex → Tauri + PocketBase, phased plan, risks, cutover strategy).

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

All runtime env vars are listed in `.env.example`. `.env.local` is gitignored. VAPID keys and `ENCRYPTION_KEY` must also be set in the Convex dashboard — the Convex Node runtime does not read Next.js's env.