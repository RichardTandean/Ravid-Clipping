#!/bin/bash

# Start Development Environment
# This script starts all services for the video clipping platform

set -e

echo "🚀 Starting Video Clipping Platform Development Environment"
echo "=========================================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please run ./scripts/dev-setup.sh first."
    exit 1
fi

# Start all services
echo "🔄 Starting all services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to start up..."

# Wait for Redis to be ready
echo "Waiting for Redis..."
until docker exec clipping-redis redis-cli ping &> /dev/null; do
    echo -n "."
    sleep 1
done
echo " ✅ Redis is ready"

# Wait for Ollama to be ready
echo "Waiting for Ollama..."
until curl -f http://localhost:11434/api/health &> /dev/null; do
    echo -n "."
    sleep 1
done
echo " ✅ Ollama is ready"

# Wait for Queue Service to be ready
echo "Waiting for Queue Service..."
until curl -f http://localhost:3004/health &> /dev/null; do
    echo -n "."
    sleep 1
done
echo " ✅ Queue Service is ready"

echo ""
echo "🎉 All services are running!"
echo ""
echo "Available services:"
echo "├── Queue Dashboard: http://localhost:3004/admin/queues"
echo "├── Queue API: http://localhost:3004/api"
echo "├── Redis Commander: http://localhost:8081"
echo "├── Ollama API: http://localhost:11434"
echo "└── Storage Service: http://localhost:3005 (when implemented)"
echo ""
echo "Worker Status:"
docker-compose ps | grep worker

echo ""
echo "Useful commands:"
echo "├── View logs: ./scripts/dev-logs.sh"
echo "├── Stop services: ./scripts/dev-stop.sh"
echo "├── Restart services: ./scripts/dev-restart.sh"
echo "├── View status: ./scripts/dev-status.sh"
echo "└── Test workers: ./scripts/dev-test.sh" 