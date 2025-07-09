/**
 * WebSocket Connection Manager for Microservices Real-time Updates
 * Supports authentication, automatic reconnection, and multiple event types
 */

import { TokenManager } from './api';

export interface WebSocketMessage {
  type: 'progress' | 'job_status' | 'queue_stats' | 'system_health' | 'error' | 'auth_required' | 'heartbeat';
  sessionId?: string;
  jobId?: string;
  queueName?: string;
  data?: any;
  timestamp?: number;
}

export interface ProgressData {
  type: string;
  stage: string;
  progress: number;
  message: string;
  clipIndex?: number;
  totalClips?: number;
  clipProgress?: number;
  data?: any;
  error?: string;
  jobId?: string;
  queueName?: string;
}

export interface ConnectionOptions {
  maxReconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
  connectionTimeout?: number;
  enableAuth?: boolean;
}

export class WebSocketConnection {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private isAuthenticated = false;
  private subscribers = new Map<string, Set<(data: any) => void>>();
  private options: Required<ConnectionOptions>;
  private baseUrl: string;

  constructor(options: ConnectionOptions = {}) {
    this.options = {
      maxReconnectAttempts: 10,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      enableAuth: true,
      ...options
    };

    // Determine WebSocket URL based on current location
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.NEXT_PUBLIC_WS_URL || `${protocol}//${window.location.hostname}:3000`;
      this.baseUrl = host.endsWith('/ws') ? host : `${host}/ws`;
    } else {
      this.baseUrl = 'ws://localhost:3000/ws';
    }

    // Handle page visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }

      console.log(`🔌 Connecting to WebSocket: ${this.baseUrl}`);

      try {
        this.ws = new WebSocket(this.baseUrl);

        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            console.error('⏰ WebSocket connection timeout');
            this.disconnect();
            reject(new Error('Connection timeout'));
          }
        }, this.options.connectionTimeout);

        this.ws.onopen = () => {
          console.log('✅ WebSocket connected successfully');
          clearTimeout(connectionTimeout);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Authenticate if enabled
          if (this.options.enableAuth) {
            this.authenticate();
          } else {
            this.isAuthenticated = true;
          }

          // Start heartbeat
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          console.log('🔚 WebSocket connection closed:', event.code, event.reason);
          clearTimeout(connectionTimeout);
          this.handleDisconnection();
        };

        this.ws.onerror = (error) => {
          console.error('🚨 WebSocket error:', error);
          clearTimeout(connectionTimeout);
          this.handleDisconnection();
          
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        };

      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Authenticate the WebSocket connection
   */
  private authenticate(): void {
    const accessToken = TokenManager.getAccessToken();
    if (accessToken) {
      this.send({
        type: 'auth',
        data: { token: accessToken }
      });
    } else {
      console.warn('⚠️ No access token available for WebSocket authentication');
      this.isAuthenticated = false;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'heartbeat':
          // Respond to heartbeat
          this.send({ type: 'heartbeat_response' });
          break;

        case 'auth_required':
          console.log('🔐 Authentication required');
          this.authenticate();
          break;

        case 'auth_success':
          console.log('✅ WebSocket authentication successful');
          this.isAuthenticated = true;
          break;

        case 'auth_failed':
          console.error('❌ WebSocket authentication failed');
          this.isAuthenticated = false;
          // Try to refresh token and reconnect
          this.handleAuthenticationFailure();
          break;

        case 'progress':
          this.notifySubscribers('progress', message.data);
          break;

        case 'job_status':
          this.notifySubscribers('job_status', message.data);
          if (message.jobId) {
            this.notifySubscribers(`job_${message.jobId}`, message.data);
          }
          break;

        case 'queue_stats':
          this.notifySubscribers('queue_stats', message.data);
          if (message.queueName) {
            this.notifySubscribers(`queue_${message.queueName}`, message.data);
          }
          break;

        case 'system_health':
          this.notifySubscribers('system_health', message.data);
          break;

        case 'error':
          console.error('WebSocket error message:', message.data);
          this.notifySubscribers('error', message.data);
          break;

        default:
          console.log('📨 Received WebSocket message:', message);
          this.notifySubscribers('message', message);
      }
    } catch (error) {
      console.error('Error parsing WebSocket message:', error, event.data);
    }
  }

  /**
   * Handle authentication failure
   */
  private async handleAuthenticationFailure(): Promise<void> {
    const refreshToken = TokenManager.getRefreshToken();
    if (refreshToken) {
      try {
        // Try to refresh the token
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${refreshToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const { accessToken, refreshToken: newRefreshToken } = await response.json();
          TokenManager.setTokens(accessToken, newRefreshToken);
          
          // Retry authentication
          this.authenticate();
        } else {
          TokenManager.clearTokens();
          this.notifySubscribers('auth_failed', { reason: 'Token refresh failed' });
        }
      } catch (error) {
        TokenManager.clearTokens();
        this.notifySubscribers('auth_failed', { reason: 'Token refresh error', error });
      }
    } else {
      this.notifySubscribers('auth_failed', { reason: 'No refresh token' });
    }
  }

  /**
   * Send message to WebSocket server
   */
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        ...message,
        timestamp: Date.now(),
      }));
    } else {
      console.warn('⚠️ Cannot send message: WebSocket not connected');
    }
  }

  /**
   * Subscribe to job progress updates
   */
  subscribeToJobProgress(jobId: string, callback: (data: ProgressData) => void): () => void {
    this.subscribe(`job_${jobId}`, callback);
    
    // Request job status updates
    this.send({
      type: 'subscribe',
      data: { jobId, eventType: 'progress' }
    });

    return () => this.unsubscribe(`job_${jobId}`, callback);
  }

  /**
   * Subscribe to queue statistics
   */
  subscribeToQueueStats(queueName: string, callback: (data: any) => void): () => void {
    this.subscribe(`queue_${queueName}`, callback);
    
    // Request queue stats updates
    this.send({
      type: 'subscribe',
      data: { queueName, eventType: 'stats' }
    });

    return () => this.unsubscribe(`queue_${queueName}`, callback);
  }

  /**
   * Subscribe to system health updates
   */
  subscribeToSystemHealth(callback: (data: any) => void): () => void {
    this.subscribe('system_health', callback);
    
    // Request system health updates
    this.send({
      type: 'subscribe',
      data: { eventType: 'system_health' }
    });

    return () => this.unsubscribe('system_health', callback);
  }

  /**
   * Generic subscribe method
   */
  subscribe(channel: string, callback: (data: any) => void): void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(callback);
  }

  /**
   * Generic unsubscribe method
   */
  unsubscribe(channel: string, callback: (data: any) => void): void {
    const channelSubscribers = this.subscribers.get(channel);
    if (channelSubscribers) {
      channelSubscribers.delete(callback);
      if (channelSubscribers.size === 0) {
        this.subscribers.delete(channel);
      }
    }
  }

  /**
   * Notify all subscribers for a channel
   */
  private notifySubscribers(channel: string, data: any): void {
    const channelSubscribers = this.subscribers.get(channel);
    if (channelSubscribers) {
      channelSubscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in WebSocket subscriber callback for ${channel}:`, error);
        }
      });
    }
  }

  /**
   * Handle disconnection and reconnection logic
   */
  private handleDisconnection(): void {
    this.isConnected = false;
    this.isAuthenticated = false;
    this.stopHeartbeat();

    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.attemptReconnection();
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.notifySubscribers('connection_failed', { reason: 'Max reconnection attempts reached' });
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnection(): void {
    this.reconnectAttempts++;
    const delay = Math.min(this.options.reconnectDelay * this.reconnectAttempts, 30000);
    
    console.log(`🔄 Attempting WebSocket reconnection (${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${delay}ms...`);
    
    this.notifySubscribers('reconnecting', { 
      attempt: this.reconnectAttempts, 
      maxAttempts: this.options.maxReconnectAttempts,
      delay 
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(error => {
        console.error('Reconnection failed:', error);
        this.handleDisconnection();
      });
    }, delay);
  }

  /**
   * Start heartbeat
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'heartbeat' });
      }
    }, this.options.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Handle page visibility changes
   */
  private handleVisibilityChange(): void {
    if (document.visibilityState === 'visible' && !this.isConnected) {
      console.log('👁️ Page became visible - attempting to reconnect WebSocket');
      this.reconnectAttempts = Math.max(0, this.reconnectAttempts - 2); // Reduce penalty
      this.connect().catch(console.error);
    }
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    console.log('🔌 Disconnecting WebSocket');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }

    this.isConnected = false;
    this.isAuthenticated = false;
    this.subscribers.clear();
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; authenticated: boolean; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      authenticated: this.isAuthenticated,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// Global WebSocket instance
let globalWebSocket: WebSocketConnection | null = null;

/**
 * Get or create global WebSocket connection
 */
export const getWebSocketConnection = (): WebSocketConnection => {
  if (!globalWebSocket) {
    globalWebSocket = new WebSocketConnection();
  }
  return globalWebSocket;
};

/**
 * Initialize WebSocket connection
 */
export const initializeWebSocket = async (): Promise<WebSocketConnection> => {
  const ws = getWebSocketConnection();
  await ws.connect();
  return ws;
}; 