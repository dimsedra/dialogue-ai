/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const reflections = app.findCollectionByNameOrId("reflections");
    
    // Update viewRule to allow reading if shared == true
    reflections.viewRule = "user = @request.auth.id || shared = true";

    app.save(reflections);
  },
  (app) => {
    const reflections = app.findCollectionByNameOrId("reflections");
    
    // Revert viewRule to only owner
    reflections.viewRule = "user = @request.auth.id";

    app.save(reflections);
  }
);
