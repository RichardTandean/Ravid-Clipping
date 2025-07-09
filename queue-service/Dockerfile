FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    bash

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create directories for logs
RUN mkdir -p logs

# Set environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

# Expose port
EXPOSE 3004

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S queueservice -u 1001

# Change ownership of the app directory
RUN chown -R queueservice:nodejs /app
USER queueservice

# Start the service
CMD ["npm", "start"] 