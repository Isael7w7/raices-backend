# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files first (better caching)
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN pnpm build

# ============================================
# Stage 2: Production
# ============================================
FROM node:22-alpine AS production

# Solo variables globales NO sensibles. Los secretos se inyectan en tiempo
# de ejecución vía Cloud Run (--set-secrets de Secret Manager) o .env local.
ENV NODE_ENV=production

# System dependencies for native modules (canvas requires cairo/pango)
RUN apk add --no-cache \
    build-base \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev

# Security: run as non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and production dependencies
# Pin pnpm v9 to avoid ERR_PNPM_IGNORED_BUILDS (v11 requires interactive approval for build scripts)
RUN corepack enable && corepack prepare pnpm@9 --activate
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Create uploads directory and clean up build tools to reduce image size
RUN mkdir -p /app/uploads && chown -R appuser:appgroup /app && \
    apk del build-base

# Switch to non-root user
USER appuser

# Expose port (Cloud Run requires PORT env var)
EXPOSE 7000

# Health check (valida proceso + Firestore). Usa PORT si Cloud Run lo inyecta.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider "http://localhost:${PORT:-7000}/api/health" || exit 1

# Start the application
CMD ["node", "dist/main.js"]
