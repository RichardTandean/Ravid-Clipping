# API Gateway Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies for building)
RUN npm ci --only=production && npm cache clean --force

# Runtime stage
FROM node:18-alpine AS runtime

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    tini && \
    rm -rf /var/cache/apk/*

# Create non-root user for security
RUN addgroup -g 1001 -S apigateway && \
    adduser -S apigateway -u 1001 -G apigateway

# Set working directory
WORKDIR /app

# Copy node_modules from builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY --chown=apigateway:apigateway . .

# Create necessary directories with proper permissions
RUN mkdir -p logs tmp && \
    chown -R apigateway:apigateway /app

# Remove unnecessary files
RUN rm -rf \
    .git \
    .gitignore \
    .dockerignore \
    README.md \
    Dockerfile* \
    docker-compose* \
    tests/ \
    coverage/ \
    .nyc_output \
    node_modules/.cache

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV LOG_LEVEL=info
ENV JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ENV JWT_REFRESH_SECRET=your-refresh-secret-key

# Expose port
EXPOSE 3000

# Switch to non-root user
USER apigateway

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use tini as init system for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "src/index.js"] 