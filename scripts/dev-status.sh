#!/bin/bash

# Development Environment Status
# This script shows the status of all services

echo "📊 Video Clipping Platform - Service Status"
echo "==========================================="
echo ""

# Check if Docker Compose is running
if ! docker-compose ps >/dev/null 2>&1; then
    echo "❌ Docker Compose environment not found"
    echo "Run ./scripts/dev-start.sh to start the environment"
    exit 1
fi

# Show container status
echo "🐳 Container Status:"
docker-compose ps

echo ""
echo "📊 Service Health Checks:"

# Check Redis
if curl -f -s http://localhost:6379 >/dev/null 2>&1 || docker exec clipping-redis redis-cli ping >/dev/null 2>&1; then
    echo "✅ Redis: Healthy"
else
    echo "❌ Redis: Not responding"
fi

# Check Ollama
if curl -f -s http://localhost:11434/api/health >/dev/null 2>&1; then
    echo "✅ Ollama: Healthy"
else
    echo "❌ Ollama: Not responding"
fi

# Check Queue Service
if curl -f -s http://localhost:3004/health >/dev/null 2>&1; then
    echo "✅ Queue Service: Healthy"
else
    echo "❌ Queue Service: Not responding"
fi

# Check Redis Commander
if curl -f -s http://localhost:8081 >/dev/null 2>&1; then
    echo "✅ Redis Commander: Healthy"
else
    echo "❌ Redis Commander: Not responding"
fi

echo ""
echo "📈 Queue Status:"
if curl -f -s http://localhost:3004/api/queues/status >/dev/null 2>&1; then
    curl -s http://localhost:3004/api/queues/status | python3 -m json.tool 2>/dev/null || echo "Queue status available at http://localhost:3004/api/queues/status"
else
    echo "❌ Queue status not available"
fi

echo ""
echo "🔗 Available URLs:"
echo "├── Queue Dashboard: http://localhost:3004/admin/queues"
echo "├── Queue API: http://localhost:3004/api"
echo "├── Redis Commander: http://localhost:8081"
echo "└── Ollama API: http://localhost:11434"

echo ""
echo "📋 Recent logs (last 10 lines):"
echo "================================"
docker-compose logs --tail=10 