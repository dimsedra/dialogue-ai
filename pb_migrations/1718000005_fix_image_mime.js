/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("user_images");
    const field = collection.fields.getByName("storageId");
    field.mimeTypes = [];
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("user_images");
    const field = collection.fields.getByName("storageId");
    field.mimeTypes = ["image/*"];
    app.save(collection);
  }
);
