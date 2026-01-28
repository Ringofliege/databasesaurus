import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/audit - Get audit events for a project
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
  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
  const action = searchParams.get('action');

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

  const events = await prisma.auditEvent.findMany({
    where: {
      projectId: id,
      ...(action ? { action: { contains: action } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ events });
}
