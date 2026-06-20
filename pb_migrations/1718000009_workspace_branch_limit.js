/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    const workspaces = app.findCollectionByNameOrId("workspaces");

    workspaces.fields.add(new NumberField({
      name: "activeBranchLimit",
      required: false,
      min: 1,
      max: 5,
      defaultValue: 3
    }));

    app.save(workspaces);
  },
  (app) => {
    const workspaces = app.findCollectionByNameOrId("workspaces");
    workspaces.fields.removeByName("activeBranchLimit");
    app.save(workspaces);
  }
);
