# Development Environment Setup

This document provides instructions for setting up the Video Clipping Platform development environment.

## Phase 1: Initial Setup ✅

Phase 1 includes Docker configurations, service communication, and development environment setup.

### Prerequisites

Before starting, ensure you have the following installed:

- **Docker** (version 20.10 or later)
- **Docker Compose** (version 2.0 or later)
- **Node.js** (version 18 or later)
- **Python 3** (version 3.8 or later)
- **curl** (for health checks)

### Quick Start

1. **Clone and setup the environment:**
   ```bash
   ./scripts/dev-setup.sh
   ```

2. **Start all services:**
   ```bash
   ./scripts/dev-start.sh
   ```

3. **Check status:**
   ```bash
   ./scripts/dev-status.sh
   ```

### Detailed Setup

#### 1. Environment Configuration

Copy the example environment file and modify as needed:
```bash
cp environment.example .env
```

Key environment variables:
- `REDIS_HOST` - Redis server host (default: localhost)
- `OLLAMA_HOST` - Ollama AI service URL
- `WHISPER_MODEL` - Whisper model size (tiny, base, small, medium, large)
- Worker concurrency settings for each service

#### 2. Service Architecture

The development environment includes:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Redis         │    │   Ollama        │    │ Queue Service   │
│   (Database)    │    │   (AI Engine)   │    │ (Queue Mgmt)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   AI Worker     │    │Transcription    │    │  Video Worker   │
│                 │    │    Worker       │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │Whisper Timestamp│
                    │     Worker      │
                    └─────────────────┘
```

#### 3. Services Overview

| Service | Port | Purpose | Status |
|---------|------|---------|--------|
| Redis | 6379 | Job queue database | ✅ Running |
| Ollama | 11434 | AI analysis engine | ✅ Running |
| Queue Service | 3004 | Queue management & monitoring | ✅ Running |
| AI Worker | - | Background AI processing | ✅ Running |
| Transcription Worker | - | Audio transcription | ✅ Running |
| Whisper Timestamp Worker | - | Precise timestamp extraction | ✅ Running |
| Video Worker | - | Video processing | ✅ Running |
| Redis Commander | 8081 | Redis web interface | ✅ Running |

#### 4. Available Interfaces

- **Queue Dashboard**: http://localhost:3004/admin/queues
  - Monitor job queues and worker status
  - View job details and logs
  - Pause/resume queues

- **Queue API**: http://localhost:3004/api
  - REST API for queue management
  - Job submission and status endpoints
  - Queue statistics

- **Redis Commander**: http://localhost:8081
  - Visual Redis database browser
  - Direct Redis data inspection

- **Ollama API**: http://localhost:11434
  - AI model management
  - Direct API access for testing

### Development Scripts

All scripts are located in the `scripts/` directory:

#### Setup & Management
- `./scripts/dev-setup.sh` - Initial environment setup
- `./scripts/dev-start.sh` - Start all services
- `./scripts/dev-stop.sh` - Stop all services
- `./scripts/dev-status.sh` - Show service status

#### Monitoring
- `./scripts/dev-logs.sh [service]` - View logs
- `./scripts/dev-help.sh` - Show help information

### Testing the Environment

After setup, test each worker service:

1. **AI Worker Test:**
   ```bash
   curl -X POST http://localhost:3004/api/queues/ai-analysis/jobs \
     -H "Content-Type: application/json" \
     -d '{"type": "test_connection", "data": {}}'
   ```

2. **Transcription Worker Test:**
   ```bash
   curl -X POST http://localhost:3004/api/queues/transcription/jobs \
     -H "Content-Type: application/json" \
     -d '{"type": "test_service", "data": {}}'
   ```

3. **Video Worker Test:**
   ```bash
   curl -X POST http://localhost:3004/api/queues/video-processing/jobs \
     -H "Content-Type: application/json" \
     -d '{"type": "test_service", "data": {}}'
   ```

### Troubleshooting

#### Common Issues

1. **Port already in use:**
   ```bash
   # Check what's using the port
   lsof -i :3004
   # Stop the service or change port in .env file
   ```

2. **Docker build failures:**
   ```bash
   # Clean Docker cache
   docker system prune -a
   # Rebuild specific service
   docker-compose build ai-worker
   ```

3. **Worker not processing jobs:**
   ```bash
   # Check worker logs
   ./scripts/dev-logs.sh ai-worker
   # Restart worker
   docker-compose restart ai-worker
   ```

4. **Ollama model download issues:**
   ```bash
   # Manually download model
   docker exec clipping-ollama ollama pull llama3.2:3b
   ```

#### Log Analysis

View logs for specific services:
```bash
# All services
./scripts/dev-logs.sh

# Specific service
./scripts/dev-logs.sh queue-service
./scripts/dev-logs.sh ai-worker
```

#### Service Restart

Restart individual services without stopping everything:
```bash
docker-compose restart queue-service
docker-compose restart ai-worker
```

### Development Workflow

1. **Start Development Session:**
   ```bash
   ./scripts/dev-start.sh
   ```

2. **Monitor Services:**
   ```bash
   ./scripts/dev-status.sh
   ```

3. **Make Code Changes:**
   - Edit worker code in `workers/*/src/`
   - Changes are reflected via volume mounts

4. **Test Changes:**
   ```bash
   # Restart specific worker
   docker-compose restart ai-worker
   
   # View logs
   ./scripts/dev-logs.sh ai-worker
   ```

5. **End Session:**
   ```bash
   ./scripts/dev-stop.sh
   ```

### Next Steps

After Phase 1 setup is complete, the following phases will be implemented:

- **Phase 2**: Queue Implementation (Advanced queue features)
- **Phase 3**: Worker Services (Enhanced worker capabilities)
- **Phase 4**: API Gateway (Service routing and authentication)
- **Phase 5**: Frontend Updates (UI integration with microservices)

### Files Created in Phase 1

#### Docker Configuration
- `workers/*/Dockerfile` - Worker service containers
- `queue-service/Dockerfile` - Queue service container
- `docker-compose.yml` - Complete development environment

#### Development Tools
- `scripts/dev-*.sh` - Development management scripts
- `environment.example` - Environment configuration template

#### Service Implementation
- `queue-service/src/index.js` - Queue management service
- Enhanced worker services with BullMQ integration

### Support

For issues or questions:
1. Check `./scripts/dev-help.sh`
2. Review logs with `./scripts/dev-logs.sh`
3. Consult `ARCHITECTURE_REFACTOR.md` for architecture details 