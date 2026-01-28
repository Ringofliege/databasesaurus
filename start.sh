#!/bin/sh
set -e

echo "=========================================="
echo "Databasesaurus Starting"
echo "=========================================="
echo "Node version: $(node --version)"
echo "Working directory: $(pwd)"
echo ""
echo "Configuration:"
echo "  PORT: ${PORT:-3000}"
echo "  HOSTNAME: ${HOSTNAME:-0.0.0.0}"
echo "  NODE_ENV: ${NODE_ENV:-production}"
echo "  DATABASE_URL: ${DATABASE_URL:+[SET - length: $(echo -n "$DATABASE_URL" | wc -c) chars]}"
echo "  DATABASE_URL: ${DATABASE_URL:-[NOT SET]}"
echo "  REDIS_URL: ${REDIS_URL:+[SET]}"
echo "  REDIS_URL: ${REDIS_URL:-[NOT SET]}"
echo "  BASIC_AUTH_USER: ${BASIC_AUTH_USER:+[SET]}"
echo "  BASIC_AUTH_USER: ${BASIC_AUTH_USER:-[NOT SET]}"
echo ""
echo "Starting Next.js server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
echo "=========================================="
echo ""

# Start the Next.js server
exec node server.js
