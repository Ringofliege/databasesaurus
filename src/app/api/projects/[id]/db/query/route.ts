import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';
import { validateSql, maskSqlSecrets, isWriteStatement } from '@/lib/sql-parser';

const querySchema = z.object({
  database: z.string().optional(),
  sql: z.string().min(1).max(10000),
  mode: z.enum(['readonly', 'danger']),
  allowMultiStatement: z.boolean().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/db/query - Execute SQL query
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

  const startTime = Date.now();

  try {
    const body = await request.json();
    const data = querySchema.parse(body);

    // Validate SQL against allowlist
    const validation = validateSql(
      data.sql,
      data.mode,
      data.mode === 'danger' && data.allowMultiStatement
    );

    if (!validation.valid) {
      // Log the failed attempt
      await logAudit(id, auth.actor, 'sql.execute', false, {
        mode: data.mode,
        statementType: validation.statementType,
        error: validation.error,
        sql: maskSqlSecrets(data.sql.substring(0, 500)),
      });

      return NextResponse.json(
        { error: validation.error },
        { status: 400 }
      );
    }

    // Additional confirmation for write operations
    const isWrite = isWriteStatement(data.sql);
    if (isWrite && data.mode !== 'danger') {
      return NextResponse.json(
        { error: 'Write operations require danger mode' },
        { status: 400 }
      );
    }

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      const result = await client.executeQuery(data.sql, data.database);
      const durationMs = Date.now() - startTime;
      
      // Log audit
      await logAudit(id, auth.actor, 'sql.execute', true, {
        mode: data.mode,
        statementType: validation.statementType,
        database: data.database,
        rowCount: result.rowCount,
        truncated: result.truncated,
        sql: maskSqlSecrets(data.sql.substring(0, 500)),
      }, durationMs);
      
      return NextResponse.json({
        success: true,
        ...result,
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
    
    const durationMs = Date.now() - startTime;
    
    // Log failed audit
    await logAudit(id, auth.actor, 'sql.execute', false, {
      error: (error as Error).message,
    }, durationMs);
    
    console.error('Error executing query:', error);
    return NextResponse.json(
      { error: `Query failed: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
