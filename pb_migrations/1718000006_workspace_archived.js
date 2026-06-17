/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const workspaces = app.findCollectionByNameOrId("workspaces");

    workspaces.fields.add(new BoolField({
      name: "archived",
      required: false
    }));

    app.save(workspaces);
  },
  (app) => {
    const workspaces = app.findCollectionByNameOrId("workspaces");

    workspaces.fields.removeByName("archived");

    app.save(workspaces);
  }
);
