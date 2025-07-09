/**
 * Rate Limiter Middleware - API Protection System
 * 
 * This middleware protects our API Gateway from abuse by implementing:
 * - Multi-tier rate limiting (per endpoint, per user, global)
 * - Redis-based distributed rate limiting
 * - Progressive throttling (slow down before blocking)
 * - Whitelist/blacklist support
 * - Custom limits for different endpoint types
 * 
 * Rate limiting is essential for:
 * - Preventing DoS attacks
 * - Ensuring fair usage among users
 * - Protecting downstream services
 * - Managing resource consumption
 */

const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const Redis = require('redis');
const logger = require('../utils/logger');

class RateLimiter {
    constructor() {
        this.redisClient = null;
        this.initializeRedis();
        this.setupLimiters();
    }

    /**
     * Initialize Redis client for distributed rate limiting
     */
    async initializeRedis() {
        try {
            this.redisClient = Redis.createClient({
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                retryDelayOnFailover: 100,
                maxRetriesPerRequest: 3
            });

            this.redisClient.on('error', (error) => {
                logger.error('Rate limiter Redis client error:', error);
            });

            logger.info('Rate limiter Redis client initialized');

        } catch (error) {
            logger.error('Failed to initialize rate limiter Redis client:', error);
        }
    }

    /**
     * Setup different rate limiters for various scenarios
     */
    setupLimiters() {
        // Global rate limiter - applies to all requests
        this.globalLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // Limit each IP to 1000 requests per windowMs
            message: {
                error: 'Too many requests',
                message: 'You have exceeded the global rate limit. Please try again later.',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
            store: this.createRedisStore('global'),
            keyGenerator: (req) => {
                return `global:${this.getClientIdentifier(req)}`;
            },
            onLimitReached: (req, res, options) => {
                logger.logRateLimit(
                    this.getClientIdentifier(req),
                    'global',
                    options.max,
                    options.totalHits
                );
            }
        });

        // API rate limiter - for API endpoints
        this.apiLimiter = rateLimit({
            windowMs: 5 * 60 * 1000, // 5 minutes
            max: 100, // Limit each IP to 100 API requests per windowMs
            message: {
                error: 'API rate limit exceeded',
                message: 'You have exceeded the API rate limit. Please try again later.',
                retryAfter: '5 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
            store: this.createRedisStore('api'),
            keyGenerator: (req) => {
                const identifier = this.getClientIdentifier(req);
                return `api:${identifier}`;
            },
            onLimitReached: (req, res, options) => {
                logger.logRateLimit(
                    this.getClientIdentifier(req),
                    'api',
                    options.max,
                    options.totalHits
                );
            }
        });

        // Upload rate limiter - for file uploads (more restrictive)
        this.uploadLimiter = rateLimit({
            windowMs: 10 * 60 * 1000, // 10 minutes
            max: 10, // Only 10 uploads per 10 minutes
            message: {
                error: 'Upload rate limit exceeded',
                message: 'You have exceeded the file upload limit. Please try again later.',
                retryAfter: '10 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
            store: this.createRedisStore('upload'),
            keyGenerator: (req) => {
                const identifier = this.getClientIdentifier(req);
                return `upload:${identifier}`;
            },
            onLimitReached: (req, res, options) => {
                logger.logRateLimit(
                    this.getClientIdentifier(req),
                    'upload',
                    options.max,
                    options.totalHits
                );
            }
        });

        // Processing rate limiter - for compute-intensive operations
        this.processingLimiter = rateLimit({
            windowMs: 30 * 60 * 1000, // 30 minutes
            max: 20, // Only 20 processing jobs per 30 minutes
            message: {
                error: 'Processing rate limit exceeded',
                message: 'You have exceeded the processing job limit. Please try again later.',
                retryAfter: '30 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
            store: this.createRedisStore('processing'),
            keyGenerator: (req) => {
                const identifier = this.getClientIdentifier(req);
                return `processing:${identifier}`;
            },
            onLimitReached: (req, res, options) => {
                logger.logRateLimit(
                    this.getClientIdentifier(req),
                    'processing',
                    options.max,
                    options.totalHits
                );
            }
        });

        // Auth rate limiter - for authentication attempts
        this.authLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 5, // Only 5 auth attempts per 15 minutes
            message: {
                error: 'Authentication rate limit exceeded',
                message: 'Too many authentication attempts. Please try again later.',
                retryAfter: '15 minutes'
            },
            standardHeaders: true,
            legacyHeaders: false,
            store: this.createRedisStore('auth'),
            keyGenerator: (req) => {
                const identifier = this.getClientIdentifier(req);
                return `auth:${identifier}`;
            },
            onLimitReached: (req, res, options) => {
                logger.logRateLimit(
                    this.getClientIdentifier(req),
                    'auth',
                    options.max,
                    options.totalHits
                );
            }
        });

        // Progressive slow down - gradually slow responses before blocking
        this.progressiveSlowDown = slowDown({
            windowMs: 5 * 60 * 1000, // 5 minutes
            delayAfter: 50, // Allow 50 requests per windowMs without delay
            delayMs: 100, // Add 100ms delay per request after delayAfter
            maxDelayMs: 3000, // Max delay of 3 seconds
            store: this.createRedisStore('slowdown'),
            keyGenerator: (req) => {
                return `slowdown:${this.getClientIdentifier(req)}`;
            },
            onLimitReached: (req, res, options) => {
                logger.warn('Progressive slowdown triggered', {
                    ip: this.getClientIdentifier(req),
                    delay: options.delay,
                    endpoint: req.originalUrl
                });
            }
        });
    }

    /**
     * Create Redis store for rate limiting
     */
    createRedisStore(prefix) {
        if (!this.redisClient) {
            // Fallback to memory store if Redis is not available
            logger.warn(`Redis not available for ${prefix} rate limiter, using memory store`);
            return undefined; // express-rate-limit will use default memory store
        }

        // Custom Redis store implementation
        return {
            async get(key) {
                try {
                    const result = await this.redisClient.get(`rate_limit:${prefix}:${key}`);
                    return result ? JSON.parse(result) : undefined;
                } catch (error) {
                    logger.error(`Redis get error for rate limiter ${prefix}:`, error);
                    return undefined;
                }
            },

            async set(key, value, windowMs) {
                try {
                    const ttl = Math.ceil(windowMs / 1000);
                    await this.redisClient.setEx(
                        `rate_limit:${prefix}:${key}`,
                        ttl,
                        JSON.stringify(value)
                    );
                    return true;
                } catch (error) {
                    logger.error(`Redis set error for rate limiter ${prefix}:`, error);
                    return false;
                }
            },

            async increment(key) {
                try {
                    const current = await this.get(key);
                    if (current) {
                        current.totalHits++;
                        await this.set(key, current, current.resetTime - Date.now());
                        return current;
                    }
                    return undefined;
                } catch (error) {
                    logger.error(`Redis increment error for rate limiter ${prefix}:`, error);
                    return undefined;
                }
            },

            async decrement(key) {
                try {
                    const current = await this.get(key);
                    if (current && current.totalHits > 0) {
                        current.totalHits--;
                        await this.set(key, current, current.resetTime - Date.now());
                        return current;
                    }
                    return undefined;
                } catch (error) {
                    logger.error(`Redis decrement error for rate limiter ${prefix}:`, error);
                    return undefined;
                }
            },

            async resetKey(key) {
                try {
                    await this.redisClient.del(`rate_limit:${prefix}:${key}`);
                    return true;
                } catch (error) {
                    logger.error(`Redis resetKey error for rate limiter ${prefix}:`, error);
                    return false;
                }
            }
        };
    }

    /**
     * Get client identifier (IP + User ID if available)
     */
    getClientIdentifier(req) {
        // Use user ID if authenticated, otherwise use IP
        if (req.user && req.user.id) {
            return `user:${req.user.id}`;
        }

        // Get real IP address (handle proxy headers)
        const ip = req.ip || 
                  req.connection.remoteAddress || 
                  req.socket.remoteAddress || 
                  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
                  req.headers['x-real-ip'] ||
                  'unknown';

        return `ip:${ip}`;
    }

    /**
     * Check if IP is whitelisted
     */
    isWhitelisted(ip) {
        const whitelist = (process.env.RATE_LIMIT_WHITELIST || '').split(',').map(ip => ip.trim());
        return whitelist.includes(ip) || whitelist.includes('*');
    }

    /**
     * Check if IP is blacklisted
     */
    isBlacklisted(ip) {
        const blacklist = (process.env.RATE_LIMIT_BLACKLIST || '').split(',').map(ip => ip.trim());
        return blacklist.includes(ip);
    }

    /**
     * Main rate limiter middleware that applies appropriate limits based on endpoint
     */
    middleware() {
        return (req, res, next) => {
            const ip = req.ip || req.connection.remoteAddress;

            // Check blacklist first
            if (this.isBlacklisted(ip)) {
                logger.warn('Blocked request from blacklisted IP', { ip, endpoint: req.originalUrl });
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'Your IP address is blocked'
                });
            }

            // Skip rate limiting for whitelisted IPs
            if (this.isWhitelisted(ip)) {
                logger.debug('Skipping rate limit for whitelisted IP', { ip });
                return next();
            }

            // Apply progressive slowdown first
            this.progressiveSlowDown(req, res, (err) => {
                if (err) return next(err);

                // Apply global rate limiter
                this.globalLimiter(req, res, (err) => {
                    if (err) return next(err);

                    // Apply specific rate limiters based on endpoint
                    const path = req.path.toLowerCase();
                    
                    if (path.startsWith('/api/auth')) {
                        return this.authLimiter(req, res, next);
                    } else if (path.includes('/upload') || req.method === 'POST' && req.headers['content-type']?.includes('multipart')) {
                        return this.uploadLimiter(req, res, next);
                    } else if (path.includes('/process') || path.includes('/queue')) {
                        return this.processingLimiter(req, res, next);
                    } else if (path.startsWith('/api/')) {
                        return this.apiLimiter(req, res, next);
                    }

                    // No specific rate limiter needed
                    next();
                });
            });
        };
    }

    /**
     * Get rate limit status for a client
     */
    async getRateLimitStatus(req) {
        const identifier = this.getClientIdentifier(req);
        const stores = ['global', 'api', 'upload', 'processing', 'auth'];
        const status = {};

        for (const store of stores) {
            try {
                const key = `${store}:${identifier}`;
                const data = await this.redisClient?.get(`rate_limit:${store}:${key}`);
                
                if (data) {
                    const parsed = JSON.parse(data);
                    status[store] = {
                        totalHits: parsed.totalHits,
                        resetTime: new Date(parsed.resetTime),
                        remaining: Math.max(0, parsed.limit - parsed.totalHits)
                    };
                } else {
                    status[store] = {
                        totalHits: 0,
                        resetTime: null,
                        remaining: 'unlimited'
                    };
                }
            } catch (error) {
                logger.error(`Error getting rate limit status for ${store}:`, error);
                status[store] = { error: error.message };
            }
        }

        return status;
    }

    /**
     * Reset rate limits for a specific client (admin function)
     */
    async resetRateLimits(identifier) {
        const stores = ['global', 'api', 'upload', 'processing', 'auth', 'slowdown'];
        const results = {};

        for (const store of stores) {
            try {
                const key = `rate_limit:${store}:${identifier}`;
                await this.redisClient?.del(key);
                results[store] = 'reset';
                logger.info(`Rate limit reset for ${store}:${identifier}`);
            } catch (error) {
                logger.error(`Error resetting rate limit for ${store}:`, error);
                results[store] = error.message;
            }
        }

        return results;
    }
}

// Create and export the rate limiter instance
const rateLimiter = new RateLimiter();

module.exports = rateLimiter.middleware();
module.exports.rateLimiter = rateLimiter; 