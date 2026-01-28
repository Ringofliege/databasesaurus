import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { CommandRunner } from '@/lib/runner';
import { getWorkspacePath } from '@/lib/path-utils';
import { buildDbUrl } from '@/lib/db-url';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/prisma/pnpm-prisma-migrate - Run pnpm prisma:migrate
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

    if (!project.pnpmFilter) {
      return NextResponse.json(
        { error: 'pnpm filter not configured for this project. This command requires a pnpm monorepo setup.' },
        { status: 400 }
      );
    }

    const branch = project.defaultBranch || 'main';
    const workspacePath = getWorkspacePath(project.slug, project.gitlabRepoPath, branch);
    const databaseUrl = buildDbUrl(session.dbUrl);

    // Log audit
    await logAudit(id, auth.actor, 'prisma.pnpm-prisma-migrate', true, {
      workspacePath,
      pnpmFilter: project.pnpmFilter,
    });

    // Run pnpm command
    const runner = new CommandRunner();
    const result = await runner.run(
      'pnpm',
      ['--filter', project.pnpmFilter, 'prisma:migrate'],
      {
        projectId: id,
        kind: 'prisma.pnpm-prisma-migrate',
        cwd: workspacePath,
        env: {
          DATABASE_URL: databaseUrl,
        },
      }
    );

    return NextResponse.json({
      success: result.success,
      runId: result.runId,
      exitCode: result.exitCode,
    });
  } catch (error) {
    // Log failed audit
    await logAudit(id, auth.actor, 'prisma.pnpm-prisma-migrate', false, {
      error: (error as Error).message,
    });

    console.error('Error running pnpm prisma:migrate:', error);
    return NextResponse.json(
      { error: `Failed to run pnpm prisma:migrate: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
