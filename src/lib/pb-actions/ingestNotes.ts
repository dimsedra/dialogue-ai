import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { ingestTaskNotes, ingestEventNotes, ingestHabitLogNotes, deleteSourceMemories } from "../graph/ingest";

interface IngestNotesArgs {
  targetId: string;
  targetType: "Task" | "Event" | "HabitLog";
}

export const ingestNotes: PbActionHandler<IngestNotesArgs, { success: boolean }> = async (
  args,
  ctx
) => {
  const pb = new PocketBase(
    process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090",
  );
  pb.authStore.save(ctx.token, null);

  if (args.targetType === "Task") {
    try {
      const record = await pb.collection("tasks").getOne(args.targetId);
      await ingestTaskNotes(pb, args.targetId, record.notes);
    } catch (err) {
      await deleteSourceMemories(pb, args.targetId, "Task");
    }
  } else if (args.targetType === "Event") {
    try {
      const record = await pb.collection("events").getOne(args.targetId);
      await ingestEventNotes(pb, args.targetId, record.notes, record.outcome);
    } catch (err) {
      await deleteSourceMemories(pb, args.targetId, "Event");
    }
  } else if (args.targetType === "HabitLog") {
    try {
      const record = await pb.collection("habit_logs").getOne(args.targetId);
      await ingestHabitLogNotes(pb, args.targetId, record.habit, record.notes);
    } catch (err) {
      await deleteSourceMemories(pb, args.targetId, "HabitLog");
    }
  } else {
    throw new Error(`Invalid targetType: ${args.targetType}`);
  }

  return { success: true };
};
