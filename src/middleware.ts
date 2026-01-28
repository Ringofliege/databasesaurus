import { NextRequest, NextResponse } from 'next/server';

// Track first request
let firstRequest = true;

export function middleware(request: NextRequest) {
  // Log first request to confirm server is receiving traffic
  if (firstRequest) {
    console.log('[Middleware] First request received:', {
      url: request.url,
      method: request.method,
      headers: {
        host: request.headers.get('host'),
        userAgent: request.headers.get('user-agent')?.substring(0, 50),
        forwarded: request.headers.get('x-forwarded-for'),
        realIp: request.headers.get('x-real-ip'),
      },
    });
    firstRequest = false;
  }

  return NextResponse.next();
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
