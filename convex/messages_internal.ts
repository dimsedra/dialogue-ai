import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const saveExtractedText = internalMutation({
  args: {
    messageId: v.id("messages"),
    storageId: v.id("_storage"),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message || !message.attachments) return;

    const newAttachments = message.attachments.map(att => 
      att.storageId === args.storageId 
        ? { ...att, extractedText: args.text } 
        : att
    );

    await ctx.db.patch(args.messageId, { attachments: newAttachments });
  },
});
