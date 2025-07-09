/**
 * API Gateway - Main Entry Point
 * 
 * This is the central entry point for all client requests to our video clipping platform.
 * The API Gateway handles:
 * - Request routing to appropriate microservices
 * - Authentication and authorization
 * - Rate limiting and security
 * - Request/response logging
 * - Error handling and standardization
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

// Import our custom modules
const logger = require('./utils/logger');
const healthCheck = require('./middleware/healthCheck');
const rateLimiter = require('./middleware/rateLimiter');
const authentication = require('./middleware/authentication');
const errorHandler = require('./middleware/errorHandler');
const serviceRouter = require('./routes/serviceRouter');
const ServiceDiscovery = require('./services/serviceDiscovery');

class ApiGateway {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.serviceDiscovery = new ServiceDiscovery();
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }

    /**
     * Setup Express middleware in the correct order
     * Order is important: security first, then logging, then business logic
     */
    setupMiddleware() {
        logger.info('Setting up API Gateway middleware...');

        // Security middleware (should be first)
        this.app.use(helmet({
            crossOriginEmbedderPolicy: false, // Allow embedding for development
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
        }));

        // CORS configuration for frontend communication
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        }));

        // Compression for better performance
        this.app.use(compression());

        // Body parsing middleware
        this.app.use(express.json({ limit: '50mb' })); // Large limit for video uploads
        this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

        // HTTP request logging
        this.app.use(morgan('combined', {
            stream: {
                write: (message) => logger.info(message.trim())
            }
        }));

        // Rate limiting (apply before authentication)
        this.app.use(rateLimiter);

        // Health check endpoint (no authentication required)
        this.app.use('/health', healthCheck);

        logger.info('Middleware setup completed');
    }

    /**
     * Setup application routes
     * Routes define how different API endpoints are handled
     */
    setupRoutes() {
        logger.info('Setting up API Gateway routes...');

        // API documentation endpoint
        this.app.get('/', (req, res) => {
            res.json({
                service: 'Video Clipping Platform API Gateway',
                version: '1.0.0',
                status: 'operational',
                endpoints: {
                    health: '/health',
                    queue: '/api/queue/*',
                    storage: '/api/storage/*',
                    auth: '/api/auth/*',
                    status: '/api/status'
                },
                documentation: 'https://github.com/your-org/video-clipping-platform',
                timestamp: new Date().toISOString()
            });
        });

        // Authentication routes (handled directly by gateway)
        this.app.use('/api/auth', require('./routes/authRoutes'));

        // Service status endpoint
        this.app.get('/api/status', authentication, async (req, res) => {
            try {
                const services = await this.serviceDiscovery.getServiceStatus();
                res.json({
                    gateway: 'healthy',
                    services,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                logger.error('Error getting service status:', error);
                res.status(500).json({ error: 'Failed to get service status' });
            }
        });

        // Protected routes that require authentication
        this.app.use('/api', authentication);

        // Route all other API requests to appropriate microservices
        this.app.use('/api', serviceRouter(this.serviceDiscovery));

        // 404 handler for unknown routes
        this.app.use('*', (req, res) => {
            logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
            res.status(404).json({
                error: 'Route not found',
                message: `The endpoint ${req.method} ${req.originalUrl} does not exist`,
                availableEndpoints: ['/health', '/api/queue', '/api/storage', '/api/auth']
            });
        });

        logger.info('Routes setup completed');
    }

    /**
     * Setup centralized error handling
     * This catches all errors and provides consistent error responses
     */
    setupErrorHandling() {
        this.app.use(errorHandler);
    }

    /**
     * Start the API Gateway server
     */
    async start() {
        try {
            // Initialize service discovery
            await this.serviceDiscovery.initialize();
            logger.info('Service discovery initialized');

            // Start the server
            this.server = this.app.listen(this.port, () => {
                logger.info(`🚀 API Gateway server running on port ${this.port}`);
                logger.info(`📋 Health check available at: http://localhost:${this.port}/health`);
                logger.info(`📚 API documentation at: http://localhost:${this.port}/`);
                logger.info(`🔍 Service status at: http://localhost:${this.port}/api/status`);
            });

            // Graceful shutdown handling
            this.setupGracefulShutdown();

        } catch (error) {
            logger.error('Failed to start API Gateway:', error);
            process.exit(1);
        }
    }

    /**
     * Setup graceful shutdown handling
     * Ensures proper cleanup when the service is stopped
     */
    setupGracefulShutdown() {
        const gracefulShutdown = (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);
            
            if (this.server) {
                this.server.close(() => {
                    logger.info('API Gateway server closed');
                    this.serviceDiscovery.cleanup();
                    process.exit(0);
                });
            }
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    }
}

// Initialize and start the API Gateway
const gateway = new ApiGateway();
gateway.start().catch((error) => {
    logger.error('Failed to start API Gateway:', error);
    process.exit(1);
});

module.exports = ApiGateway; 