import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getSessionStore } from '@/lib/session-store';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/session/end - End the current session
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  // Check if project exists
  const project = await prisma.project.findUnique({
    where: { id },
  });

  if (!project) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  // Delete session
  const sessionStore = getSessionStore();
  await sessionStore.deleteByProjectId(id);

  // Log audit
  await logAudit(id, auth.actor, 'session.end', true);

  // Clear session cookie
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('session_id');

  return response;
}
