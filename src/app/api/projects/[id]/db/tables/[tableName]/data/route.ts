import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient } from '@/lib/db-client';
import { logAudit } from '@/lib/audit';

type RouteParams = { params: Promise<{ id: string; tableName: string }> };

/**
 * GET /api/projects/:id/db/tables/:tableName/data
 * Get table data with search and pagination
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
  const search = searchParams.get('search') || undefined;
  const limitStr = searchParams.get('limit');
  const offsetStr = searchParams.get('offset');
  const orderBy = searchParams.get('orderBy') || undefined;
  const orderDirRaw = searchParams.get('orderDir');
  const orderDir: 'ASC' | 'DESC' | undefined = 
    orderDirRaw === 'DESC' ? 'DESC' : 
    orderDirRaw === 'ASC' ? 'ASC' : 
    orderDirRaw ? undefined : undefined; // Invalid values result in undefined (default to ASC)
  const limit = limitStr ? parseInt(limitStr, 10) : 50;
  const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

  if (!database) {
    return NextResponse.json(
      { error: 'database query parameter is required' },
      { status: 400 }
    );
  }

  // Validate orderDir if provided
  if (orderDirRaw && orderDirRaw !== 'ASC' && orderDirRaw !== 'DESC') {
    return NextResponse.json(
      { error: 'Invalid orderDir parameter. Must be ASC or DESC.' },
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

  // Validate pagination parameters
  if (isNaN(limit) || limit < 1 || limit > 200) {
    return NextResponse.json(
      { error: 'Invalid limit parameter. Must be between 1 and 200.' },
      { status: 400 }
    );
  }

  if (isNaN(offset) || offset < 0) {
    return NextResponse.json(
      { error: 'Invalid offset parameter. Must be >= 0.' },
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
    const result = await client.getTableData(database, tableName, {
      limit,
      offset,
      search,
      orderBy,
      orderDir,
    });
    
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error getting table data:', error);
    return NextResponse.json(
      { error: `Failed to get table data: ${(error as Error).message}` },
      { status: 500 }
    );
  } finally {
    await client.disconnect();
  }
}

const updateRowSchema = z.object({
  primaryKey: z.record(z.string(), z.any()),
  data: z.record(z.string(), z.any()),
});

/**
 * PUT /api/projects/:id/db/tables/:tableName/data
 * Update a row in the table
 */
export async function PUT(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id, tableName } = await params;

  try {
    const body = await request.json();
    const { database } = body;
    const { primaryKey, data } = updateRowSchema.parse(body);

    if (!database) {
      return NextResponse.json(
        { error: 'database is required' },
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
      console.log('[updateRow] Starting update for table:', tableName, 'database:', database);
      console.log('[updateRow] primaryKey:', primaryKey, 'data:', data);
      await client.connect();
      await client.updateRow(database, tableName, primaryKey, data);
      console.log('[updateRow] Update completed successfully');
      
      // Log audit
      await logAudit(id, auth.actor, 'table.update_row', true, {
        database,
        table: tableName,
        primaryKey,
      });
      
      return NextResponse.json({ success: true });
    } catch (error) {
      // Log failed audit
      await logAudit(id, auth.actor, 'table.update_row', false, {
        database,
        table: tableName,
        error: (error as Error).message,
      });
      
      console.error('Error updating row:', error);
      return NextResponse.json(
        { error: `Failed to update row: ${(error as Error).message}` },
        { status: 500 }
      );
    } finally {
      await client.disconnect();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }
}

const deleteRowSchema = z.object({
  primaryKey: z.record(z.string(), z.any()),
});

/**
 * DELETE /api/projects/:id/db/tables/:tableName/data
 * Delete a row from the table
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id, tableName } = await params;

  try {
    const body = await request.json();
    const { database } = body;
    const { primaryKey } = deleteRowSchema.parse(body);

    if (!database) {
      return NextResponse.json(
        { error: 'database is required' },
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
      console.log('[deleteRow] Starting delete for table:', tableName, 'database:', database);
      console.log('[deleteRow] primaryKey:', primaryKey);
      await client.connect();
      await client.deleteRow(database, tableName, primaryKey);
      console.log('[deleteRow] Delete completed successfully');
      
      // Log audit
      await logAudit(id, auth.actor, 'table.delete_row', true, {
        database,
        table: tableName,
        primaryKey,
      });
      
      return NextResponse.json({ success: true });
    } catch (error) {
      // Log failed audit
      await logAudit(id, auth.actor, 'table.delete_row', false, {
        database,
        table: tableName,
        error: (error as Error).message,
      });
      
      console.error('Error deleting row:', error);
      return NextResponse.json(
        { error: `Failed to delete row: ${(error as Error).message}` },
        { status: 500 }
      );
    } finally {
      await client.disconnect();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      );
    }
    throw error;
  }
}
