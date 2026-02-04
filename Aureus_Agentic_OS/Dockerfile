# Aureus Agentic OS - Console Application Docker Image
# Multi-stage build for production deployment

# Stage 1: Build all packages
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
COPY packages/*/package.json ./packages/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build all workspaces in order
RUN npm run build:ordered

# Build console app
RUN npm run build --workspace=@aureus/console

# Stage 2: Production runtime
FROM node:18-alpine

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
COPY packages/*/package.json ./packages/
RUN npm ci --only=production --ignore-scripts

# Copy built artifacts from builder
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/apps/console/dist ./apps/console/dist
COPY --from=builder /app/apps/console/package.json ./apps/console/

# Create necessary directories
RUN mkdir -p /app/data /app/logs /app/var/run /app/config

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); })"

# Start console
CMD ["node", "apps/console/dist/index.js"]
