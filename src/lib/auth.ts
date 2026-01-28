import { NextRequest, NextResponse } from 'next/server';

const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || 'admin';
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || 'changeme';

export interface AuthContext {
  actor: string;
}

/**
 * Verify HTTP Basic Auth credentials.
 */
export function verifyBasicAuth(request: NextRequest): AuthContext | null {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }
  
  try {
    const base64Credentials = authHeader.substring(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
    const [username, password] = credentials.split(':');
    
    if (username === BASIC_AUTH_USER && password === BASIC_AUTH_PASS) {
      return { actor: username };
    }
  } catch {
    // Invalid base64 or format
  }
  
  return null;
}

/**
 * Create an unauthorized response with WWW-Authenticate header.
 */
export function unauthorizedResponse(): NextResponse {
  return new NextResponse('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="DB + Prisma Helper"',
    },
  });
}

/**
 * Higher-order function to wrap API handlers with authentication.
 */
export function withAuth<T>(
  handler: (request: NextRequest, context: T & { auth: AuthContext }) => Promise<NextResponse>
): (request: NextRequest, context: T) => Promise<NextResponse> {
  return async (request: NextRequest, context: T) => {
    const auth = verifyBasicAuth(request);
    if (!auth) {
      return unauthorizedResponse();
    }
    return handler(request, { ...context, auth });
  };
}

/**
 * Check if request is authenticated (for middleware).
 */
export function isAuthenticated(request: NextRequest): boolean {
  return verifyBasicAuth(request) !== null;
}
