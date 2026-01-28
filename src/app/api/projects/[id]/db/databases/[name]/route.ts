import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

const confirmSchema = z.object({
  confirmName: z.string().min(1),
});

type RouteParams = { params: Promise<{ id: string; name: string }> };

/**
 * DELETE /api/projects/:id/db/databases/:name - Drop a database
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id, name } = await params;

  const session = await getActiveSession(request, id);
  if (!session) {
    return noSessionResponse();
  }

  try {
    // Get confirmName from body or header
    let confirmName: string;
    try {
      const body = await request.json();
      const data = confirmSchema.parse(body);
      confirmName = data.confirmName;
    } catch {
      confirmName = request.headers.get('x-confirm-name') || '';
    }

    if (confirmName !== name) {
      return NextResponse.json(
        { error: 'Confirmation name does not match database name' },
        { status: 400 }
      );
    }

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      await client.dropDatabase(name);
      
      // Remove from known db objects
      await prisma.projectDbObject.deleteMany({
        where: {
          projectId: id,
          objectType: 'database',
          name,
        },
      });
      
      // Log audit
      await logAudit(id, auth.actor, 'db.drop', true, { database: name });
      
      return NextResponse.json({ success: true });
    } finally {
      await client.disconnect();
    }
  } catch (error) {
    // Log failed audit
    await logAudit(id, auth.actor, 'db.drop', false, { database: name, error: (error as Error).message });
    
    console.error('Error dropping database:', error);
    return NextResponse.json(
      { error: `Failed to drop database: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
