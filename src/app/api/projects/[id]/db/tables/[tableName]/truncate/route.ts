import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

const truncateSchema = z.object({
  database: z.string().min(1),
  confirmName: z.string().min(1),
});

type RouteParams = { params: Promise<{ id: string; tableName: string }> };

/**
 * POST /api/projects/:id/db/tables/:tableName/truncate
 * Truncate (clear) a specific table
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id, tableName } = await params;

  // Validate table name
  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return NextResponse.json(
      { error: 'Invalid table name. Use only alphanumeric characters and underscores.' },
      { status: 400 }
    );
  }

  const session = await getActiveSession(request, id);
  if (!session) {
    return noSessionResponse();
  }

  try {
    const body = await request.json();
    const data = truncateSchema.parse(body);

    // Verify confirmation matches table name
    if (data.confirmName !== tableName) {
      return NextResponse.json(
        { error: 'Confirmation name does not match table name' },
        { status: 400 }
      );
    }

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      await client.truncateTable(data.database, tableName);
      
      // Log audit
      await logAudit(id, auth.actor, 'table.truncate', true, { 
        database: data.database, 
        table: tableName 
      });
      
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
    await logAudit(id, auth.actor, 'table.truncate', false, { 
      table: tableName,
      error: (error as Error).message 
    });
    
    console.error('Error truncating table:', error);
    return NextResponse.json(
      { error: `Failed to truncate table: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
