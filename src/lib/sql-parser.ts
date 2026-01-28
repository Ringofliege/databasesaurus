/**
 * SQL Parser for query validation and allowlist checking.
 * 
 * Read-only mode: Only SELECT, SHOW, DESCRIBE, EXPLAIN, WITH allowed
 * Danger mode: Additionally allows INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE, CREATE
 */

export type SqlMode = 'readonly' | 'danger';

export interface SqlValidationResult {
  valid: boolean;
  mode: SqlMode;
  statementType: string | null;
  error: string | null;
  isMultiStatement: boolean;
}

// Keywords that are allowed in read-only mode
const READONLY_KEYWORDS = new Set([
  'select',
  'show',
  'describe',
  'desc',
  'explain',
  'with',
]);

// Additional keywords allowed in danger mode
const DANGER_KEYWORDS = new Set([
  'insert',
  'update',
  'delete',
  'alter',
  'drop',
  'truncate',
  'create',
]);

/**
 * Extract the first keyword from an SQL statement.
 */
export function getFirstKeyword(sql: string): string | null {
  // Remove leading whitespace and comments
  let cleaned = sql.trim();
  
  // Remove single-line comments
  cleaned = cleaned.replace(/--.*$/gm, '');
  
  // Remove multi-line comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Get the first word
  const match = cleaned.trim().match(/^([a-zA-Z_]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Check if SQL contains multiple statements.
 * This is a simple check that looks for semicolons not inside strings.
 */
export function isMultiStatement(sql: string): boolean {
  // Remove strings (single and double quoted) and comments
  let cleaned = sql;
  
  // Remove string literals (simple approach)
  cleaned = cleaned.replace(/'[^']*'/g, '');
  cleaned = cleaned.replace(/"[^"]*"/g, '');
  
  // Remove comments
  cleaned = cleaned.replace(/--.*$/gm, '');
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Check for multiple semicolons (or one that's not at the very end)
  const trimmed = cleaned.trim();
  const semicolonCount = (trimmed.match(/;/g) || []).length;
  
  // Allow one semicolon at the end
  if (semicolonCount === 0) return false;
  if (semicolonCount === 1 && trimmed.endsWith(';')) return false;
  
  return true;
}

/**
 * Validate SQL against the allowlist based on mode.
 */
export function validateSql(sql: string, mode: SqlMode, allowMultiStatement = false): SqlValidationResult {
  const firstKeyword = getFirstKeyword(sql);
  
  if (!firstKeyword) {
    return {
      valid: false,
      mode,
      statementType: null,
      error: 'Empty or invalid SQL statement',
      isMultiStatement: false,
    };
  }
  
  const hasMultiStatement = isMultiStatement(sql);
  
  // Check for multi-statement
  if (hasMultiStatement && !allowMultiStatement) {
    return {
      valid: false,
      mode,
      statementType: firstKeyword,
      error: 'Multi-statement queries are not allowed. Use single statements.',
      isMultiStatement: true,
    };
  }
  
  // Check if keyword is allowed
  if (mode === 'readonly') {
    if (!READONLY_KEYWORDS.has(firstKeyword)) {
      return {
        valid: false,
        mode,
        statementType: firstKeyword,
        error: `Statement type '${firstKeyword.toUpperCase()}' is not allowed in read-only mode. Allowed: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH`,
        isMultiStatement: hasMultiStatement,
      };
    }
  } else {
    // Danger mode
    if (!READONLY_KEYWORDS.has(firstKeyword) && !DANGER_KEYWORDS.has(firstKeyword)) {
      return {
        valid: false,
        mode,
        statementType: firstKeyword,
        error: `Statement type '${firstKeyword.toUpperCase()}' is not allowed. Allowed: SELECT, SHOW, DESCRIBE, EXPLAIN, WITH, INSERT, UPDATE, DELETE, ALTER, DROP, TRUNCATE, CREATE`,
        isMultiStatement: hasMultiStatement,
      };
    }
  }
  
  return {
    valid: true,
    mode,
    statementType: firstKeyword,
    error: null,
    isMultiStatement: hasMultiStatement,
  };
}

/**
 * Check if a statement is a write operation (for audit purposes).
 */
export function isWriteStatement(sql: string): boolean {
  const firstKeyword = getFirstKeyword(sql);
  if (!firstKeyword) return false;
  return DANGER_KEYWORDS.has(firstKeyword);
}

/**
 * Mask potential secrets in SQL for audit logging.
 * Masks strings that look like passwords or tokens.
 */
export function maskSqlSecrets(sql: string): string {
  // Mask password-like strings in SET PASSWORD, IDENTIFIED BY, etc.
  let masked = sql.replace(/(IDENTIFIED\s+BY\s+)'[^']*'/gi, "$1'****'");
  masked = masked.replace(/(PASSWORD\s*=\s*)'[^']*'/gi, "$1'****'");
  masked = masked.replace(/(PASSWORD\s+)'[^']*'/gi, "$1'****'");
  masked = masked.replace(/(SET\s+PASSWORD\s*=\s*)'[^']*'/gi, "$1'****'");
  
  return masked;
}
