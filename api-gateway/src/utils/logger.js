/**
 * Logger Utility - Centralized Logging System
 * 
 * This utility provides structured logging for the API Gateway with:
 * - Multiple log levels (error, warn, info, debug)
 * - File rotation to prevent large log files
 * - Structured JSON formatting for production
 * - Console output for development
 * - Request correlation IDs for tracing
 */

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

class Logger {
    constructor() {
        this.logDir = process.env.LOG_DIR || path.join(__dirname, '../../logs');
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.isProduction = process.env.NODE_ENV === 'production';
        
        this.createLogger();
    }

    /**
     * Create Winston logger with appropriate transports
     */
    createLogger() {
        // Custom format for log messages
        const logFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            winston.format.errors({ stack: true }),
            winston.format.json(),
            winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
                const logObject = {
                    timestamp,
                    level: level.toUpperCase(),
                    service: 'api-gateway',
                    message,
                    ...meta
                };

                if (stack) {
                    logObject.stack = stack;
                }

                return JSON.stringify(logObject);
            })
        );

        // Console format for development
        const consoleFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'HH:mm:ss'
            }),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, service = 'api-gateway', ...meta }) => {
                let output = `[${timestamp}] ${level}: [${service}] ${message}`;
                
                // Add metadata if present
                if (Object.keys(meta).length > 0) {
                    output += ` ${JSON.stringify(meta)}`;
                }
                
                return output;
            })
        );

        // Create transports array
        const transports = [];

        // Console transport for development
        if (!this.isProduction) {
            transports.push(
                new winston.transports.Console({
                    format: consoleFormat,
                    level: 'debug'
                })
            );
        }

        // File transport for all logs
        transports.push(
            new DailyRotateFile({
                filename: path.join(this.logDir, 'api-gateway-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '14d',
                format: logFormat,
                level: this.logLevel
            })
        );

        // Error-specific file transport
        transports.push(
            new DailyRotateFile({
                filename: path.join(this.logDir, 'api-gateway-error-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '30d',
                format: logFormat,
                level: 'error'
            })
        );

        // Create the logger
        this.logger = winston.createLogger({
            level: this.logLevel,
            format: logFormat,
            transports,
            exitOnError: false
        });

        // Log uncaught exceptions and rejections
        this.logger.exceptions.handle(
            new DailyRotateFile({
                filename: path.join(this.logDir, 'api-gateway-exceptions-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '30d',
                format: logFormat
            })
        );

        this.logger.rejections.handle(
            new DailyRotateFile({
                filename: path.join(this.logDir, 'api-gateway-rejections-%DATE%.log'),
                datePattern: 'YYYY-MM-DD',
                maxSize: '20m',
                maxFiles: '30d',
                format: logFormat
            })
        );
    }

    /**
     * Log an info message
     */
    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    /**
     * Log an error message
     */
    error(message, error = null, meta = {}) {
        const logMeta = { ...meta };
        
        if (error instanceof Error) {
            logMeta.error = {
                name: error.name,
                message: error.message,
                stack: error.stack
            };
        } else if (error) {
            logMeta.error = error;
        }

        this.logger.error(message, logMeta);
    }

    /**
     * Log a warning message
     */
    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    /**
     * Log a debug message
     */
    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    /**
     * Log HTTP request information
     */
    logRequest(req, res, duration) {
        const meta = {
            method: req.method,
            url: req.originalUrl,
            statusCode: res.statusCode,
            userAgent: req.get('User-Agent'),
            ip: req.ip || req.connection.remoteAddress,
            duration: `${duration}ms`
        };

        if (req.user) {
            meta.userId = req.user.id;
        }

        if (req.correlationId) {
            meta.correlationId = req.correlationId;
        }

        const level = res.statusCode >= 400 ? 'warn' : 'info';
        this[level](`${req.method} ${req.originalUrl} - ${res.statusCode}`, meta);
    }

    /**
     * Log service communication
     */
    logServiceCall(serviceName, endpoint, method, statusCode, duration) {
        const meta = {
            serviceName,
            endpoint,
            method,
            statusCode,
            duration: `${duration}ms`,
            type: 'service_call'
        };

        const level = statusCode >= 400 ? 'warn' : 'info';
        this[level](`Service call to ${serviceName}: ${method} ${endpoint} - ${statusCode}`, meta);
    }

    /**
     * Log authentication events
     */
    logAuth(event, userId = null, ip = null, meta = {}) {
        const logMeta = {
            event,
            userId,
            ip,
            type: 'authentication',
            ...meta
        };

        if (['login_success', 'token_refresh'].includes(event)) {
            this.info(`Authentication event: ${event}`, logMeta);
        } else {
            this.warn(`Authentication event: ${event}`, logMeta);
        }
    }

    /**
     * Log rate limiting events
     */
    logRateLimit(ip, endpoint, limit, current) {
        this.warn('Rate limit exceeded', {
            ip,
            endpoint,
            limit,
            current,
            type: 'rate_limit'
        });
    }

    /**
     * Create a child logger with additional context
     */
    child(meta = {}) {
        return {
            info: (message, additionalMeta = {}) => this.info(message, { ...meta, ...additionalMeta }),
            error: (message, error = null, additionalMeta = {}) => this.error(message, error, { ...meta, ...additionalMeta }),
            warn: (message, additionalMeta = {}) => this.warn(message, { ...meta, ...additionalMeta }),
            debug: (message, additionalMeta = {}) => this.debug(message, { ...meta, ...additionalMeta }),
        };
    }
}

// Create and export a singleton instance
const logger = new Logger();

module.exports = logger; 