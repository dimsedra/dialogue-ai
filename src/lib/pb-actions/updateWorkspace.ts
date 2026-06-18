import fs from "node:fs";
import { join } from "node:path";
import PocketBase from "pocketbase";
import type { PbActionHandler } from "./registry";
import { syncFolioFileToDb, pruneFolioFileFromDb } from "../folio/sync";
import { parseWorkspaceYaml, serializeWorkspaceYaml } from "../folio/parser";
import { DEFAULT_FOLIO_DIR } from "../folio/constants";

interface UpdateWorkspaceArgs {
  id: string;
  name?: string;
  icon?: string;
  color?: string;
  context?: string;
  agentName?: string;
  defaultAgentPersonaId?: string | null;
  archived?: boolean;
}

export const updateWorkspace: PbActionHandler<
  UpdateWorkspaceArgs,
  { success: boolean }
> = async (args, ctx) => {
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8090";
  const pb = new PocketBase(pbUrl);
  pb.authStore.save(ctx.token, null);

  // 1. Fetch current DB record
  const record = await pb.collection("workspaces").getOne(args.id);
  if (!record) throw new Error(`Workspace not found: ${args.id}`);

  const isDevOrTest = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
  let devFallbackPath = isDevOrTest ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

  // 2. Locate the workspace folder on disk
  const workspacesParent = join(folioRootPath, "workspaces");
  if (!fs.existsSync(workspacesParent)) {
    throw new Error(`Workspaces directory does not exist: ${workspacesParent}`);
  }

  const folders = fs.readdirSync(workspacesParent);
  const matchedFolder = folders.find((f) => f.endsWith(`-${args.id}`));
  if (!matchedFolder) {
    throw new Error(`Workspace folder not found on disk for ID: ${args.id}`);
  }

  const oldWorkspacePath = join(workspacesParent, matchedFolder);
  const configFilePath = join(oldWorkspacePath, ".workspace.yaml");

  // 3. Load or initialize metadata
  let metadata: Record<string, any> = {};
  if (fs.existsSync(configFilePath)) {
    const fileContent = fs.readFileSync(configFilePath, "utf8");
    metadata = parseWorkspaceYaml(fileContent);
  } else {
    // Populate from DB record if missing
    metadata = {
      id: record.id,
      name: record.name,
      icon: record.icon,
      color: record.color,
      context: record.context || "",
      agentName: record.agentName || "",
      defaultAgentPersona: record.defaultAgentPersona || "",
      createdAt: record.createdAt,
      archived: record.archived || false,
    };
  }

  // 4. Merge updates
  if (args.name !== undefined) metadata.name = args.name;
  if (args.icon !== undefined) metadata.icon = args.icon;
  if (args.color !== undefined) metadata.color = args.color;
  if (args.context !== undefined) metadata.context = args.context;
  if (args.agentName !== undefined) metadata.agentName = args.agentName;
  if (args.defaultAgentPersonaId !== undefined) {
    metadata.defaultAgentPersona = args.defaultAgentPersonaId === null ? "" : args.defaultAgentPersonaId;
  }
  if (args.archived !== undefined) metadata.archived = args.archived;

  const serialized = serializeWorkspaceYaml(metadata);

  // 5. Handle folder renaming if name changed
  let currentWorkspacePath = oldWorkspacePath;
  let renamed = false;
  if (args.name !== undefined && args.name !== record.name) {
    const slug = args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
    const newFolderName = `${slug}-${args.id}`;
    const newWorkspacePath = join(workspacesParent, newFolderName);
    if (newWorkspacePath !== oldWorkspacePath) {
      renamed = true;
      // Rename folder
      fs.renameSync(oldWorkspacePath, newWorkspacePath);
      currentWorkspacePath = newWorkspacePath;
    }
  }

  // Save config file in the final path
  const finalConfigFilePath = join(currentWorkspacePath, ".workspace.yaml");
  fs.writeFileSync(finalConfigFilePath, serialized, "utf8");

  // 6. Sync changes back to PB cache
  if (renamed) {
    const oldConfigFilePath = join(oldWorkspacePath, ".workspace.yaml");
    await pruneFolioFileFromDb(oldConfigFilePath, pb, folioRootPath);
  }
  await syncFolioFileToDb(finalConfigFilePath, pb, folioRootPath);

  return { success: true };
};
