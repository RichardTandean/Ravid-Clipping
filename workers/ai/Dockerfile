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

# Create directories for logs and models
RUN mkdir -p logs models

# Set environment variables
ENV NODE_ENV=production
ENV OLLAMA_HOST=http://ollama:11434

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expose port (if the worker exposes an HTTP interface)
EXPOSE 3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S worker -u 1001

# Change ownership of the app directory
RUN chown -R worker:nodejs /app
USER worker

# Start the worker
CMD ["npm", "start"] 