import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, renameSync } from 'fs';
import PocketBase from 'pocketbase';
import { verifyPbToken } from '../../../../lib/pb-actions/auth';
import { DEFAULT_FOLIO_DIR } from '../../../../lib/folio/constants';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Unauthorized: Missing token' }, { status: 401 });
  }

  const user = await verifyPbToken(token);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Unauthorized: Invalid token' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = (body as { id?: string })?.id;
  if (!id) {
    return NextResponse.json({ ok: false, error: 'Missing workspace ID' }, { status: 400 });
  }

  try {
    const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
    const pb = new PocketBase(pbUrl);
    pb.autoCancellation(false);
    pb.authStore.save(token, null);

    // Resolve folioRootPath
    let devFallbackPath = process.env.NODE_ENV === 'development' ? process.env.DEV_LOCAL_PATH : null;
    if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
      devFallbackPath = devFallbackPath.slice(1, -1);
    }
    const folioRootPath = req.headers.get('x-folio-path') || devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

    // Move workspace folder to .trash/
    const trashDir = join(folioRootPath, '.trash');
    if (!existsSync(trashDir)) {
      mkdirSync(trashDir, { recursive: true });
    }

    let sourcePath: string | null = null;
    let folderName: string | null = null;

    // 1. Check workspaces parent folder (new-style nested workspaces)
    const workspacesParent = join(folioRootPath, 'workspaces');
    if (existsSync(workspacesParent)) {
      const folders = readdirSync(workspacesParent);
      const matched = folders.find((f) => f.endsWith(`-${id}`));
      if (matched) {
        folderName = matched;
        sourcePath = join(workspacesParent, matched);
      }
    }

    // 2. Check old-style root directory (fallback)
    if (!sourcePath) {
      const legacyPath = join(folioRootPath, id);
      if (existsSync(legacyPath) && statSync(legacyPath).isDirectory()) {
        folderName = id;
        sourcePath = legacyPath;
      }
    }

    if (sourcePath && folderName) {
      const targetPath = join(trashDir, `${folderName}-${Date.now()}`);
      renameSync(sourcePath, targetPath);
      console.log(`[API Workspace] Moved workspace folder ${sourcePath} to ${targetPath}`);
    }

    // Cascade delete related records in PocketBase (tasks, events, chat_sessions, habits)
    const collectionsToClean = ['tasks', 'events', 'chat_sessions', 'habits'];
    for (const col of collectionsToClean) {
      try {
        const records = await pb.collection(col).getFullList({
          filter: `workspace = "${id}"`
        });
        for (const rec of records) {
          await pb.collection(col).delete(rec.id);
        }
      } catch (e) {
        console.warn(`[API Workspace] Failed to clean collection ${col}:`, e);
      }
    }

    // Finally, delete the workspace record in PocketBase
    await pb.collection('workspaces').delete(id);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[API Workspace] Deletion failed:', err);
    return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 500 });
  }
}
