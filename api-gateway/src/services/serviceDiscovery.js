/**
 * Service Discovery - Microservice Registry & Health Management
 * 
 * This service provides automatic discovery and monitoring of microservices:
 * - Service registration and deregistration
 * - Health checking and status monitoring
 * - Load balancing across service instances
 * - Circuit breaker pattern for failing services
 * - Service endpoint mapping and routing
 * 
 * Service Discovery is essential for:
 * - Dynamic scaling (services come and go)
 * - Health-based routing (avoid unhealthy instances)
 * - Load distribution across multiple instances
 * - Fault tolerance and resilience
 */

const axios = require('axios');
const logger = require('../utils/logger');

class ServiceDiscovery {
    constructor() {
        this.services = new Map();
        this.healthCheckInterval = 30000; // 30 seconds
        this.healthCheckTimeout = 5000; // 5 seconds
        this.maxFailures = 3; // Circuit breaker threshold
        this.isInitialized = false;
        
        this.initializeServices();
    }

    /**
     * Initialize known services and start health monitoring
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            // Register known services from environment
            await this.registerKnownServices();
            
            // Start health checking
            this.startHealthChecking();
            
            this.isInitialized = true;
            logger.info('Service discovery initialized successfully');
            
        } catch (error) {
            logger.error('Failed to initialize service discovery:', error);
            throw error;
        }
    }

    /**
     * Register known services from configuration
     */
    async registerKnownServices() {
        const knownServices = {
            'queue-service': {
                name: 'queue-service',
                type: 'queue',
                baseUrl: process.env.QUEUE_SERVICE_URL || 'http://queue-service:3004',
                healthEndpoint: '/health',
                priority: 1,
                weight: 100
            },
            'storage-service': {
                name: 'storage-service',
                type: 'storage',
                baseUrl: process.env.STORAGE_SERVICE_URL || 'http://storage-service:3005',
                healthEndpoint: '/health',
                priority: 1,
                weight: 100
            }
        };

        for (const [serviceName, config] of Object.entries(knownServices)) {
            await this.registerService(serviceName, config);
        }

        logger.info(`Registered ${Object.keys(knownServices).length} known services`);
    }

    /**
     * Register a new service
     */
    async registerService(serviceName, config) {
        const serviceInfo = {
            name: serviceName,
            type: config.type || 'unknown',
            baseUrl: config.baseUrl,
            healthEndpoint: config.healthEndpoint || '/health',
            priority: config.priority || 1,
            weight: config.weight || 100,
            status: 'unknown',
            lastHealthCheck: null,
            consecutiveFailures: 0,
            responseTime: null,
            registeredAt: new Date().toISOString(),
            metadata: config.metadata || {}
        };

        this.services.set(serviceName, serviceInfo);
        
        // Perform initial health check
        await this.checkServiceHealth(serviceName);
        
        logger.info(`Service registered: ${serviceName} at ${config.baseUrl}`);
        return serviceInfo;
    }

    /**
     * Deregister a service
     */
    deregisterService(serviceName) {
        if (this.services.has(serviceName)) {
            this.services.delete(serviceName);
            logger.info(`Service deregistered: ${serviceName}`);
            return true;
        }
        return false;
    }

    /**
     * Get service information by name
     */
    getService(serviceName) {
        return this.services.get(serviceName);
    }

    /**
     * Get all services with optional filtering
     */
    getServices(filter = {}) {
        const services = Array.from(this.services.values());
        
        if (filter.status) {
            return services.filter(service => service.status === filter.status);
        }
        
        if (filter.type) {
            return services.filter(service => service.type === filter.type);
        }
        
        return services;
    }

    /**
     * Get healthy services for load balancing
     */
    getHealthyServices(serviceName = null) {
        if (serviceName) {
            const service = this.getService(serviceName);
            return service && service.status === 'healthy' ? [service] : [];
        }
        
        return this.getServices({ status: 'healthy' });
    }

    /**
     * Get service URL for routing
     */
    getServiceUrl(serviceName) {
        const service = this.getService(serviceName);
        
        if (!service) {
            throw new Error(`Service not found: ${serviceName}`);
        }
        
        if (service.status !== 'healthy') {
            throw new Error(`Service unavailable: ${serviceName} (status: ${service.status})`);
        }
        
        return service.baseUrl;
    }

    /**
     * Check health of a specific service
     */
    async checkServiceHealth(serviceName) {
        const service = this.services.get(serviceName);
        
        if (!service) {
            logger.warn(`Attempted to check health of unknown service: ${serviceName}`);
            return false;
        }

        const startTime = Date.now();
        
        try {
            const healthUrl = `${service.baseUrl}${service.healthEndpoint}`;
            
            const response = await axios.get(healthUrl, {
                timeout: this.healthCheckTimeout,
                headers: {
                    'User-Agent': 'api-gateway-service-discovery'
                }
            });

            const responseTime = Date.now() - startTime;
            
            // Update service status
            service.status = 'healthy';
            service.lastHealthCheck = new Date().toISOString();
            service.consecutiveFailures = 0;
            service.responseTime = responseTime;

            logger.debug(`Health check passed for ${serviceName}`, {
                responseTime: `${responseTime}ms`,
                statusCode: response.status
            });

            return true;

        } catch (error) {
            const responseTime = Date.now() - startTime;
            service.consecutiveFailures++;
            service.lastHealthCheck = new Date().toISOString();
            service.responseTime = responseTime;

            // Implement circuit breaker pattern
            if (service.consecutiveFailures >= this.maxFailures) {
                service.status = 'unhealthy';
                logger.warn(`Service marked as unhealthy: ${serviceName}`, {
                    consecutiveFailures: service.consecutiveFailures,
                    error: error.message
                });
            } else {
                service.status = 'degraded';
                logger.debug(`Service health check failed: ${serviceName}`, {
                    attempt: service.consecutiveFailures,
                    error: error.message
                });
            }

            return false;
        }
    }

    /**
     * Check health of all services
     */
    async checkAllServicesHealth() {
        const healthChecks = [];
        
        for (const serviceName of this.services.keys()) {
            healthChecks.push(this.checkServiceHealth(serviceName));
        }

        const results = await Promise.allSettled(healthChecks);
        
        const summary = {
            total: results.length,
            healthy: 0,
            unhealthy: 0,
            degraded: 0
        };

        this.services.forEach(service => {
            summary[service.status]++;
        });

        logger.debug('Health check summary:', summary);
        return summary;
    }

    /**
     * Start periodic health checking
     */
    startHealthChecking() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }

        this.healthCheckTimer = setInterval(async () => {
            try {
                await this.checkAllServicesHealth();
            } catch (error) {
                logger.error('Error during periodic health check:', error);
            }
        }, this.healthCheckInterval);

        logger.info(`Started health checking with ${this.healthCheckInterval}ms interval`);
    }

    /**
     * Stop health checking
     */
    stopHealthChecking() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
            logger.info('Stopped health checking');
        }
    }

    /**
     * Get service status for monitoring
     */
    async getServiceStatus() {
        const services = {};
        
        for (const [name, service] of this.services.entries()) {
            services[name] = {
                status: service.status,
                lastHealthCheck: service.lastHealthCheck,
                responseTime: service.responseTime ? `${service.responseTime}ms` : null,
                consecutiveFailures: service.consecutiveFailures,
                baseUrl: service.baseUrl,
                type: service.type
            };
        }

        return services;
    }

    /**
     * Select service instance for load balancing
     * Currently implements round-robin, can be extended for other strategies
     */
    selectServiceInstance(serviceName, strategy = 'round-robin') {
        const healthyServices = this.getHealthyServices(serviceName);
        
        if (healthyServices.length === 0) {
            throw new Error(`No healthy instances available for service: ${serviceName}`);
        }

        // For single service instances, return the only healthy one
        if (healthyServices.length === 1) {
            return healthyServices[0];
        }

        // Implement load balancing strategies
        switch (strategy) {
            case 'round-robin':
                return this.roundRobinSelection(healthyServices, serviceName);
            
            case 'weighted':
                return this.weightedSelection(healthyServices);
            
            case 'least-response-time':
                return this.leastResponseTimeSelection(healthyServices);
            
            default:
                return healthyServices[0];
        }
    }

    /**
     * Round-robin load balancing
     */
    roundRobinSelection(services, serviceName) {
        if (!this.roundRobinCounters) {
            this.roundRobinCounters = {};
        }

        if (!this.roundRobinCounters[serviceName]) {
            this.roundRobinCounters[serviceName] = 0;
        }

        const index = this.roundRobinCounters[serviceName] % services.length;
        this.roundRobinCounters[serviceName]++;

        return services[index];
    }

    /**
     * Weighted load balancing
     */
    weightedSelection(services) {
        const totalWeight = services.reduce((sum, service) => sum + service.weight, 0);
        let random = Math.random() * totalWeight;

        for (const service of services) {
            random -= service.weight;
            if (random <= 0) {
                return service;
            }
        }

        return services[0]; // Fallback
    }

    /**
     * Least response time selection
     */
    leastResponseTimeSelection(services) {
        return services.reduce((fastest, service) => {
            if (!fastest.responseTime || !service.responseTime) {
                return fastest.responseTime ? fastest : service;
            }
            return service.responseTime < fastest.responseTime ? service : fastest;
        });
    }

    /**
     * Route request to appropriate service
     */
    async routeRequest(serviceName, path, method = 'GET', data = null, headers = {}) {
        try {
            const service = this.selectServiceInstance(serviceName);
            const url = `${service.baseUrl}${path}`;
            
            const config = {
                method,
                url,
                headers: {
                    ...headers,
                    'X-Forwarded-By': 'api-gateway',
                    'X-Service-Discovery': 'true'
                },
                timeout: 30000
            };

            if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
                config.data = data;
            }

            const startTime = Date.now();
            const response = await axios(config);
            const responseTime = Date.now() - startTime;

            logger.logServiceCall(serviceName, path, method, response.status, responseTime);

            return response;

        } catch (error) {
            logger.error(`Service routing failed: ${serviceName}${path}`, error);
            
            // Update service health if it's a connection error
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                const service = this.getService(serviceName);
                if (service) {
                    service.consecutiveFailures++;
                    if (service.consecutiveFailures >= this.maxFailures) {
                        service.status = 'unhealthy';
                    }
                }
            }

            throw error;
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopHealthChecking();
        this.services.clear();
        logger.info('Service discovery cleaned up');
    }
}

module.exports = ServiceDiscovery; 