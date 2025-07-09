/**
 * Authentication Middleware - JWT Token Verification & User Management
 * 
 * This middleware handles authentication for the API Gateway by:
 * - Verifying JWT tokens from requests
 * - Loading user information and permissions
 * - Implementing role-based access control (RBAC)
 * - Managing session validation and refresh
 * - Providing user context for downstream services
 * 
 * Authentication flow:
 * 1. Extract token from Authorization header or cookies
 * 2. Verify JWT signature and expiration
 * 3. Load user data and check if account is active
 * 4. Attach user context to request object
 * 5. Check role-based permissions if required
 */

const jwt = require('jsonwebtoken');
const Redis = require('redis');
const logger = require('../utils/logger');

class AuthenticationMiddleware {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
        this.jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
        this.redisClient = null;
        this.initializeRedis();
    }

    /**
     * Initialize Redis client for session management
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
                logger.error('Authentication Redis client error:', error);
            });

            logger.info('Authentication Redis client initialized');

        } catch (error) {
            logger.error('Failed to initialize authentication Redis client:', error);
        }
    }

    /**
     * Main authentication middleware
     * Verifies JWT token and attaches user to request
     */
    authenticate() {
        return async (req, res, next) => {
            try {
                // Extract token from request
                const token = this.extractToken(req);
                
                if (!token) {
                    return this.sendUnauthorized(res, 'No authentication token provided');
                }

                // Verify JWT token
                const decoded = await this.verifyToken(token);
                
                if (!decoded) {
                    return this.sendUnauthorized(res, 'Invalid or expired token');
                }

                // Check if session is valid in Redis
                const sessionValid = await this.validateSession(decoded.sessionId);
                
                if (!sessionValid) {
                    return this.sendUnauthorized(res, 'Session expired or invalid');
                }

                // Load user data (in a real app, this would query a user database)
                const user = await this.loadUserData(decoded.userId);
                
                if (!user) {
                    return this.sendUnauthorized(res, 'User not found or inactive');
                }

                // Attach user to request for downstream middleware
                req.user = user;
                req.token = token;
                req.sessionId = decoded.sessionId;

                // Log successful authentication
                logger.logAuth('token_verified', user.id, req.ip);

                next();

            } catch (error) {
                logger.error('Authentication error:', error);
                
                if (error.name === 'JsonWebTokenError') {
                    return this.sendUnauthorized(res, 'Invalid token format');
                } else if (error.name === 'TokenExpiredError') {
                    return this.sendUnauthorized(res, 'Token expired');
                } else {
                    return this.sendUnauthorized(res, 'Authentication failed');
                }
            }
        };
    }

    /**
     * Optional authentication - doesn't fail if no token provided
     * Useful for endpoints that work for both authenticated and anonymous users
     */
    optionalAuthenticate() {
        return async (req, res, next) => {
            try {
                const token = this.extractToken(req);
                
                if (token) {
                    const decoded = await this.verifyToken(token);
                    
                    if (decoded) {
                        const sessionValid = await this.validateSession(decoded.sessionId);
                        
                        if (sessionValid) {
                            const user = await this.loadUserData(decoded.userId);
                            
                            if (user) {
                                req.user = user;
                                req.token = token;
                                req.sessionId = decoded.sessionId;
                                logger.logAuth('optional_token_verified', user.id, req.ip);
                            }
                        }
                    }
                }

                next();

            } catch (error) {
                // For optional auth, we don't fail on errors
                logger.debug('Optional authentication failed (continuing):', error.message);
                next();
            }
        };
    }

    /**
     * Role-based access control middleware
     * Checks if authenticated user has required roles
     */
    requireRole(requiredRoles) {
        if (!Array.isArray(requiredRoles)) {
            requiredRoles = [requiredRoles];
        }

        return (req, res, next) => {
            if (!req.user) {
                return this.sendUnauthorized(res, 'Authentication required');
            }

            const userRoles = req.user.roles || [];
            const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role));

            if (!hasRequiredRole) {
                logger.logAuth('access_denied', req.user.id, req.ip, {
                    requiredRoles,
                    userRoles,
                    endpoint: req.originalUrl
                });

                return res.status(403).json({
                    error: 'Insufficient permissions',
                    message: `This endpoint requires one of the following roles: ${requiredRoles.join(', ')}`,
                    userRoles: userRoles
                });
            }

            logger.logAuth('role_check_passed', req.user.id, req.ip, {
                requiredRoles,
                userRoles,
                endpoint: req.originalUrl
            });

            next();
        };
    }

    /**
     * Permission-based access control
     * Checks if user has specific permissions
     */
    requirePermission(requiredPermissions) {
        if (!Array.isArray(requiredPermissions)) {
            requiredPermissions = [requiredPermissions];
        }

        return (req, res, next) => {
            if (!req.user) {
                return this.sendUnauthorized(res, 'Authentication required');
            }

            const userPermissions = req.user.permissions || [];
            const hasRequiredPermission = requiredPermissions.some(permission => 
                userPermissions.includes(permission)
            );

            if (!hasRequiredPermission) {
                logger.logAuth('permission_denied', req.user.id, req.ip, {
                    requiredPermissions,
                    userPermissions,
                    endpoint: req.originalUrl
                });

                return res.status(403).json({
                    error: 'Insufficient permissions',
                    message: `This endpoint requires one of the following permissions: ${requiredPermissions.join(', ')}`,
                    userPermissions: userPermissions
                });
            }

            next();
        };
    }

    /**
     * Extract JWT token from request (header or cookie)
     */
    extractToken(req) {
        // Try Authorization header first (Bearer token)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        // Try cookies as fallback
        if (req.cookies && req.cookies.accessToken) {
            return req.cookies.accessToken;
        }

        // Try query parameter (for specific use cases like file downloads)
        if (req.query && req.query.token) {
            return req.query.token;
        }

        return null;
    }

    /**
     * Verify JWT token and return decoded payload
     */
    async verifyToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            
            // Basic token validation
            if (!decoded.userId || !decoded.sessionId) {
                throw new Error('Invalid token payload');
            }

            return decoded;

        } catch (error) {
            logger.warn('Token verification failed:', error.message);
            return null;
        }
    }

    /**
     * Validate session in Redis
     */
    async validateSession(sessionId) {
        try {
            if (!this.redisClient) {
                // If Redis is not available, skip session validation
                logger.warn('Redis not available for session validation');
                return true;
            }

            const sessionData = await this.redisClient.get(`session:${sessionId}`);
            
            if (!sessionData) {
                return false;
            }

            const session = JSON.parse(sessionData);
            
            // Check if session is expired
            if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
                await this.redisClient.del(`session:${sessionId}`);
                return false;
            }

            // Update last access time
            session.lastAccess = new Date().toISOString();
            await this.redisClient.setEx(
                `session:${sessionId}`,
                60 * 60 * 24 * 7, // 7 days
                JSON.stringify(session)
            );

            return true;

        } catch (error) {
            logger.error('Session validation error:', error);
            return false;
        }
    }

    /**
     * Load user data (mock implementation - replace with real user service)
     */
    async loadUserData(userId) {
        try {
            // In a real application, this would query your user database/service
            // For now, we'll create a mock user based on the ID
            
            const mockUsers = {
                'admin-1': {
                    id: 'admin-1',
                    email: 'admin@example.com',
                    name: 'Admin User',
                    roles: ['admin', 'user'],
                    permissions: ['read', 'write', 'delete', 'admin'],
                    isActive: true,
                    createdAt: '2024-01-01T00:00:00Z'
                },
                'user-1': {
                    id: 'user-1',
                    email: 'user@example.com',
                    name: 'Regular User',
                    roles: ['user'],
                    permissions: ['read', 'write'],
                    isActive: true,
                    createdAt: '2024-01-01T00:00:00Z'
                }
            };

            const user = mockUsers[userId] || {
                id: userId,
                email: `user-${userId}@example.com`,
                name: `User ${userId}`,
                roles: ['user'],
                permissions: ['read'],
                isActive: true,
                createdAt: new Date().toISOString()
            };

            if (!user.isActive) {
                return null;
            }

            return user;

        } catch (error) {
            logger.error('Error loading user data:', error);
            return null;
        }
    }

    /**
     * Create JWT token for user
     */
    createToken(userId, sessionId, expiresIn = '1h') {
        const payload = {
            userId,
            sessionId,
            iat: Math.floor(Date.now() / 1000),
            type: 'access'
        };

        return jwt.sign(payload, this.jwtSecret, { expiresIn });
    }

    /**
     * Create refresh token
     */
    createRefreshToken(userId, sessionId) {
        const payload = {
            userId,
            sessionId,
            iat: Math.floor(Date.now() / 1000),
            type: 'refresh'
        };

        return jwt.sign(payload, this.jwtRefreshSecret, { expiresIn: '7d' });
    }

    /**
     * Verify refresh token
     */
    async verifyRefreshToken(token) {
        try {
            const decoded = jwt.verify(token, this.jwtRefreshSecret);
            
            if (!decoded.userId || !decoded.sessionId) {
                throw new Error('Invalid token payload');
            }

            return decoded;

        } catch (error) {
            logger.warn('Refresh token verification failed:', error.message);
            return null;
        }
    }

    /**
     * Create session in Redis
     */
    async createSession(userId, metadata = {}) {
        try {
            const sessionId = require('uuid').v4();
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

            const sessionData = {
                userId,
                sessionId,
                createdAt: new Date().toISOString(),
                lastAccess: new Date().toISOString(),
                expiresAt: expiresAt.toISOString(),
                ...metadata
            };

            if (this.redisClient) {
                await this.redisClient.setEx(
                    `session:${sessionId}`,
                    60 * 60 * 24 * 7, // 7 days in seconds
                    JSON.stringify(sessionData)
                );
            }

            return sessionId;

        } catch (error) {
            logger.error('Error creating session:', error);
            throw error;
        }
    }

    /**
     * Delete session (logout)
     */
    async deleteSession(sessionId) {
        try {
            if (this.redisClient) {
                await this.redisClient.del(`session:${sessionId}`);
            }
            return true;
        } catch (error) {
            logger.error('Error deleting session:', error);
            return false;
        }
    }

    /**
     * Send standardized unauthorized response
     */
    sendUnauthorized(res, message = 'Unauthorized') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get current user from request
     */
    getCurrentUser(req) {
        return req.user || null;
    }

    /**
     * Check if user has specific role
     */
    hasRole(req, role) {
        const user = this.getCurrentUser(req);
        return user && user.roles && user.roles.includes(role);
    }

    /**
     * Check if user has specific permission
     */
    hasPermission(req, permission) {
        const user = this.getCurrentUser(req);
        return user && user.permissions && user.permissions.includes(permission);
    }
}

// Create and export the authentication middleware instance
const authMiddleware = new AuthenticationMiddleware();

module.exports = authMiddleware.authenticate();
module.exports.authMiddleware = authMiddleware;
module.exports.optionalAuth = authMiddleware.optionalAuthenticate();
module.exports.requireRole = authMiddleware.requireRole.bind(authMiddleware);
module.exports.requirePermission = authMiddleware.requirePermission.bind(authMiddleware); 