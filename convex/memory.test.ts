import { describe, expect, test } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = {
  "convex/ai.ts": () => import("./ai"),
  "convex/_generated/api.ts": () => import("./_generated/api"),
};

describe("Semantic Memory System", () => {
  test("saveMemory point deduplication and deleteMemory mutation", async () => {
    const t = convexTest(schema, modules);

    // Create a mock user in the database
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {});
    });

    // Authenticate the test client as that user
    const authenticatedClient = t.withIdentity({
      subject: userId,
    });

    const text1 = "I have a cat named Milo";
    const embedding1 = Array(768).fill(0.1);
    const hash = "abc123hash"; // Mock SHA-256 hash

    // 1. Save new memory
    const memoryId = await authenticatedClient.mutation(api.ai.saveMemory, {
      text: text1,
      embedding: embedding1,
      hash,
    });

    expect(memoryId).toBeDefined();

    // 2. Fetch by hash and verify
    const fetched = await authenticatedClient.query(api.ai.getMemoryByHash, {
      hash,
    });
    expect(fetched).not.toBeNull();
    expect(fetched?.text).toBe(text1);
    expect(fetched?.createdAt).toBeDefined();
    expect(fetched?.updatedAt).toBeDefined();

    // Store timestamps to verify updates
    const initialCreatedAt = fetched?.createdAt;
    const initialUpdatedAt = fetched?.updatedAt;

    // 3. Save memory again with the SAME hash but updated text and embedding
    const text2 = "I have a cat named Milo (updated)";
    const embedding2 = Array(768).fill(0.2);

    // Delay slightly to ensure updatedAt differs
    await new Promise((resolve) => setTimeout(resolve, 5));

    const secondMemoryId = await authenticatedClient.mutation(api.ai.saveMemory, {
      text: text2,
      embedding: embedding2,
      hash,
    });

    // Verification: point deduplication updates/patches the same memory ID
    expect(secondMemoryId).toBe(memoryId);

    // Fetch again and verify updates
    const fetchedUpdated = await authenticatedClient.query(api.ai.getMemoryByHash, {
      hash,
    });
    expect(fetchedUpdated?.text).toBe(text2);
    expect(fetchedUpdated?.createdAt).toBe(initialCreatedAt);
    expect(fetchedUpdated?.updatedAt).toBeGreaterThan(initialUpdatedAt ?? 0);

    // 4. Delete the memory
    await authenticatedClient.mutation(api.ai.deleteMemory, {
      id: memoryId,
    });

    // Verify it is deleted
    const fetchedDeleted = await authenticatedClient.query(api.ai.getMemoryByHash, {
      hash,
    });
    expect(fetchedDeleted).toBeNull();
  });
});
