import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient, generatePassword } from '@/lib/db-client';

const createUserSchema = z.object({
  username: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_]+$/, 'Use only alphanumeric characters and underscores'),
  password: z.string().min(8).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/db/users - Create a database user
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
    const data = createUserSchema.parse(body);

    // Generate password if not provided
    const password = data.password || generatePassword();

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      await client.createUser(data.username, password);
      
      // Store in known db objects
      await prisma.projectDbObject.upsert({
        where: {
          projectId_objectType_name: {
            projectId: id,
            objectType: 'user',
            name: data.username,
          },
        },
        create: {
          projectId: id,
          objectType: 'user',
          name: data.username,
        },
        update: {},
      });
      
      // Log audit (don't include password)
      await logAudit(id, auth.actor, 'user.create', true, { username: data.username });
      
      return NextResponse.json({
        success: true,
        username: data.username,
        password, // Return the password only once
      }, { status: 201 });
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
    
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: `Failed to create user: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
