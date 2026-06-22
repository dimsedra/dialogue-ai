// PocketBase migration: 1700000002_drop_weekly_digests.js
//
// Drops the weekly_digests collection — it was a zombie from the
// Convex era. The actual weekly digest content is stored in
// user_profile.weeklyNotesSummaries.

/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("weekly_digests");
    if (collection) {
      app.delete(collection);
    }
  },
  (app) => {
    // No rollback — data was never written by app code.
  }
);
