# ============================================
# Stage 1: Build
# ============================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency files first (better caching)
# pnpm-workspace.yaml es obligatorio: contiene overrides/allowBuilds que el
# lockfile valida (sin él: ERR_PNPM_LOCKFILE_CONFIG_MISMATCH).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# pnpm >= 10: versiones anteriores no leen overrides desde pnpm-workspace.yaml
RUN npm install -g pnpm@12
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
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install pnpm and production dependencies
# pnpm >= 10 (mismo motivo que el builder: overrides en pnpm-workspace.yaml).
# pnpm 10+ no ejecuta scripts de dependencias salvo las aprobadas en
# allowBuilds (pnpm-workspace.yaml), por lo que no bloquea de forma interactiva.
RUN npm install -g pnpm@12
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
