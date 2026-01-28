import { z } from 'zod';

export interface ParsedDbUrl {
  scheme: 'mysql' | 'postgres';
  username: string;
  password: string | null;
  host: string;
  port: number;
  database: string;
  params: Record<string, string>;
}

export interface ParseResult {
  url: ParsedDbUrl;
  warnings: string[];
}

const DEFAULT_PORTS: Record<string, number> = {
  mysql: 3306,
  postgres: 5432,
  postgresql: 5432,
};

/**
 * Parse a database URL into its components.
 * Supports mysql://, postgres://, and postgresql:// schemes.
 */
export function parseDbUrl(urlStr: string, passwordOverride?: string): ParseResult {
  const warnings: string[] = [];

  // Parse URL
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error(`Invalid database URL format: ${urlStr}`);
  }

  // Validate scheme
  const schemeRaw = url.protocol.replace(':', '');
  const normalizedScheme = schemeRaw === 'postgresql' ? 'postgres' : schemeRaw;

  if (normalizedScheme !== 'mysql' && normalizedScheme !== 'postgres') {
    throw new Error(`Unsupported database scheme: ${schemeRaw}. Supported: mysql, postgres, postgresql`);
  }

  // Extract port
  const port = url.port ? parseInt(url.port, 10) : DEFAULT_PORTS[schemeRaw];

  // Check for scheme/port mismatch
  if (normalizedScheme === 'mysql' && port === 5432) {
    warnings.push(`Warning: MySQL scheme with PostgreSQL default port (5432). Attempting connection anyway.`);
  } else if (normalizedScheme === 'postgres' && port === 3306) {
    warnings.push(`Warning: PostgreSQL scheme with MySQL default port (3306). Attempting connection anyway.`);
  }

  // Extract database name (path without leading slash)
  const database = url.pathname.slice(1);

  // Extract query params
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  // Use password override if provided, otherwise use URL password
  const password = passwordOverride || decodeURIComponent(url.password || '');

  return {
    url: {
      scheme: normalizedScheme,
      username: decodeURIComponent(url.username),
      password: password || null,
      host: url.hostname,
      port,
      database,
      params,
    },
    warnings,
  };
}

/**
 * Build a database URL from parsed components.
 */
export function buildDbUrl(parsed: ParsedDbUrl, targetDatabase?: string): string {
  const scheme = parsed.scheme === 'postgres' ? 'postgresql' : parsed.scheme;
  const auth = parsed.password
    ? `${encodeURIComponent(parsed.username)}:${encodeURIComponent(parsed.password)}`
    : encodeURIComponent(parsed.username);
  const db = targetDatabase ?? parsed.database;
  const params = Object.entries(parsed.params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  return `${scheme}://${auth}@${parsed.host}:${parsed.port}/${db}${params ? `?${params}` : ''}`;
}

/**
 * Mask password in a database URL for logging.
 */
export function maskDbUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    if (url.password) {
      url.password = '****';
    }
    return url.toString();
  } catch {
    // If we can't parse it, try a regex replacement
    return urlStr.replace(/:([^:@]+)@/, ':****@');
  }
}

// Zod schema for parsed DB URL validation
export const parsedDbUrlSchema = z.object({
  scheme: z.enum(['mysql', 'postgres']),
  username: z.string().min(1),
  password: z.string().nullable(),
  host: z.string().min(1),
  port: z.number().int().positive(),
  database: z.string(),
  params: z.record(z.string()),
});
