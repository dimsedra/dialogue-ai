/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = new Collection({
      name: "system_state",
      type: "base",
      listRule: "",
      viewRule: "",
      createRule: "",
      updateRule: "",
      deleteRule: null,
      fields: [
        { name: "key", type: "text", required: true, max: 64 },
        { name: "lastRunAt", type: "number", required: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_system_state_key ON system_state (key)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("system_state");
    if (collection) {
      app.delete(collection);
    }
  }
);
