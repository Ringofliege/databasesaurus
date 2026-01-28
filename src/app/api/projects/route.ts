import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { generateSlug, isValidSlug } from '@/lib/path-utils';

// Zod schemas for validation
const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().optional(),
  gitlabRepoPath: z.string().optional(),
  defaultBranch: z.string().optional(),
  workingDirectory: z.string().optional(),
  pnpmFilter: z.string().optional(),
});

/**
 * GET /api/projects - List all projects
 */
export async function GET(request: NextRequest) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      lastDbKind: true,
      lastDbHost: true,
      lastDbPort: true,
      updatedAt: true,
      gitlabRepoPath: true,
    },
  });

  return NextResponse.json({ projects });
}

/**
 * POST /api/projects - Create a new project
 */
export async function POST(request: NextRequest) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json();
    const data = createProjectSchema.parse(body);

    // Generate or validate slug
    let slug = data.slug || generateSlug(data.name);
    
    if (!isValidSlug(slug)) {
      return NextResponse.json(
        { error: 'Invalid slug format. Use lowercase letters, numbers, and hyphens.' },
        { status: 400 }
      );
    }

    // Check if slug is unique
    const existing = await prisma.project.findUnique({
      where: { slug },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A project with this slug already exists.' },
        { status: 409 }
      );
    }

    // Create project
    const project = await prisma.project.create({
      data: {
        name: data.name,
        slug,
        gitlabRepoPath: data.gitlabRepoPath || null,
        defaultBranch: data.defaultBranch || 'main',
        workingDirectory: data.workingDirectory || null,
        pnpmFilter: data.pnpmFilter || null,
      },
    });

    // Log audit
    await logAudit(project.id, auth.actor, 'project.create', true, {
      name: data.name,
      slug,
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
