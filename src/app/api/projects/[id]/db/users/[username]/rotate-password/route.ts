import { NextRequest, NextResponse } from 'next/server';
import { verifyBasicAuth, unauthorizedResponse } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { getActiveSession, noSessionResponse } from '@/lib/session-middleware';
import { createDbClient, generatePassword } from '@/lib/db-client';

type RouteParams = { params: Promise<{ id: string; username: string }> };

/**
 * POST /api/projects/:id/db/users/:username/rotate-password - Rotate user password
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const auth = verifyBasicAuth(request);
  if (!auth) {
    return unauthorizedResponse();
  }

  const { id, username } = await params;

  const session = await getActiveSession(request, id);
  if (!session) {
    return noSessionResponse();
  }

  try {
    const newPassword = generatePassword();

    const client = createDbClient(session.dbUrl);
    
    try {
      await client.connect();
      await client.rotatePassword(username, newPassword);
      
      // Log audit
      await logAudit(id, auth.actor, 'user.rotate-password', true, { username });
      
      return NextResponse.json({
        success: true,
        username,
        password: newPassword, // Return the new password only once
      });
    } finally {
      await client.disconnect();
    }
  } catch (error) {
    // Log failed audit
    await logAudit(id, auth.actor, 'user.rotate-password', false, { username, error: (error as Error).message });
    
    console.error('Error rotating password:', error);
    return NextResponse.json(
      { error: `Failed to rotate password: ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
