import { NextRequest, NextResponse } from 'next/server';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

type RouteParams = { params: Promise<{ id: string; tableName: string }> };

/**
 * GET /api/projects/:id/db/tables/:tableName/columns?database=<name>
 * Get column information for a table
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id, tableName } = await params;
  const { searchParams } = new URL(request.url);
  const database = searchParams.get('database');

  if (!database) {
    return NextResponse.json(
      { error: 'database query parameter is required' },
      { status: 400 }
    );
  }

  // Validate database name
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    return NextResponse.json(
      { error: 'Invalid database name. Use only alphanumeric characters and underscores.' },
      { status: 400 }
    );
  }

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

  const client = createDbClient(session.dbUrl);
  
  try {
    await client.connect();
    const columns = await client.getTableColumns(database, tableName);
    
    return NextResponse.json({ columns });
  } catch (error) {
    console.error('Error getting table columns:', error);
    return NextResponse.json(
      { error: `Failed to get table columns: ${(error as Error).message}` },
      { status: 500 }
    );
  } finally {
    await client.disconnect();
  }
}
