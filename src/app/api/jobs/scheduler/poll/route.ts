import { NextRequest, NextResponse } from "next/server";
import { getPbAdmin } from "@/lib/pb-server-admin";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.INTERNAL_CRON_SECRET || "default_local_secret";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pb = await getPbAdmin();
    const now = Date.now();
    const notificationsToFire: Array<{ id: string, title: string, message: string }> = [];

    // 1. Process scheduled_notifications
    try {
      const pending = await pb.collection("scheduled_notifications").getFullList({
        filter: `delivered = false && triggerAt <= ${now}`,
      });

      for (const notif of pending) {
        let title = "Reminder";
        let message = "You have a pending item.";

        if (notif.kind === "task_remind") {
          try {
            const task = await pb.collection("tasks").getOne(notif.targetId);
            title = `Task Reminder: ${task.text}`;
            message = `"${task.text}" is due.`;
          } catch (e) {
            console.error("Task not found for notification", notif.id);
          }
        } else if (notif.kind === "event_remind") {
          try {
            const event = await pb.collection("events").getOne(notif.targetId);
            title = `Event Reminder: ${event.title}`;
            message = `"${event.title}" is happening soon.`;
          } catch (e) {
            console.error("Event not found for notification", notif.id);
          }
        } else if (notif.kind === "habit_remind") {
          try {
            const habit = await pb.collection("habits").getOne(notif.targetId);
            title = `Habit Reminder: ${habit.name}`;
            message = `Don't forget to complete "${habit.name}".`;
          } catch (e) {
            console.error("Habit not found for notification", notif.id);
          }
        }

        notificationsToFire.push({
          id: notif.id,
          title,
          message,
        });
      }
    } catch (err) {
      console.error("Error fetching scheduled notifications:", err);
    }

    // 2. Process system_state crons (simple daily/weekly approximations for now)
    // We will just do a rough port of the 7 checks here. In a real environment, 
    // we would check the user's timezone exactly, but for local-first we can use Date properties.
    const users = await pb.collection("users").getFullList();
    if (users.length > 0) {
      const user = users[0]; // Assuming single user desktop app

      const checkCron = async (key: string, intervalMs: number) => {
        try {
          const state = await pb.collection("system_state").getFirstListItem(`key = "${key}"`);
          if (now - state.lastRunAt >= intervalMs) {
            await pb.collection("system_state").update(state.id, { lastRunAt: now });
            return true;
          }
          return false;
        } catch (e) {
          // 404, create it
          await pb.collection("system_state").create({ key, lastRunAt: now });
          // Fire on first creation? Usually yes.
          return true;
        }
      };

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timezoneOffset = new Date().getTimezoneOffset();

      // Daily session summary
      if (await checkCron("daily-session-summary", 24 * 60 * 60 * 1000)) {
        const { runObserver } = await import("@/lib/jobs/observer");
        await runObserver(pb, { userId: user.id, timezone });
      }
    }

    return NextResponse.json({ ok: true, notifications: notificationsToFire });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Scheduler error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
