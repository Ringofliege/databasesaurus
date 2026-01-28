import { describe, it, expect } from 'vitest';
import { MySqlClient, PostgresClient } from '../src/lib/db-client';

describe('MySqlClient.previewGrantSql', () => {
  it('should generate correct MySQL grant statements', () => {
    const client = new MySqlClient({
      scheme: 'mysql',
      username: 'admin',
      password: 'pass',
      host: 'localhost',
      port: 3306,
      database: '',
      params: {},
    });

    const statements = client.previewGrantSql('mydb', 'app_user');

    expect(statements).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON `mydb`.* TO 'app_user'@'%'"
    );
    expect(statements).toContain(
      "GRANT CREATE, ALTER, INDEX, DROP ON `mydb`.* TO 'app_user'@'%'"
    );
    expect(statements).toContain(
      "GRANT REFERENCES ON `mydb`.* TO 'app_user'@'%'"
    );
    expect(statements).toContain('FLUSH PRIVILEGES');
    expect(statements).toHaveLength(4);
  });
});

describe('PostgresClient.previewGrantSql', () => {
  it('should generate correct PostgreSQL grant statements', () => {
    const client = new PostgresClient({
      scheme: 'postgres',
      username: 'admin',
      password: 'pass',
      host: 'localhost',
      port: 5432,
      database: 'postgres',
      params: {},
    });

    const statements = client.previewGrantSql('mydb', 'app_user');

    expect(statements).toContain(
      'GRANT CONNECT ON DATABASE "mydb" TO "app_user"'
    );
    expect(statements).toContain(
      'GRANT USAGE ON SCHEMA public TO "app_user"'
    );
    expect(statements).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "app_user"'
    );
    expect(statements).toContain(
      'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "app_user"'
    );
    expect(statements.some(s => s.includes('ALTER DEFAULT PRIVILEGES'))).toBe(true);
    expect(statements).toHaveLength(6);
  });
});
