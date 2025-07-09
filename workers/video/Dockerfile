FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies including FFmpeg
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-dev \
    curl \
    bash \
    build-base \
    imagemagick

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create directories for logs, temp files, and output
RUN mkdir -p logs temp uploads output frames thumbnails

# Set environment variables
ENV NODE_ENV=production
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Expose port
EXPOSE 3002

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S worker -u 1001

# Change ownership of the app directory
RUN chown -R worker:nodejs /app
USER worker

# Start the worker
CMD ["npm", "start"] 