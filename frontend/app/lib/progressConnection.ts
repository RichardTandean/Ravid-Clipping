/**
 * Enhanced SSE connection handler with better error handling and reconnection logic
 */

export interface ProgressData {
  type: string
  stage: string
  progress: number
  message: string
  clipIndex?: number
  totalClips?: number
  clipProgress?: number
  data?: any
  error?: string
  downloadInfo?: {
    progress: number
    downloadedBytes?: number
    totalSize?: number
    downloadedFormatted?: string
    totalFormatted?: string
    speed?: string
  }
}

export interface ConnectionOptions {
  maxReconnectAttempts?: number
  reconnectDelay?: number
  heartbeatInterval?: number
  connectionTimeout?: number
}

export class ProgressConnection {
  private eventSource: EventSource | null = null
  private reconnectAttempts = 0
  private connectionTimer: NodeJS.Timeout | null = null
  private isConnected = false
  private sessionId: string
  private baseUrl: string
  private options: Required<ConnectionOptions>

  constructor(
    sessionId: string, 
    baseUrl: string,
    options: ConnectionOptions = {}
  ) {
    this.sessionId = sessionId
    this.baseUrl = baseUrl
    this.options = {
      maxReconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      connectionTimeout: 10000,
      ...options
    }
  }

  connect(
    onProgress: (data: ProgressData) => void,
    onComplete: (data: any) => void,
    onError: (error: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect() // Ensure clean state

      console.log(`🔌 Establishing SSE connection for session: ${this.sessionId}`)

      // Add timestamp to prevent caching
      const sseUrl = `${this.baseUrl}/progress/${this.sessionId}?t=${Date.now()}`
      
      try {
        this.eventSource = new EventSource(sseUrl)
        
        // Connection timeout
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            console.error('⏰ SSE connection timeout')
            this.disconnect()
            reject(new Error('Connection timeout'))
          }
        }, this.options.connectionTimeout)

        this.eventSource.onopen = (event) => {
          console.log('✅ SSE connection established successfully')
          clearTimeout(timeout)
          this.isConnected = true
          this.reconnectAttempts = 0
          resolve()
        }

        this.eventSource.onmessage = (event) => {
          try {
            const data: ProgressData = JSON.parse(event.data)
            
            // Handle different message types
            switch (data.type) {
              case 'heartbeat':
                console.log('💓 Heartbeat received')
                break
                
              case 'connected':
                console.log('🔗 Connection confirmed by server')
                break
                
              case 'progress':
                console.log('📨 Progress update:', data)
                onProgress(data)
                break
                
              case 'complete':
                console.log('✅ Processing completed')
                onComplete(data.data)
                this.disconnect()
                break
                
              case 'error':
                console.error('❌ Processing error:', data.error)
                onError(data.error || 'Unknown processing error')
                this.disconnect()
                break
                
              case 'close':
                console.log('🔚 Server requested connection close')
                this.disconnect()
                break
                
              default:
                console.log('📨 Received message:', data)
                onProgress(data)
            }
          } catch (error) {
            console.error('Error parsing SSE message:', error)
          }
        }

        this.eventSource.onerror = (error) => {
          console.error('🚨 SSE connection error:', error)
          clearTimeout(timeout)
          this.isConnected = false
          
          if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
            this.attemptReconnect(onProgress, onComplete, onError)
          } else {
            console.error('❌ Max reconnection attempts reached')
            onError('Connection lost after multiple attempts')
            this.disconnect()
            reject(new Error('Max reconnection attempts reached'))
          }
        }

      } catch (error) {
        console.error('Failed to create SSE connection:', error)
        reject(error)
      }
    })
  }

  private attemptReconnect(
    onProgress: (data: ProgressData) => void,
    onComplete: (data: any) => void,
    onError: (error: string) => void
  ) {
    this.reconnectAttempts++
    const delay = Math.min(this.options.reconnectDelay * this.reconnectAttempts, 5000)
    
    console.log(`🔄 Attempting reconnection (${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${delay}ms...`)
    
    // Show reconnection status
    onProgress({
      type: 'reconnecting',
      stage: 'reconnecting',
      progress: 0,
      message: `Reconnecting... (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`
    })

    this.connectionTimer = setTimeout(() => {
      this.connect(onProgress, onComplete, onError).catch(() => {
        // Reconnection failed, will be handled by error handler
      })
    }, delay)
  }

  disconnect() {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer)
      this.connectionTimer = null
    }

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    this.isConnected = false
    console.log('🔌 SSE connection disconnected')
  }

  isConnectionActive(): boolean {
    return this.isConnected && this.eventSource !== null
  }
}

/**
 * Helper function to create and manage SSE connections
 */
export const createProgressConnection = (
  sessionId: string,
  baseUrl: string,
  options?: ConnectionOptions
) => {
  return new ProgressConnection(sessionId, baseUrl, options)
} 