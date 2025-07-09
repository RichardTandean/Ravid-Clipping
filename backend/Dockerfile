FROM node:18-slim

# Install FFmpeg, Python, and other dependencies for video processing and AI models
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    wget \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

ENV FRONTEND_URL=https://clipper.astrals.agency

# Copy source code
COPY . .

# Create directories for uploads and clips
RUN mkdir -p uploads clips

# Set permissions
RUN chown -R node:node /app
USER node

EXPOSE 3001

CMD ["npm", "start"]
