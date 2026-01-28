/**
 * Next.js Instrumentation
 * This runs when the Next.js server starts up
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Next.js server starting...');
    console.log('[Instrumentation] Server will listen on:', {
      hostname: process.env.HOSTNAME || '0.0.0.0',
      port: process.env.PORT || 3000,
    });
    console.log('[Instrumentation] Environment checks:', {
      nodeEnv: process.env.NODE_ENV,
      databaseUrlSet: !!process.env.DATABASE_URL,
      redisUrlSet: !!process.env.REDIS_URL,
      basicAuthSet: !!(process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASS),
    });
    console.log('[Instrumentation] Server ready for connections');
  }
}
