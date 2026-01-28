import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';

const grantRightsSchema = z.object({
  database: z.string().min(1),
  username: z.string().min(1),
  preview: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/db/grants/app-rights - Grant application rights
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
    const data = grantRightsSchema.parse(body);

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      
      // Preview mode - just show the SQL
      if (data.preview) {
        const sql = client.previewGrantSql(data.database, data.username);
        return NextResponse.json({ sql });
      }
      
      // Execute grants
      const executedSql = await client.grantAppRights(data.database, data.username);
      
      // Log audit
      await logAudit(id, auth.actor, 'grants.app-rights', true, {
        database: data.database,
        username: data.username,
      });
      
      return NextResponse.json({
        success: true,
        executedSql,
      });
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
    
    console.error('Error granting rights:', error);
    return NextResponse.json(
      { error: `Failed to grant rights: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
