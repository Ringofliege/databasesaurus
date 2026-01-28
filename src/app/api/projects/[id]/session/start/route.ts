import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { parseDbUrl } from '@/lib/db-url';
import { getSessionStore } from '@/lib/session-store';
import { createDbClient } from '@/lib/db-client';

const startSessionSchema = z.object({
  adminUrl: z.string().min(1),
  passwordOverride: z.string().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/session/start - Start a new session
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
    const body = await request.json();
    const data = startSessionSchema.parse(body);

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

    // Parse the database URL
    let parseResult;
    try {
      parseResult = parseDbUrl(data.adminUrl, data.passwordOverride);
    } catch (error) {
      return NextResponse.json(
        { error: `Invalid database URL: ${(error as Error).message}` },
        { status: 400 }
      );
    }

    const { url: dbUrl, warnings } = parseResult;

    // Test connection
    const client = createDbClient(dbUrl);
    try {
      await client.connect();
      const connected = await client.testConnection();
      if (!connected) {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      await client.disconnect();
      return NextResponse.json(
        { error: `Failed to connect to database: ${(error as Error).message}` },
        { status: 400 }
      );
    } finally {
      await client.disconnect();
    }

    // Store session
    const sessionStore = getSessionStore();
    const { sessionId, expiresAt } = await sessionStore.create(id, dbUrl, auth.actor);

    // Update project with last known DB info
    await prisma.project.update({
      where: { id },
      data: {
        lastDbKind: dbUrl.scheme,
        lastDbHost: dbUrl.host,
        lastDbPort: dbUrl.port,
        lastDbName: dbUrl.database || null,
      },
    });

    // Log audit
    await logAudit(id, auth.actor, 'session.start', true, {
      dbKind: dbUrl.scheme,
      dbHost: dbUrl.host,
      dbPort: dbUrl.port,
      hasWarnings: warnings.length > 0,
    });

    // Set session cookie
    const response = NextResponse.json({
      ok: true,
      warnings,
      expiresAt: expiresAt.toISOString(),
    });

    response.cookies.set('session_id', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60, // 1 hour
      path: '/',
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error starting session:', error);
    return NextResponse.json(
      { error: 'Failed to start session' },
      { status: 500 }
    );
  }
}
