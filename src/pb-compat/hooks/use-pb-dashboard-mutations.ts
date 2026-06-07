import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbCardState } from "../_generated/dataModel";

async function findExistingCardState(userId: string, cardType: string, cardId?: string) {
  const pb = getPbClient();
  const filter = cardId 
    ? `user = "${userId}" && cardType = "${cardType}" && cardId = "${cardId}"`
    : `user = "${userId}" && cardType = "${cardType}" && (cardId = null || cardId = "")`;
  const list = await pb.collection("card_state").getList(1, 1, { filter });
  return list.items[0] ?? null;
}

export function usePbDismissCard() {
  const { user } = useAuth();
  const create = useMutation<PbCardState>({ collection: "card_state", kind: "create" });
  const update = useMutation<PbCardState>({ collection: "card_state", kind: "update" });

  return async (args: { cardType: string; cardId?: string }) => {
    if (!user) throw new Error("Unauthorized");
    const existing = await findExistingCardState(user.id, args.cardType, args.cardId);
    if (existing) {
      const record = await update({
        id: existing.id,
        record: {
          dismissedAt: Date.now(),
          snoozedUntil: undefined,
        },
      });
      return record.id;
    }
    const record = await create({
      user: user.id as any,
      cardType: args.cardType,
      cardId: args.cardId || undefined,
      dismissedAt: Date.now(),
    } as any);
    return record.id;
  };
}

export function usePbSnoozeCard() {
  const { user } = useAuth();
  const create = useMutation<PbCardState>({ collection: "card_state", kind: "create" });
  const update = useMutation<PbCardState>({ collection: "card_state", kind: "update" });

  return async (args: {
    cardType: string;
    cardId?: string;
    duration: "1h" | "today" | "tomorrow";
  }) => {
    if (!user) throw new Error("Unauthorized");
    const now = Date.now();
    let snoozedUntil: number;
    if (args.duration === "1h") {
      snoozedUntil = now + 60 * 60 * 1000;
    } else if (args.duration === "today") {
      const endOfDay = new Date();
      endOfDay.setHours(22, 0, 0, 0);
      snoozedUntil = endOfDay.getTime();
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(8, 0, 0, 0);
      snoozedUntil = tomorrow.getTime();
    }

    const existing = await findExistingCardState(user.id, args.cardType, args.cardId);
    if (existing) {
      const record = await update({
        id: existing.id,
        record: {
          snoozedUntil,
          dismissedAt: undefined,
        },
      });
      return record.id;
    }
    const record = await create({
      user: user.id as any,
      cardType: args.cardType,
      cardId: args.cardId || undefined,
      snoozedUntil,
    } as any);
    return record.id;
  };
}

export function usePbMuteCardType() {
  const { user } = useAuth();
  const create = useMutation<PbCardState>({ collection: "card_state", kind: "create" });
  const update = useMutation<PbCardState>({ collection: "card_state", kind: "update" });

  return async (args: { cardType: string }) => {
    if (!user) throw new Error("Unauthorized");
    const existing = await findExistingCardState(user.id, args.cardType, undefined);
    if (existing) {
      const record = await update({
        id: existing.id,
        record: {
          mutedAt: Date.now(),
        },
      });
      return record.id;
    }
    const record = await create({
      user: user.id as any,
      cardType: args.cardType,
      mutedAt: Date.now(),
    } as any);
    return record.id;
  };
}

export function usePbMarkCardShown() {
  const { user } = useAuth();
  const create = useMutation<PbCardState>({ collection: "card_state", kind: "create" });
  const update = useMutation<PbCardState>({ collection: "card_state", kind: "update" });

  return async (args: { cardType: string; cardId?: string }) => {
    if (!user) return null;
    const existing = await findExistingCardState(user.id, args.cardType, args.cardId);
    if (existing) {
      const record = await update({
        id: existing.id,
        record: {
          lastShownAt: Date.now(),
        },
      });
      return record.id;
    }
    const record = await create({
      user: user.id as any,
      cardType: args.cardType,
      cardId: args.cardId || undefined,
      lastShownAt: Date.now(),
    } as any);
    return record.id;
  };
}
