import { NextRequest, NextResponse } from 'next/server';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

type RouteParams = { params: Promise<{ id: string; tableName: string }> };

/**
 * GET /api/projects/:id/db/tables/:tableName/preview?database=<name>&limit=3
 * Get a preview of rows from a table
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
  const limitStr = searchParams.get('limit');
  const limit = limitStr ? parseInt(limitStr, 10) : 3;

  if (!database) {
    return NextResponse.json(
      { error: 'database query parameter is required' },
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
    const result = await client.getTablePreview(database, tableName, limit);
    
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error getting table preview:', error);
    return NextResponse.json(
      { error: `Failed to get table preview: ${(error as Error).message}` },
      { status: 500 }
    );
  } finally {
    await client.disconnect();
  }
}
