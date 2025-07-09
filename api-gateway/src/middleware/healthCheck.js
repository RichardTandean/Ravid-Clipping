/**
 * Health Check Middleware - Service Health Monitoring
 * 
 * This middleware provides health checking capabilities for:
 * - API Gateway itself (memory, uptime, response time)
 * - Downstream microservices (queue, storage, workers)
 * - System resources (CPU, memory usage)
 * - Database connections (Redis)
 * 
 * Health checks are essential for:
 * - Load balancer decisions
 * - Auto-scaling triggers
 * - Monitoring and alerting systems
 * - Service discovery
 */

const express = require('express');
const axios = require('axios');
const Redis = require('redis');
const logger = require('../utils/logger');

class HealthChecker {
    constructor() {
        this.router = express.Router();
        this.startTime = Date.now();
        this.setupRoutes();
        this.initializeRedisClient();
    }

    /**
     * Initialize Redis client for health checks
     */
    async initializeRedisClient() {
        try {
            this.redisClient = Redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3,
                connectTimeout: 5000
            });

            this.redisClient.on('error', (error) => {
                logger.error('Redis health check client error:', error);
            });

        } catch (error) {
            logger.error('Failed to initialize Redis health check client:', error);
        }
    }

    /**
     * Setup health check routes
     */
    setupRoutes() {
        // Basic health check - quick response for load balancers
        this.router.get('/', this.basicHealthCheck.bind(this));
        
        // Detailed health check - comprehensive service status
        this.router.get('/detailed', this.detailedHealthCheck.bind(this));
        
        // Readiness check - is the service ready to handle requests?
        this.router.get('/ready', this.readinessCheck.bind(this));
        
        // Liveness check - is the service alive?
        this.router.get('/live', this.livenessCheck.bind(this));
        
        // Specific service health checks
        this.router.get('/services/:serviceName', this.serviceHealthCheck.bind(this));
    }

    /**
     * Basic health check - fast response for load balancers
     * Returns: 200 OK with minimal information
     */
    async basicHealthCheck(req, res) {
        const startTime = Date.now();
        
        try {
            const health = {
                status: 'healthy',
                service: 'api-gateway',
                timestamp: new Date().toISOString(),
                uptime: this.getUptime(),
                version: '1.0.0'
            };

            const responseTime = Date.now() - startTime;
            health.responseTime = `${responseTime}ms`;

            res.status(200).json(health);
            
            logger.debug('Basic health check completed', { responseTime });
            
        } catch (error) {
            logger.error('Basic health check failed:', error);
            res.status(503).json({
                status: 'unhealthy',
                service: 'api-gateway',
                error: 'Health check failed',
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Detailed health check - comprehensive service status
     * Returns: Detailed information about all system components
     */
    async detailedHealthCheck(req, res) {
        const startTime = Date.now();
        
        try {
            const health = {
                status: 'healthy',
                service: 'api-gateway',
                timestamp: new Date().toISOString(),
                uptime: this.getUptime(),
                version: '1.0.0',
                system: await this.getSystemHealth(),
                services: await this.getServicesHealth(),
                dependencies: await this.getDependenciesHealth()
            };

            // Determine overall health status
            const hasUnhealthyServices = Object.values(health.services).some(service => service.status !== 'healthy');
            const hasUnhealthyDependencies = Object.values(health.dependencies).some(dep => dep.status !== 'healthy');
            
            if (hasUnhealthyServices || hasUnhealthyDependencies) {
                health.status = 'degraded';
            }

            const responseTime = Date.now() - startTime;
            health.responseTime = `${responseTime}ms`;

            const statusCode = health.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);
            
            logger.info('Detailed health check completed', { 
                status: health.status, 
                responseTime 
            });
            
        } catch (error) {
            logger.error('Detailed health check failed:', error);
            res.status(503).json({
                status: 'unhealthy',
                service: 'api-gateway',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Readiness check - is the service ready to handle requests?
     */
    async readinessCheck(req, res) {
        try {
            // Check if critical dependencies are available
            const redisHealth = await this.checkRedisHealth();
            const criticalServices = await this.checkCriticalServices();

            const isReady = redisHealth.status === 'healthy' && 
                           criticalServices.every(service => service.status === 'healthy');

            const result = {
                ready: isReady,
                service: 'api-gateway',
                timestamp: new Date().toISOString(),
                checks: {
                    redis: redisHealth,
                    services: criticalServices
                }
            };

            const statusCode = isReady ? 200 : 503;
            res.status(statusCode).json(result);
            
        } catch (error) {
            logger.error('Readiness check failed:', error);
            res.status(503).json({
                ready: false,
                service: 'api-gateway',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Liveness check - is the service alive?
     */
    async livenessCheck(req, res) {
        // Simple check - if we can respond, we're alive
        res.status(200).json({
            alive: true,
            service: 'api-gateway',
            timestamp: new Date().toISOString(),
            uptime: this.getUptime()
        });
    }

    /**
     * Check health of a specific service
     */
    async serviceHealthCheck(req, res) {
        const { serviceName } = req.params;
        
        try {
            const serviceHealth = await this.checkSpecificService(serviceName);
            
            const statusCode = serviceHealth.status === 'healthy' ? 200 : 503;
            res.status(statusCode).json(serviceHealth);
            
        } catch (error) {
            logger.error(`Health check failed for service ${serviceName}:`, error);
            res.status(503).json({
                service: serviceName,
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Get system health information
     */
    async getSystemHealth() {
        const memUsage = process.memoryUsage();
        
        return {
            memory: {
                used: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
                total: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB',
                external: Math.round(memUsage.external / 1024 / 1024) + 'MB',
                rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
            },
            cpu: {
                usage: process.cpuUsage()
            },
            uptime: this.getUptime(),
            nodeVersion: process.version,
            platform: process.platform
        };
    }

    /**
     * Get health status of all microservices
     */
    async getServicesHealth() {
        const services = {
            'queue-service': process.env.QUEUE_SERVICE_URL || 'http://queue-service:3004',
            'storage-service': process.env.STORAGE_SERVICE_URL || 'http://storage-service:3005'
        };

        const healthChecks = {};
        
        for (const [serviceName, serviceUrl] of Object.entries(services)) {
            try {
                healthChecks[serviceName] = await this.checkServiceHealth(serviceName, serviceUrl);
            } catch (error) {
                healthChecks[serviceName] = {
                    status: 'unhealthy',
                    error: error.message,
                    lastChecked: new Date().toISOString()
                };
            }
        }

        return healthChecks;
    }

    /**
     * Get health status of dependencies (Redis, etc.)
     */
    async getDependenciesHealth() {
        return {
            redis: await this.checkRedisHealth()
        };
    }

    /**
     * Check health of a specific service
     */
    async checkServiceHealth(serviceName, serviceUrl) {
        const startTime = Date.now();
        
        try {
            const response = await axios.get(`${serviceUrl}/health`, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'api-gateway-health-check'
                }
            });

            const responseTime = Date.now() - startTime;

            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
                statusCode: response.status,
                lastChecked: new Date().toISOString(),
                version: response.data.version || 'unknown'
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            return {
                status: 'unhealthy',
                error: error.message,
                responseTime: `${responseTime}ms`,
                lastChecked: new Date().toISOString()
            };
        }
    }

    /**
     * Check Redis health
     */
    async checkRedisHealth() {
        const startTime = Date.now();
        
        try {
            if (!this.redisClient) {
                throw new Error('Redis client not initialized');
            }

            await this.redisClient.ping();
            const responseTime = Date.now() - startTime;

            return {
                status: 'healthy',
                responseTime: `${responseTime}ms`,
                lastChecked: new Date().toISOString()
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            
            return {
                status: 'unhealthy',
                error: error.message,
                responseTime: `${responseTime}ms`,
                lastChecked: new Date().toISOString()
            };
        }
    }

    /**
     * Check critical services for readiness
     */
    async checkCriticalServices() {
        // For readiness, we only check absolutely critical services
        const criticalServices = ['queue-service'];
        const results = [];

        for (const serviceName of criticalServices) {
            const serviceUrl = process.env[`${serviceName.toUpperCase().replace('-', '_')}_URL`] || 
                              `http://${serviceName}:${serviceName === 'queue-service' ? '3004' : '3005'}`;
            
            try {
                const health = await this.checkServiceHealth(serviceName, serviceUrl);
                results.push({ service: serviceName, ...health });
            } catch (error) {
                results.push({
                    service: serviceName,
                    status: 'unhealthy',
                    error: error.message
                });
            }
        }

        return results;
    }

    /**
     * Check health of a specific service by name
     */
    async checkSpecificService(serviceName) {
        const serviceUrls = {
            'queue': process.env.QUEUE_SERVICE_URL || 'http://queue-service:3004',
            'storage': process.env.STORAGE_SERVICE_URL || 'http://storage-service:3005',
            'redis': null // Special case for Redis
        };

        if (serviceName === 'redis') {
            return await this.checkRedisHealth();
        }

        const serviceUrl = serviceUrls[serviceName];
        if (!serviceUrl) {
            throw new Error(`Unknown service: ${serviceName}`);
        }

        return await this.checkServiceHealth(serviceName, serviceUrl);
    }

    /**
     * Get formatted uptime
     */
    getUptime() {
        const uptimeMs = Date.now() - this.startTime;
        const days = Math.floor(uptimeMs / (24 * 60 * 60 * 1000));
        const hours = Math.floor((uptimeMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((uptimeMs % (60 * 60 * 1000)) / (60 * 1000));
        const seconds = Math.floor((uptimeMs % (60 * 1000)) / 1000);

        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }
}

// Create and export the router
const healthChecker = new HealthChecker();
module.exports = healthChecker.router; 