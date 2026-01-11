# ================================
# Stage 1: Dependencies
# ================================
FROM node:20-alpine AS deps

# Install dependencies only when needed
# libc6-compat may not be available in all Alpine versions - skip if not found
RUN apk add --no-cache libc6-compat 2>/dev/null || true

WORKDIR /app

# Copy package files (bun.lock for bun, package.json for fallback)
COPY package.json bun.lock* ./

# Install dependencies using bun (faster) or npm fallback
RUN corepack enable && \
    (npm install -g bun && bun install --frozen-lockfile) || \
    (npm ci && npm cache clean --force)

# ================================
# Stage 2: Builder
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Set build-time environment variables
# These are embedded into the Next.js build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Install bun and build Next.js application
RUN npm install -g bun && bun run build

# Prune devDependencies after build
RUN npm prune --production 2>/dev/null || true
# ================================
# Stage 3: Runner (Production)
# ================================
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3010
ENV HOSTNAME=0.0.0.0

# Copy built application from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose Next.js port
EXPOSE 3010

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3010/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start the application
CMD ["node", "server.js"]
