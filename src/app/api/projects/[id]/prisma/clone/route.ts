import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { cloneOrRefreshRepo } from '@/lib/runner';

const cloneSchema = z.object({
  refresh: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/prisma/clone - Clone or refresh the repository
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

  try {
    const body = await request.json().catch(() => ({}));
    const data = cloneSchema.parse(body);

    // Get project
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (!project.gitlabRepoPath) {
      return NextResponse.json(
        { error: 'GitLab repository path not configured for this project' },
        { status: 400 }
      );
    }

    const branch = project.defaultBranch || 'main';

    // Log audit
    await logAudit(id, auth.actor, data.refresh ? 'prisma.refresh' : 'prisma.clone', true, {
      repoPath: project.gitlabRepoPath,
      branch,
    });

    // Clone or refresh
    const result = await cloneOrRefreshRepo(
      project.id,
      project.slug,
      project.gitlabRepoPath,
      branch,
      data.refresh || false
    );

    return NextResponse.json({
      success: true,
      workspacePath: result.workspacePath,
      runId: result.runId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    console.error('Error cloning repository:', error);
    return NextResponse.json(
      { error: `Failed to clone repository: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
