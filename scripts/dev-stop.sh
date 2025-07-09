#!/bin/bash

# Stop Development Environment
# This script stops all services for the video clipping platform

echo "🛑 Stopping Video Clipping Platform Development Environment"
echo "=========================================================="

# Stop all services
echo "🔄 Stopping all services..."
docker-compose down

echo ""
echo "✅ All services stopped!"
echo ""
echo "To start services again, run: ./scripts/dev-start.sh"
echo "To remove all data and start fresh, run: ./scripts/dev-clean.sh" 