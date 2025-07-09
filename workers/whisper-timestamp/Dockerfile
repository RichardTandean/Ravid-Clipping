FROM node:18

# Set working directory
WORKDIR /app

# Install system dependencies including Python and build tools
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    ffmpeg \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create symlink for python
RUN ln -s /usr/bin/python3 /usr/bin/python

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy Python requirements and install
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Create directories for logs, models, and temp files
RUN mkdir -p logs models temp uploads output torch_hub

# Set environment variables
ENV NODE_ENV=production
ENV PYTHON_EXECUTABLE=python3
ENV PYTORCH_HOME=/app/torch_hub

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Expose port
EXPOSE 3003

# Create non-root user
RUN groupadd -g 1001 nodejs
RUN useradd -r -u 1001 -g nodejs worker

# Change ownership of the app directory
RUN chown -R worker:nodejs /app
USER worker

# Pre-create whisper cache directory
RUN mkdir -p ~/.cache/whisper

# Start the worker
CMD ["npm", "start"] 