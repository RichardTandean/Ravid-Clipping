/**
 * Service Router - Intelligent Request Routing
 * 
 * This router handles intelligent routing of requests to appropriate microservices:
 * - URL-based routing patterns
 * - Service discovery integration
 * - Load balancing and failover
 * - Request/response transformation
 * - Timeout and retry logic
 * 
 * Routing Strategy:
 * - /api/queue/* -> queue-service
 * - /api/storage/* -> storage-service
 * - /api/auth/* -> handled locally by gateway
 * - Dynamic service resolution based on health
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('../utils/logger');
const { asyncErrorHandler } = require('../middleware/errorHandler');

class ServiceRouter {
    constructor(serviceDiscovery) {
        this.serviceDiscovery = serviceDiscovery;
        this.router = express.Router();
        this.setupRoutes();
    }

    /**
     * Setup routing rules and patterns
     */
    setupRoutes() {
        // Queue service routes
        this.router.use('/queue/*', asyncErrorHandler(this.createServiceProxy('queue-service')));
        
        // Storage service routes
        this.router.use('/storage/*', asyncErrorHandler(this.createServiceProxy('storage-service')));
        
        // Dynamic routing for other services
        this.router.use('/:serviceName/*', asyncErrorHandler(this.dynamicServiceRoute.bind(this)));
        
        logger.info('Service router routes configured');
    }

    /**
     * Create HTTP proxy middleware for a specific service
     */
    createServiceProxy(serviceName) {
        return createProxyMiddleware({
            target: 'http://placeholder', // This will be dynamically resolved
            changeOrigin: true,
            pathRewrite: (path, req) => {
                // Remove the service prefix from the path
                // e.g., /api/queue/jobs -> /api/jobs
                const segments = path.split('/');
                const serviceIndex = segments.findIndex(segment => 
                    segment === 'queue' || segment === 'storage'
                );
                
                if (serviceIndex > 0) {
                    segments.splice(serviceIndex, 1);
                    return segments.join('/');
                }
                
                return path;
            },
            
            // Dynamic target resolution
            router: async (req) => {
                try {
                    const serviceUrl = this.serviceDiscovery.getServiceUrl(serviceName);
                    logger.debug(`Routing ${req.method} ${req.path} to ${serviceName} at ${serviceUrl}`);
                    return serviceUrl;
                } catch (error) {
                    logger.error(`Failed to resolve service URL for ${serviceName}:`, error);
                    throw error;
                }
            },

            // Request transformation
            onProxyReq: (proxyReq, req, res) => {
                // Add headers for service identification
                proxyReq.setHeader('X-Forwarded-By', 'api-gateway');
                proxyReq.setHeader('X-Original-URL', req.originalUrl);
                proxyReq.setHeader('X-Request-ID', req.correlationId || 'unknown');
                
                if (req.user) {
                    proxyReq.setHeader('X-User-ID', req.user.id);
                    proxyReq.setHeader('X-User-Roles', req.user.roles?.join(',') || '');
                }

                // Log the proxied request
                logger.debug(`Proxying request to ${serviceName}`, {
                    method: req.method,
                    originalUrl: req.originalUrl,
                    targetUrl: `${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`,
                    userAgent: req.get('User-Agent'),
                    correlationId: req.correlationId
                });
            },

            // Response transformation
            onProxyRes: (proxyRes, req, res) => {
                // Add response headers
                proxyRes.headers['X-Served-By'] = serviceName;
                proxyRes.headers['X-Gateway'] = 'api-gateway';
                
                // Log the response
                logger.debug(`Response from ${serviceName}`, {
                    statusCode: proxyRes.statusCode,
                    method: req.method,
                    originalUrl: req.originalUrl,
                    correlationId: req.correlationId
                });
            },

            // Error handling
            onError: (err, req, res) => {
                logger.error(`Proxy error for ${serviceName}:`, {
                    error: err.message,
                    code: err.code,
                    method: req.method,
                    originalUrl: req.originalUrl,
                    correlationId: req.correlationId
                });

                // Create upstream error for error handler
                const upstreamError = new Error(`${serviceName} service error: ${err.message}`);
                upstreamError.isUpstreamError = true;
                upstreamError.service = serviceName;
                upstreamError.statusCode = err.code === 'ECONNREFUSED' ? 503 : 502;
                upstreamError.retryable = true;

                // Send error response
                if (!res.headersSent) {
                    res.status(upstreamError.statusCode).json({
                        error: {
                            type: 'upstream_error',
                            message: upstreamError.message,
                            service: serviceName,
                            retryable: true,
                            correlationId: req.correlationId,
                            timestamp: new Date().toISOString()
                        }
                    });
                }
            },

            // Timeout configuration
            timeout: 30000,
            proxyTimeout: 30000,

            // Keep alive for better performance
            secure: false,
            ws: false, // WebSocket support (can be enabled if needed)
            
            // Logging
            logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'warn'
        });
    }

    /**
     * Handle dynamic service routing based on URL
     */
    async dynamicServiceRoute(req, res, next) {
        try {
            const serviceName = req.params.serviceName;
            const path = req.originalUrl.replace(`/api/${serviceName}`, '');

            // Check if service exists and is healthy
            const service = this.serviceDiscovery.getService(serviceName);
            
            if (!service) {
                return res.status(404).json({
                    error: {
                        type: 'service_not_found',
                        message: `Service not found: ${serviceName}`,
                        availableServices: this.getAvailableServices(),
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            if (service.status !== 'healthy') {
                return res.status(503).json({
                    error: {
                        type: 'service_unavailable',
                        message: `Service unavailable: ${serviceName} (status: ${service.status})`,
                        retryable: true,
                        correlationId: req.correlationId,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Route the request using service discovery
            const response = await this.serviceDiscovery.routeRequest(
                serviceName,
                path || '/',
                req.method,
                req.body,
                this.prepareHeaders(req)
            );

            // Forward response
            res.set(response.headers);
            res.status(response.status).json(response.data);

        } catch (error) {
            logger.error('Dynamic service routing error:', error);
            next(error);
        }
    }

    /**
     * Prepare headers for upstream service request
     */
    prepareHeaders(req) {
        const headers = {};

        // Forward essential headers
        const forwardHeaders = [
            'authorization',
            'content-type',
            'accept',
            'user-agent',
            'x-forwarded-for',
            'x-real-ip'
        ];

        forwardHeaders.forEach(header => {
            if (req.headers[header]) {
                headers[header] = req.headers[header];
            }
        });

        // Add gateway-specific headers
        headers['X-Forwarded-By'] = 'api-gateway';
        headers['X-Original-URL'] = req.originalUrl;
        headers['X-Request-ID'] = req.correlationId || 'unknown';
        headers['X-Forwarded-Method'] = req.method;

        // Add user context if available
        if (req.user) {
            headers['X-User-ID'] = req.user.id;
            headers['X-User-Email'] = req.user.email;
            headers['X-User-Roles'] = req.user.roles?.join(',') || '';
            headers['X-User-Permissions'] = req.user.permissions?.join(',') || '';
        }

        return headers;
    }

    /**
     * Get list of available services
     */
    getAvailableServices() {
        const services = this.serviceDiscovery.getServices();
        return services.map(service => ({
            name: service.name,
            type: service.type,
            status: service.status,
            endpoints: this.getServiceEndpoints(service.name)
        }));
    }

    /**
     * Get available endpoints for a service
     */
    getServiceEndpoints(serviceName) {
        const endpointMap = {
            'queue-service': [
                'GET /api/queue/status',
                'POST /api/queue/jobs',
                'GET /api/queue/jobs/:id',
                'POST /api/queue/pause',
                'POST /api/queue/resume'
            ],
            'storage-service': [
                'POST /api/storage/upload',
                'GET /api/storage/download/:fileId',
                'DELETE /api/storage/files/:fileId',
                'GET /api/storage/metadata/:fileId'
            ]
        };

        return endpointMap[serviceName] || [`/* ${serviceName} endpoints */`];
    }

    /**
     * Health check for routing
     */
    async checkRoutingHealth() {
        const services = this.serviceDiscovery.getServices();
        const routingHealth = {
            totalServices: services.length,
            healthyServices: 0,
            unhealthyServices: 0,
            routingStatus: 'operational'
        };

        services.forEach(service => {
            if (service.status === 'healthy') {
                routingHealth.healthyServices++;
            } else {
                routingHealth.unhealthyServices++;
            }
        });

        // Determine overall routing status
        if (routingHealth.healthyServices === 0) {
            routingHealth.routingStatus = 'critical';
        } else if (routingHealth.unhealthyServices > 0) {
            routingHealth.routingStatus = 'degraded';
        }

        return routingHealth;
    }

    /**
     * Get routing statistics
     */
    getRoutingStats() {
        const services = this.serviceDiscovery.getServices();
        const stats = {
            services: {},
            summary: {
                totalServices: services.length,
                healthyServices: 0,
                totalRequests: 0,
                averageResponseTime: 0
            }
        };

        services.forEach(service => {
            stats.services[service.name] = {
                status: service.status,
                responseTime: service.responseTime,
                consecutiveFailures: service.consecutiveFailures,
                lastHealthCheck: service.lastHealthCheck,
                type: service.type
            };

            if (service.status === 'healthy') {
                stats.summary.healthyServices++;
            }
        });

        return stats;
    }

    /**
     * Add custom route for specific service patterns
     */
    addCustomRoute(pattern, serviceName, options = {}) {
        const middleware = options.middleware || [];
        const handler = options.handler || this.createServiceProxy(serviceName);

        this.router.use(pattern, ...middleware, asyncErrorHandler(handler));
        
        logger.info(`Added custom route: ${pattern} -> ${serviceName}`);
    }

    /**
     * Remove custom route
     */
    removeCustomRoute(pattern) {
        // Express doesn't provide a direct way to remove routes
        // This would require rebuilding the router or using a more advanced routing library
        logger.warn(`Route removal not implemented: ${pattern}`);
    }
}

/**
 * Factory function to create service router
 */
function createServiceRouter(serviceDiscovery) {
    const serviceRouter = new ServiceRouter(serviceDiscovery);
    return serviceRouter.router;
}

module.exports = createServiceRouter; 