import { randomBytes } from 'crypto';
import Redis from 'ioredis';
import { ParsedDbUrl } from './db-url';

export interface SessionData {
  projectId: string;
  dbUrl: ParsedDbUrl;
  expiresAt: Date;
  actor: string;
}

const SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes

/**
 * Abstract interface for session storage.
 */
export interface SessionStore {
  create(projectId: string, dbUrl: ParsedDbUrl, actor: string): Promise<{ sessionId: string; expiresAt: Date }>;
  get(sessionId: string): Promise<SessionData | null>;
  getByProjectId(projectId: string): Promise<SessionData | null>;
  delete(sessionId: string): Promise<void>;
  deleteByProjectId(projectId: string): Promise<void>;
}

/**
 * In-memory session store for single-instance deployment.
 */
export class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionData>();
  private projectSessions = new Map<string, string>(); // projectId -> sessionId
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Clean up expired sessions every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
  }

  async create(projectId: string, dbUrl: ParsedDbUrl, actor: string): Promise<{ sessionId: string; expiresAt: Date }> {
    // Delete existing session for this project
    const existingSessionId = this.projectSessions.get(projectId);
    if (existingSessionId) {
      this.sessions.delete(existingSessionId);
    }

    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    this.sessions.set(sessionId, {
      projectId,
      dbUrl,
      expiresAt,
      actor,
    });
    this.projectSessions.set(projectId, sessionId);

    return { sessionId, expiresAt };
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.expiresAt < new Date()) {
      this.sessions.delete(sessionId);
      this.projectSessions.delete(session.projectId);
      return null;
    }
    return session;
  }

  async getByProjectId(projectId: string): Promise<SessionData | null> {
    const sessionId = this.projectSessions.get(projectId);
    if (!sessionId) return null;
    return this.get(sessionId);
  }

  async delete(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.projectSessions.delete(session.projectId);
    }
    this.sessions.delete(sessionId);
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    const sessionId = this.projectSessions.get(projectId);
    if (sessionId) {
      this.sessions.delete(sessionId);
    }
    this.projectSessions.delete(projectId);
  }

  private cleanup(): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(sessionId);
        this.projectSessions.delete(session.projectId);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Redis-backed session store for multi-instance deployment.
 */
export class RedisSessionStore implements SessionStore {
  private redis: Redis;
  private prefix = 'dbhelper:session:';

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async create(projectId: string, dbUrl: ParsedDbUrl, actor: string): Promise<{ sessionId: string; expiresAt: Date }> {
    // Delete existing session for this project
    await this.deleteByProjectId(projectId);

    const sessionId = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const ttlSeconds = Math.floor(SESSION_TTL_MS / 1000);

    const data: SessionData = {
      projectId,
      dbUrl,
      expiresAt,
      actor,
    };

    await this.redis.setex(
      `${this.prefix}${sessionId}`,
      ttlSeconds,
      JSON.stringify(data)
    );
    await this.redis.setex(
      `${this.prefix}project:${projectId}`,
      ttlSeconds,
      sessionId
    );

    return { sessionId, expiresAt };
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const data = await this.redis.get(`${this.prefix}${sessionId}`);
    if (!data) return null;

    const session = JSON.parse(data) as SessionData;
    session.expiresAt = new Date(session.expiresAt);

    if (session.expiresAt < new Date()) {
      await this.delete(sessionId);
      return null;
    }

    return session;
  }

  async getByProjectId(projectId: string): Promise<SessionData | null> {
    const sessionId = await this.redis.get(`${this.prefix}project:${projectId}`);
    if (!sessionId) return null;
    return this.get(sessionId);
  }

  async delete(sessionId: string): Promise<void> {
    const session = await this.get(sessionId);
    if (session) {
      await this.redis.del(`${this.prefix}project:${session.projectId}`);
    }
    await this.redis.del(`${this.prefix}${sessionId}`);
  }

  async deleteByProjectId(projectId: string): Promise<void> {
    const sessionId = await this.redis.get(`${this.prefix}project:${projectId}`);
    if (sessionId) {
      await this.redis.del(`${this.prefix}${sessionId}`);
    }
    await this.redis.del(`${this.prefix}project:${projectId}`);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

// Global session store instance
let sessionStore: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!sessionStore) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      sessionStore = new RedisSessionStore(redisUrl);
    } else {
      sessionStore = new InMemorySessionStore();
    }
  }
  return sessionStore;
}
