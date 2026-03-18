# Build stage - install ALL deps for building
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY ShopSyncFlow-Todo-Project/package*.json ./

# Install all dependencies (dev + prod needed for build)
RUN npm ci

# Copy source code
COPY ShopSyncFlow-Todo-Project/. .

# Build the application
RUN npm run build

# Production stage - only production deps
FROM node:20-alpine
WORKDIR /app

# Copy package files and install production deps only
COPY ShopSyncFlow-Todo-Project/package*.json ./
RUN npm ci --omit=dev

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Copy server directory for dynamic imports (services, etc.)
COPY --from=builder /app/server ./server

# Copy shared directory for schema definitions
COPY --from=builder /app/shared ./shared

# Create non-root user for security (matching host UID 1026)
RUN addgroup -g 1026 -S nodejs && \
    adduser -S nodejs -u 1026

# Create uploads directory with proper permissions
RUN mkdir -p /app/server/uploads && \
    chown -R nodejs:nodejs /app/server/uploads && \
    chmod 755 /app/server/uploads

# Set ownership
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "dist/index.js"]
