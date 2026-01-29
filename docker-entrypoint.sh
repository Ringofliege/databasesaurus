#!/bin/sh
set -e

echo "=========================================="
echo "Docker Entrypoint"
echo "=========================================="

# Fix permissions for workspaces directory if it exists
if [ -d "/data/workspaces" ]; then
  echo "Setting permissions for /data/workspaces..."
  chown -R nextjs:nodejs /data/workspaces 2>/dev/null || {
    echo "Warning: Could not change ownership (this is normal if running without root)"
  }
  chmod -R u+w /data/workspaces 2>/dev/null || {
    echo "Warning: Could not set write permissions"
  }
else
  echo "Creating /data/workspaces directory..."
  mkdir -p /data/workspaces
  chown -R nextjs:nodejs /data/workspaces 2>/dev/null || true
  chmod -R u+w /data/workspaces 2>/dev/null || true
fi

echo "Switching to nextjs user..."
echo ""

# Switch to nextjs user and execute the actual startup script
exec su-exec nextjs "$@"
