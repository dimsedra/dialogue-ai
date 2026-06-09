import { getPbClient } from "../client";
import { defineQuery } from "../use-query";
import type { PbPageSettings } from "../_generated/dataModel";

export type PageSettingsGetArgs =
  | { user: string; page: string }
  | undefined;

export function buildPageSettingsFilter(
  args: Record<string, unknown> | undefined,
): string {
  if (!args || typeof args !== "object") {
    return "1 = 2";
  }
  const user = args.user;
  const page = args.page;
  if (typeof user !== "string" || user.length === 0 || typeof page !== "string" || page.length === 0) {
    return "1 = 2";
  }
  const escapedUser = user.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedPage = page.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `user = "${escapedUser}" && page = "${escapedPage}"`;
}

async function getPageSettingsImpl(
  args: PageSettingsGetArgs,
): Promise<PbPageSettings | null> {
  const pb = getPbClient();
  const userId = args?.user ?? pb.authStore.record?.id;
  const page = args?.page;
  if (!userId || !page) {
    return null;
  }
  const list = await pb.collection("page_settings").getList(1, 1, {
    filter: `user = "${userId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" && page = "${page.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  });
  return (list.items[0] as PbPageSettings | undefined) ?? null;
}

export const pageSettingsGetQuery = defineQuery<
  PageSettingsGetArgs,
  PbPageSettings | null
>(
  {
    collection: "page_settings",
    kind: "first",
    buildFilter: buildPageSettingsFilter,
  },
  getPageSettingsImpl,
);
