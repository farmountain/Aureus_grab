# Aureus Sentinel Bridge - Production Docker Image
# Simple build (no npm dependencies - uses only Node.js built-ins)

FROM node:20-alpine

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S aureus && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G aureus -g aureus aureus

WORKDIR /app

# Copy application files (bridge has no npm dependencies)
COPY --chown=aureus:aureus Aureus-Sentinel/bridge/ ./
COPY --chown=aureus:aureus contracts/ ./contracts/

# Create directory for keys and logs
RUN mkdir -p /app/keys /app/logs /app/events && \
    chown -R aureus:aureus /app

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

