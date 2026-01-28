import { describe, it, expect } from 'vitest';
import { 
  validateSql, 
  getFirstKeyword, 
  isMultiStatement, 
  isWriteStatement,
  maskSqlSecrets 
} from '../src/lib/sql-parser';

describe('getFirstKeyword', () => {
  it('should extract SELECT keyword', () => {
    expect(getFirstKeyword('SELECT * FROM users')).toBe('select');
  });

  it('should handle leading whitespace', () => {
    expect(getFirstKeyword('   SELECT * FROM users')).toBe('select');
  });

  it('should handle single-line comments', () => {
    expect(getFirstKeyword('-- comment\nSELECT * FROM users')).toBe('select');
  });

  it('should handle multi-line comments', () => {
    expect(getFirstKeyword('/* comment */ SELECT * FROM users')).toBe('select');
  });

  it('should extract INSERT keyword', () => {
    expect(getFirstKeyword('INSERT INTO users VALUES (1)')).toBe('insert');
  });

  it('should extract UPDATE keyword', () => {
    expect(getFirstKeyword('UPDATE users SET name = "test"')).toBe('update');
  });

  it('should extract DELETE keyword', () => {
    expect(getFirstKeyword('DELETE FROM users WHERE id = 1')).toBe('delete');
  });

  it('should extract WITH keyword', () => {
    expect(getFirstKeyword('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe('with');
  });

  it('should return null for empty string', () => {
    expect(getFirstKeyword('')).toBe(null);
  });

  it('should return null for only whitespace', () => {
    expect(getFirstKeyword('   ')).toBe(null);
  });

  it('should return null for only comments', () => {
    expect(getFirstKeyword('-- just a comment')).toBe(null);
  });
});

describe('isMultiStatement', () => {
  it('should return false for single statement', () => {
    expect(isMultiStatement('SELECT * FROM users')).toBe(false);
  });

  it('should return false for single statement with trailing semicolon', () => {
    expect(isMultiStatement('SELECT * FROM users;')).toBe(false);
  });

  it('should return true for multiple statements', () => {
    expect(isMultiStatement('SELECT 1; SELECT 2')).toBe(true);
  });

  it('should ignore semicolons in strings', () => {
    expect(isMultiStatement("SELECT ';' FROM users")).toBe(false);
  });

  it('should ignore semicolons in double-quoted strings', () => {
    expect(isMultiStatement('SELECT ";" FROM users')).toBe(false);
  });
});

describe('validateSql - readonly mode', () => {
  it('should allow SELECT', () => {
    const result = validateSql('SELECT * FROM users', 'readonly');
    expect(result.valid).toBe(true);
    expect(result.statementType).toBe('select');
  });

  it('should allow SHOW', () => {
    const result = validateSql('SHOW DATABASES', 'readonly');
    expect(result.valid).toBe(true);
    expect(result.statementType).toBe('show');
  });

  it('should allow DESCRIBE', () => {
    const result = validateSql('DESCRIBE users', 'readonly');
    expect(result.valid).toBe(true);
  });

  it('should allow DESC', () => {
    const result = validateSql('DESC users', 'readonly');
    expect(result.valid).toBe(true);
  });

  it('should allow EXPLAIN', () => {
    const result = validateSql('EXPLAIN SELECT * FROM users', 'readonly');
    expect(result.valid).toBe(true);
  });

  it('should allow WITH (CTE)', () => {
    const result = validateSql('WITH cte AS (SELECT 1) SELECT * FROM cte', 'readonly');
    expect(result.valid).toBe(true);
  });

  it('should reject INSERT in readonly mode', () => {
    const result = validateSql('INSERT INTO users VALUES (1)', 'readonly');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed in read-only mode');
  });

  it('should reject UPDATE in readonly mode', () => {
    const result = validateSql('UPDATE users SET name = "test"', 'readonly');
    expect(result.valid).toBe(false);
  });

  it('should reject DELETE in readonly mode', () => {
    const result = validateSql('DELETE FROM users', 'readonly');
    expect(result.valid).toBe(false);
  });

  it('should reject DROP in readonly mode', () => {
    const result = validateSql('DROP TABLE users', 'readonly');
    expect(result.valid).toBe(false);
  });

  it('should reject CREATE in readonly mode', () => {
    const result = validateSql('CREATE TABLE test (id INT)', 'readonly');
    expect(result.valid).toBe(false);
  });

  it('should reject multi-statement by default', () => {
    const result = validateSql('SELECT 1; SELECT 2', 'readonly');
    expect(result.valid).toBe(false);
    expect(result.isMultiStatement).toBe(true);
    expect(result.error).toContain('Multi-statement');
  });
});

describe('validateSql - danger mode', () => {
  it('should allow SELECT', () => {
    const result = validateSql('SELECT * FROM users', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should allow INSERT', () => {
    const result = validateSql('INSERT INTO users VALUES (1)', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should allow UPDATE', () => {
    const result = validateSql('UPDATE users SET name = "test"', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should allow DELETE', () => {
    const result = validateSql('DELETE FROM users WHERE id = 1', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should allow ALTER', () => {
    const result = validateSql('ALTER TABLE users ADD COLUMN email VARCHAR(255)', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should allow DROP', () => {
    const result = validateSql('DROP TABLE users', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should allow TRUNCATE', () => {
    const result = validateSql('TRUNCATE TABLE users', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should allow CREATE', () => {
    const result = validateSql('CREATE TABLE test (id INT)', 'danger');
    expect(result.valid).toBe(true);
  });

  it('should still reject multi-statement by default', () => {
    const result = validateSql('DELETE FROM users; DROP TABLE users', 'danger');
    expect(result.valid).toBe(false);
    expect(result.isMultiStatement).toBe(true);
  });

  it('should allow multi-statement when explicitly enabled', () => {
    const result = validateSql('DELETE FROM users; DROP TABLE users', 'danger', true);
    expect(result.valid).toBe(true);
  });

  it('should reject unknown statements', () => {
    const result = validateSql('GRANT ALL ON users TO admin', 'danger');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not allowed');
  });
});

describe('isWriteStatement', () => {
  it('should return false for SELECT', () => {
    expect(isWriteStatement('SELECT * FROM users')).toBe(false);
  });

  it('should return true for INSERT', () => {
    expect(isWriteStatement('INSERT INTO users VALUES (1)')).toBe(true);
  });

  it('should return true for UPDATE', () => {
    expect(isWriteStatement('UPDATE users SET name = "test"')).toBe(true);
  });

  it('should return true for DELETE', () => {
    expect(isWriteStatement('DELETE FROM users')).toBe(true);
  });

  it('should return true for DROP', () => {
    expect(isWriteStatement('DROP TABLE users')).toBe(true);
  });

  it('should return true for CREATE', () => {
    expect(isWriteStatement('CREATE TABLE test (id INT)')).toBe(true);
  });

  it('should return true for ALTER', () => {
    expect(isWriteStatement('ALTER TABLE users ADD COLUMN email VARCHAR(255)')).toBe(true);
  });

  it('should return true for TRUNCATE', () => {
    expect(isWriteStatement('TRUNCATE TABLE users')).toBe(true);
  });
});

describe('maskSqlSecrets', () => {
  it('should mask IDENTIFIED BY password', () => {
    const masked = maskSqlSecrets("CREATE USER 'test'@'%' IDENTIFIED BY 'secret123'");
    expect(masked).toContain("IDENTIFIED BY '****'");
    expect(masked).not.toContain('secret123');
  });

  it('should mask PASSWORD = password', () => {
    const masked = maskSqlSecrets("ALTER USER 'test' PASSWORD = 'newsecret'");
    expect(masked).toContain("PASSWORD = '****'");
    expect(masked).not.toContain('newsecret');
  });

  it('should mask SET PASSWORD', () => {
    const masked = maskSqlSecrets("SET PASSWORD = 'mypassword'");
    expect(masked).toContain("SET PASSWORD = '****'");
    expect(masked).not.toContain('mypassword');
  });

  it('should not mask regular strings', () => {
    const sql = "SELECT * FROM users WHERE name = 'John'";
    const masked = maskSqlSecrets(sql);
    expect(masked).toBe(sql);
  });
});
