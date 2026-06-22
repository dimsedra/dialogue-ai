import { NextRequest, NextResponse } from 'next/server';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import PocketBase from 'pocketbase';
import { verifyPbToken } from '../../../lib/pb-actions/auth';
import { DEFAULT_FOLIO_DIR } from '../../../lib/folio/constants';

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

  const name = (body as { name?: string })?.name;
  const icon = (body as { icon?: string })?.icon || 'Briefcase';
  const color = (body as { color?: string })?.color || '#d4a373';

  if (!name) {
    return NextResponse.json({ ok: false, error: 'Missing name' }, { status: 400 });
  }

  try {
    const pbUrl = process.env.NEXT_PUBLIC_PB_URL ?? 'http://127.0.0.1:8090';
    const pb = new PocketBase(pbUrl);
    pb.autoCancellation(false);
    pb.authStore.save(token, null);

    // Create workspace in PocketBase
    const record = await pb.collection('workspaces').create({
      user: user.id,
      name,
      icon,
      color,
      createdAt: Date.now(),
      activeBranchLimit: 3,
    });

    // Create default trunk session for this workspace in PocketBase
    await pb.collection('chat_sessions').create({
      user: user.id,
      workspace: record.id,
      title: `${name} Trunk`,
      isTrunk: true,
      sessionType: 'trunk',
      pinned: true,
      lastActivity: Date.now(),
      createdAt: Date.now(),
    });

    // Resolve folioRootPath
    let devFallbackPath = process.env.NODE_ENV === 'development' ? process.env.DEV_LOCAL_PATH : null;
    if (devFallbackPath && devFallbackPath.startsWith('"') && devFallbackPath.endsWith('"')) {
      devFallbackPath = devFallbackPath.slice(1, -1);
    }
    const folioRootPath = req.headers.get('x-folio-path') || devFallbackPath || join(process.cwd(), DEFAULT_FOLIO_DIR);

    // Create folder on filesystem proactively
    const workspacesParent = join(folioRootPath, 'workspaces');
    if (!existsSync(workspacesParent)) {
      mkdirSync(workspacesParent, { recursive: true });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
    const folderName = `${slug}-${record.id}`;
    const workspacePath = join(workspacesParent, folderName);
    if (!existsSync(workspacePath)) {
      mkdirSync(workspacePath, { recursive: true });
    }

    // Write initial .workspace.yaml file
    const { serializeWorkspaceYaml } = await import('../../../lib/folio/parser');
    const { writeFileSync } = await import('fs');
    const configContent = serializeWorkspaceYaml({
      id: record.id,
      name,
      icon,
      color,
      createdAt: record.createdAt,
      archived: false,
      activeBranchLimit: 3,
    });
    writeFileSync(join(workspacePath, '.workspace.yaml'), configContent, 'utf8');

    // Write initial CONTEXT.md file
    let defaultContext = `# ${name}\n\n## Purpose\n`;
    if (name.toLowerCase() === 'personal') {
      defaultContext += `Casual daily companion space. Journal, reflections, random thoughts.\n\n## Current State\n[What's happening now — active focus, ongoing themes]\n\n## User Notes\n- User prefers Indonesian mixed with English\n`;
    } else {
      defaultContext += `[Provide the purpose and context of this workspace to guide the AI's behavior.]\n\n## Current State\n[Current state — active objectives, recent progress, immediate next steps]\n\n## User Notes\n`;
    }
    writeFileSync(join(workspacePath, 'CONTEXT.md'), defaultContext, 'utf8');

    return NextResponse.json({ ok: true, id: record.id });
  } catch (err: any) {
    console.error('[API Workspace] Creation failed:', err);
    return NextResponse.json({ ok: false, error: err.message || String(err) }, { status: 500 });
  }
}
