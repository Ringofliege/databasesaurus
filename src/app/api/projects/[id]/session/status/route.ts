import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { getSessionStore } from '@/lib/session-store';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/session/status - Get session status
 */
export async function GET(
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

  // Get session
  const sessionStore = getSessionStore();
  const session = await sessionStore.getByProjectId(id);

  if (!session) {
    return NextResponse.json({
      active: false,
      expiresAt: null,
    });
  }

  return NextResponse.json({
    active: true,
    expiresAt: session.expiresAt.toISOString(),
    dbKind: session.dbUrl.scheme,
    dbHost: session.dbUrl.host,
    dbPort: session.dbUrl.port,
  });
}
