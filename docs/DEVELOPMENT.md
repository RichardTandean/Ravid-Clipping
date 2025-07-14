# Development Guide

## Prerequisites

Before you begin, ensure you have the following installed:

- Node.js (v18 or later)
- Python (v3.10 or later)
- Docker and Docker Compose
- Git
- PostgreSQL (v14 or later)
- Redis (v6 or later)

## Repository Structure

```
ravid-clipping/
├── frontend/           # Next.js frontend application
├── services/          
│   ├── user/          # User authentication service
│   ├── video/         # Video processing API service
│   ├── billing/       # Token and payment service
│   └── worker/        # Python video processing worker
├── k8s/               # Kubernetes configuration files
├── scripts/           # Development and deployment scripts
├── docs/              # Project documentation
└── docker/            # Dockerfile and compose files
```

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/ravid-clipping.git
cd ravid-clipping
```

### 2. Environment Setup

Copy example environment files:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
cp services/user/.env.example services/user/.env
cp services/video/.env.example services/video/.env
cp services/billing/.env.example services/billing/.env
cp services/worker/.env.example services/worker/.env
```

### 3. Install Dependencies

Frontend:
```bash
cd frontend
npm install
```

User Service:
```bash
cd services/user
npm install
```

Video Service:
```bash
cd services/video
npm install
```

Billing Service:
```bash
cd services/billing
npm install
```

Worker Service:
```bash
cd services/worker
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
```

### 4. Start Infrastructure Services

```bash
docker-compose up -d postgres redis minio
```

### 5. Database Setup

```bash
cd services/user
npm run migrate
```

### 6. Start Development Servers

In separate terminals:

```bash
# Frontend
cd frontend
npm run dev

# User Service
cd services/user
npm run dev

# Video Service
cd services/video
npm run dev

# Billing Service
cd services/billing
npm run dev

# Worker Service
cd services/worker
python main.py
```

## Development Workflow

### 1. Branch Naming Convention

- Feature: `feature/description`
- Bugfix: `fix/description`
- Hotfix: `hotfix/description`
- Release: `release/v1.0.0`

### 2. Commit Message Format

```
type(scope): description

[optional body]
[optional footer]
```

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation
- style: Formatting
- refactor: Code restructuring
- test: Tests
- chore: Maintenance

### 3. Pull Request Process

1. Create feature branch
2. Make changes
3. Run tests
4. Update documentation
5. Create pull request
6. Code review
7. Merge to main

## Testing

### Frontend Tests

```bash
cd frontend
npm run test        # Run unit tests
npm run test:e2e    # Run E2E tests
```

### Backend Tests

User Service:
```bash
cd services/user
npm run test
```

Video Service:
```bash
cd services/video
npm run test
```

Billing Service:
```bash
cd services/billing
npm run test
```

Worker Service:
```bash
cd services/worker
python -m pytest
```

## Code Style

### JavaScript/TypeScript

- ESLint configuration
- Prettier for formatting
- TypeScript strict mode enabled

### Python

- Black for formatting
- Flake8 for linting
- Type hints required

## Building for Production

### 1. Build Docker Images

```bash
docker-compose -f docker-compose.prod.yml build
```

### 2. Run Production Stack

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 3. Kubernetes Deployment

```bash
kubectl apply -f k8s/
```

## Monitoring and Debugging

### Logs

- Frontend: `docker logs ravid-frontend`
- Services: `docker logs ravid-service-name`
- Worker: `docker logs ravid-worker`

### Metrics

- Prometheus metrics available at `/metrics`
- Grafana dashboards for visualization
- Custom service health checks

## Troubleshooting

### Common Issues

1. **Database Connection Issues**
   ```bash
   # Check database status
   docker-compose ps postgres
   # View logs
   docker-compose logs postgres
   ```

2. **Redis Connection**
   ```bash
   # Check Redis status
   docker-compose ps redis
   # Redis CLI
   docker-compose exec redis redis-cli
   ```

3. **MinIO Issues**
   ```bash
   # Check MinIO status
   docker-compose ps minio
   # View logs
   docker-compose logs minio
   ```

### Debug Mode

Enable debug logging:

```bash
# User Service
DEBUG=* npm run dev

# Worker
export DEBUG=1
python main.py
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## Additional Resources

- [Architecture Documentation](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [User Flows](./USER_FLOWS.md)
- [Deployment Guide](./DEPLOYMENT.md) 