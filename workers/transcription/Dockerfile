FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies including FFmpeg and Python for whisper models
RUN apk add --no-cache \
    ffmpeg \
    ffmpeg-dev \
    python3 \
    py3-pip \
    curl \
    bash \
    build-base

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create directories for logs, models, and temp files
RUN mkdir -p logs models temp uploads output

# Set environment variables
ENV NODE_ENV=production
ENV WHISPER_MODEL=medium
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Expose port
EXPOSE 3001

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S worker -u 1001

# Change ownership of the app directory
RUN chown -R worker:nodejs /app
USER worker

# Pre-download whisper model to reduce startup time
RUN mkdir -p ~/.cache/whisper

# Start the worker
CMD ["npm", "start"] 