import mysql from 'mysql2/promise';
import { Pool, PoolClient } from 'pg';
import { ParsedDbUrl } from './db-url';

export interface DbClient {
  // Connection
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  testConnection(): Promise<boolean>;
  
  // Overview
  getOverview(currentDb?: string): Promise<DbOverview>;
  
  // Database operations
  listDatabases(): Promise<string[]>;
  createDatabase(name: string): Promise<void>;
  dropDatabase(name: string): Promise<void>;
  clearDatabase(name: string): Promise<void>;
  
  // Table operations
  listTables(database: string): Promise<string[]>;
  
  // User operations
  createUser(username: string, password: string): Promise<void>;
  rotatePassword(username: string, newPassword: string): Promise<void>;
  
  // Grant operations
  grantAppRights(database: string, username: string): Promise<string[]>; // Returns SQL statements
  previewGrantSql(database: string, username: string): string[];
  
  // Query execution
  executeQuery(sql: string, database?: string): Promise<QueryResult>;
}

export interface DbOverview {
  kind: 'mysql' | 'postgres';
  host: string;
  port: number;
  currentDatabase: string;
  totalDatabases: number;
  activeConnections: number;
  databaseSize: string;
  serverVersion: string;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  fields: string[];
  executionTimeMs: number;
  truncated: boolean;
}

const QUERY_ROW_LIMIT = 200;
const QUERY_TIMEOUT_MS = 10000;

/**
 * MySQL database client implementation.
 */
export class MySqlClient implements DbClient {
  private pool: mysql.Pool | null = null;
  private config: ParsedDbUrl;
  
  constructor(config: ParsedDbUrl) {
    this.config = config;
  }
  
  async connect(): Promise<void> {
    this.pool = mysql.createPool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password || undefined,
      database: this.config.database || undefined,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      connectTimeout: QUERY_TIMEOUT_MS,
    });
  }
  
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
  
  async testConnection(): Promise<boolean> {
    if (!this.pool) await this.connect();
    try {
      await this.pool!.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
  
  async getOverview(currentDb?: string): Promise<DbOverview> {
    if (!this.pool) await this.connect();
    
    const [databases] = await this.pool!.query<mysql.RowDataPacket[]>('SHOW DATABASES');
    const [processlist] = await this.pool!.query<mysql.RowDataPacket[]>('SHOW PROCESSLIST');
    const [versionRow] = await this.pool!.query<mysql.RowDataPacket[]>('SELECT VERSION() as version');
    
    let dbSize = 'N/A';
    const db = currentDb || this.config.database;
    if (db) {
      try {
        const [sizeRows] = await this.pool!.query<mysql.RowDataPacket[]>(
          `SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS size_mb 
           FROM information_schema.tables WHERE table_schema = ?`,
          [db]
        );
        if (sizeRows[0]?.size_mb) {
          dbSize = `${sizeRows[0].size_mb} MB`;
        }
      } catch {
        // Ignore size errors
      }
    }
    
    return {
      kind: 'mysql',
      host: this.config.host,
      port: this.config.port,
      currentDatabase: db || '',
      totalDatabases: databases.length,
      activeConnections: processlist.length,
      databaseSize: dbSize,
      serverVersion: versionRow[0]?.version || 'Unknown',
    };
  }
  
  async listDatabases(): Promise<string[]> {
    if (!this.pool) await this.connect();
    const [rows] = await this.pool!.query<mysql.RowDataPacket[]>('SHOW DATABASES');
    return rows.map(row => row.Database);
  }
  
  async createDatabase(name: string): Promise<void> {
    if (!this.pool) await this.connect();
    // Validate name to prevent SQL injection
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid database name. Use only alphanumeric characters and underscores.');
    }
    await this.pool!.query(`CREATE DATABASE \`${name}\``);
  }
  
  async dropDatabase(name: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid database name.');
    }
    await this.pool!.query(`DROP DATABASE \`${name}\``);
  }
  
  async clearDatabase(name: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid database name.');
    }
    
    // Try drop + recreate
    try {
      await this.pool!.query(`DROP DATABASE \`${name}\``);
      await this.pool!.query(`CREATE DATABASE \`${name}\``);
    } catch (error) {
      // If drop fails, try to truncate all tables
      const conn = await this.pool!.getConnection();
      try {
        await conn.query(`USE \`${name}\``);
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');
        
        const [tables] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES');
        const tableKey = `Tables_in_${name}`;
        
        for (const row of tables) {
          const tableName = row[tableKey];
          await conn.query(`TRUNCATE TABLE \`${tableName}\``);
        }
        
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');
      } finally {
        conn.release();
      }
    }
  }
  
  async listTables(database: string): Promise<string[]> {
    if (!this.pool) await this.connect();
    const conn = await this.pool!.getConnection();
    try {
      await conn.query(`USE \`${database}\``);
      const [rows] = await conn.query<mysql.RowDataPacket[]>('SHOW TABLES');
      const tableKey = `Tables_in_${database}`;
      return rows.map(row => row[tableKey]);
    } finally {
      conn.release();
    }
  }
  
  async createUser(username: string, password: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Invalid username. Use only alphanumeric characters and underscores.');
    }
    await this.pool!.query(`CREATE USER ?@'%' IDENTIFIED BY ?`, [username, password]);
  }
  
  async rotatePassword(username: string, newPassword: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Invalid username.');
    }
    await this.pool!.query(`ALTER USER ?@'%' IDENTIFIED BY ?`, [username, newPassword]);
  }
  
  previewGrantSql(database: string, username: string): string[] {
    return [
      `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database}\`.* TO '${username}'@'%'`,
      `GRANT CREATE, ALTER, INDEX, DROP ON \`${database}\`.* TO '${username}'@'%'`,
      `GRANT REFERENCES ON \`${database}\`.* TO '${username}'@'%'`,
      `FLUSH PRIVILEGES`,
    ];
  }
  
  async grantAppRights(database: string, username: string): Promise<string[]> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(database) || !/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Invalid database or username.');
    }
    
    const statements = this.previewGrantSql(database, username);
    for (const sql of statements) {
      await this.pool!.query(sql);
    }
    return statements;
  }
  
  async executeQuery(sql: string, database?: string): Promise<QueryResult> {
    if (!this.pool) await this.connect();
    
    const startTime = Date.now();
    const conn = await this.pool!.getConnection();
    
    try {
      if (database) {
        await conn.query(`USE \`${database}\``);
      }
      
      // Set query timeout
      await conn.query(`SET SESSION MAX_EXECUTION_TIME=${QUERY_TIMEOUT_MS}`);
      
      const [result] = await conn.query(sql + ` LIMIT ${QUERY_ROW_LIMIT + 1}`);
      const executionTimeMs = Date.now() - startTime;
      
      const rows = Array.isArray(result) ? result as Record<string, unknown>[] : [];
      const truncated = rows.length > QUERY_ROW_LIMIT;
      const limitedRows = truncated ? rows.slice(0, QUERY_ROW_LIMIT) : rows;
      
      const fields = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];
      
      return {
        rows: limitedRows,
        rowCount: limitedRows.length,
        fields,
        executionTimeMs,
        truncated,
      };
    } finally {
      conn.release();
    }
  }
}

/**
 * PostgreSQL database client implementation.
 */
export class PostgresClient implements DbClient {
  private pool: Pool | null = null;
  private config: ParsedDbUrl;
  
  constructor(config: ParsedDbUrl) {
    this.config = config;
  }
  
  async connect(): Promise<void> {
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password || undefined,
      database: this.config.database || 'postgres',
      max: 5,
      connectionTimeoutMillis: QUERY_TIMEOUT_MS,
      idleTimeoutMillis: 30000,
    });
  }
  
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
  
  async testConnection(): Promise<boolean> {
    if (!this.pool) await this.connect();
    let client: PoolClient | null = null;
    try {
      client = await this.pool!.connect();
      await client.query('SELECT 1');
      return true;
    } catch {
      return false;
    } finally {
      if (client) client.release();
    }
  }
  
  async getOverview(currentDb?: string): Promise<DbOverview> {
    if (!this.pool) await this.connect();
    
    const dbResult = await this.pool!.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false"
    );
    
    const connResult = await this.pool!.query(
      "SELECT count(*) as count FROM pg_stat_activity"
    );
    
    const versionResult = await this.pool!.query("SELECT version()");
    
    let dbSize = 'N/A';
    const db = currentDb || this.config.database;
    if (db && db !== 'postgres') {
      try {
        const sizeResult = await this.pool!.query(
          "SELECT pg_size_pretty(pg_database_size($1)) as size",
          [db]
        );
        dbSize = sizeResult.rows[0]?.size || 'N/A';
      } catch {
        // Ignore size errors
      }
    }
    
    return {
      kind: 'postgres',
      host: this.config.host,
      port: this.config.port,
      currentDatabase: db || 'postgres',
      totalDatabases: dbResult.rows.length,
      activeConnections: parseInt(connResult.rows[0]?.count || '0'),
      databaseSize: dbSize,
      serverVersion: versionResult.rows[0]?.version?.split(' ')[1] || 'Unknown',
    };
  }
  
  async listDatabases(): Promise<string[]> {
    if (!this.pool) await this.connect();
    const result = await this.pool!.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
    );
    return result.rows.map(row => row.datname);
  }
  
  async createDatabase(name: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid database name. Use only alphanumeric characters and underscores.');
    }
    // Need to connect to postgres db for create operations
    const maintenancePool = new Pool({
      ...this.pool!.options,
      database: 'postgres',
    });
    try {
      await maintenancePool.query(`CREATE DATABASE "${name}"`);
    } finally {
      await maintenancePool.end();
    }
  }
  
  async dropDatabase(name: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid database name.');
    }
    // Need to connect to postgres db for drop operations
    const maintenancePool = new Pool({
      ...this.pool!.options,
      database: 'postgres',
    });
    try {
      // Terminate existing connections
      await maintenancePool.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [name]
      );
      await maintenancePool.query(`DROP DATABASE "${name}"`);
    } finally {
      await maintenancePool.end();
    }
  }
  
  async clearDatabase(name: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(name)) {
      throw new Error('Invalid database name.');
    }
    
    // Try drop + recreate first
    try {
      await this.dropDatabase(name);
      await this.createDatabase(name);
      return;
    } catch {
      // Fall back to truncating all tables
    }
    
    // Connect to the target database to truncate tables
    const targetPool = new Pool({
      ...this.pool!.options,
      database: name,
    });
    
    try {
      // Get all tables in public schema
      const tablesResult = await targetPool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
      );
      
      if (tablesResult.rows.length > 0) {
        // Disable triggers temporarily
        await targetPool.query('SET session_replication_role = replica');
        
        for (const row of tablesResult.rows) {
          await targetPool.query(`TRUNCATE TABLE "${row.tablename}" CASCADE`);
        }
        
        await targetPool.query('SET session_replication_role = DEFAULT');
      }
    } finally {
      await targetPool.end();
    }
  }
  
  async listTables(database: string): Promise<string[]> {
    if (!this.pool) await this.connect();
    
    const targetPool = new Pool({
      ...this.pool!.options,
      database,
    });
    
    try {
      const result = await targetPool.query(
        `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
      );
      return result.rows.map(row => row.tablename);
    } finally {
      await targetPool.end();
    }
  }
  
  async createUser(username: string, password: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Invalid username. Use only alphanumeric characters and underscores.');
    }
    await this.pool!.query(`CREATE USER "${username}" WITH PASSWORD $1`, [password]);
  }
  
  async rotatePassword(username: string, newPassword: string): Promise<void> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Invalid username.');
    }
    await this.pool!.query(`ALTER USER "${username}" WITH PASSWORD $1`, [newPassword]);
  }
  
  previewGrantSql(database: string, username: string): string[] {
    return [
      `GRANT CONNECT ON DATABASE "${database}" TO "${username}"`,
      `GRANT USAGE ON SCHEMA public TO "${username}"`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${username}"`,
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${username}"`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${username}"`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${username}"`,
    ];
  }
  
  async grantAppRights(database: string, username: string): Promise<string[]> {
    if (!this.pool) await this.connect();
    if (!/^[a-zA-Z0-9_]+$/.test(database) || !/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error('Invalid database or username.');
    }
    
    const statements = this.previewGrantSql(database, username);
    
    // First statement needs to run on maintenance DB
    const maintenancePool = new Pool({
      ...this.pool!.options,
      database: 'postgres',
    });
    
    try {
      await maintenancePool.query(statements[0]);
    } finally {
      await maintenancePool.end();
    }
    
    // Rest need to run on target DB
    const targetPool = new Pool({
      ...this.pool!.options,
      database,
    });
    
    try {
      for (let i = 1; i < statements.length; i++) {
        await targetPool.query(statements[i]);
      }
    } finally {
      await targetPool.end();
    }
    
    return statements;
  }
  
  async executeQuery(sql: string, database?: string): Promise<QueryResult> {
    if (!this.pool) await this.connect();
    
    const startTime = Date.now();
    
    const targetPool = database
      ? new Pool({ ...this.pool!.options, database })
      : this.pool!;
    
    try {
      // Set statement timeout
      await targetPool.query(`SET statement_timeout = ${QUERY_TIMEOUT_MS}`);
      
      // Add LIMIT if it's a SELECT without one
      let limitedSql = sql;
      const sqlLower = sql.toLowerCase().trim();
      if (sqlLower.startsWith('select') && !sqlLower.includes(' limit ')) {
        // Remove trailing semicolon if present
        limitedSql = sql.replace(/;\s*$/, '');
        limitedSql = `${limitedSql} LIMIT ${QUERY_ROW_LIMIT + 1}`;
      }
      
      const result = await targetPool.query(limitedSql);
      const executionTimeMs = Date.now() - startTime;
      
      const rows = result.rows || [];
      const truncated = rows.length > QUERY_ROW_LIMIT;
      const limitedRows = truncated ? rows.slice(0, QUERY_ROW_LIMIT) : rows;
      
      const fields = result.fields?.map(f => f.name) || 
                    (limitedRows.length > 0 ? Object.keys(limitedRows[0]) : []);
      
      return {
        rows: limitedRows,
        rowCount: limitedRows.length,
        fields,
        executionTimeMs,
        truncated,
      };
    } finally {
      if (database && targetPool !== this.pool) {
        await targetPool.end();
      }
    }
  }
}

/**
 * Create a database client based on the parsed URL.
 */
export function createDbClient(config: ParsedDbUrl): DbClient {
  if (config.scheme === 'mysql') {
    return new MySqlClient(config);
  } else {
    return new PostgresClient(config);
  }
}

/**
 * Generate a random password.
 */
export function generatePassword(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const randomBytes = require('crypto').randomBytes(length);
  for (let i = 0; i < length; i++) {
    password += chars[randomBytes[i] % chars.length];
  }
  return password;
}
