import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

const confirmSchema = z.object({
  confirmName: z.string().min(1),
});

type RouteParams = { params: Promise<{ id: string; name: string }> };

/**
 * POST /api/projects/:id/db/databases/:name/clear - Clear a database
 */
export async function POST(
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
    const body = await request.json();
    const data = confirmSchema.parse(body);

    if (data.confirmName !== name) {
      return NextResponse.json(
        { error: 'Confirmation name does not match database name' },
        { status: 400 }
      );
    }

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      await client.clearDatabase(name);
      
      // Log audit
      await logAudit(id, auth.actor, 'db.clear', true, { database: name });
      
      return NextResponse.json({ success: true });
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
    await logAudit(id, auth.actor, 'db.clear', false, { database: name, error: (error as Error).message });
    
    // Check if it's a permission error
    const errorMsg = (error as Error).message;
    if (errorMsg.includes('permission') || errorMsg.includes('denied') || errorMsg.includes('privilege')) {
      return NextResponse.json(
        { error: 'Not permitted: You do not have permission to clear this database.' },
        { status: 403 }
      );
    }
    
    console.error('Error clearing database:', error);
    return NextResponse.json(
      { error: `Failed to clear database: ${errorMsg}` },
      { status: 500 }
    );
  }
}
