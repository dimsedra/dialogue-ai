/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");
    const events = app.findCollectionByNameOrId("events");

    tasks.fields.add(new JSONField({
      name: "history_logs",
      required: false
    }));

    events.fields.add(new JSONField({
      name: "history_logs",
      required: false
    }));

    app.save(tasks);
    app.save(events);
  },
  (app) => {
    const tasks = app.findCollectionByNameOrId("tasks");
    const events = app.findCollectionByNameOrId("events");

    tasks.fields.removeByName("history_logs");
    events.fields.removeByName("history_logs");

    app.save(tasks);
    app.save(events);
  }
);
