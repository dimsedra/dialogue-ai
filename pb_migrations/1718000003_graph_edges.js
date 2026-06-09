/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const memories = app.findCollectionByNameOrId("memories");

    const collection = new Collection({
      name: "graph_edges",
      type: "base",
      listRule: "user = @request.auth.id",
      viewRule: "user = @request.auth.id",
      createRule: "@request.auth.id != ''",
      updateRule: "user = @request.auth.id",
      deleteRule: "user = @request.auth.id",
      fields: [
        { 
          name: "user", 
          type: "relation", 
          required: true, 
          collectionId: users.id, 
          cascadeDelete: true, 
          maxSelect: 1, 
          minSelect: 1 
        },
        { 
          name: "from_mem", 
          type: "relation", 
          required: true, 
          collectionId: memories.id, 
          cascadeDelete: true, 
          maxSelect: 1, 
          minSelect: 1 
        },
        { 
          name: "to_id", 
          type: "text", 
          required: true, 
          max: 256 
        },
        { 
          name: "target_type", 
          type: "select", 
          required: true, 
          maxSelect: 1, 
          values: ["Task", "Event", "Habit"] 
        },
        { 
          name: "edge_type", 
          type: "select", 
          required: true, 
          maxSelect: 1, 
          values: ["MENTIONS_TASK", "MENTIONS_EVENT", "MENTIONS_HABIT"] 
        },
      ],
      indexes: [
        "CREATE INDEX idx_graph_edges_user ON graph_edges (user)",
        "CREATE INDEX idx_graph_edges_from_mem ON graph_edges (from_mem)",
        "CREATE INDEX idx_graph_edges_to_id ON graph_edges (to_id)",
        "CREATE INDEX idx_graph_edges_user_edge_type ON graph_edges (user, edge_type)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("graph_edges");
    if (collection) {
      app.delete(collection);
    }
  }
);
