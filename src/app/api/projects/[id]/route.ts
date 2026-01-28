import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';

// Zod schema for updating a project
const updateProjectSchema = z.object({
  gitlabRepoPath: z.string().optional().nullable(),
  defaultBranch: z.string().optional().nullable(),
  workingDirectory: z.string().optional().nullable(),
  pnpmFilter: z.string().optional().nullable(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id - Get a single project
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

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      dbObjects: {
        orderBy: { createdAt: 'desc' },
      },
      auditEvents: {
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    },
  });

  if (!project) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ project });
}

/**
 * PATCH /api/projects/:id - Update a project
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const data = updateProjectSchema.parse(body);

    // Check if project exists
    const existing = await prisma.project.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Update project
    const project = await prisma.project.update({
      where: { id },
      data: {
        gitlabRepoPath: data.gitlabRepoPath ?? existing.gitlabRepoPath,
        defaultBranch: data.defaultBranch ?? existing.defaultBranch,
        workingDirectory: data.workingDirectory ?? existing.workingDirectory,
        pnpmFilter: data.pnpmFilter ?? existing.pnpmFilter,
      },
    });

    // Log audit
    await logAudit(id, auth.actor, 'project.update', true, data);

    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/:id - Delete a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  const existing = await prisma.project.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  await prisma.project.delete({
    where: { id },
  });

  // Note: Audit event can't be logged for deleted project
  // Consider logging to a separate system audit log

  return NextResponse.json({ success: true });
}
