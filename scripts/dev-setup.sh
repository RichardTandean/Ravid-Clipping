#!/bin/bash

# Development Environment Setup Script
# This script sets up the entire video clipping platform development environment

set -e

echo "🚀 Setting up Video Clipping Platform Development Environment"
echo "============================================================="

# Check if Docker and Docker Compose are installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"

# Create environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📋 Creating .env file from example..."
    cp environment.example .env
    echo "✅ Created .env file. Please review and modify as needed."
else
    echo "⚠️  .env file already exists. Skipping creation."
fi

# Create necessary directories
echo "📁 Creating required directories..."
mkdir -p storage/{uploads,output,temp}
mkdir -p logs
mkdir -p models
echo "✅ Directories created"

# Install dependencies for each service
echo "📦 Installing dependencies..."

services=("queue-service" "workers/ai" "workers/transcription" "workers/video" "workers/whisper-timestamp")

for service in "${services[@]}"; do
    if [ -d "$service" ]; then
        echo "Installing dependencies for $service..."
        cd "$service"
        npm install
        cd - > /dev/null
        echo "✅ Dependencies installed for $service"
    else
        echo "⚠️  Service directory $service not found. Skipping."
    fi
done

# Install Python dependencies for whisper-timestamp worker
if [ -d "workers/whisper-timestamp" ]; then
    echo "🐍 Installing Python dependencies for whisper-timestamp worker..."
    cd workers/whisper-timestamp
    if command -v python3 &> /dev/null; then
        pip3 install -r requirements.txt
        echo "✅ Python dependencies installed"
    else
        echo "⚠️  Python3 not found. Please install Python3 and run: pip3 install -r workers/whisper-timestamp/requirements.txt"
    fi
    cd - > /dev/null
fi

# Pull required Docker images
echo "🐳 Pulling required Docker images..."
docker pull redis:7-alpine
docker pull ollama/ollama:latest
docker pull rediscommander/redis-commander:latest
echo "✅ Docker images pulled"

# Build all services
echo "🔨 Building all services..."
docker-compose build
echo "✅ All services built"

# Start Ollama and download required model
echo "🤖 Setting up Ollama AI model..."
docker-compose up -d ollama
sleep 10  # Wait for Ollama to start

# Download the model
echo "📥 Downloading llama3.2:3b model (this may take a while)..."
docker exec clipping-ollama ollama pull llama3.2:3b || echo "⚠️  Failed to download model. You can download it later with: docker exec clipping-ollama ollama pull llama3.2:3b"

echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Review and modify .env file if needed"
echo "2. Start all services: ./scripts/dev-start.sh"
echo "3. View logs: ./scripts/dev-logs.sh"
echo "4. Stop services: ./scripts/dev-stop.sh"
echo ""
echo "Available services:"
echo "- Queue Dashboard: http://localhost:3004/admin/queues"
echo "- Redis Commander: http://localhost:8081"
echo "- API Gateway: http://localhost:3000 (when implemented)"
echo ""
echo "For help, run: ./scripts/dev-help.sh" 