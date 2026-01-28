import { describe, it, expect } from 'vitest';
import { parseDbUrl, maskDbUrl, buildDbUrl } from '../src/lib/db-url';

describe('parseDbUrl', () => {
  it('should parse a MySQL URL correctly', () => {
    const result = parseDbUrl('mysql://user:pass@localhost:3306/mydb');
    
    expect(result.url.scheme).toBe('mysql');
    expect(result.url.username).toBe('user');
    expect(result.url.password).toBe('pass');
    expect(result.url.host).toBe('localhost');
    expect(result.url.port).toBe(3306);
    expect(result.url.database).toBe('mydb');
    expect(result.warnings).toHaveLength(0);
  });

  it('should parse a PostgreSQL URL correctly', () => {
    const result = parseDbUrl('postgresql://admin:secret@db.example.com:5432/proddb');
    
    expect(result.url.scheme).toBe('postgres');
    expect(result.url.username).toBe('admin');
    expect(result.url.password).toBe('secret');
    expect(result.url.host).toBe('db.example.com');
    expect(result.url.port).toBe(5432);
    expect(result.url.database).toBe('proddb');
    expect(result.warnings).toHaveLength(0);
  });

  it('should parse postgres:// scheme correctly', () => {
    const result = parseDbUrl('postgres://user:pass@localhost:5432/db');
    
    expect(result.url.scheme).toBe('postgres');
  });

  it('should use default port for MySQL when not specified', () => {
    const result = parseDbUrl('mysql://user:pass@localhost/mydb');
    
    expect(result.url.port).toBe(3306);
  });

  it('should use default port for PostgreSQL when not specified', () => {
    const result = parseDbUrl('postgresql://user:pass@localhost/mydb');
    
    expect(result.url.port).toBe(5432);
  });

  it('should warn when MySQL scheme is used with PostgreSQL port', () => {
    const result = parseDbUrl('mysql://user:pass@localhost:5432/mydb');
    
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('MySQL scheme with PostgreSQL default port');
  });

  it('should warn when PostgreSQL scheme is used with MySQL port', () => {
    const result = parseDbUrl('postgresql://user:pass@localhost:3306/mydb');
    
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('PostgreSQL scheme with MySQL default port');
  });

  it('should use password override when provided', () => {
    const result = parseDbUrl('mysql://user:oldpass@localhost/mydb', 'newpass');
    
    expect(result.url.password).toBe('newpass');
  });

  it('should handle URL-encoded credentials', () => {
    const result = parseDbUrl('mysql://user%40domain:p%40ss%3Dword@localhost/mydb');
    
    expect(result.url.username).toBe('user@domain');
    expect(result.url.password).toBe('p@ss=word');
  });

  it('should handle query parameters', () => {
    const result = parseDbUrl('postgresql://user:pass@localhost/mydb?sslmode=require&connect_timeout=10');
    
    expect(result.url.params).toEqual({
      sslmode: 'require',
      connect_timeout: '10',
    });
  });

  it('should throw for unsupported schemes', () => {
    expect(() => parseDbUrl('mongodb://localhost/mydb')).toThrow('Unsupported database scheme');
  });

  it('should throw for invalid URLs', () => {
    expect(() => parseDbUrl('not-a-url')).toThrow('Invalid database URL format');
  });
});

describe('maskDbUrl', () => {
  it('should mask password in URL', () => {
    const masked = maskDbUrl('mysql://user:secretpass@localhost:3306/mydb');
    
    expect(masked).toBe('mysql://user:****@localhost:3306/mydb');
  });

  it('should handle URLs without password', () => {
    const masked = maskDbUrl('mysql://user@localhost:3306/mydb');
    
    expect(masked).toBe('mysql://user@localhost:3306/mydb');
  });

  it('should handle invalid URLs gracefully', () => {
    // This URL doesn't match the pattern `:xxx@` so it won't be masked
    const masked = maskDbUrl('invalid:url:with:password@host');
    
    // The function should not crash and should return something
    expect(typeof masked).toBe('string');
  });
});

describe('buildDbUrl', () => {
  it('should build a valid MySQL URL', () => {
    const parsed = {
      scheme: 'mysql' as const,
      username: 'user',
      password: 'pass',
      host: 'localhost',
      port: 3306,
      database: 'mydb',
      params: {},
    };
    
    const url = buildDbUrl(parsed);
    
    expect(url).toBe('mysql://user:pass@localhost:3306/mydb');
  });

  it('should build a valid PostgreSQL URL', () => {
    const parsed = {
      scheme: 'postgres' as const,
      username: 'admin',
      password: 'secret',
      host: 'db.example.com',
      port: 5432,
      database: 'proddb',
      params: {},
    };
    
    const url = buildDbUrl(parsed);
    
    expect(url).toBe('postgresql://admin:secret@db.example.com:5432/proddb');
  });

  it('should allow overriding the database name', () => {
    const parsed = {
      scheme: 'mysql' as const,
      username: 'user',
      password: 'pass',
      host: 'localhost',
      port: 3306,
      database: 'olddb',
      params: {},
    };
    
    const url = buildDbUrl(parsed, 'newdb');
    
    expect(url).toBe('mysql://user:pass@localhost:3306/newdb');
  });

  it('should encode special characters in credentials', () => {
    const parsed = {
      scheme: 'mysql' as const,
      username: 'user@domain',
      password: 'p@ss=word',
      host: 'localhost',
      port: 3306,
      database: 'mydb',
      params: {},
    };
    
    const url = buildDbUrl(parsed);
    
    expect(url).toContain('user%40domain');
    expect(url).toContain('p%40ss%3Dword');
  });

  it('should include query parameters', () => {
    const parsed = {
      scheme: 'postgres' as const,
      username: 'user',
      password: 'pass',
      host: 'localhost',
      port: 5432,
      database: 'mydb',
      params: { sslmode: 'require' },
    };
    
    const url = buildDbUrl(parsed);
    
    expect(url).toContain('?sslmode=require');
  });
});
