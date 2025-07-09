# 🚀 Production Deployment Guide

Complete guide for deploying the Video Clipping Microservices Platform to a production VPS with Cloudflare integration.

## 📋 Prerequisites

### VPS Requirements
- **OS**: Ubuntu 20.04+ or Debian 11+
- **RAM**: Minimum 8GB (16GB recommended)
- **CPU**: Minimum 4 cores (8 cores recommended)
- **Storage**: Minimum 100GB SSD
- **Network**: Good internet connection with static IP

### Required Accounts
- **VPS Provider**: DigitalOcean, Linode, AWS EC2, etc.
- **Domain**: Registered domain name
- **Cloudflare**: Free account with domain added

## 🎯 Quick Start

### 1. VPS Initial Setup

Connect to your fresh VPS:
```bash
ssh root@YOUR_VPS_IP
# or
ssh your_user@YOUR_VPS_IP
```

Run the VPS setup script:
```bash
# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/your-repo/clipping/main/deployment/vps-setup.sh | bash

# Or if you have the repository
cd /opt/clipping
chmod +x deployment/vps-setup.sh
./deployment/vps-setup.sh
```

**Important**: Log out and log back in after the setup to apply Docker group membership.

### 2. Clone Repository

```bash
cd /opt/clipping
git clone https://github.com/your-username/clipping.git .
```

### 3. Configure Environment

```bash
# Copy the environment template
cp deployment/production.env.template .env.production

# Edit the configuration
nano .env.production
```

**Required Configuration:**
```env
DOMAIN=yourdomain.com
ADMIN_DOMAIN=admin.yourdomain.com
LETSENCRYPT_EMAIL=admin@yourdomain.com
```

**Generate Secrets:**
```bash
# JWT Secret
echo "JWT_SECRET=$(openssl rand -base64 32)"

# JWT Refresh Secret  
echo "JWT_REFRESH_SECRET=$(openssl rand -base64 32)"

# Redis Password
echo "REDIS_PASSWORD=$(openssl rand -base64 32)"
```

### 4. Deploy Application

```bash
# Make deployment script executable
chmod +x deployment/deploy.sh

# Run deployment
./deployment/deploy.sh
```

### 5. Configure Cloudflare

Follow the [Cloudflare Setup Guide](./CLOUDFLARE_SETUP.md) to:
- Configure DNS records
- Set up SSL/TLS
- Configure security rules
- Optimize performance

## 📖 Detailed Setup Guide

### Step 1: VPS Preparation

#### A. Create Non-Root User (if using root)

```bash
# Create user
adduser deploy
usermod -aG sudo deploy

# Switch to new user
su - deploy
```

#### B. Secure SSH (Recommended)

```bash
# Generate SSH key on your local machine
ssh-keygen -t ed25519 -C "your-email@example.com"

# Copy public key to VPS
ssh-copy-id deploy@YOUR_VPS_IP

# Disable password authentication (optional)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart ssh
```

#### C. Update System

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

### Step 2: Environment Configuration

#### A. Database Setup (if using external DB)

For Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

For PostgreSQL:
```env
DATABASE_URL=postgresql://username:password@host:5432/clipping_db
```

#### B. Storage Configuration

**Local Storage (Default):**
```env
STORAGE_TYPE=local
```

**AWS S3:**
```env
STORAGE_TYPE=aws
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name
```

**Google Cloud Storage:**
```env
STORAGE_TYPE=gcs
GCS_PROJECT_ID=your-project-id
GCS_KEY_FILE=/path/to/service-account-key.json
GCS_BUCKET=your-bucket-name
```

### Step 3: SSL Certificate Setup

#### A. Let's Encrypt (Automatic)

The deployment script automatically handles Let's Encrypt certificates:

```bash
# SSL setup is included in deployment
./deployment/deploy.sh
```

#### B. Cloudflare Origin Certificates (Recommended)

1. Generate Origin Certificate in Cloudflare dashboard
2. Save certificates to VPS:

```bash
# Create SSL directory
mkdir -p deployment/ssl

# Save Cloudflare origin certificate
nano deployment/ssl/fullchain.pem
# Paste certificate content

# Save private key
nano deployment/ssl/privkey.pem
# Paste private key content

# Set permissions
chmod 600 deployment/ssl/*.pem
```

### Step 4: Advanced Configuration

#### A. Admin Interface Setup

```bash
# Create admin password
sudo htpasswd -c deployment/nginx/.htpasswd admin

# Update IP restrictions in nginx config
nano deployment/nginx/conf.d/clipping.conf
# Add your IP address to the allow list
```

#### B. Monitoring Setup

```bash
# Enable admin services
docker-compose -f deployment/docker-compose.production.yml --profile admin up -d
```

Access admin interfaces:
- Queue Dashboard: `https://admin.yourdomain.com/queue/`
- Redis Commander: `https://admin.yourdomain.com/redis/`

#### C. Backup Configuration

```bash
# Create backup script
nano scripts/backup.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /opt/clipping/scripts/backup.sh
```

## 🔧 Management Commands

### Service Management

```bash
# Start all services
./deployment/deploy.sh

# Restart services
./deployment/deploy.sh restart

# Stop services
./deployment/deploy.sh stop

# View service status
./deployment/deploy.sh status

# View logs
./deployment/deploy.sh logs
```

### Individual Service Control

```bash
# Using docker-compose directly
docker-compose -f deployment/docker-compose.production.yml ps
docker-compose -f deployment/docker-compose.production.yml logs frontend
docker-compose -f deployment/docker-compose.production.yml restart api-gateway
```

### SSL Certificate Management

```bash
# Renew SSL certificates
./deployment/deploy.sh ssl

# Check certificate expiry
openssl x509 -in deployment/ssl/fullchain.pem -text -noout | grep "Not After"
```

## 📊 Monitoring & Maintenance

### Health Checks

```bash
# API Gateway health
curl https://yourdomain.com/api/health

# Service status
docker-compose -f deployment/docker-compose.production.yml ps

# Resource usage
docker stats

# Disk usage
df -h
```

### Log Management

```bash
# View real-time logs
docker-compose -f deployment/docker-compose.production.yml logs -f

# Specific service logs
docker-compose -f deployment/docker-compose.production.yml logs frontend

# Nginx access logs
tail -f /var/log/nginx/access.log

# System logs
sudo journalctl -f
```

### Performance Monitoring

```bash
# System resources
htop

# Docker resource usage
docker stats

# Nginx status
sudo systemctl status nginx

# Database connections (if using external DB)
# Connect to your database and check active connections
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Services Not Starting

**Check logs:**
```bash
docker-compose -f deployment/docker-compose.production.yml logs
```

**Common causes:**
- Environment variables not set
- Port conflicts
- Insufficient resources
- Docker daemon not running

#### 2. SSL Certificate Issues

**Symptoms:** Browser shows "Not Secure" or certificate errors

**Solutions:**
```bash
# Check certificate status
./deployment/deploy.sh ssl

# Verify Cloudflare SSL settings
# Ensure SSL/TLS mode is "Full (strict)"

# Check certificate files
ls -la deployment/ssl/
```

#### 3. High Memory Usage

**Check memory usage:**
```bash
free -h
docker stats
```

**Solutions:**
- Reduce worker concurrency in environment
- Add swap space
- Upgrade VPS plan

#### 4. Slow Video Processing

**Symptoms:** Video uploads taking too long

**Solutions:**
- Check CPU usage during processing
- Increase video worker concurrency
- Optimize video processing settings
- Consider GPU-enabled VPS

### Debug Mode

Enable debug logging:
```bash
# Edit environment
nano .env.production

# Set debug mode
DEBUG=true
LOG_LEVEL=debug

# Restart services
./deployment/deploy.sh restart
```

## 🔐 Security Checklist

### Server Security

- [ ] SSH key-based authentication enabled
- [ ] Root login disabled
- [ ] Firewall configured (UFW)
- [ ] Fail2ban active
- [ ] Regular security updates scheduled
- [ ] Non-standard SSH port (optional)

### Application Security

- [ ] Strong JWT secrets generated
- [ ] Redis password set
- [ ] Admin interfaces password-protected
- [ ] IP restrictions on admin interfaces
- [ ] HTTPS enforced
- [ ] Security headers configured

### Cloudflare Security

- [ ] WAF rules configured
- [ ] Bot protection enabled
- [ ] Rate limiting active
- [ ] DDoS protection enabled
- [ ] SSL/TLS Full (strict) mode

## 📈 Scaling Considerations

### Horizontal Scaling

For higher loads, consider:

1. **Load Balancer**: Add multiple VPS instances behind a load balancer
2. **Database Scaling**: Use managed database services
3. **Storage Scaling**: Move to cloud storage (S3, GCS)
4. **CDN**: Use Cloudflare for static content delivery

### Vertical Scaling

Upgrade VPS resources:
- More CPU cores for video processing
- More RAM for concurrent operations
- SSD storage for better I/O performance

## 📞 Support

### Getting Help

1. **Check logs first**: Most issues are revealed in logs
2. **Review configuration**: Ensure all environment variables are correct
3. **Test connectivity**: Verify network connectivity and DNS resolution
4. **Check resources**: Monitor CPU, memory, and disk usage

### Useful Commands

```bash
# Complete system status
./deployment/deploy.sh status

# Detailed service logs
docker-compose -f deployment/docker-compose.production.yml logs --timestamps

# Resource usage
docker stats --no-stream

# Network connectivity
ping yourdomain.com
curl -I https://yourdomain.com
```

---

## 🎉 Congratulations!

Your Video Clipping Microservices Platform is now deployed and ready for production use!

Visit your domain to start using the platform and monitor the admin dashboard for system health and performance.

Remember to:
- Set up regular backups
- Monitor system resources
- Keep dependencies updated
- Review security logs regularly 