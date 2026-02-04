# Aureus Sentinel Bridge - Production Docker Image
# Multi-stage build for minimal final image size

# Stage 1: Dependencies
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copy package files
COPY Aureus-Sentinel/bridge/package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Stage 2: Builder (if needed for future compilation)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy source and dependencies
COPY --from=dependencies /app/node_modules ./node_modules
COPY Aureus-Sentinel/bridge/ ./

# Stage 3: Production
FROM node:20-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S aureus && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G aureus -g aureus aureus

WORKDIR /app

# Copy dependencies and source
COPY --from=dependencies --chown=aureus:aureus /app/node_modules ./node_modules
COPY --chown=aureus:aureus Aureus-Sentinel/bridge/ ./
COPY --chown=aureus:aureus contracts/ ./contracts/

# Create directory for keys (if not using KMS)
RUN mkdir -p /app/keys && chown aureus:aureus /app/keys

# Switch to non-root user
USER aureus

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start server
CMD ["node", "server.js"]

# Labels
LABEL org.opencontainers.image.title="Aureus Sentinel Bridge"
LABEL org.opencontainers.image.description="Cryptographic signing service for Aureus Sentinel"
LABEL org.opencontainers.image.vendor="Aureus Sentinel Team"
LABEL org.opencontainers.image.url="https://github.com/farmountain/Aureus-Sentinel"
LABEL org.opencontainers.image.documentation="https://github.com/farmountain/Aureus-Sentinel/blob/main/README.md"
LABEL org.opencontainers.image.source="https://github.com/farmountain/Aureus-Sentinel"
LABEL org.opencontainers.image.licenses="MIT"
