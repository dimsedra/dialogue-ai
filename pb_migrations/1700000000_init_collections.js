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
// Conventions (full table in schema-mapping.md "Conventions" section):
//   - v.id("table")     -> relation field, maxSelect:1, cascadeDelete:true
//   - v.number()        -> number field (NOT date; preserve epoch-ms byte format)
//   - v.array(v.X())    -> json field
//   - v.object({...})   -> json field
//   - v.any()           -> json field
//   - v.union(v.lit..)  -> select field
//   - v.optional(v.X()) -> field with required:false
//   - v.id("_storage")  -> file field (single); for arrays, json of file refs
//   - v.id("_sched...") -> text field (string ID); see scheduled_notifications table
//
// Idempotency: PB auto-skips already-applied migrations on startup. This file is
// run once. To re-apply, delete the corresponding row from `_migrations`.
//
// Rollback: the second migrate() arg removes the collections in reverse order and
// removes the custom fields we added to `users`. PB does not preserve data on
// rollback — this is acceptable because we're greenfield (no data migrated yet).

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (db) => {
    const dao = new Dao(db);
    const collections = {};

    // ========================================================================
    // 1. Extend built-in `users` with authTables fields.
    //    PB users already has: id, email, verified, created, updated, etc.
    //    We add the fields from @convex-dev/auth's authTables.users:
    //      name, image, emailVerificationTime, phone, phoneVerificationTime, isAnonymous
    // ========================================================================
    const users = dao.findCollectionByNameOrId("users");
    // authTables.users fields:
    users.schema.addField(
      new Field({ name: "name", type: "text", required: false, options: { max: 256 } }),
    );
    users.schema.addField(
      new Field({ name: "image", type: "url", required: false, options: { max: 2048 } }),
    );
    users.schema.addField(
      new Field({ name: "emailVerificationTime", type: "number", required: false }),
    );
    users.schema.addField(
      new Field({ name: "phone", type: "text", required: false, options: { max: 32 } }),
    );
    users.schema.addField(
      new Field({ name: "phoneVerificationTime", type: "number", required: false }),
    );
    users.schema.addField(
      new Field({ name: "isAnonymous", type: "bool", required: false }),
    );
    // No "by_email" / "by_phone" indexes on users here — PB auto-indexes email
    // (built-in) and phone is not currently queried by index in the app.
    dao.saveCollection(users);
    collections.users = users;

    // ========================================================================
    // Helper: create a relation field referencing another collection.
    // Resolves the target collection's id and sets cascadeDelete:true (Convex parity).
    // ========================================================================
    const rel = (target, opts = {}) =>
      new Field({
        type: "relation",
        required: opts.required ?? false,
        collectionId: collections[target].id,
        cascadeDelete: opts.cascadeDelete ?? true,
        minSelect: 0,
        maxSelect: 1,
      });

    // ========================================================================
    // 2. agent_personas (no app-level FKs; depends only on users)
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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "name", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "prompt", type: "text", required: true, options: { max: 65535 } }),
        new Field({ name: "description", type: "text", required: false, options: { max: 1024 } }),
        new Field({ name: "isDefault", type: "bool", required: false }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_agent_personas_user ON agent_personas (user)",
      ],
    });
    dao.saveCollection(collections.agent_personas);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "name", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "icon", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "color", type: "text", required: true, options: { max: 32 } }),
        new Field({ name: "context", type: "text", required: false, options: { max: 65535 } }),
        new Field({ name: "agentName", type: "text", required: false, options: { max: 256 } }),
        rel("agent_personas", { required: false }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_workspaces_user ON workspaces (user)",
      ],
    });
    dao.saveCollection(collections.workspaces);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "title", type: "text", required: false, options: { max: 512 } }),
        rel("workspaces", { required: false }),
        rel("agent_personas", { required: false }),
        new Field({ name: "timezone", type: "text", required: false, options: { max: 64 } }),
        new Field({ name: "createdAt", type: "number", required: true }),
        new Field({ name: "lastActivity", type: "number", required: true }),
        new Field({ name: "pinned", type: "bool", required: false }),
      ],
      indexes: [
        "CREATE INDEX idx_chat_sessions_user ON chat_sessions (user)",
        "CREATE INDEX idx_chat_sessions_workspace ON chat_sessions (workspace)",
        "CREATE INDEX idx_chat_sessions_user_lastActivity ON chat_sessions (user, lastActivity)",
      ],
    });
    dao.saveCollection(collections.chat_sessions);

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
      schema: [
        rel("chat_sessions", { required: false, cascadeDelete: true }),
        new Field({ name: "text", type: "text", required: true, options: { max: 65535 } }),
        new Field({ name: "author", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "timestamp", type: "number", required: true }),
        new Field({ name: "timezoneOffset", type: "number", required: false }),
        new Field({ name: "toolCall", type: "json", required: false }),
        new Field({ name: "toolCalls", type: "json", required: false }),
        new Field({ name: "reasoning", type: "text", required: false, options: { max: 65535 } }),
        // Convex v.id("_storage") -> PB file field
        new Field({ name: "storageId", type: "file", required: false, options: { maxSelect: 1, maxSize: 52428800, mimeTypes: [] } }),
        new Field({ name: "fileType", type: "text", required: false, options: { max: 256 } }),
        new Field({ name: "fileName", type: "text", required: false, options: { max: 512 } }),
        // Convex v.array(v.object({...})) -> json array of file refs
        new Field({ name: "attachments", type: "json", required: false }),
        new Field({ name: "scope", type: "json", required: false }),
      ],
      indexes: [
        "CREATE INDEX idx_messages_session ON messages (session)",
        "CREATE INDEX idx_messages_session_timestamp ON messages (session, timestamp)",
      ],
    });
    dao.saveCollection(collections.messages);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "text", type: "text", required: true, options: { max: 65535 } }),
        rel("workspaces", { required: false }),
        new Field({ name: "completed", type: "bool", required: true }),
        new Field({ name: "dueDate", type: "number", required: false }),
        new Field({ name: "dueDateStr", type: "text", required: false, options: { max: 16 } }),
        new Field({
          name: "priority",
          type: "select",
          required: false,
          maxSelect: 1,
          values: ["low", "medium", "high"],
        }),
        new Field({ name: "category", type: "text", required: false, options: { max: 128 } }),
        new Field({ name: "notes", type: "text", required: false, options: { max: 65535 } }),
        new Field({ name: "progress", type: "number", required: false, options: { min: 0, max: 100 } }),
        new Field({ name: "statusHook", type: "text", required: false, options: { max: 256 } }),
        new Field({ name: "contextUpdatedAt", type: "number", required: false }),
        new Field({ name: "createdAt", type: "number", required: true }),
        new Field({ name: "completedAt", type: "number", required: false }),
        new Field({ name: "resources", type: "json", required: false }),
        new Field({ name: "reminderOffset", type: "number", required: false }),
        new Field({ name: "scheduledNotificationId", type: "text", required: false, options: { max: 64 } }),
      ],
      indexes: [
        "CREATE INDEX idx_tasks_user ON tasks (user)",
        "CREATE INDEX idx_tasks_workspace ON tasks (workspace)",
        "CREATE INDEX idx_tasks_user_completed ON tasks (user, completed)",
        "CREATE INDEX idx_tasks_user_dueDate ON tasks (user, dueDate)",
      ],
    });
    dao.saveCollection(collections.tasks);

    // ========================================================================
    // 7. events (depends on users, workspaces, self for seriesId)
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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "title", type: "text", required: true, options: { max: 512 } }),
        new Field({ name: "description", type: "text", required: false, options: { max: 65535 } }),
        new Field({ name: "startTime", type: "number", required: true }),
        new Field({ name: "endTime", type: "number", required: false }),
        new Field({
          name: "eventType",
          type: "select",
          required: false,
          maxSelect: 1,
          values: ["interval", "point"],
        }),
        new Field({ name: "location", type: "text", required: false, options: { max: 512 } }),
        new Field({ name: "notes", type: "text", required: false, options: { max: 65535 } }),
        new Field({ name: "outcome", type: "text", required: false, options: { max: 65535 } }),
        new Field({ name: "statusHook", type: "text", required: false, options: { max: 256 } }),
        new Field({ name: "cancelled", type: "bool", required: false }),
        new Field({ name: "contextUpdatedAt", type: "number", required: false }),
        rel("workspaces", { required: false }),
        new Field({ name: "recurrence", type: "json", required: false }),
        new Field({ name: "createdAt", type: "number", required: true }),
        // Self-reference for recurring series. PB allows forward self-references.
        rel("events", { required: false, cascadeDelete: false }),
        new Field({ name: "resources", type: "json", required: false }),
        new Field({ name: "reminderOffset", type: "number", required: false }),
        new Field({ name: "scheduledNotificationId", type: "text", required: false, options: { max: 64 } }),
      ],
      indexes: [
        "CREATE INDEX idx_events_user ON events (user)",
        "CREATE INDEX idx_events_workspace ON events (workspace)",
        "CREATE INDEX idx_events_series ON events (series)",
        "CREATE INDEX idx_events_user_startTime ON events (user, startTime)",
      ],
    });
    dao.saveCollection(collections.events);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "name", type: "text", required: false, options: { max: 256 } }),
        new Field({ name: "bio", type: "text", required: true, options: { max: 65535 } }),
        new Field({ name: "preferences", type: "json", required: true }),
        new Field({ name: "weeklyNotesSummaries", type: "json", required: false }),
        new Field({ name: "monthlyNotesSummaries", type: "json", required: false }),
        new Field({ name: "behavioralProfile", type: "text", required: false, options: { max: 65535 } }),
      ],
      indexes: [
        "CREATE INDEX idx_user_profile_user ON user_profile (user)",
      ],
    });
    dao.saveCollection(collections.user_profile);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "text", type: "text", required: true, options: { max: 65535 } }),
        // 384-float vector. json field; LadybugDB is the search index.
        new Field({ name: "embedding", type: "json", required: true }),
        new Field({ name: "hash", type: "text", required: false, options: { max: 64 } }),
        new Field({ name: "createdAt", type: "number", required: false }),
        new Field({ name: "updatedAt", type: "number", required: false }),
      ],
      indexes: [
        "CREATE INDEX idx_memories_user ON memories (user)",
        "CREATE INDEX idx_memories_hash ON memories (hash)",
        "CREATE INDEX idx_memories_user_createdAt ON memories (user, createdAt)",
      ],
    });
    dao.saveCollection(collections.memories);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "storageId", type: "file", required: true, options: { maxSelect: 1, maxSize: 52428800, mimeTypes: ["image/*"] } }),
        new Field({ name: "fileName", type: "text", required: true, options: { max: 512 } }),
        new Field({ name: "fileType", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_user_images_user ON user_images (user)",
      ],
    });
    dao.saveCollection(collections.user_images);

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
      schema: [
        rel("users", { required: true }),
        rel("workspaces", { required: false }),
        new Field({ name: "name", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "description", type: "text", required: false, options: { max: 65535 } }),
        new Field({
          name: "frequency",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["daily", "custom"],
        }),
        new Field({ name: "frequencyConfig", type: "json", required: true }),
        new Field({ name: "currentStreak", type: "number", required: true }),
        new Field({ name: "longestStreak", type: "number", required: true }),
        new Field({ name: "lastLoggedAt", type: "number", required: false }),
        new Field({ name: "lastLoggedDate", type: "text", required: false, options: { max: 16 } }),
        new Field({ name: "archived", type: "bool", required: true }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_habits_user ON habits (user)",
        "CREATE INDEX idx_habits_workspace ON habits (workspace)",
      ],
    });
    dao.saveCollection(collections.habits);

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
      schema: [
        rel("users", { required: true }),
        rel("habits", { required: true }),
        new Field({ name: "timestamp", type: "number", required: true }),
        new Field({ name: "dateString", type: "text", required: true, options: { max: 16 } }),
        new Field({
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["completed", "skipped"],
        }),
        new Field({ name: "notes", type: "text", required: false, options: { max: 65535 } }),
      ],
      indexes: [
        "CREATE INDEX idx_habit_logs_user ON habit_logs (user)",
        "CREATE INDEX idx_habit_logs_habit ON habit_logs (habit)",
        "CREATE INDEX idx_habit_logs_timestamp ON habit_logs (timestamp)",
        "CREATE INDEX idx_habit_logs_habit_dateString ON habit_logs (habit, dateString)",
      ],
    });
    dao.saveCollection(collections.habit_logs);

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
      schema: [
        rel("users", { required: true }),
        rel("workspaces", { required: false }),
        new Field({
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["weekly", "monthly", "yearly"],
        }),
        new Field({ name: "periodStart", type: "number", required: true }),
        new Field({ name: "periodStartStr", type: "text", required: false, options: { max: 16 } }),
        new Field({ name: "periodEnd", type: "number", required: true }),
        new Field({ name: "periodEndStr", type: "text", required: false, options: { max: 16 } }),
        new Field({ name: "periodLabel", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "summary", type: "text", required: true, options: { max: 65535 } }),
        new Field({ name: "stats", type: "json", required: true }),
        new Field({ name: "userReflection", type: "text", required: false, options: { max: 65535 } }),
        new Field({ name: "shared", type: "bool", required: false }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_reflections_user_type ON reflections (user, type)",
        "CREATE INDEX idx_reflections_user_period ON reflections (user, periodStart)",
      ],
    });
    dao.saveCollection(collections.reflections);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "page", type: "text", required: true, options: { max: 128 } }),
        new Field({ name: "settings", type: "json", required: true }),
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_page_settings_user_page ON page_settings (user, page)",
      ],
    });
    dao.saveCollection(collections.page_settings);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "date", type: "text", required: true, options: { max: 16 } }),
        new Field({ name: "summary", type: "text", required: true, options: { max: 65535 } }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_session_summaries_user_date ON session_summaries (user, date)",
      ],
    });
    dao.saveCollection(collections.session_summaries);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "weekStart", type: "number", required: true }),
        new Field({ name: "weekStartStr", type: "text", required: false, options: { max: 16 } }),
        new Field({ name: "weekLabel", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "digest", type: "text", required: true, options: { max: 65535 } }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_weekly_digests_user_week ON weekly_digests (user, weekStart)",
      ],
    });
    dao.saveCollection(collections.weekly_digests);

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
      schema: [
        rel("users", { required: true }),
        new Field({
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["weekly", "monthly"],
        }),
        new Field({ name: "originalDate", type: "number", required: true }),
        new Field({ name: "originalDateStr", type: "text", required: false, options: { max: 16 } }),
        new Field({ name: "content", type: "text", required: true, options: { max: 65535 } }),
        new Field({ name: "archivedAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_archived_summaries_user_type_date ON archived_summaries (user, type, originalDate)",
      ],
    });
    dao.saveCollection(collections.archived_summaries);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "title", type: "text", required: true, options: { max: 256 } }),
        new Field({ name: "message", type: "text", required: true, options: { max: 65535 } }),
        new Field({
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["event_remind", "habit_remind", "task_remind", "system"],
        }),
        new Field({ name: "read", type: "bool", required: true }),
        new Field({ name: "actionUrl", type: "text", required: false, options: { max: 1024 } }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_notifications_user_unread ON notifications (user, read)",
        "CREATE INDEX idx_notifications_user_created ON notifications (user, createdAt)",
      ],
    });
    dao.saveCollection(collections.notifications);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "endpoint", type: "text", required: true, options: { max: 2048 } }),
        // v.union(v.number(), v.null()) -> optional number (nullable at runtime)
        new Field({ name: "expirationTime", type: "number", required: false }),
        new Field({ name: "createdAt", type: "number", required: false }),
        new Field({ name: "keys", type: "json", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user)",
        "CREATE UNIQUE INDEX idx_push_subscriptions_endpoint ON push_subscriptions (endpoint)",
      ],
    });
    dao.saveCollection(collections.push_subscriptions);

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
      schema: [
        rel("users", { required: true }),
        new Field({ name: "cardType", type: "text", required: true, options: { max: 128 } }),
        new Field({ name: "cardId", type: "text", required: false, options: { max: 256 } }),
        new Field({ name: "dismissedAt", type: "number", required: false }),
        new Field({ name: "snoozedUntil", type: "number", required: false }),
        new Field({ name: "mutedAt", type: "number", required: false }),
        new Field({ name: "lastShownAt", type: "number", required: false }),
      ],
      indexes: [
        "CREATE INDEX idx_card_state_user ON card_state (user)",
        "CREATE INDEX idx_card_state_user_type ON card_state (user, cardType)",
        "CREATE INDEX idx_card_state_user_type_cardid ON card_state (user, cardType, cardId)",
      ],
    });
    dao.saveCollection(collections.card_state);

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
      schema: [
        rel("users", { required: true }),
        new Field({
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["event_remind", "task_remind", "habit_remind"],
        }),
        new Field({ name: "targetId", type: "text", required: true, options: { max: 64 } }),
        new Field({ name: "triggerAt", type: "number", required: true }),
        new Field({ name: "delivered", type: "bool", required: true }),
        new Field({ name: "createdAt", type: "number", required: true }),
      ],
      indexes: [
        "CREATE INDEX idx_scheduled_notifications_user ON scheduled_notifications (user)",
        "CREATE INDEX idx_scheduled_notifications_pending ON scheduled_notifications (delivered, triggerAt)",
      ],
    });
    dao.saveCollection(collections.scheduled_notifications);
  },

  // ========================================================================
  // Rollback: removes everything we created, in reverse order.
  // PB does NOT preserve data on rollback. Acceptable: greenfield, no data migrated yet.
  // ========================================================================
  (db) => {
    const dao = new Dao(db);
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
      const c = dao.findCollectionByNameOrId(name);
      if (c) dao.deleteCollection(c);
    }
    // Revert users extension.
    const users = dao.findCollectionByNameOrId("users");
    for (const fieldName of [
      "name",
      "image",
      "emailVerificationTime",
      "phone",
      "phoneVerificationTime",
      "isAnonymous",
    ]) {
      try { users.schema.removeField(fieldName); } catch (_) { /* field not present */ }
    }
    dao.saveCollection(users);
  },
);
