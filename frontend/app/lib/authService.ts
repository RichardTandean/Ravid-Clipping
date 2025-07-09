/**
 * Authentication Service for API Gateway Integration
 * Handles user authentication, JWT token management, and session handling
 */

import { TokenManager, apiCall, apiConfig } from './api';
import { getErrorHandler } from './errorHandler';

export interface User {
  id: string;
  email: string;
  role: 'user' | 'admin';
  permissions: string[];
  profile: {
    firstName?: string;
    lastName?: string;
    avatar?: string;
    preferences?: Record<string, any>;
  };
  createdAt: Date;
  lastLogin?: Date;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface SessionInfo {
  id: string;
  userId: string;
  deviceInfo: string;
  ipAddress: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  isLoading: boolean;
}

/**
 * Authentication Service Class
 */
export class AuthenticationService {
  private authState: AuthState = {
    status: 'loading',
    user: null,
    error: null,
    isLoading: false,
  };

  private subscribers = new Set<(state: AuthState) => void>();
  private tokenRefreshTimer: NodeJS.Timeout | null = null;
  private errorHandler = getErrorHandler();

  constructor() {
    this.initializeAuth();
  }

  /**
   * Initialize authentication state
   */
  private async initializeAuth(): Promise<void> {
    const accessToken = TokenManager.getAccessToken();
    
    if (accessToken) {
      try {
        // Verify token is still valid by fetching user profile
        await this.fetchUserProfile();
        this.scheduleTokenRefresh();
      } catch (error) {
        console.log('Stored token is invalid, clearing auth state');
        this.logout();
      }
    } else {
      this.updateAuthState({
        status: 'unauthenticated',
        user: null,
        error: null,
        isLoading: false,
      });
    }
  }

  /**
   * Login user with email and password
   */
  async login(credentials: LoginCredentials): Promise<User> {
    this.updateAuthState({ ...this.authState, isLoading: true, error: null });

    try {
      const response = await apiCall(apiConfig.endpoints.auth.login, {
        method: 'POST',
        body: JSON.stringify(credentials),
      });

      const { user, tokens } = response;

      // Store tokens
      TokenManager.setTokens(tokens.accessToken, tokens.refreshToken);

      // Update auth state
      this.updateAuthState({
        status: 'authenticated',
        user: this.parseUser(user),
        error: null,
        isLoading: false,
      });

      // Schedule token refresh
      this.scheduleTokenRefresh(tokens.expiresIn);

      console.log('✅ User logged in successfully');
      return this.authState.user!;

    } catch (error) {
      const serviceError = this.errorHandler.handleError(error, {
        action: 'login',
        service: 'api-gateway',
      });

      this.updateAuthState({
        status: 'unauthenticated',
        user: null,
        error: serviceError.userMessage || 'Login failed',
        isLoading: false,
      });

      throw serviceError;
    }
  }

  /**
   * Register new user
   */
  async register(registerData: RegisterData): Promise<User> {
    this.updateAuthState({ ...this.authState, isLoading: true, error: null });

    try {
      const response = await apiCall('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(registerData),
      });

      const { user, tokens } = response;

      // Store tokens
      TokenManager.setTokens(tokens.accessToken, tokens.refreshToken);

      // Update auth state
      this.updateAuthState({
        status: 'authenticated',
        user: this.parseUser(user),
        error: null,
        isLoading: false,
      });

      // Schedule token refresh
      this.scheduleTokenRefresh(tokens.expiresIn);

      console.log('✅ User registered successfully');
      return this.authState.user!;

    } catch (error) {
      const serviceError = this.errorHandler.handleError(error, {
        action: 'register',
        service: 'api-gateway',
      });

      this.updateAuthState({
        status: 'unauthenticated',
        user: null,
        error: serviceError.userMessage || 'Registration failed',
        isLoading: false,
      });

      throw serviceError;
    }
  }

  /**
   * Logout user
   */
  async logout(): Promise<void> {
    try {
      // Call logout endpoint to invalidate tokens on server
      const refreshToken = TokenManager.getRefreshToken();
      if (refreshToken) {
        await apiCall(apiConfig.endpoints.auth.logout, {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch (error) {
      console.warn('Logout API call failed:', error);
      // Continue with local logout even if server logout fails
    }

    // Clear tokens and state
    TokenManager.clearTokens();
    this.clearTokenRefreshTimer();

    this.updateAuthState({
      status: 'unauthenticated',
      user: null,
      error: null,
      isLoading: false,
    });

    console.log('✅ User logged out');
  }

  /**
   * Refresh access token
   */
  async refreshToken(): Promise<void> {
    const refreshToken = TokenManager.getRefreshToken();
    
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await apiCall(apiConfig.endpoints.auth.refresh, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${refreshToken}`,
        },
      });

      const { accessToken, refreshToken: newRefreshToken, expiresIn } = response;

      // Update stored tokens
      TokenManager.setTokens(accessToken, newRefreshToken || refreshToken);

      // Schedule next refresh
      this.scheduleTokenRefresh(expiresIn);

      console.log('✅ Token refreshed successfully');

    } catch (error) {
      console.error('Token refresh failed:', error);
      // Force logout on refresh failure
      this.logout();
      throw error;
    }
  }

  /**
   * Fetch user profile
   */
  async fetchUserProfile(): Promise<User> {
    try {
      const response = await apiCall(apiConfig.endpoints.auth.profile);
      const user = this.parseUser(response.user);

      this.updateAuthState({
        status: 'authenticated',
        user,
        error: null,
        isLoading: false,
      });

      return user;

    } catch (error) {
      const serviceError = this.errorHandler.handleError(error, {
        action: 'fetch_profile',
        service: 'api-gateway',
      });

      if (serviceError.code === 'AUTH_FAILED') {
        this.logout();
      }

      throw serviceError;
    }
  }

  /**
   * Update user profile
   */
  async updateProfile(profileData: Partial<User['profile']>): Promise<User> {
    try {
      const response = await apiCall(apiConfig.endpoints.auth.profile, {
        method: 'PUT',
        body: JSON.stringify({ profile: profileData }),
      });

      const user = this.parseUser(response.user);

      this.updateAuthState({
        ...this.authState,
        user,
      });

      return user;

    } catch (error) {
      const serviceError = this.errorHandler.handleError(error, {
        action: 'update_profile',
        service: 'api-gateway',
      });

      throw serviceError;
    }
  }

  /**
   * Change password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    try {
      await apiCall(apiConfig.endpoints.auth.changePassword, {
        method: 'POST',
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      console.log('✅ Password changed successfully');

    } catch (error) {
      const serviceError = this.errorHandler.handleError(error, {
        action: 'change_password',
        service: 'api-gateway',
      });

      throw serviceError;
    }
  }

  /**
   * Get active sessions
   */
  async getSessions(): Promise<SessionInfo[]> {
    try {
      const response = await apiCall(apiConfig.endpoints.auth.sessions);
      return response.sessions.map(this.parseSession);

    } catch (error) {
      const serviceError = this.errorHandler.handleError(error, {
        action: 'get_sessions',
        service: 'api-gateway',
      });

      throw serviceError;
    }
  }

  /**
   * Revoke a session
   */
  async revokeSession(sessionId: string): Promise<void> {
    try {
      await apiCall(`${apiConfig.endpoints.auth.sessions}/${sessionId}`, {
        method: 'DELETE',
      });

      console.log(`✅ Session ${sessionId} revoked`);

    } catch (error) {
      const serviceError = this.errorHandler.handleError(error, {
        action: 'revoke_session',
        service: 'api-gateway',
      });

      throw serviceError;
    }
  }

  /**
   * Check if user has specific permission
   */
  hasPermission(permission: string): boolean {
    return this.authState.user?.permissions.includes(permission) || false;
  }

  /**
   * Check if user has specific role
   */
  hasRole(role: string): boolean {
    return this.authState.user?.role === role;
  }

  /**
   * Get current auth state
   */
  getAuthState(): AuthState {
    return { ...this.authState };
  }

  /**
   * Subscribe to auth state changes
   */
  subscribe(callback: (state: AuthState) => void): () => void {
    this.subscribers.add(callback);
    
    // Immediately call with current state
    callback(this.authState);

    return () => this.subscribers.delete(callback);
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(expiresIn?: number): void {
    this.clearTokenRefreshTimer();

    // Default to 50 minutes (JWT tokens expire in 1 hour)
    const refreshTime = expiresIn ? (expiresIn - 600) * 1000 : 50 * 60 * 1000;

    this.tokenRefreshTimer = setTimeout(async () => {
      try {
        await this.refreshToken();
      } catch (error) {
        console.error('Automatic token refresh failed:', error);
      }
    }, refreshTime);
  }

  /**
   * Clear token refresh timer
   */
  private clearTokenRefreshTimer(): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  /**
   * Update auth state and notify subscribers
   */
  private updateAuthState(newState: Partial<AuthState>): void {
    this.authState = { ...this.authState, ...newState };
    
    this.subscribers.forEach(callback => {
      try {
        callback(this.authState);
      } catch (error) {
        console.error('Error in auth state subscriber:', error);
      }
    });
  }

  /**
   * Parse user data from API response
   */
  private parseUser(userData: any): User {
    return {
      id: userData.id,
      email: userData.email,
      role: userData.role || 'user',
      permissions: userData.permissions || [],
      profile: {
        firstName: userData.profile?.firstName,
        lastName: userData.profile?.lastName,
        avatar: userData.profile?.avatar,
        preferences: userData.profile?.preferences || {},
      },
      createdAt: new Date(userData.createdAt),
      lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : undefined,
    };
  }

  /**
   * Parse session data from API response
   */
  private parseSession(sessionData: any): SessionInfo {
    return {
      id: sessionData.id,
      userId: sessionData.userId,
      deviceInfo: sessionData.deviceInfo,
      ipAddress: sessionData.ipAddress,
      createdAt: new Date(sessionData.createdAt),
      lastActivity: new Date(sessionData.lastActivity),
      isActive: sessionData.isActive,
    };
  }
}

// Global authentication service
let globalAuthService: AuthenticationService | null = null;

/**
 * Get or create global authentication service
 */
export const getAuthService = (): AuthenticationService => {
  if (!globalAuthService) {
    globalAuthService = new AuthenticationService();
  }
  return globalAuthService;
};

/**
 * Hook-like function for use in React components
 */
export const useAuth = () => {
  const authService = getAuthService();
  return {
    ...authService.getAuthState(),
    login: authService.login.bind(authService),
    register: authService.register.bind(authService),
    logout: authService.logout.bind(authService),
    updateProfile: authService.updateProfile.bind(authService),
    changePassword: authService.changePassword.bind(authService),
    hasPermission: authService.hasPermission.bind(authService),
    hasRole: authService.hasRole.bind(authService),
    subscribe: authService.subscribe.bind(authService),
  };
}; 