#!/bin/bash

# Development Environment Logs
# This script shows logs from all services

SERVICE=${1:-""}

if [ -z "$SERVICE" ]; then
    echo "📋 Showing logs from all services (use Ctrl+C to exit)"
    echo "======================================================"
    echo ""
    echo "Available services:"
    echo "├── redis"
    echo "├── ollama"
    echo "├── queue-service"
    echo "├── ai-worker"
    echo "├── transcription-worker"
    echo "├── whisper-timestamp-worker"
    echo "├── video-worker"
    echo "├── storage-service"
    echo "├── api-gateway"
    echo "└── redis-commander"
    echo ""
    echo "Usage: $0 [service-name]"
    echo "Example: $0 ai-worker"
    echo ""
    echo "Showing logs from all services..."
    docker-compose logs -f
else
    echo "📋 Showing logs for $SERVICE"
    echo "=========================="
    docker-compose logs -f "$SERVICE"
fi 