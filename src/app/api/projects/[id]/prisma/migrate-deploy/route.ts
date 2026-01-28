import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { runPrismaCommand } from '@/lib/runner';
import { getWorkspacePath } from '@/lib/path-utils';
import { buildDbUrl } from '@/lib/db-url';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/prisma/migrate-deploy - Run Prisma migrate deploy
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

  const session = await getActiveSession(request, id);
  if (!session) {
    return noSessionResponse();
  }

  try {
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
        { error: 'GitLab repository path not configured' },
        { status: 400 }
      );
    }

    const branch = project.defaultBranch || 'main';
    const workspacePath = getWorkspacePath(project.slug, project.gitlabRepoPath, branch);
    const databaseUrl = buildDbUrl(session.dbUrl);

    // Log audit
    await logAudit(id, auth.actor, 'prisma.migrate-deploy', true, {
      workspacePath,
      workingDirectory: project.workingDirectory,
    });

    // Run migrate deploy
    const result = await runPrismaCommand(
      id,
      workspacePath,
      project.workingDirectory,
      'migrate-deploy',
      databaseUrl
    );

    return NextResponse.json({
      success: result.success,
      runId: result.runId,
      exitCode: result.exitCode,
    });
  } catch (error) {
    // Log failed audit
    await logAudit(id, auth.actor, 'prisma.migrate-deploy', false, {
      error: (error as Error).message,
    });

    console.error('Error running migrate deploy:', error);
    return NextResponse.json(
      { error: `Failed to run migrate deploy: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
