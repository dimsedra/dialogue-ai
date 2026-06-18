import { NextRequest, NextResponse } from 'next/server';
import { join, relative } from 'path';
import PocketBase from 'pocketbase';
import { verifyPbToken } from '@/lib/pb-actions/auth';
import { getPbAdmin } from '@/lib/pb-server-admin';
import { syncFolioFileToDb, resolveEntityFromPath, pruneFolioFileFromDb } from '@/lib/folio/sync';
import { DEFAULT_FOLIO_DIR } from '@/lib/folio/constants';
import { existsSync } from 'fs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  const cronSecret = process.env.INTERNAL_CRON_SECRET || 'default_local_secret';

  let pb: PocketBase;
  
  if (!token) {
    return NextResponse.json({ ok: false, error: 'Missing Bearer token' }, { status: 401 });
  }

  // Support both background jobs/watchers (using INTERNAL_CRON_SECRET) and authenticated user tokens
  if (token === cronSecret) {
    try {
      pb = await getPbAdmin();
    } catch (err) {
      return NextResponse.json({ ok: false, error: 'Failed to authenticate admin' }, { status: 500 });
    }
  } else {
    const user = await verifyPbToken(token);
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Invalid or expired token' }, { status: 401 });
    }
    const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
    pb = new PocketBase(pbUrl);
    pb.autoCancellation(false);
    pb.authStore.save(token, null);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const filePath = (body as { filePath?: string })?.filePath;
  if (!filePath) {
    return NextResponse.json({ ok: false, error: 'Missing filePath in body' }, { status: 400 });
  }

  // Resolve folioRootPath
  let devFallbackPath = process.env.NODE_ENV === 'development' ? process.env.DEV_LOCAL_PATH : null;
  if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
    devFallbackPath = devFallbackPath.slice(1, -1);
  }
  const folioRootPath = req.headers.get('x-folio-path') || devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

  try {
    const info = resolveEntityFromPath(filePath, folioRootPath);
    if (!info) {
      return NextResponse.json({ ok: true, status: 'ignored', reason: 'Path outside folio or invalid collection' });
    }

    if (existsSync(filePath)) {
      await syncFolioFileToDb(filePath, pb, folioRootPath);
      return NextResponse.json({ ok: true, status: 'synced', entity: info });
    } else {
      // File deleted, let's prune it
      console.log(`[Sync Engine API] File deleted, pruning:`, filePath);
      await pruneFolioFileFromDb(filePath, pb, folioRootPath);
      return NextResponse.json({ ok: true, status: 'pruned', entity: info });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Sync Engine API] Sync error:', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
