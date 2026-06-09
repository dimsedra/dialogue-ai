import PocketBase from 'pocketbase';
import crypto from 'crypto';
import { getLocalEmbedding } from './embedding';
import { wireMentionsEdges } from './edges';

/**
 * Splits text into paragraph-level or sentence-level chunks of a maximum size.
 * Keeps semantic units intact where possible.
 */
export function chunkText(text: string, maxChunkSize = 500): string[] {
  if (!text || !text.trim()) return [];
  
  // Split by double newlines first (paragraphs)
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if ((currentChunk + (currentChunk ? "\n\n" : "") + paragraph).length <= maxChunkSize) {
      currentChunk = currentChunk ? currentChunk + "\n\n" + paragraph : paragraph;
    } else {
      if (currentChunk) chunks.push(currentChunk);
      
      // If a single paragraph is larger than maxChunkSize, split it by sentence
      if (paragraph.length > maxChunkSize) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        currentChunk = "";
        for (const sentence of sentences) {
          if ((currentChunk + (currentChunk ? " " : "") + sentence).length <= maxChunkSize) {
            currentChunk = currentChunk ? currentChunk + " " + sentence : sentence;
          } else {
            if (currentChunk) chunks.push(currentChunk);
            currentChunk = sentence;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk) chunks.push(currentChunk);
  return chunks;
}

/**
 * Semantically chunks and indexes a task's notes into the memories collection.
 * Cleans up old memories that are no longer referenced.
 */
export async function ingestTaskNotes(
  pb: PocketBase,
  taskId: string,
  notesText: string | undefined,
  maxChunkSize = 500
): Promise<void> {
  let userId = pb.authStore.record?.id;
  if (!userId) {
    try {
      const firstUser = await pb.collection("users").getFirstListItem("");
      userId = firstUser?.id;
    } catch {
      return;
    }
  }

  if (!userId) return;

  const existing = await pb.collection("memories").getFullList({
    filter: `user = "${userId}" && source_id = "${taskId}" && source_type = "Task"`,
  });

  const chunks = chunkText(notesText || "", maxChunkSize);

  if (chunks.length === 0) {
    for (const mem of existing) {
      await pb.collection("memories").delete(mem.id);
    }
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await getLocalEmbedding(chunk);
    const hash = crypto.createHash('sha256').update(chunk).digest('hex');

    let memoryRecord;
    if (i < existing.length) {
      memoryRecord = await pb.collection("memories").update(existing[i].id, {
        text: chunk,
        embedding,
        hash,
        updatedAt: Date.now(),
      });
    } else {
      memoryRecord = await pb.collection("memories").create({
        user: userId,
        text: chunk,
        embedding,
        hash,
        source_id: taskId,
        source_type: "Task",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await wireMentionsEdges(pb, memoryRecord.id, { taskIds: [taskId] });
  }

  if (chunks.length < existing.length) {
    for (let i = chunks.length; i < existing.length; i++) {
      await pb.collection("memories").delete(existing[i].id);
    }
  }
}

/**
 * Semantically chunks and indexes an event's prep notes and outcomes.
 */
export async function ingestEventNotes(
  pb: PocketBase,
  eventId: string,
  notesText: string | undefined,
  outcomeText: string | undefined,
  maxChunkSize = 500
): Promise<void> {
  let userId = pb.authStore.record?.id;
  if (!userId) {
    try {
      const firstUser = await pb.collection("users").getFirstListItem("");
      userId = firstUser?.id;
    } catch {
      return;
    }
  }

  if (!userId) return;

  const existing = await pb.collection("memories").getFullList({
    filter: `user = "${userId}" && source_id = "${eventId}" && source_type = "Event"`,
  });

  const noteChunks = chunkText(notesText || "", maxChunkSize);
  const outcomeChunks = chunkText(outcomeText || "", maxChunkSize);
  const chunks = [...noteChunks, ...outcomeChunks];

  if (chunks.length === 0) {
    for (const mem of existing) {
      await pb.collection("memories").delete(mem.id);
    }
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await getLocalEmbedding(chunk);
    const hash = crypto.createHash('sha256').update(chunk).digest('hex');

    let memoryRecord;
    if (i < existing.length) {
      memoryRecord = await pb.collection("memories").update(existing[i].id, {
        text: chunk,
        embedding,
        hash,
        updatedAt: Date.now(),
      });
    } else {
      memoryRecord = await pb.collection("memories").create({
        user: userId,
        text: chunk,
        embedding,
        hash,
        source_id: eventId,
        source_type: "Event",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await wireMentionsEdges(pb, memoryRecord.id, { eventIds: [eventId] });
  }

  if (chunks.length < existing.length) {
    for (let i = chunks.length; i < existing.length; i++) {
      await pb.collection("memories").delete(existing[i].id);
    }
  }
}

/**
 * Semantically indexes a habit log's notes, linking the memory back to the parent habit.
 */
export async function ingestHabitLogNotes(
  pb: PocketBase,
  logId: string,
  habitId: string,
  notesText: string | undefined,
  maxChunkSize = 500
): Promise<void> {
  let userId = pb.authStore.record?.id;
  if (!userId) {
    try {
      const firstUser = await pb.collection("users").getFirstListItem("");
      userId = firstUser?.id;
    } catch {
      return;
    }
  }

  if (!userId) return;

  const existing = await pb.collection("memories").getFullList({
    filter: `user = "${userId}" && source_id = "${logId}" && source_type = "HabitLog"`,
  });

  const chunks = chunkText(notesText || "", maxChunkSize);

  if (chunks.length === 0) {
    for (const mem of existing) {
      await pb.collection("memories").delete(mem.id);
    }
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const embedding = await getLocalEmbedding(chunk);
    const hash = crypto.createHash('sha256').update(chunk).digest('hex');

    let memoryRecord;
    if (i < existing.length) {
      memoryRecord = await pb.collection("memories").update(existing[i].id, {
        text: chunk,
        embedding,
        hash,
        updatedAt: Date.now(),
      });
    } else {
      memoryRecord = await pb.collection("memories").create({
        user: userId,
        text: chunk,
        embedding,
        hash,
        source_id: logId,
        source_type: "HabitLog",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await wireMentionsEdges(pb, memoryRecord.id, { habitIds: [habitId] });
  }

  if (chunks.length < existing.length) {
    for (let i = chunks.length; i < existing.length; i++) {
      await pb.collection("memories").delete(existing[i].id);
    }
  }
}

/**
 * Deletes all memories (and their cascade-deleted edges) associated with a deleted source entity.
 */
export async function deleteSourceMemories(
  pb: PocketBase,
  sourceId: string,
  sourceType: 'Task' | 'Event' | 'HabitLog'
): Promise<void> {
  let userId = pb.authStore.record?.id;
  if (!userId) {
    try {
      const firstUser = await pb.collection("users").getFirstListItem("");
      userId = firstUser?.id;
    } catch {
      return;
    }
  }

  if (!userId) return;

  const existing = await pb.collection("memories").getFullList({
    filter: `user = "${userId}" && source_id = "${sourceId}" && source_type = "${sourceType}"`,
  });

  for (const mem of existing) {
    await pb.collection("memories").delete(mem.id);
  }
}
