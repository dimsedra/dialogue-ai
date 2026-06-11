import PocketBase from "pocketbase";

let adminClient: PocketBase | null = null;

export async function getPbAdmin(): Promise<PocketBase> {
  if (adminClient) {
    if (adminClient.authStore.isValid) {
      return adminClient;
    }
  }

  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.autoCancellation(false);

  const email = process.env.PB_ADMIN_EMAIL || "admin@dialogue.local";
  const password = process.env.PB_ADMIN_PASSWORD || "admin123456";

  try {
    await pb.admins.authWithPassword(email, password);
    adminClient = pb;
    return pb;
  } catch (err) {
    console.error("Failed to auth PB Admin:", err);
    throw new Error("Cannot authenticate PB admin");
  }
}
