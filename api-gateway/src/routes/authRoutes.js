/**
 * Authentication Routes - User Authentication & Authorization
 * 
 * These routes handle authentication directly in the API Gateway:
 * - User login and logout
 * - Token generation and refresh
 * - Password management
 * - User profile management
 * - Session management
 * 
 * Routes handled locally (not proxied):
 * - POST /api/auth/login
 * - POST /api/auth/logout
 * - POST /api/auth/refresh
 * - GET /api/auth/profile
 * - POST /api/auth/change-password
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authMiddleware } = require('../middleware/authentication');
const { asyncErrorHandler } = require('../middleware/errorHandler');

const router = express.Router();

/**
 * Mock user database
 * In a real application, this would be replaced with actual database queries
 */
const mockUsers = {
    'admin@example.com': {
        id: 'admin-1',
        email: 'admin@example.com',
        password: '$2a$10$rODTwNaS7Nqgj5YSZO6HjOKE6qMYx4dGUyuDCdDKDlMhVNKhm4Kiy', // 'admin123'
        name: 'Admin User',
        roles: ['admin', 'user'],
        permissions: ['read', 'write', 'delete', 'admin'],
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        lastLogin: null
    },
    'user@example.com': {
        id: 'user-1',
        email: 'user@example.com',
        password: '$2a$10$rODTwNaS7Nqgj5YSZO6HjOKE6qMYx4dGUyuDCdDKDlMhVNKhm4Kiy', // 'user123'
        name: 'Regular User',
        roles: ['user'],
        permissions: ['read', 'write'],
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        lastLogin: null
    }
};

/**
 * Login endpoint
 * Validates credentials and returns JWT tokens
 */
router.post('/login',
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ],
    asyncErrorHandler(async (req, res) => {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.logAuth('login_validation_failed', null, req.ip, { errors: errors.array() });
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                timestamp: new Date().toISOString()
            });
        }

        const { email, password, rememberMe = false } = req.body;

        try {
            // Find user
            const user = mockUsers[email.toLowerCase()];
            
            if (!user) {
                logger.logAuth('login_user_not_found', null, req.ip, { email });
                return res.status(401).json({
                    error: 'Invalid credentials',
                    message: 'Email or password is incorrect',
                    timestamp: new Date().toISOString()
                });
            }

            if (!user.isActive) {
                logger.logAuth('login_inactive_user', user.id, req.ip, { email });
                return res.status(401).json({
                    error: 'Account disabled',
                    message: 'Your account has been disabled. Please contact support.',
                    timestamp: new Date().toISOString()
                });
            }

            // Verify password
            const passwordValid = await bcrypt.compare(password, user.password);
            
            if (!passwordValid) {
                logger.logAuth('login_invalid_password', user.id, req.ip, { email });
                return res.status(401).json({
                    error: 'Invalid credentials',
                    message: 'Email or password is incorrect',
                    timestamp: new Date().toISOString()
                });
            }

            // Create session
            const sessionId = await authMiddleware.createSession(user.id, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                rememberMe
            });

            // Generate tokens
            const tokenExpiry = rememberMe ? '7d' : '1h';
            const accessToken = authMiddleware.createToken(user.id, sessionId, tokenExpiry);
            const refreshToken = authMiddleware.createRefreshToken(user.id, sessionId);

            // Update last login
            user.lastLogin = new Date().toISOString();

            // Remove sensitive data from response
            const userResponse = {
                id: user.id,
                email: user.email,
                name: user.name,
                roles: user.roles,
                permissions: user.permissions,
                lastLogin: user.lastLogin
            };

            logger.logAuth('login_success', user.id, req.ip, { email, rememberMe });

            res.json({
                success: true,
                message: 'Login successful',
                user: userResponse,
                tokens: {
                    accessToken,
                    refreshToken,
                    expiresIn: rememberMe ? '7 days' : '1 hour'
                },
                sessionId,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An error occurred during login',
                timestamp: new Date().toISOString()
            });
        }
    })
);

/**
 * Logout endpoint
 * Invalidates the current session
 */
router.post('/logout',
    authMiddleware.authenticate(),
    asyncErrorHandler(async (req, res) => {
        try {
            // Delete session
            await authMiddleware.deleteSession(req.sessionId);
            
            logger.logAuth('logout_success', req.user.id, req.ip);

            res.json({
                success: true,
                message: 'Logged out successfully',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Logout error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An error occurred during logout',
                timestamp: new Date().toISOString()
            });
        }
    })
);

/**
 * Token refresh endpoint
 * Exchanges refresh token for new access token
 */
router.post('/refresh',
    [
        body('refreshToken').notEmpty().withMessage('Refresh token is required')
    ],
    asyncErrorHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                timestamp: new Date().toISOString()
            });
        }

        const { refreshToken } = req.body;

        try {
            // Verify refresh token
            const decoded = await authMiddleware.verifyRefreshToken(refreshToken);
            
            if (!decoded || decoded.type !== 'refresh') {
                logger.logAuth('refresh_invalid_token', null, req.ip);
                return res.status(401).json({
                    error: 'Invalid refresh token',
                    message: 'The refresh token is invalid or expired',
                    timestamp: new Date().toISOString()
                });
            }

            // Validate session
            const sessionValid = await authMiddleware.validateSession(decoded.sessionId);
            
            if (!sessionValid) {
                logger.logAuth('refresh_invalid_session', decoded.userId, req.ip);
                return res.status(401).json({
                    error: 'Session expired',
                    message: 'Your session has expired. Please log in again.',
                    timestamp: new Date().toISOString()
                });
            }

            // Generate new access token
            const newAccessToken = authMiddleware.createToken(decoded.userId, decoded.sessionId);
            
            logger.logAuth('token_refresh_success', decoded.userId, req.ip);

            res.json({
                success: true,
                accessToken: newAccessToken,
                expiresIn: '1 hour',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Token refresh error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An error occurred during token refresh',
                timestamp: new Date().toISOString()
            });
        }
    })
);

/**
 * Get user profile
 * Returns current user information
 */
router.get('/profile',
    authMiddleware.authenticate(),
    asyncErrorHandler(async (req, res) => {
        try {
            const userResponse = {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                roles: req.user.roles,
                permissions: req.user.permissions,
                isActive: req.user.isActive,
                createdAt: req.user.createdAt,
                lastLogin: req.user.lastLogin
            };

            res.json({
                success: true,
                user: userResponse,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Get profile error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An error occurred while fetching profile',
                timestamp: new Date().toISOString()
            });
        }
    })
);

/**
 * Update user profile
 * Updates user information
 */
router.put('/profile',
    authMiddleware.authenticate(),
    [
        body('name').optional().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
        body('email').optional().isEmail().normalizeEmail().withMessage('Valid email is required')
    ],
    asyncErrorHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                timestamp: new Date().toISOString()
            });
        }

        try {
            const { name, email } = req.body;
            const currentUser = Object.values(mockUsers).find(u => u.id === req.user.id);
            
            if (!currentUser) {
                return res.status(404).json({
                    error: 'User not found',
                    timestamp: new Date().toISOString()
                });
            }

            // Update fields if provided
            if (name) currentUser.name = name;
            if (email && email !== currentUser.email) {
                // Check if email is already taken
                const emailExists = Object.values(mockUsers).some(u => u.email === email && u.id !== req.user.id);
                if (emailExists) {
                    return res.status(409).json({
                        error: 'Email already exists',
                        message: 'Another user is already using this email address',
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Update email in the mock database
                delete mockUsers[currentUser.email];
                currentUser.email = email;
                mockUsers[email] = currentUser;
            }

            const userResponse = {
                id: currentUser.id,
                email: currentUser.email,
                name: currentUser.name,
                roles: currentUser.roles,
                permissions: currentUser.permissions
            };

            logger.info(`Profile updated for user ${req.user.id}`, { 
                updatedFields: Object.keys(req.body)
            });

            res.json({
                success: true,
                user: userResponse,
                message: 'Profile updated successfully',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Update profile error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An error occurred while updating profile',
                timestamp: new Date().toISOString()
            });
        }
    })
);

/**
 * Change password
 * Updates user password
 */
router.post('/change-password',
    authMiddleware.authenticate(),
    [
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
        body('confirmPassword').custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Password confirmation does not match');
            }
            return true;
        })
    ],
    asyncErrorHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array(),
                timestamp: new Date().toISOString()
            });
        }

        const { currentPassword, newPassword } = req.body;

        try {
            const currentUser = Object.values(mockUsers).find(u => u.id === req.user.id);
            
            if (!currentUser) {
                return res.status(404).json({
                    error: 'User not found',
                    timestamp: new Date().toISOString()
                });
            }

            // Verify current password
            const passwordValid = await bcrypt.compare(currentPassword, currentUser.password);
            
            if (!passwordValid) {
                logger.logAuth('change_password_invalid_current', req.user.id, req.ip);
                return res.status(401).json({
                    error: 'Invalid current password',
                    message: 'The current password you entered is incorrect',
                    timestamp: new Date().toISOString()
                });
            }

            // Hash new password
            const saltRounds = 10;
            const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
            
            // Update password
            currentUser.password = hashedNewPassword;

            logger.logAuth('change_password_success', req.user.id, req.ip);

            res.json({
                success: true,
                message: 'Password changed successfully',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Change password error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An error occurred while changing password',
                timestamp: new Date().toISOString()
            });
        }
    })
);

/**
 * Verify token endpoint
 * Validates if a token is still valid
 */
router.post('/verify',
    authMiddleware.authenticate(),
    asyncErrorHandler(async (req, res) => {
        res.json({
            success: true,
            valid: true,
            user: {
                id: req.user.id,
                email: req.user.email,
                name: req.user.name,
                roles: req.user.roles,
                permissions: req.user.permissions
            },
            timestamp: new Date().toISOString()
        });
    })
);

/**
 * Get all sessions for current user
 */
router.get('/sessions',
    authMiddleware.authenticate(),
    asyncErrorHandler(async (req, res) => {
        try {
            // In a real application, you'd query the session store
            res.json({
                success: true,
                sessions: [
                    {
                        id: req.sessionId,
                        current: true,
                        ip: req.ip,
                        userAgent: req.get('User-Agent'),
                        createdAt: new Date().toISOString(),
                        lastAccess: new Date().toISOString()
                    }
                ],
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            logger.error('Get sessions error:', error);
            res.status(500).json({
                error: 'Internal server error',
                message: 'An error occurred while fetching sessions',
                timestamp: new Date().toISOString()
            });
        }
    })
);

module.exports = router; 