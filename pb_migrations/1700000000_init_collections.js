// PocketBase migration: 1700000000_init_collections.js
//
// Phase 1 of the Convex → PocketBase migration. See:
//   - docs/migration/phase-1-schema-mapping.md (the human-readable mapping)
//   - docs/MIGRATION_POCKETBASE.md §5 Phase 1
//
// What this migration does:
//   - Extends PB's built-in `users` collection with fields from Convex's `authTables.users`.
//   - Creates 19 PB collections, one per Convex app table (see schema-mapping.md table list).
//   - Creates the `scheduled_notifications` PB table (replacement for Convex's
//     `_scheduled_functions` system; see plan §3.7).
//   - Adds an index for every Convex `.index(...)` and compound index.
//   - Vector indexes stay in LadybugDB, not PB (no PB equivalent).
//
// What this migration does NOT do:
//   - Touch Convex. Both systems coexist; no data migration yet (that's Phase 4).
//   - Touch any app code. `api.*` still resolves to Convex (this phase is schema-only).
//   - Add system rules or hooks. Those come in Phase 2 with the pb-compat adapter.
//
// PB 0.22+ JS migration API (verified against https://pocketbase.io/docs/js-migrations):
//   - migrate((app) => {...}, (app) => {...}) — `app` is a transactional App instance.
//   - app.findCollectionByNameOrId(name)        — fetch a collection.
//   - app.save(collection)                       — persist a new or modified collection.
//   - app.delete(collection)                     — delete a collection.
//   - For NEW collections: pass `fields: [plainObj, ...]` and `indexes: [sqlStr, ...]`
//     to `new Collection({...})`. The JSVM processes the plain object array and
//     auto-adds the system `id` field. Class instances (new TextField({...})) in
//     the array are silently ignored — confirmed by direct testing.
//   - For MODIFYING existing collections (e.g. extending `users`): use
//     `collection.fields.add(new TextField({...}))` with class instances.
//   - Rules: use `fieldName = @request.auth.id` (PB auto-derefs relation fields).
//   - Specific field types (per PB docs): text, number, bool, email, url, date,
//     select, file, relation, json, geoPoint. All are passed as plain objects.
//
// Conventions (full table in schema-mapping.md "Conventions" section):
//   - v.id("table")     -> { type: "relation", collectionId: ..., cascadeDelete: true,
//                              maxSelect: 1, minSelect: 0 }
//   - v.number()        -> { type: "number", ... }
//   - v.array(v.X())    -> { type: "json", ... }
//   - v.object({...})   -> { type: "json", ... }
//   - v.any()           -> { type: "json", ... }
//   - v.union(v.lit..)  -> { type: "select", maxSelect: 1, values: [...] }
//   - v.optional(v.X()) -> field with required: false
//   - v.id("_storage")  -> { type: "file", maxSelect: 1, maxSize: 52428800, mimeTypes: [] }
//   - v.id("_sched...") -> { type: "text", max: 64 }
//
// Idempotency: PB auto-skips already-applied migrations on startup. This file is
// run once. To re-apply, delete the corresponding row from `_migrations`.
//
// Rollback: the second migrate() arg removes the collections in reverse order and
// removes the custom fields we added to `users`. PB does not preserve data on
// rollback — this is acceptable because we're greenfield (no data migrated yet).

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collections = {};

    // ========================================================================
    // 1. Extend built-in `users` with authTables fields.
    //    PB users already has: id, email, verified, created, updated, etc.
    //    We add the fields from @convex-dev/auth's authTables.users:
    //      name, image, emailVerificationTime, phone, phoneVerificationTime, isAnonymous
    //
    //    For MODIFYING existing collections, use `collection.fields.add(new XField({...}))`
    //    with class instances. This works (verified).
    // ========================================================================
    const users = app.findCollectionByNameOrId("users");
    users.fields.add(new TextField({ name: "name", max: 256 }));
    users.fields.add(new URLField({ name: "image", max: 2048 }));
    users.fields.add(new NumberField({ name: "emailVerificationTime" }));
    users.fields.add(new TextField({ name: "phone", max: 32 }));
    users.fields.add(new NumberField({ name: "phoneVerificationTime" }));
    users.fields.add(new BoolField({ name: "isAnonymous" }));
    // No "by_email" / "by_phone" indexes on users here — PB auto-indexes email
    // (built-in) and phone is not currently queried by index in the app.
    app.save(users);
    collections.users = users;

    // Cache users collection id for relation fields.
    const userCollectionId = users.id;

    // ========================================================================
    // 2. agent_personas (depends on users)
    //    Convex: agentPersonas { userId, name, prompt, description?, isDefault?, createdAt }
    //           .index("by_user", ["userId"])
    // ========================================================================
    collections.agent_personas = new Collection({
      name: "agent_personas",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "name", type: "text", required: true, max: 256 },
        { name: "prompt", type: "text", required: true, max: 65535 },
        { name: "description", type: "text", required: false, max: 1024 },
        { name: "isDefault", type: "bool", required: false },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_agent_personas_user ON agent_personas (user)",
      ],
    });
    app.save(collections.agent_personas);

    // ========================================================================
    // 3. workspaces (depends on users, agent_personas)
    //    Convex: workspaces { userId, name, icon, color, context?, agentName?,
    //                        defaultAgentPersonaId?, createdAt }
    //           .index("by_user", ["userId"])
    // ========================================================================
    collections.workspaces = new Collection({
      name: "workspaces",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "name", type: "text", required: true, max: 256 },
        { name: "icon", type: "text", required: true, max: 256 },
        { name: "color", type: "text", required: true, max: 32 },
        { name: "context", type: "text", required: false, max: 65535 },
        { name: "agentName", type: "text", required: false, max: 256 },
        { name: "defaultAgentPersona", type: "relation", required: false, collectionId: collections.agent_personas.id, cascadeDelete: false, maxSelect: 1, minSelect: 0 },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_workspaces_user ON workspaces (user)",
      ],
    });
    app.save(collections.workspaces);

    // ========================================================================
    // 4. chat_sessions (depends on users, workspaces, agent_personas)
    //    Convex: chatSessions { userId, title?, workspaceId?, agentPersonaId?,
    //                          timezone?, createdAt, lastActivity, pinned? }
    //           .index("by_user", ["userId"])
    //           .index("by_workspace", ["workspaceId"])
    // ========================================================================
    collections.chat_sessions = new Collection({
      name: "chat_sessions",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "title", type: "text", required: false, max: 512 },
        { name: "workspace", type: "relation", required: false, collectionId: collections.workspaces.id, cascadeDelete: false, maxSelect: 1, minSelect: 0 },
        { name: "agentPersona", type: "relation", required: false, collectionId: collections.agent_personas.id, cascadeDelete: false, maxSelect: 1, minSelect: 0 },
        { name: "timezone", type: "text", required: false, max: 64 },
        { name: "createdAt", type: "number", required: true },
        { name: "lastActivity", type: "number", required: true },
        { name: "pinned", type: "bool", required: false },
      ],
      indexes: [
        "CREATE INDEX idx_chat_sessions_user ON chat_sessions (user)",
        "CREATE INDEX idx_chat_sessions_workspace ON chat_sessions (workspace)",
        "CREATE INDEX idx_chat_sessions_user_lastActivity ON chat_sessions (user, lastActivity)",
      ],
    });
    app.save(collections.chat_sessions);

    // ========================================================================
    // 5. messages (depends on chat_sessions)
    //    Convex: messages { sessionId?, text, author, timestamp, timezoneOffset?,
    //                      toolCall?, toolCalls?, reasoning?, storageId?, fileType?, fileName?,
    //                      attachments?, scope? }
    //           .index("by_session", ["sessionId"])
    //    Heavy nested-object usage -> mostly json fields.
    // ========================================================================
    collections.messages = new Collection({
      name: "messages",
      type: "base",
      // Messages have no userId directly; access is mediated through chat_sessions in
      // app code. For now, allow any authenticated user to read; tighten in Phase 2.
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: "session", type: "relation", required: false, collectionId: collections.chat_sessions.id, cascadeDelete: true, maxSelect: 1, minSelect: 0 },
        { name: "text", type: "text", required: true, max: 65535 },
        { name: "author", type: "text", required: true, max: 256 },
        { name: "timestamp", type: "number", required: true },
        { name: "timezoneOffset", type: "number", required: false },
        { name: "toolCall", type: "json", required: false },
        { name: "toolCalls", type: "json", required: false },
        { name: "reasoning", type: "text", required: false, max: 65535 },
        // Convex v.id("_storage") -> PB file field
        { name: "storageId", type: "file", required: false, maxSelect: 1, maxSize: 52428800, mimeTypes: [] },
        { name: "fileType", type: "text", required: false, max: 256 },
        { name: "fileName", type: "text", required: false, max: 512 },
        // Convex v.array(v.object({...})) -> json array of file refs
        { name: "attachments", type: "json", required: false },
        { name: "scope", type: "json", required: false },
      ],
      indexes: [
        "CREATE INDEX idx_messages_session ON messages (session)",
        "CREATE INDEX idx_messages_session_timestamp ON messages (session, timestamp)",
      ],
    });
    app.save(collections.messages);

    // ========================================================================
    // 6. tasks (depends on users, workspaces)
    //    Convex: tasks { userId, text, workspaceId?, completed, dueDate?, dueDateStr?,
    //                   priority?, category?, notes?, progress?, statusHook?,
    //                   contextUpdatedAt?, createdAt, completedAt?, resources?,
    //                   reminderOffset?, scheduledNotificationId? }
    //           .index("by_user", ["userId"])
    //           .index("by_workspace", ["workspaceId"])
    // ========================================================================
    collections.tasks = new Collection({
      name: "tasks",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "text", type: "text", required: true, max: 65535 },
        { name: "workspace", type: "relation", required: false, collectionId: collections.workspaces.id, cascadeDelete: false, maxSelect: 1, minSelect: 0 },
        { name: "completed", type: "bool", required: false },
        { name: "dueDate", type: "number", required: false },
        { name: "dueDateStr", type: "text", required: false, max: 16 },
        { name: "priority", type: "select", required: false, maxSelect: 1, values: ["low", "medium", "high"] },
        { name: "category", type: "text", required: false, max: 128 },
        { name: "notes", type: "text", required: false, max: 65535 },
        { name: "progress", type: "number", required: false, min: 0, max: 100 },
        { name: "statusHook", type: "text", required: false, max: 256 },
        { name: "contextUpdatedAt", type: "number", required: false },
        { name: "createdAt", type: "number", required: true },
        { name: "completedAt", type: "number", required: false },
        { name: "resources", type: "json", required: false },
        { name: "reminderOffset", type: "number", required: false },
        { name: "scheduledNotificationId", type: "text", required: false, max: 64 },
      ],
      indexes: [
        "CREATE INDEX idx_tasks_user ON tasks (user)",
        "CREATE INDEX idx_tasks_workspace ON tasks (workspace)",
        "CREATE INDEX idx_tasks_user_completed ON tasks (user, completed)",
        "CREATE INDEX idx_tasks_user_dueDate ON tasks (user, dueDate)",
      ],
    });
    app.save(collections.tasks);

    // ========================================================================
    // 7. events (depends on users, workspaces, self for series)
    //    Convex: events { userId, title, description?, startTime, endTime?,
    //                    eventType?, location?, notes?, outcome?, statusHook?,
    //                    cancelled?, contextUpdatedAt?, workspaceId?, recurrence?,
    //                    createdAt, seriesId?, resources?, reminderOffset?,
    //                    scheduledNotificationId? }
    //           .index("by_user", ["userId"])
    //           .index("by_workspace", ["workspaceId"])
    //           .index("by_series", ["seriesId"])
    // ========================================================================
    collections.events = new Collection({
      name: "events",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "title", type: "text", required: true, max: 512 },
        { name: "description", type: "text", required: false, max: 65535 },
        { name: "startTime", type: "number", required: true },
        { name: "endTime", type: "number", required: false },
        { name: "eventType", type: "select", required: false, maxSelect: 1, values: ["interval", "point"] },
        { name: "location", type: "text", required: false, max: 512 },
        { name: "notes", type: "text", required: false, max: 65535 },
        { name: "outcome", type: "text", required: false, max: 65535 },
        { name: "statusHook", type: "text", required: false, max: 256 },
        { name: "cancelled", type: "bool", required: false },
        { name: "contextUpdatedAt", type: "number", required: false },
        { name: "workspace", type: "relation", required: false, collectionId: collections.workspaces.id, cascadeDelete: false, maxSelect: 1, minSelect: 0 },
        { name: "recurrence", type: "json", required: false },
        { name: "createdAt", type: "number", required: true },
        // NOTE: `series` (self-reference for recurring events) is added in a second
        // pass below because the collection's own id is assigned during app.save().
        { name: "resources", type: "json", required: false },
        { name: "reminderOffset", type: "number", required: false },
        { name: "scheduledNotificationId", type: "text", required: false, max: 64 },
      ],
      indexes: [
        "CREATE INDEX idx_events_user ON events (user)",
        "CREATE INDEX idx_events_workspace ON events (workspace)",
        "CREATE INDEX idx_events_user_startTime ON events (user, startTime)",
      ],
    });
    app.save(collections.events);
    // Second pass: add the self-referencing `series` relation. PB allows forward
    // self-references once the collection has its assigned id.
    collections.events.fields.add(new RelationField({
      name: "series",
      required: false,
      collectionId: collections.events.id,
      cascadeDelete: false,
      maxSelect: 1,
      minSelect: 0,
    }));
    collections.events.indexes.push("CREATE INDEX idx_events_series ON events (series)");
    app.save(collections.events);

    // ========================================================================
    // 8. user_profile (depends on users)
    //    Convex: userProfile { userId, name?, bio, preferences: v.any(),
    //                         weeklyNotesSummaries?, monthlyNotesSummaries?,
    //                         behavioralProfile? }
    //           .index("by_user", ["userId"])
    // ========================================================================
    collections.user_profile = new Collection({
      name: "user_profile",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "name", type: "text", required: false, max: 256 },
        { name: "bio", type: "text", required: true, max: 65535 },
        { name: "preferences", type: "json", required: true },
        { name: "weeklyNotesSummaries", type: "json", required: false },
        { name: "monthlyNotesSummaries", type: "json", required: false },
        { name: "behavioralProfile", type: "text", required: false, max: 65535 },
      ],
      indexes: [
        "CREATE INDEX idx_user_profile_user ON user_profile (user)",
      ],
    });
    app.save(collections.user_profile);

    // ========================================================================
    // 9. memories (depends on users)
    //    Convex: memories { userId, text, embedding: v.array(v.number()),
    //                      hash?, createdAt?, updatedAt? }
    //           .index("by_user", ["userId"])
    //           .index("by_hash", ["hash"])
    //           .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 384,
    //                                          filterFields: ["userId"] })
    //    Vector index: NO PB equivalent. Vector search lives in LadybugDB.
    //    The `embedding` PB field is just a json mirror of the 384-float array.
    // ========================================================================
    collections.memories = new Collection({
      name: "memories",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "text", type: "text", required: true, max: 65535 },
        // 384-float vector. json field; LadybugDB is the search index.
        { name: "embedding", type: "json", required: true },
        { name: "hash", type: "text", required: false, max: 64 },
        { name: "createdAt", type: "number", required: false },
        { name: "updatedAt", type: "number", required: false },
      ],
      indexes: [
        "CREATE INDEX idx_memories_user ON memories (user)",
        "CREATE INDEX idx_memories_hash ON memories (hash)",
        "CREATE INDEX idx_memories_user_createdAt ON memories (user, createdAt)",
      ],
    });
    app.save(collections.memories);

    // ========================================================================
    // 10. user_images (depends on users)
    //     Convex: userImages { userId, storageId: v.id("_storage"),
    //                         fileName, fileType, createdAt }
    //            .index("by_user", ["userId"])
    //     storageId is a single file ref -> PB file field.
    // ========================================================================
    collections.user_images = new Collection({
      name: "user_images",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "storageId", type: "file", required: true, maxSelect: 1, maxSize: 52428800, mimeTypes: ["image/*"] },
        { name: "fileName", type: "text", required: true, max: 512 },
        { name: "fileType", type: "text", required: true, max: 256 },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_user_images_user ON user_images (user)",
      ],
    });
    app.save(collections.user_images);

    // ========================================================================
    // 11. habits (depends on users, workspaces)
    //     Convex: habits { userId, workspaceId?, name, description?, frequency,
    //                     frequencyConfig, currentStreak, longestStreak,
    //                     lastLoggedAt?, lastLoggedDate?, archived, createdAt }
    //            .index("by_user", ["userId"])
    //            .index("by_workspace", ["workspaceId"])
    // ========================================================================
    collections.habits = new Collection({
      name: "habits",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "workspace", type: "relation", required: false, collectionId: collections.workspaces.id, cascadeDelete: false, maxSelect: 1, minSelect: 0 },
        { name: "name", type: "text", required: true, max: 256 },
        { name: "description", type: "text", required: false, max: 65535 },
        { name: "frequency", type: "select", required: true, maxSelect: 1, values: ["daily", "custom"] },
        { name: "frequencyConfig", type: "json", required: false },
        { name: "currentStreak", type: "number", required: true },
        { name: "longestStreak", type: "number", required: true },
        { name: "lastLoggedAt", type: "number", required: false },
        { name: "lastLoggedDate", type: "text", required: false, max: 16 },
        { name: "archived", type: "bool", required: false },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_habits_user ON habits (user)",
        "CREATE INDEX idx_habits_workspace ON habits (workspace)",
      ],
    });
    app.save(collections.habits);

    // ========================================================================
    // 12. habit_logs (depends on users, habits)
    //     Convex: habitLogs { userId, habitId, timestamp, dateString,
    //                        status: v.union("completed", "skipped"), notes? }
    //            .index("by_user", ["userId"])
    //            .index("by_habit", ["habitId"])
    //            .index("by_timestamp", ["timestamp"])
    //            .index("by_habit_dateString", ["habitId", "dateString"])
    //     Compound unique constraint by_habit_dateString: not enforced in PB;
    //     enforced in app layer (see schema-mapping.md "Gaps explicitly accepted").
    // ========================================================================
    collections.habit_logs = new Collection({
      name: "habit_logs",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "habit", type: "relation", required: true, collectionId: collections.habits.id, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "timestamp", type: "number", required: true },
        { name: "dateString", type: "text", required: true, max: 16 },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["completed", "skipped"] },
        { name: "notes", type: "text", required: false, max: 65535 },
      ],
      indexes: [
        "CREATE INDEX idx_habit_logs_user ON habit_logs (user)",
        "CREATE INDEX idx_habit_logs_habit ON habit_logs (habit)",
        "CREATE INDEX idx_habit_logs_timestamp ON habit_logs (timestamp)",
        "CREATE INDEX idx_habit_logs_habit_dateString ON habit_logs (habit, dateString)",
      ],
    });
    app.save(collections.habit_logs);

    // ========================================================================
    // 13. reflections (depends on users, workspaces)
    //     Convex: reflections { userId, workspaceId?, type, periodStart, periodStartStr?,
    //                          periodEnd, periodEndStr?, periodLabel, summary,
    //                          stats: v.object({...}), userReflection?, shared?, createdAt }
    //            .index("by_user_type", ["userId", "type"])
    //            .index("by_user_period", ["userId", "periodStart"])
    // ========================================================================
    collections.reflections = new Collection({
      name: "reflections",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "workspace", type: "relation", required: false, collectionId: collections.workspaces.id, cascadeDelete: false, maxSelect: 1, minSelect: 0 },
        { name: "type", type: "select", required: true, maxSelect: 1, values: ["weekly", "monthly", "yearly"] },
        { name: "periodStart", type: "number", required: true },
        { name: "periodStartStr", type: "text", required: false, max: 16 },
        { name: "periodEnd", type: "number", required: true },
        { name: "periodEndStr", type: "text", required: false, max: 16 },
        { name: "periodLabel", type: "text", required: true, max: 256 },
        { name: "summary", type: "text", required: true, max: 65535 },
        { name: "stats", type: "json", required: true },
        { name: "userReflection", type: "text", required: false, max: 65535 },
        { name: "shared", type: "bool", required: false },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_reflections_user_type ON reflections (user, type)",
        "CREATE INDEX idx_reflections_user_period ON reflections (user, periodStart)",
      ],
    });
    app.save(collections.reflections);

    // ========================================================================
    // 14. page_settings (depends on users)
    //     Convex: pageSettings { userId, page, settings: v.object({...}) }
    //            .index("by_user_page", ["userId", "page"])  -- conceptually unique
    // ========================================================================
    collections.page_settings = new Collection({
      name: "page_settings",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "page", type: "text", required: true, max: 128 },
        { name: "settings", type: "json", required: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_page_settings_user_page ON page_settings (user, page)",
      ],
    });
    app.save(collections.page_settings);

    // ========================================================================
    // 15. session_summaries (depends on users)
    //     Convex: sessionSummaries { userId, date, summary, createdAt }
    //            .index("by_user_date", ["userId", "date"])
    // ========================================================================
    collections.session_summaries = new Collection({
      name: "session_summaries",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "date", type: "text", required: true, max: 16 },
        { name: "summary", type: "text", required: true, max: 65535 },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_session_summaries_user_date ON session_summaries (user, date)",
      ],
    });
    app.save(collections.session_summaries);

    // ========================================================================
    // 16. weekly_digests (depends on users)
    //     Convex: weeklyDigests { userId, weekStart, weekStartStr?, weekLabel,
    //                            digest, createdAt }
    //            .index("by_user_week", ["userId", "weekStart"])
    // ========================================================================
    collections.weekly_digests = new Collection({
      name: "weekly_digests",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "weekStart", type: "number", required: true },
        { name: "weekStartStr", type: "text", required: false, max: 16 },
        { name: "weekLabel", type: "text", required: true, max: 256 },
        { name: "digest", type: "text", required: true, max: 65535 },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_weekly_digests_user_week ON weekly_digests (user, weekStart)",
      ],
    });
    app.save(collections.weekly_digests);

    // ========================================================================
    // 17. archived_summaries (depends on users)
    //     Convex: archivedSummaries { userId, type, originalDate, originalDateStr?,
    //                                content, archivedAt }
    //            .index("by_user_type_date", ["userId", "type", "originalDate"])
    // ========================================================================
    collections.archived_summaries = new Collection({
      name: "archived_summaries",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "type", type: "select", required: true, maxSelect: 1, values: ["weekly", "monthly"] },
        { name: "originalDate", type: "number", required: true },
        { name: "originalDateStr", type: "text", required: false, max: 16 },
        { name: "content", type: "text", required: true, max: 65535 },
        { name: "archivedAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_archived_summaries_user_type_date ON archived_summaries (user, type, originalDate)",
      ],
    });
    app.save(collections.archived_summaries);

    // ========================================================================
    // 18. notifications (depends on users)
    //     Convex: notifications { userId, title, message, type, read,
    //                            actionUrl?, createdAt }
    //            .index("by_user_unread", ["userId", "read"])
    //            .index("by_user_created", ["userId", "createdAt"])
    // ========================================================================
    collections.notifications = new Collection({
      name: "notifications",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "title", type: "text", required: true, max: 256 },
        { name: "message", type: "text", required: true, max: 65535 },
        { name: "type", type: "select", required: true, maxSelect: 1, values: ["event_remind", "habit_remind", "task_remind", "system"] },
        { name: "read", type: "bool", required: false },
        { name: "actionUrl", type: "text", required: false, max: 1024 },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_notifications_user_unread ON notifications (user, read)",
        "CREATE INDEX idx_notifications_user_created ON notifications (user, createdAt)",
      ],
    });
    app.save(collections.notifications);

    // ========================================================================
    // 19. push_subscriptions (depends on users)
    //     Convex: pushSubscriptions { userId, endpoint, expirationTime?: v.union(number, null),
    //                                createdAt?, keys: v.object({ p256dh, auth }) }
    //            .index("by_user", ["userId"])
    //            .index("by_endpoint", ["endpoint"])
    //     Phase 1 note: push subscriptions are dormant in desktop mode
    //     (DESKTOP_MODE=true uses OS notifications; see ADR-011 §1 carve-outs).
    // ========================================================================
    collections.push_subscriptions = new Collection({
      name: "push_subscriptions",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "endpoint", type: "text", required: true, max: 2048 },
        // v.union(v.number(), v.null()) -> optional number (nullable at runtime)
        { name: "expirationTime", type: "number", required: false },
        { name: "createdAt", type: "number", required: false },
        { name: "keys", type: "json", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user)",
        "CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint)",
      ],
    });
    app.save(collections.push_subscriptions);

    // ========================================================================
    // 20. card_state (depends on users)
    //     Convex: cardState { userId, cardType, cardId?, dismissedAt?, snoozedUntil?,
    //                        mutedAt?, lastShownAt? }
    //            .index("by_user", ["userId"])
    //            .index("by_user_type", ["userId", "cardType"])
    //            .index("by_user_type_cardid", ["userId", "cardType", "cardId"])
    // ========================================================================
    collections.card_state = new Collection({
      name: "card_state",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "cardType", type: "text", required: true, max: 128 },
        { name: "cardId", type: "text", required: false, max: 256 },
        { name: "dismissedAt", type: "number", required: false },
        { name: "snoozedUntil", type: "number", required: false },
        { name: "mutedAt", type: "number", required: false },
        { name: "lastShownAt", type: "number", required: false },
      ],
      indexes: [
        "CREATE INDEX idx_card_state_user ON card_state (user)",
        "CREATE INDEX idx_card_state_user_type ON card_state (user, cardType)",
        "CREATE INDEX idx_card_state_user_type_cardid ON card_state (user, cardType, cardId)",
      ],
    });
    app.save(collections.card_state);

    // ========================================================================
    // 21. scheduled_notifications (NEW table, replaces Convex's _scheduled_functions)
    //     Per plan §3.7. Scanned by the Tauri on-open check.
    //     No Convex equivalent (this is the destination, not a mapping).
    // ========================================================================
    collections.scheduled_notifications = new Collection({
      name: "scheduled_notifications",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: userCollectionId, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: ["event_remind", "task_remind", "habit_remind"] },
        { name: "targetId", type: "text", required: true, max: 64 },
        { name: "triggerAt", type: "number", required: true },
        { name: "delivered", type: "bool", required: false },
        { name: "createdAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE INDEX idx_scheduled_notifications_user ON scheduled_notifications (user)",
        "CREATE INDEX idx_scheduled_notifications_pending ON scheduled_notifications (delivered, triggerAt)",
      ],
    });
    app.save(collections.scheduled_notifications);
  },

  // ========================================================================
  // Rollback: removes everything we created, in reverse order.
  // PB does NOT preserve data on rollback. Acceptable: greenfield, no data migrated yet.
  // ========================================================================
  (app) => {
    const collectionNames = [
      "scheduled_notifications",
      "card_state",
      "push_subscriptions",
      "notifications",
      "archived_summaries",
      "weekly_digests",
      "session_summaries",
      "page_settings",
      "reflections",
      "habit_logs",
      "habits",
      "user_images",
      "memories",
      "user_profile",
      "events",
      "tasks",
      "messages",
      "chat_sessions",
      "workspaces",
      "agent_personas",
    ];
    for (const name of collectionNames) {
      const c = app.findCollectionByNameOrId(name);
      if (c) app.delete(c);
    }
    // Revert users extension.
    const users = app.findCollectionByNameOrId("users");
    for (const fieldName of [
      "name",
      "image",
      "emailVerificationTime",
      "phone",
      "phoneVerificationTime",
      "isAnonymous",
    ]) {
      try { users.fields.removeByName(fieldName); } catch (_) { /* field not present */ }
    }
    app.save(users);
  },
);
