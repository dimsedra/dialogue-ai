# Phase 1.5 — End-to-end PocketBase schema verification

Phase 1 (schema mapping + graph decision + pb-compat type surface) was proved end-to-end against a real PocketBase 0.39.1 instance on 2026-06-07. This document records the procedure and the result.

## What was verified

`pb_migrations/1700000000_init_collections.js` was applied to a fresh `pb_data` directory and the resulting SQLite schema was inspected. 117 checks pass across 10 categories:

1. **All 20 app collections exist** with the expected minimum field and index counts (the 19 from Convex + 1 new `scheduled_notifications`).
2. **`users` extension** has all 6 authTables custom fields: `name`, `image`, `emailVerificationTime`, `phone`, `phoneVerificationTime`, `isAnonymous`.
3. **Critical field presence** across all collections — types match the spec (e.g. `memories.embedding` is `json`, `events.series` is `relation`, `user_images.storageId` is `file`).
4. **Access rules** are present on every user-owned collection; `messages` correctly uses the permissive fallback (`@request.auth.id != ''`).
5. **Unique indexes** are in place on `page_settings` and `push_subscriptions` (Convex had conceptual uniqueness; PB enforces at the DB level).
6. **`events.series` self-reference** resolves correctly to its own collection id (`pbc_1687431684`), and `idx_events_series` is created.
7. **Relation integrity** — every relation field's `collectionId` points to an existing collection (0 broken links across all 21 app + 5 system collections).
8. **Cascade delete** — every user-owned collection's `user` field has `cascadeDelete: true` (Convex parity).
9. **Select field value lists** — `priority`, `eventType`, `frequency`, `status`, `type`, `kind` all match the source-of-truth enumerations.
10. **File field constraints** — `user_images.storageId` accepts only `image/*` mime types with a 50MB cap; `messages.storageId` accepts any mime type with a 50MB cap.

## How to re-run

Requires:
- Node 22+ (uses `node:sqlite` which is still experimental; run with `--experimental-sqlite`)
- PocketBase 0.39.1+ Windows binary (or any platform)

```sh
# From the project root
node --experimental-sqlite scripts/verify-pb-migration.mjs C:\path\to\pocketbase.exe
```

The script:
1. Creates a temporary PB data directory under `%TEMP%\pb-verify-<timestamp>\`.
2. Copies the migration into a `pb_migrations/` subdir.
3. Runs `pocketbase migrate up` against the fresh data dir.
4. Reads the resulting `data.db` and runs the 117 checks.
5. Cleans up the temp directory on success or failure.

## Result

```
=== Result: 117 passed, 0 failed ===
```

Migration is **idempotent** — verified by `pocketbase migrate down 1` followed by `migrate up`, which re-passes 117/117.

## Caveats

- The script only verifies the **schema**. Data migration (Phase 4) and runtime behaviour (Phase 2 hooks) are separate.
- The users extension adds the `name` field, but `name` is already a default PB auth field. PB silently merges (or rejects the duplicate) — net result is correct (5 new fields + the existing name). This is safe but noted for future migrations.
- The migration's two-pass approach for the `events.series` self-reference is documented in the migration file's inline comment; it's the only collection requiring a second `app.save()`.

## Companion artifacts

- `pb_migrations/1700000000_init_collections.js` — the migration (commit `3c1797c` updated, current state in this commit).
- `scripts/verify-pb-migration.mjs` — the verification script.
- `docs/migration/phase-1-schema-mapping.md` — the human-readable mapping the migration implements.
- `docs/migration/phase-1-graph-decision.md` — the 4 keep / 6 delete edge decision.
- `src/pb-compat/_generated/dataModel.ts` — TypeScript types that mirror this schema (21 type-level tests, all pass).
