/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const memories = app.findCollectionByNameOrId("memories");

    // Add source_id and source_type fields
    memories.fields.add(new TextField({
      name: "source_id",
      required: false,
      max: 256
    }));

    memories.fields.add(new TextField({
      name: "source_type",
      required: false,
      max: 50
    }));

    // Add index on source_id and source_type
    memories.indexes.push("CREATE INDEX idx_memories_source ON memories (source_id, source_type)");

    app.save(memories);
  },
  (app) => {
    const memories = app.findCollectionByNameOrId("memories");

    memories.fields.removeByName("source_id");
    memories.fields.removeByName("source_type");

    memories.indexes = memories.indexes.filter(idx => !idx.includes("idx_memories_source"));

    app.save(memories);
  }
);
