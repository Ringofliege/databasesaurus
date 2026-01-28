import { prisma } from './prisma';

export interface AuditPayload {
  [key: string]: unknown;
}

/**
 * Log an audit event to the database.
 */
export async function logAudit(
  projectId: string,
  actor: string,
  action: string,
  success: boolean,
  payload?: AuditPayload,
  durationMs?: number
): Promise<void> {
  try {
    // Mask any sensitive data in payload
    const maskedPayload = payload ? maskSensitiveData(payload) : undefined;
    
    await prisma.auditEvent.create({
      data: {
        projectId,
        actor,
        action,
        success,
        durationMs,
        payloadJson: maskedPayload,
      },
    });
  } catch (error) {
    // Don't let audit failures break the main flow
    console.error('Failed to log audit event:', error);
  }
}

/**
 * Mask sensitive data in audit payloads.
 */
function maskSensitiveData(payload: AuditPayload): AuditPayload {
  const sensitiveKeys = ['password', 'secret', 'token', 'key', 'credential', 'adminUrl'];
  const masked = { ...payload };
  
  for (const key of Object.keys(masked)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      masked[key] = '****';
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskSensitiveData(masked[key] as AuditPayload);
    } else if (typeof masked[key] === 'string') {
      // Check if value looks like a URL with password
      const value = masked[key] as string;
      if (value.includes('://') && value.includes('@')) {
        masked[key] = value.replace(/:([^:@]+)@/, ':****@');
      }
    }
  }
  
  return masked;
}

/**
 * Measure execution time and log audit.
 */
export async function withAudit<T>(
  projectId: string,
  actor: string,
  action: string,
  payload: AuditPayload,
  fn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  let success = false;
  
  try {
    const result = await fn();
    success = true;
    return result;
  } finally {
    const durationMs = Date.now() - startTime;
    await logAudit(projectId, actor, action, success, payload, durationMs);
  }
}
