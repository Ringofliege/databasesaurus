import { NextRequest, NextResponse } from 'next/server';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/db/tables - List tables in a database
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
  const { searchParams } = new URL(request.url);
  const database = searchParams.get('database');

  if (!database) {
    return NextResponse.json(
      { error: 'database query parameter is required' },
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
    const tables = await client.listTables(database);
    
    return NextResponse.json({ tables });
  } catch (error) {
    console.error('Error listing tables:', error);
    return NextResponse.json(
      { error: `Failed to list tables: ${(error as Error).message}` },
      { status: 500 }
    );
  } finally {
    await client.disconnect();
  }
}
