/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId("messages");
    
    // Remove the old JSON attachments field
    messages.fields.removeByName("attachments");
    
    // Add the new File attachments field
    messages.fields.add(new FileField({ 
      name: "attachments", 
      required: false, 
      maxSelect: 10, 
      maxSize: 52428800, 
      mimeTypes: [] 
    }));

    app.save(messages);
  },
  (app) => {
    const messages = app.findCollectionByNameOrId("messages");
    
    // Revert back to JSON
    messages.fields.removeByName("attachments");
    messages.fields.add(new JsonField({ 
      name: "attachments", 
      required: false 
    }));

    app.save(messages);
  }
);
