"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import webpush from "web-push";

/**
 * Sends a Web Push notification to all registered subscriptions of a user.
 * Runs in the Node.js runtime to utilize cryptography operations of web-push.
 */
export const sendPushNotification = internalAction({
  args: {
    userId: v.id("users"),
    title: v.string(),
    message: v.string(),
    actionUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const contactEmail = process.env.VAPID_CONTACT_EMAIL || "mailto:admin@dialogue.ai";

    if (!publicKey || !privateKey) {
      console.warn("Web Push notifications are skipped: VAPID keys are not configured.");
      return;
    }

    try {
      webpush.setVapidDetails(contactEmail, publicKey, privateKey);
    } catch (err) {
      console.error("Failed to configure VAPID details:", err);
      return;
    }

    // Retrieve all active push subscriptions for this user
    const subscriptions = await ctx.runQuery(
      internal.push.getSubscriptionsForUser,
      { userId: args.userId }
    );

    if (subscriptions.length === 0) {
      return;
    }

    const payload = JSON.stringify({
      title: args.title,
      message: args.message,
      actionUrl: args.actionUrl || "/",
    });

    // Send notifications concurrently
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payload
          );
        } catch (error: any) {
          // If the push service returns 404 (Not Found) or 410 (Gone), the subscription has expired
          if (error.statusCode === 404 || error.statusCode === 410) {
            console.log(`Removing expired push subscription endpoint: ${sub.endpoint}`);
            await ctx.runMutation(
              internal.push.deleteExpiredSubscription,
              { endpoint: sub.endpoint }
            );
          } else {
            console.error(
              `Error sending web push notification to ${sub.endpoint}:`,
              error
            );
          }
        }
      })
    );
  },
});
