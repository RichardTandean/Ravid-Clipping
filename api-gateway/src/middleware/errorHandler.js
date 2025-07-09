/**
 * Error Handler Middleware - Centralized Error Management
 * 
 * This middleware provides centralized error handling for the API Gateway:
 * - Standardized error response format
 * - Detailed logging for debugging and monitoring
 * - Different error levels for development vs production
 * - Error correlation IDs for tracing
 * - Upstream service error handling
 * 
 * Error Types Handled:
 * - Validation errors (400)
 * - Authentication errors (401)
 * - Authorization errors (403)
 * - Not found errors (404)
 * - Rate limiting errors (429)
 * - Internal server errors (500)
 * - Service unavailable errors (503)
 * - Upstream service errors
 */

const logger = require('../utils/logger');

class ErrorHandler {
    constructor() {
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.includeStackTrace = process.env.INCLUDE_STACK_TRACE === 'true' || this.isDevelopment;
    }

    /**
     * Main error handling middleware
     * Processes all errors and sends standardized responses
     */
    handleError() {
        return (error, req, res, next) => {
            // Generate correlation ID for error tracking
            const correlationId = req.correlationId || this.generateCorrelationId();
            req.correlationId = correlationId;

            // Extract error information
            const errorInfo = this.extractErrorInfo(error);
            
            // Log the error with context
            this.logError(error, req, correlationId);

            // Create standardized error response
            const errorResponse = this.createErrorResponse(errorInfo, correlationId, req);

            // Set appropriate headers
            res.set('X-Correlation-ID', correlationId);
            
            // Send error response
            res.status(errorInfo.statusCode).json(errorResponse);
        };
    }

    /**
     * Extract error information and determine appropriate response
     */
    extractErrorInfo(error) {
        // Default error info
        let errorInfo = {
            statusCode: 500,
            type: 'internal_error',
            message: 'An unexpected error occurred',
            details: null,
            retryable: false
        };

        // Handle different error types
        if (error.name === 'ValidationError') {
            errorInfo = {
                statusCode: 400,
                type: 'validation_error',
                message: 'Validation failed',
                details: error.details || error.message,
                retryable: false
            };
        } else if (error.name === 'UnauthorizedError' || error.statusCode === 401) {
            errorInfo = {
                statusCode: 401,
                type: 'authentication_error',
                message: 'Authentication required',
                details: error.message,
                retryable: false
            };
        } else if (error.name === 'ForbiddenError' || error.statusCode === 403) {
            errorInfo = {
                statusCode: 403,
                type: 'authorization_error',
                message: 'Insufficient permissions',
                details: error.message,
                retryable: false
            };
        } else if (error.name === 'NotFoundError' || error.statusCode === 404) {
            errorInfo = {
                statusCode: 404,
                type: 'not_found_error',
                message: 'Resource not found',
                details: error.message,
                retryable: false
            };
        } else if (error.name === 'TooManyRequests' || error.statusCode === 429) {
            errorInfo = {
                statusCode: 429,
                type: 'rate_limit_error',
                message: 'Rate limit exceeded',
                details: error.message,
                retryable: true,
                retryAfter: error.retryAfter
            };
        } else if (error.name === 'ServiceUnavailableError' || error.statusCode === 503) {
            errorInfo = {
                statusCode: 503,
                type: 'service_unavailable',
                message: 'Service temporarily unavailable',
                details: error.message,
                retryable: true
            };
        } else if (error.name === 'TimeoutError') {
            errorInfo = {
                statusCode: 504,
                type: 'timeout_error',
                message: 'Request timeout',
                details: 'The request took too long to complete',
                retryable: true
            };
        } else if (error.isUpstreamError) {
            // Handle errors from upstream services
            errorInfo = {
                statusCode: error.statusCode || 502,
                type: 'upstream_error',
                message: 'Upstream service error',
                details: error.message,
                retryable: error.retryable || false,
                service: error.service
            };
        } else if (error.statusCode && error.statusCode >= 400) {
            // Generic HTTP errors
            errorInfo = {
                statusCode: error.statusCode,
                type: 'http_error',
                message: error.message || 'HTTP Error',
                details: error.details,
                retryable: error.statusCode >= 500
            };
        } else {
            // Unexpected errors
            errorInfo.message = this.isDevelopment ? error.message : 'Internal server error';
            errorInfo.stack = this.includeStackTrace ? error.stack : undefined;
        }

        return errorInfo;
    }

    /**
     * Create standardized error response
     */
    createErrorResponse(errorInfo, correlationId, req) {
        const response = {
            error: {
                type: errorInfo.type,
                message: errorInfo.message,
                correlationId: correlationId,
                timestamp: new Date().toISOString(),
                path: req.originalUrl,
                method: req.method
            }
        };

        // Add additional details if available
        if (errorInfo.details) {
            response.error.details = errorInfo.details;
        }

        if (errorInfo.retryable) {
            response.error.retryable = true;
            
            if (errorInfo.retryAfter) {
                response.error.retryAfter = errorInfo.retryAfter;
            }
        }

        if (errorInfo.service) {
            response.error.service = errorInfo.service;
        }

        // Include stack trace in development
        if (this.includeStackTrace && errorInfo.stack) {
            response.error.stack = errorInfo.stack;
        }

        // Add helpful information for specific error types
        if (errorInfo.type === 'validation_error') {
            response.error.documentation = 'https://docs.example.com/api/validation';
        } else if (errorInfo.type === 'authentication_error') {
            response.error.documentation = 'https://docs.example.com/api/authentication';
        } else if (errorInfo.type === 'rate_limit_error') {
            response.error.documentation = 'https://docs.example.com/api/rate-limits';
        }

        return response;
    }

    /**
     * Log error with appropriate level and context
     */
    logError(error, req, correlationId) {
        const errorContext = {
            correlationId,
            method: req.method,
            url: req.originalUrl,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress,
            userId: req.user?.id,
            sessionId: req.sessionId
        };

        // Log level based on error severity
        if (error.statusCode && error.statusCode < 500) {
            // Client errors (4xx) - log as warning
            logger.warn(`Client error: ${error.message}`, errorContext);
        } else {
            // Server errors (5xx) - log as error
            logger.error(`Server error: ${error.message}`, error, errorContext);
        }
    }

    /**
     * Handle upstream service errors
     */
    handleUpstreamError(serviceName, error, req) {
        const upstreamError = new Error(`${serviceName} service error: ${error.message}`);
        upstreamError.isUpstreamError = true;
        upstreamError.service = serviceName;
        upstreamError.statusCode = error.response?.status || 502;
        upstreamError.retryable = error.code === 'ECONNREFUSED' || 
                                  error.code === 'ETIMEDOUT' ||
                                  (error.response?.status >= 500);

        return upstreamError;
    }

    /**
     * Handle async errors in middleware
     */
    asyncErrorHandler(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next))
                .catch(next);
        };
    }

    /**
     * Create validation error
     */
    createValidationError(message, details = null) {
        const error = new Error(message);
        error.name = 'ValidationError';
        error.details = details;
        return error;
    }

    /**
     * Create unauthorized error
     */
    createUnauthorizedError(message = 'Authentication required') {
        const error = new Error(message);
        error.name = 'UnauthorizedError';
        error.statusCode = 401;
        return error;
    }

    /**
     * Create forbidden error
     */
    createForbiddenError(message = 'Insufficient permissions') {
        const error = new Error(message);
        error.name = 'ForbiddenError';
        error.statusCode = 403;
        return error;
    }

    /**
     * Create not found error
     */
    createNotFoundError(message = 'Resource not found') {
        const error = new Error(message);
        error.name = 'NotFoundError';
        error.statusCode = 404;
        return error;
    }

    /**
     * Create rate limit error
     */
    createRateLimitError(message = 'Rate limit exceeded', retryAfter = null) {
        const error = new Error(message);
        error.name = 'TooManyRequests';
        error.statusCode = 429;
        error.retryAfter = retryAfter;
        return error;
    }

    /**
     * Create service unavailable error
     */
    createServiceUnavailableError(message = 'Service temporarily unavailable') {
        const error = new Error(message);
        error.name = 'ServiceUnavailableError';
        error.statusCode = 503;
        return error;
    }

    /**
     * Generate correlation ID for error tracking
     */
    generateCorrelationId() {
        return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Add correlation ID to request
     */
    addCorrelationId() {
        return (req, res, next) => {
            if (!req.correlationId) {
                req.correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            }
            
            res.set('X-Correlation-ID', req.correlationId);
            next();
        };
    }

    /**
     * Handle 404 errors for unknown routes
     */
    handle404() {
        return (req, res, next) => {
            const error = this.createNotFoundError(`Route not found: ${req.method} ${req.originalUrl}`);
            next(error);
        };
    }

    /**
     * Handle uncaught exceptions
     */
    handleUncaughtException() {
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            
            // Give time for logging before exiting
            setTimeout(() => {
                process.exit(1);
            }, 1000);
        });
    }

    /**
     * Handle unhandled promise rejections
     */
    handleUnhandledRejection() {
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', { promise, reason });
            
            // Don't exit immediately for unhandled rejections
            // Let the application continue running
        });
    }
}

// Create and export the error handler instance
const errorHandler = new ErrorHandler();

// Set up global error handlers
errorHandler.handleUncaughtException();
errorHandler.handleUnhandledRejection();

module.exports = errorHandler.handleError();
module.exports.errorHandler = errorHandler;
module.exports.asyncErrorHandler = errorHandler.asyncErrorHandler.bind(errorHandler);
module.exports.addCorrelationId = errorHandler.addCorrelationId.bind(errorHandler);
module.exports.handle404 = errorHandler.handle404.bind(errorHandler); 