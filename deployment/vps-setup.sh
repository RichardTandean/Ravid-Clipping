#!/bin/bash

# VPS Setup Script for Video Clipping Microservices Platform
# This script sets up a fresh VPS with all required dependencies

set -e  # Exit on any error

echo "🚀 Starting VPS setup for Video Clipping Microservices Platform..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root for security reasons"
   print_status "Please run as a regular user with sudo privileges"
   exit 1
fi

# Get server information
print_header "Server Information"
echo "Hostname: $(hostname)"
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Architecture: $(uname -m)"
echo "Memory: $(free -h | grep '^Mem:' | awk '{print $2}')"
echo "Disk: $(df -h / | awk 'NR==2{print $2}')"
echo ""

# Update system packages
print_header "Updating System Packages"
sudo apt update && sudo apt upgrade -y
print_status "System packages updated successfully"

# Install essential packages
print_header "Installing Essential Packages"
sudo apt install -y \
    curl \
    wget \
    git \
    unzip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    ufw \
    htop \
    tree \
    nano \
    vim \
    fail2ban \
    certbot \
    python3-certbot-nginx

print_status "Essential packages installed"

# Configure firewall
print_header "Configuring Firewall"
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Allow development ports (will be restricted later)
sudo ufw allow 3000/tcp  # API Gateway
sudo ufw allow 3004/tcp  # Queue Dashboard (will be secured)
sudo ufw allow 8081/tcp  # Redis Commander (will be secured)
sudo ufw --force enable
print_status "Firewall configured"

# Install Docker
print_header "Installing Docker"
if ! command -v docker &> /dev/null; then
    # Remove old versions
    sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker Engine
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    
    print_status "Docker installed successfully"
else
    print_status "Docker already installed"
fi

# Install Docker Compose (standalone)
print_header "Installing Docker Compose"
if ! command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE_VERSION="2.24.1"
    sudo curl -L "https://github.com/docker/compose/releases/download/v${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_status "Docker Compose installed successfully"
else
    print_status "Docker Compose already installed"
fi

# Install Node.js (Latest LTS)
print_header "Installing Node.js"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt install -y nodejs
    print_status "Node.js installed successfully"
else
    print_status "Node.js already installed"
fi

# Install Python 3 and pip (should be available, but ensure latest)
print_header "Installing Python"
sudo apt install -y python3 python3-pip python3-venv python3-dev
print_status "Python installed successfully"

# Install Nginx
print_header "Installing Nginx"
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
print_status "Nginx installed and started"

# Install Redis CLI (for debugging)
print_header "Installing Redis CLI"
sudo apt install -y redis-tools
print_status "Redis CLI installed"

# Install FFmpeg (required for video processing)
print_header "Installing FFmpeg"
sudo apt install -y ffmpeg
print_status "FFmpeg installed"

# Install Ollama (for AI processing)
print_header "Installing Ollama"
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.ai/install.sh | sh
    print_status "Ollama installed successfully"
    
    # Start Ollama service
    sudo systemctl enable ollama
    sudo systemctl start ollama
    
    print_status "Downloading Ollama model (this may take a while)..."
    # Download the model we use in the project
    ollama pull llama3.2:3b
    print_status "Ollama model downloaded"
else
    print_status "Ollama already installed"
fi

# Configure fail2ban
print_header "Configuring fail2ban"
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
print_status "fail2ban configured and started"

# Create application directory
print_header "Setting up Application Directory"
APP_DIR="/opt/clipping"
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR
print_status "Application directory created at $APP_DIR"

# Create logs directory
sudo mkdir -p /var/log/clipping
sudo chown $USER:$USER /var/log/clipping
print_status "Logs directory created"

# Create data directory for persistent storage
sudo mkdir -p /var/lib/clipping/{redis,uploads,temp,models}
sudo chown -R $USER:$USER /var/lib/clipping
print_status "Data directories created"

# Set up log rotation
print_header "Setting up Log Rotation"
sudo tee /etc/logrotate.d/clipping > /dev/null <<EOF
/var/log/clipping/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    copytruncate
    create 644 $USER $USER
}
EOF
print_status "Log rotation configured"

# Display system information
print_header "Installation Summary"
echo "Docker version: $(docker --version)"
echo "Docker Compose version: $(docker-compose --version)"
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Python version: $(python3 --version)"
echo "Nginx version: $(nginx -v 2>&1)"
echo "FFmpeg version: $(ffmpeg -version | head -n1)"
echo "Ollama status: $(systemctl is-active ollama)"

print_header "Next Steps"
echo "1. Log out and log back in to apply Docker group membership"
echo "2. Clone your project to $APP_DIR"
echo "3. Configure environment variables"
echo "4. Set up SSL certificates with Cloudflare"
echo "5. Deploy the microservices"

print_warning "Important Security Notes:"
echo "- Change default SSH port if not already done"
echo "- Set up SSH key authentication and disable password auth"
echo "- Configure proper firewall rules for production"
echo "- Set up monitoring and alerting"
echo "- Regular security updates"

echo ""
print_status "VPS setup completed successfully! 🎉"
print_status "Please log out and log back in before proceeding with deployment." 