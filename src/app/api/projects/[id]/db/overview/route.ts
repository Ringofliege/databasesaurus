import { NextRequest, NextResponse } from 'next/server';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/:id/db/overview - Get database overview
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
    const overview = await client.getOverview();
    
    return NextResponse.json({ overview });
  } catch (error) {
    console.error('Error getting overview:', error);
    return NextResponse.json(
      { error: `Failed to get database overview: ${(error as Error).message}` },
      { status: 500 }
    );
  } finally {
    await client.disconnect();
  }
}
