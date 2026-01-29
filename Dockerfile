# Use Node.js 20 Alpine as base
FROM node:20-alpine AS base

# Install dependencies needed for Prisma, Git, SSH, and su-exec for proper user switching
RUN apk add --no-cache \
    openssl \
    libc6-compat \
    git \
    openssh-client \
    python3 \
    make \
    g++ \
    su-exec

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Dependencies stage
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Build stage
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# Production stage
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p /data/workspaces && chown -R nextjs:nodejs /data

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy prisma schema/migrations (if needed at runtime)
COPY --from=builder /app/prisma ./prisma

# Install production deps in runner (pnpm)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Generate prisma client in the runtime image (recommended)
RUN pnpm prisma generate

# Copy startup script
COPY start.sh ./
RUN chmod +x start.sh

# Copy entrypoint script (runs as root to fix permissions)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Don't switch to nextjs user yet - entrypoint will do it after fixing permissions
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use PORT environment variable in healthcheck - fallback to 3000 if not set
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/projects || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["./start.sh"]

