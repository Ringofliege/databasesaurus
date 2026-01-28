import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

const createDatabaseSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/, 'Use only alphanumeric characters and underscores'),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/db/databases - List databases
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

  const session = await getActiveSession(request, id);
  if (!session) {
    return noSessionResponse();
  }

  const client = createDbClient(session.dbUrl);
  
  try {
    await client.connect();
    const databases = await client.listDatabases();
    
    return NextResponse.json({ databases });
  } catch (error) {
    console.error('Error listing databases:', error);
    return NextResponse.json(
      { error: `Failed to list databases: ${(error as Error).message}` },
      { status: 500 }
    );
  } finally {
    await client.disconnect();
  }
}

/**
 * POST /api/projects/:id/db/databases - Create a database
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
    const body = await request.json();
    const data = createDatabaseSchema.parse(body);

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      await client.createDatabase(data.name);
      
      // Store in known db objects
      await prisma.projectDbObject.upsert({
        where: {
          projectId_objectType_name: {
            projectId: id,
            objectType: 'database',
            name: data.name,
          },
        },
        create: {
          projectId: id,
          objectType: 'database',
          name: data.name,
        },
        update: {},
      });
      
      // Log audit
      await logAudit(id, auth.actor, 'db.create', true, { database: data.name });
      
      return NextResponse.json({ success: true, database: data.name }, { status: 201 });
    } finally {
      await client.disconnect();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    
    // Log failed audit
    await logAudit(id, auth.actor, 'db.create', false, { error: (error as Error).message });
    
    console.error('Error creating database:', error);
    return NextResponse.json(
      { error: `Failed to create database: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
