import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { cloneOrRefreshRepo } from '@/lib/runner';
import { findPrismaSchemaDir } from '@/lib/path-utils';

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

    console.log(`[clone] Starting clone/refresh for project: ${project.slug}, repo: ${project.gitlabRepoPath}, branch: ${branch}`);

    // Log audit
    await logAudit(id, auth.actor, data.refresh ? 'prisma.refresh' : 'prisma.clone', true, {
      repoPath: project.gitlabRepoPath,
      branch,
    });

    // Clone or refresh
    console.log(`[clone] Calling cloneOrRefreshRepo...`);
    const result = await cloneOrRefreshRepo(
      project.id,
      project.slug,
      project.gitlabRepoPath,
      branch,
      data.refresh || false
    );

    console.log(`[clone] Clone/refresh completed:`, result);

    // Validate the cloned repository
    console.log(`[clone] Validating repository...`);
    console.log(`[clone] Workspace path exists:`, fs.existsSync(result.workspacePath));
    
    const gitDir = path.join(result.workspacePath, '.git');
    const hasGit = fs.existsSync(gitDir);
    console.log(`[clone] Git dir path: ${gitDir}, exists: ${hasGit}`);
    
    // Check what's actually in the workspace
    let contents: string[] = [];
    try {
      contents = fs.readdirSync(result.workspacePath);
      console.log(`[clone] Workspace contents:`, contents);
    } catch (err) {
      console.error(`[clone] Error reading workspace:`, err);
    }
    
    // Find prisma schema
    let prismaSchemaPath: string | null = null;
    let hasPrismaDir = false;
    
    // Use the same prisma schema search as the runner
    const schemaDirPath = findPrismaSchemaDir(result.workspacePath);
    console.log(`[clone] findPrismaSchemaDir result:`, schemaDirPath);
    
    if (schemaDirPath) {
      hasPrismaDir = true;
      // Calculate relative path from workspace root
      const relativePath = path.relative(result.workspacePath, schemaDirPath);
      prismaSchemaPath = `${relativePath}/schema.prisma`.replace(/\\/g, '/');
      console.log(`[clone] Found Prisma schema at relative path: ${prismaSchemaPath}`);
    }

    // List top-level files
    const topLevelFiles = contents.filter(f => !f.startsWith('.'));
    console.log(`[clone] Top-level files (no dots):`, topLevelFiles);

    const response = {
      success: true,
      workspacePath: result.workspacePath,
      runId: result.runId,
      validation: {
        hasGit,
        hasPrismaDir,
        prismaSchemaPath,
        topLevelFiles,
        allContents: contents,
      },
      message: prismaSchemaPath 
        ? `Repository cloned successfully. Found Prisma schema at ${prismaSchemaPath}.`
        : `Repository cloned but Prisma schema not found`,
    };

    console.log(`[clone] Final response:`, response);
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }

    const errorMessage = (error as Error).message;
    console.error('Error cloning repository:', errorMessage);
    
    return NextResponse.json(
      { 
        success: false,
        error: `Failed to clone repository: ${errorMessage}`,
        message: `Clone failed: ${errorMessage}`,
        validation: null,
      },
      { status: 500 }
    );
  }
}
