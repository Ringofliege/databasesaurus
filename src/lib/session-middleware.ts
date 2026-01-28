import { NextRequest, NextResponse } from 'next/server';
import { getSessionStore } from '@/lib/session-store';
import { ParsedDbUrl } from '@/lib/db-url';

/**
 * Get active session for a project.
 * Returns null if no session or session expired.
 */
export async function getActiveSession(
  request: NextRequest,
  projectId: string
): Promise<{ dbUrl: ParsedDbUrl; actor: string } | null> {
  const sessionStore = getSessionStore();
  const session = await sessionStore.getByProjectId(projectId);
  
  if (!session) {
    return null;
  }
  
  return {
    dbUrl: session.dbUrl,
    actor: session.actor,
  };
}

/**
 * Create a response for when no active session exists.
 */
export function noSessionResponse(): NextResponse {
  return NextResponse.json(
    { error: 'No active session. Please start a session first.' },
    { status: 401 }
  );
}
