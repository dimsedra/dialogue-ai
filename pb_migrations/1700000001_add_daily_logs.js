// PocketBase migration: 1700000001_add_daily_logs.js
//
// Adds a daily_logs collection for file-first + DB consistency.
// Every daily log file written to daily-logs/YYYY-MM-DD.md gets a
// corresponding record in this collection via the sync engine.

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const dailyLogs = new Collection({
      name: "daily_logs",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { name: "user", type: "relation", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1, minSelect: 1 },
        { name: "date", type: "text", required: true, max: 16 },
        { name: "content", type: "text", required: true, max: 65535 },
        { name: "summary", type: "text", required: false, max: 65535 },
        { name: "createdAt", type: "number", required: true },
        { name: "updatedAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_daily_logs_user_date ON daily_logs (user, date)",
      ],
    });
    app.save(dailyLogs);
  },
  (app) => {
    const c = app.findCollectionByNameOrId("daily_logs");
    if (c) app.delete(c);
  },
);
