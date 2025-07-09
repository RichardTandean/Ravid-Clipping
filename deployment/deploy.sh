#!/bin/bash

# Production Deployment Script for Video Clipping Microservices Platform
# This script deploys the application to a production VPS environment

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_step() {
    echo -e "${PURPLE}🔄 $1${NC}"
}

# Check if .env.production exists
check_env_file() {
    if [[ ! -f ".env.production" ]]; then
        print_error "Environment file .env.production not found!"
        print_status "Please copy production.env.template to .env.production and configure it"
        print_status "cp deployment/production.env.template .env.production"
        print_status "Then edit .env.production with your actual values"
        exit 1
    fi
}

# Load environment variables
load_env() {
    print_step "Loading environment configuration..."
    set -a  # automatically export all variables
    source .env.production
    set +a
    print_success "Environment loaded"
}

# Validate required environment variables
validate_env() {
    print_step "Validating environment configuration..."
    
    local required_vars=(
        "DOMAIN"
        "JWT_SECRET"
        "JWT_REFRESH_SECRET"
        "REDIS_PASSWORD"
        "LETSENCRYPT_EMAIL"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -gt 0 ]]; then
        print_error "Missing required environment variables:"
        for var in "${missing_vars[@]}"; do
            echo "  - $var"
        done
        exit 1
    fi
    
    print_success "Environment validation passed"
}

# Generate secure secrets if needed
generate_secrets() {
    print_step "Generating secure secrets..."
    
    # Check if we need to generate any secrets
    if [[ "$JWT_SECRET" == "your-jwt-secret-here-generate-with-openssl-rand" ]]; then
        print_warning "Generating JWT_SECRET. Please update your .env.production file."
        JWT_SECRET=$(openssl rand -base64 32)
        echo "JWT_SECRET=$JWT_SECRET"
    fi
    
    if [[ "$JWT_REFRESH_SECRET" == "your-jwt-refresh-secret-here-generate-with-openssl-rand" ]]; then
        print_warning "Generating JWT_REFRESH_SECRET. Please update your .env.production file."
        JWT_REFRESH_SECRET=$(openssl rand -base64 32)
        echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
    fi
    
    if [[ "$REDIS_PASSWORD" == "your-redis-password-here-generate-with-openssl-rand" ]]; then
        print_warning "Generating REDIS_PASSWORD. Please update your .env.production file."
        REDIS_PASSWORD=$(openssl rand -base64 32)
        echo "REDIS_PASSWORD=$REDIS_PASSWORD"
    fi
}

# Setup SSL certificates with Let's Encrypt
setup_ssl() {
    print_step "Setting up SSL certificates..."
    
    # Stop nginx if running
    docker-compose -f deployment/docker-compose.production.yml stop nginx 2>/dev/null || true
    
    # Create certificate directory
    sudo mkdir -p ./deployment/ssl
    sudo chown $USER:$USER ./deployment/ssl
    
    # Check if certificates already exist
    if [[ -f "./deployment/ssl/fullchain.pem" && -f "./deployment/ssl/privkey.pem" ]]; then
        print_status "SSL certificates already exist, skipping certificate generation"
        return 0
    fi
    
    # Create temporary nginx config for ACME challenge
    print_status "Creating temporary nginx configuration for ACME challenge..."
    
    cat > /tmp/nginx-acme.conf <<EOF
server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN} ${ADMIN_DOMAIN};
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF
    
    # Start temporary nginx
    docker run --rm -d \
        --name nginx-acme \
        -p 80:80 \
        -v /tmp/nginx-acme.conf:/etc/nginx/conf.d/default.conf:ro \
        -v ./certbot-webroot:/var/www/certbot \
        nginx:alpine
    
    # Create webroot directory
    mkdir -p ./certbot-webroot
    
    # Get SSL certificate
    print_status "Requesting SSL certificate from Let's Encrypt..."
    docker run --rm \
        -v ./deployment/ssl:/etc/letsencrypt/live/${DOMAIN} \
        -v ./certbot-webroot:/var/www/certbot \
        certbot/certbot:latest \
        certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email ${LETSENCRYPT_EMAIL} \
        --agree-tos \
        --no-eff-email \
        -d ${DOMAIN} \
        -d www.${DOMAIN} \
        -d ${ADMIN_DOMAIN}
    
    # Stop temporary nginx
    docker stop nginx-acme
    
    # Copy certificates to correct location
    sudo cp /etc/letsencrypt/live/${DOMAIN}/fullchain.pem ./deployment/ssl/
    sudo cp /etc/letsencrypt/live/${DOMAIN}/privkey.pem ./deployment/ssl/
    sudo cp /etc/letsencrypt/live/${DOMAIN}/chain.pem ./deployment/ssl/
    sudo chown $USER:$USER ./deployment/ssl/*
    
    print_success "SSL certificates configured"
}

# Update nginx configuration with actual domain
update_nginx_config() {
    print_step "Updating nginx configuration with domain..."
    
    # Update main site configuration
    sed -i "s/YOUR_DOMAIN_HERE/${DOMAIN}/g" deployment/nginx/conf.d/clipping.conf
    
    print_success "Nginx configuration updated"
}

# Create required directories
setup_directories() {
    print_step "Setting up required directories..."
    
    # Create data directories
    mkdir -p ./deployment/data/{redis,uploads,temp,logs,models}
    mkdir -p ./deployment/ssl
    mkdir -p ./deployment/backups
    
    # Set permissions
    chmod 755 ./deployment/data
    chmod 700 ./deployment/ssl
    
    print_success "Directories created"
}

# Pull latest images
pull_images() {
    print_step "Pulling latest Docker images..."
    docker-compose -f deployment/docker-compose.production.yml pull
    print_success "Images pulled"
}

# Build custom images
build_images() {
    print_step "Building application images..."
    docker-compose -f deployment/docker-compose.production.yml build --no-cache
    print_success "Images built"
}

# Start services
start_services() {
    print_step "Starting services..."
    
    # Start core services first
    print_status "Starting core services (Redis, Ollama)..."
    docker-compose -f deployment/docker-compose.production.yml up -d redis ollama
    
    # Wait for core services
    print_status "Waiting for core services to be ready..."
    sleep 10
    
    # Start worker services
    print_status "Starting worker services..."
    docker-compose -f deployment/docker-compose.production.yml up -d queue-service storage-service
    
    # Wait for worker services
    sleep 10
    
    # Start API Gateway
    print_status "Starting API Gateway..."
    docker-compose -f deployment/docker-compose.production.yml up -d api-gateway
    
    # Wait for API Gateway
    sleep 10
    
    # Start workers
    print_status "Starting workers..."
    docker-compose -f deployment/docker-compose.production.yml up -d \
        ai-worker \
        transcription-worker \
        video-worker \
        whisper-timestamp-worker
    
    # Start frontend
    print_status "Starting frontend..."
    docker-compose -f deployment/docker-compose.production.yml up -d frontend
    
    # Start nginx
    print_status "Starting nginx..."
    docker-compose -f deployment/docker-compose.production.yml up -d nginx
    
    print_success "All services started"
}

# Health check
health_check() {
    print_step "Performing health checks..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        print_status "Health check attempt $attempt/$max_attempts..."
        
        # Check API Gateway
        if curl -f -s "http://localhost:3000/health" > /dev/null; then
            print_success "API Gateway is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            print_error "Health check failed after $max_attempts attempts"
            return 1
        fi
        
        sleep 10
        ((attempt++))
    done
    
    # Check frontend
    if curl -f -s "http://localhost:3001/" > /dev/null; then
        print_success "Frontend is healthy"
    else
        print_warning "Frontend health check failed"
    fi
    
    print_success "Health checks completed"
}

# Setup monitoring
setup_monitoring() {
    print_step "Setting up monitoring..."
    
    # Create log rotation for Docker containers
    cat > /tmp/docker-logrotate <<EOF
/var/lib/docker/containers/*/*-json.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
    
    sudo mv /tmp/docker-logrotate /etc/logrotate.d/docker
    
    print_success "Monitoring configured"
}

# Display deployment summary
deployment_summary() {
    print_header "Deployment Summary"
    
    echo "🌐 Website: https://${DOMAIN}"
    echo "🔧 Admin Panel: https://${ADMIN_DOMAIN}"
    echo "📊 API Gateway: https://${DOMAIN}/api"
    echo "💬 WebSocket: wss://${DOMAIN}/ws"
    echo ""
    
    print_header "Service Status"
    docker-compose -f deployment/docker-compose.production.yml ps
    
    echo ""
    print_header "Next Steps"
    echo "1. 🌐 Configure your Cloudflare DNS to point to this server"
    echo "2. 🔐 Set up admin authentication: htpasswd -c deployment/nginx/.htpasswd admin"
    echo "3. 📊 Monitor logs: docker-compose -f deployment/docker-compose.production.yml logs -f"
    echo "4. 🔄 Set up automatic certificate renewal"
    echo "5. 📈 Configure monitoring and alerting"
    echo ""
    
    print_success "Deployment completed successfully! 🎉"
}

# Main deployment process
main() {
    print_header "Starting Production Deployment"
    
    # Pre-deployment checks
    check_env_file
    load_env
    validate_env
    generate_secrets
    
    # Setup infrastructure
    setup_directories
    update_nginx_config
    setup_ssl
    
    # Deploy application
    pull_images
    build_images
    start_services
    
    # Post-deployment
    health_check
    setup_monitoring
    deployment_summary
}

# Handle script arguments
case "${1:-}" in
    "ssl")
        print_header "SSL Certificate Setup"
        load_env
        setup_ssl
        ;;
    "restart")
        print_header "Restarting Services"
        docker-compose -f deployment/docker-compose.production.yml restart
        health_check
        ;;
    "logs")
        docker-compose -f deployment/docker-compose.production.yml logs -f
        ;;
    "status")
        docker-compose -f deployment/docker-compose.production.yml ps
        ;;
    "stop")
        print_header "Stopping Services"
        docker-compose -f deployment/docker-compose.production.yml down
        ;;
    "backup")
        print_header "Creating Backup"
        # Add backup logic here
        print_status "Backup functionality coming soon"
        ;;
    *)
        main
        ;;
esac 