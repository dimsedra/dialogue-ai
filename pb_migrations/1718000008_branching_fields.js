/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const chat_sessions = app.findCollectionByNameOrId("chat_sessions");
    const tasks = app.findCollectionByNameOrId("tasks");
    const events = app.findCollectionByNameOrId("events");
    const messages = app.findCollectionByNameOrId("messages");

    // Add fields to chat_sessions
    chat_sessions.fields.add(new BoolField({
      name: "isTrunk",
      required: false
    }));

    chat_sessions.fields.add(new RelationField({
      name: "parentSession",
      collectionId: chat_sessions.id,
      maxSelect: 1,
      required: false,
      cascadeDelete: true
    }));

    chat_sessions.fields.add(new RelationField({
      name: "branchedFromMessage",
      collectionId: messages.id,
      maxSelect: 1,
      required: false,
      cascadeDelete: false
    }));

    chat_sessions.fields.add(new NumberField({
      name: "branchedFromTimestamp",
      required: false
    }));

    chat_sessions.fields.add(new TextField({
      name: "sessionType",
      required: false,
      max: 32
    }));

    chat_sessions.fields.add(new BoolField({
      name: "archived",
      required: false
    }));

    // Add origin_branch to tasks and events
    tasks.fields.add(new RelationField({
      name: "origin_branch",
      collectionId: chat_sessions.id,
      maxSelect: 1,
      required: false,
      cascadeDelete: false
    }));

    events.fields.add(new RelationField({
      name: "origin_branch",
      collectionId: chat_sessions.id,
      maxSelect: 1,
      required: false,
      cascadeDelete: false
    }));

    app.save(chat_sessions);
    app.save(tasks);
    app.save(events);
  },
  (app) => {
    const chat_sessions = app.findCollectionByNameOrId("chat_sessions");
    const tasks = app.findCollectionByNameOrId("tasks");
    const events = app.findCollectionByNameOrId("events");

    chat_sessions.fields.removeByName("isTrunk");
    chat_sessions.fields.removeByName("parentSession");
    chat_sessions.fields.removeByName("branchedFromMessage");
    chat_sessions.fields.removeByName("branchedFromTimestamp");
    chat_sessions.fields.removeByName("sessionType");
    chat_sessions.fields.removeByName("archived");

    tasks.fields.removeByName("origin_branch");
    events.fields.removeByName("origin_branch");

    app.save(chat_sessions);
    app.save(tasks);
    app.save(events);
  }
);
