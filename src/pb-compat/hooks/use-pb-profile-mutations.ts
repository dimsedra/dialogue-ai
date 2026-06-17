import { useMutation } from "../use-mutation";
import { useAuth } from "../auth";
import { getPbClient } from "../client";
import type { PbUserProfile, PbPushSubscriptions } from "../_generated/dataModel";

async function getOrCreateProfile(userId: string, name: string) {
  const pb = getPbClient();
  const list = await pb.collection("user_profile").getList(1, 1, {
    filter: `user = "${userId}"`,
  });
  if (list.items[0]) {
    return list.items[0];
  }
  try {
    const created = await pb.collection("user_profile").create({
      user: userId,
      name,
      bio: "No bio yet.",
      preferences: { theme: "system", sound: true },
    });
    return created;
  } catch (e: any) {
    console.error("PB Create Error:", e.response?.data || e);
    throw e;
  }
}

export function usePbUpdateProfile() {
  const { user } = useAuth();
  const mutate = useMutation<PbUserProfile>({ collection: "user_profile", kind: "update" });
  return async (args: { name?: string; bio?: string; preferences?: any }) => {
    if (!user) throw new Error("Unauthorized");
    const email = (user as any).email;
    const name = email ? email.split("@")[0] : "User";
    const profile = await getOrCreateProfile(user.id, name);
    const patch: Record<string, any> = {};
    if (args.name !== undefined) patch.name = args.name || "User";
    if (args.bio !== undefined) patch.bio = args.bio || "No bio yet.";
    if (args.preferences !== undefined) {
      const currentPrefs = (profile.preferences as any) || {};
      patch.preferences = { ...currentPrefs, ...args.preferences };
    }
    const record = await mutate({ id: profile.id, record: patch });
    return record;
  };
}

export function usePbUpdatePreferences() {
  const { user } = useAuth();
  const mutate = useMutation<PbUserProfile>({ collection: "user_profile", kind: "update" });
  return async (args: {
    provider?: string;
    searchProvider?: "tavily" | "serper";
    customConfigs?: any;
    taskModels?: any;
    mcpServers?: any;
    timeFormat?: "auto" | "12h" | "24h";
    folioName?: string;
    localGguf?: {
      modelPath: string;
      gpuLayers: number;
      contextSize: number;
      threads: number;
    };
    userId?: string;
  }) => {
    if (!user) throw new Error("Unauthorized");
    const email = (user as any).email;
    const name = email ? email.split("@")[0] : "User";
    const profile = await getOrCreateProfile(user.id, name);
    
    const currentPrefs = (profile.preferences as any) || {};
    const existingConfigs = currentPrefs.customConfigs || {};
    const newConfigs = args.customConfigs
      ? { ...existingConfigs, ...args.customConfigs }
      : existingConfigs;

    const updatedPrefs = {
      ...currentPrefs,
      ...(args.provider ? { provider: args.provider } : {}),
      ...(args.searchProvider
        ? { searchProvider: args.searchProvider }
        : { searchProvider: "tavily" }),
      ...(args.taskModels ? { taskModels: args.taskModels } : {}),
      ...(args.mcpServers ? { mcpServers: args.mcpServers } : {}),
      ...(args.timeFormat ? { timeFormat: args.timeFormat } : {}),
      ...(args.folioName !== undefined ? { folioName: args.folioName } : {}),
      ...(args.localGguf ? { localGguf: args.localGguf } : {}),
      customConfigs: newConfigs,
    };

    const record = await mutate({ id: profile.id, record: { preferences: updatedPrefs } });
    return record;
  };
}

export function usePbAddSubscription() {
  const { user } = useAuth();
  const create = useMutation<PbPushSubscriptions>({ collection: "push_subscriptions", kind: "create" });
  const update = useMutation<PbPushSubscriptions>({ collection: "push_subscriptions", kind: "update" });
  return async (args: {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
  }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const list = await pb.collection("push_subscriptions").getList(1, 1, {
      filter: `user = "${user.id}" && endpoint = "${args.endpoint}"`,
    });
    const existing = list.items[0];
    if (existing) {
      await update({
        id: existing.id,
        record: {
          expirationTime: args.expirationTime || undefined,
          keys: args.keys,
        },
      });
    } else {
      await create({
        user: user.id as any,
        endpoint: args.endpoint,
        expirationTime: args.expirationTime || undefined,
        keys: args.keys,
      } as any);
    }
  };
}

export function usePbRemoveSubscription() {
  const { user } = useAuth();
  const remove = useMutation({ collection: "push_subscriptions", kind: "delete" });
  return async (args: { endpoint: string }) => {
    if (!user) throw new Error("Unauthorized");
    const pb = getPbClient();
    const list = await pb.collection("push_subscriptions").getList(1, 1, {
      filter: `user = "${user.id}" && endpoint = "${args.endpoint}"`,
    });
    const existing = list.items[0];
    if (existing) {
      await remove({ id: existing.id });
    }
  };
}
