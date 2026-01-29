# DB + Prisma Helper

An internal web tool for managing databases and Prisma migrations in Coolify. This tool simplifies database administration for users with limited DB knowledge.

## Features

- **Multi-Database Support**: MySQL and PostgreSQL
- **Project Management**: Organize database configurations by project
- **Secure Session Management**: Credentials stored only in memory (60-minute TTL)
- **Database Operations**:
  - Create/Drop/Clear databases
  - Create users with auto-generated passwords
  - Grant application rights
  - SQL Console (read-only by default, with danger mode)
- **Prisma Integration**:
  - Clone/refresh GitLab repositories
  - Run migrations, generate client, seed data
  - Live log streaming
- **Audit Logging**: All actions are logged with actor, timestamp, and payload

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     DB + Prisma Helper                       │
├──────────────────┬──────────────────────────────────────────┤
│   Frontend       │   Next.js App Router + React + Tailwind  │
├──────────────────┼──────────────────────────────────────────┤
│   API            │   Next.js API Routes                     │
├──────────────────┼──────────────────────────────────────────┤
│   Meta-DB        │   PostgreSQL (external, via DATABASE_URL)│
├──────────────────┼──────────────────────────────────────────┤
│   Sessions       │   In-memory (or optional Redis)          │
├──────────────────┼──────────────────────────────────────────┤
│   Target DBs     │   MySQL / PostgreSQL (via session creds) │
└──────────────────┴──────────────────────────────────────────┘
```

## Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL database for metadata (Meta-DB)
- Docker (optional, for containerized deployment)

## Environment Variables

```bash
# Required: Meta-DB connection string
DATABASE_URL="postgresql://user:password@localhost:5432/dbhelper?schema=public"

# HTTP Basic Auth credentials
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=changeme

# Optional: GitLab SSH Deploy Key for cloning repositories
GIT_SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----"

# Optional: Redis for multi-instance session storage
REDIS_URL=redis://localhost:6379
```

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env with your database connection
```

### 3. Set up Meta-DB

Choose one of the following methods to initialize your database schema.

#### Method 1: `db push` (for rapid prototyping)

This command syncs your schema with the database without creating migration files. It's ideal for initial setup or development environments where you don't need a migration history.

```bash
# Generate Prisma client
pnpm prisma generate

# Push the schema to the database
pnpm db:push
```

#### Method 2: `migrate` (for development and production)

This workflow creates migration files, allowing you to version your schema changes and apply them consistently across different environments.

```bash
# Create your first migration and apply it
pnpm db:migrate:dev --name init

# For subsequent changes during development
pnpm db:migrate:dev

# To apply migrations in production
pnpm db:migrate
```

### 4. Start development server

```bash
pnpm dev
```

Visit http://localhost:3000 and login with your BASIC_AUTH credentials.

## Running Tests

```bash
# Run all tests
pnpm test

# Watch mode
pnpm test:watch
```

## Docker Deployment

### Build and run with Docker Compose

```bash
# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Build and start (without Redis)
docker compose up -d

# Build and start (with Redis for sessions)
docker compose --profile redis up -d
```

### Custom Port Configuration

The Docker image defaults to port 3000, but you can override it using the `PORT` environment variable:

```bash
# Example with custom port 3010
docker run -p 3010:3010 \
  -e PORT=3010 \
  -e HOSTNAME="0.0.0.0" \
  -e DATABASE_URL="postgresql://..." \
  -e BASIC_AUTH_USER=admin \
  -e BASIC_AUTH_PASS=changeme \
  db-prisma-helper
```

**Docker Compose with custom port:**

```yaml
version: "3.8"
services:
  app:
    image: ghcr.io/ringofliege/databasesaurus:latest
    environment:
      HOSTNAME: "0.0.0.0"
      PORT: "3010"  # Custom port
      DATABASE_URL: ${DATABASE_URL}
      BASIC_AUTH_USER: ${BASIC_AUTH_USER:-admin}
      BASIC_AUTH_PASS: ${BASIC_AUTH_PASS:-changeme}
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
    ports:
      - "3010:3010"  # Map to custom port
    volumes:
      - workspaces:/data/workspaces
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  workspaces:
  redis_data:
```

### Build Docker image manually

```bash
docker build -t db-prisma-helper .
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e BASIC_AUTH_USER=admin \
  -e BASIC_AUTH_PASS=changeme \
  db-prisma-helper
```

### Troubleshooting Docker Deployment

**"No server is reachable" or "404 not found" errors:**

1. **Check logs for port information**: The startup script now logs the actual port being used
   ```bash
   docker logs <container-name>
   ```
   Look for lines like:
   ```
   PORT: 3010
   Starting Next.js server on 0.0.0.0:3010...
   ```

2. **Verify port mapping**: Ensure the exposed port matches the PORT environment variable
   ```bash
   docker ps  # Check port mappings
   ```

3. **Test from within the container**:
   ```bash
   docker exec <container-name> wget -O- http://localhost:3010/api/projects
   ```

4. **Check environment variables**:
   ```bash
   docker exec <container-name> env | grep -E "PORT|HOSTNAME|DATABASE_URL"
   ```

5. **Healthcheck status**:
   ```bash
   docker inspect <container-name> | grep -A 10 Health
   ```
   The healthcheck automatically uses the PORT environment variable.

**Common issues:**
- Port mismatch: Container PORT env doesn't match exposed port in docker-compose
- Database connectivity: DATABASE_URL is not reachable from container
- Missing credentials: BASIC_AUTH_USER or BASIC_AUTH_PASS not set

## API Reference

### Authentication

All API endpoints require HTTP Basic Auth. Include the `Authorization` header:

```
Authorization: Basic base64(username:password)
```

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all projects |
| POST | `/api/projects` | Create a project |
| GET | `/api/projects/:id` | Get project details |
| PATCH | `/api/projects/:id` | Update project |
| GET | `/api/projects/:id/audit` | Get audit events |

### Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:id/session/start` | Start database session |
| POST | `/api/projects/:id/session/end` | End session |
| GET | `/api/projects/:id/session/status` | Check session status |

### Database Operations (require active session)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects/:id/db/overview` | Database overview |
| GET | `/api/projects/:id/db/databases` | List databases |
| POST | `/api/projects/:id/db/databases` | Create database |
| DELETE | `/api/projects/:id/db/databases/:name` | Drop database |
| POST | `/api/projects/:id/db/databases/:name/clear` | Clear database |
| GET | `/api/projects/:id/db/tables` | List tables |
| POST | `/api/projects/:id/db/users` | Create user |
| POST | `/api/projects/:id/db/users/:username/rotate-password` | Rotate password |
| POST | `/api/projects/:id/db/grants/app-rights` | Grant app rights |
| POST | `/api/projects/:id/db/query` | Execute SQL query |

### Prisma Operations (require active session)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:id/prisma/clone` | Clone/refresh repository |
| POST | `/api/projects/:id/prisma/migrate-deploy` | Run migrate deploy |
| POST | `/api/projects/:id/prisma/generate` | Run generate |
| POST | `/api/projects/:id/prisma/seed` | Run db seed |
| POST | `/api/projects/:id/prisma/pnpm-prisma-migrate` | Run pnpm prisma:migrate |
| GET | `/api/projects/:id/prisma/logs/stream` | Stream logs (SSE) |

## Security Considerations

1. **HTTP Basic Auth**: All endpoints require authentication
2. **Session TTL**: Database credentials expire after 60 minutes
3. **No Credential Storage**: Target DB credentials are never stored in Meta-DB
4. **SQL Allowlist**: Query console validates statements before execution
5. **Audit Logging**: All actions are logged with actor and timestamp
6. **Secret Masking**: Passwords are masked in logs and audit payloads
7. **Path Validation**: Working directories are validated to prevent traversal

## Database Schema

The Meta-DB stores:

- **projects**: Project configurations
- **project_db_objects**: Known database objects (databases, users)
- **audit_events**: Action audit trail
- **runs**: Prisma command execution records
- **run_logs**: Command output logs

## License

Internal use only.
