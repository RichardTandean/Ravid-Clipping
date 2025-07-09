/**
 * Resilient connection manager that handles device sleep/wake cycles
 * and maintains progress state across connection interruptions
 */

import { apiConfig } from './api'

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

export class ResilientConnection {
  private eventSource: EventSource | null = null
  private pollingInterval: NodeJS.Timeout | null = null
  private sessionId: string
  private isActive = false
  private lastProgressData: ProgressData | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private isPageVisible = true
  private wakeUpDetected = false

  // Callbacks
  private onProgressCallback: (data: ProgressData) => void = () => {}
  private onCompleteCallback: (data: any) => void = () => {}
  private onErrorCallback: (error: string) => void = () => {}

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.setupVisibilityHandlers()
    this.setupWakeDetection()
  }

  /**
   * Setup handlers for page visibility changes (sleep/wake detection)
   */
  private setupVisibilityHandlers() {
    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      const wasVisible = this.isPageVisible
      this.isPageVisible = !document.hidden

      if (!wasVisible && this.isPageVisible) {
        console.log('👁️ Page became visible - checking connection')
        this.handleWakeUp()
      }
    })

    // Handle window focus (additional wake detection)
    window.addEventListener('focus', () => {
      console.log('🎯 Window gained focus - checking connection')
      this.handleWakeUp()
    })

    // Handle online/offline events
    window.addEventListener('online', () => {
      console.log('🌐 Device came online - reconnecting')
      this.handleWakeUp()
    })

    window.addEventListener('offline', () => {
      console.log('📴 Device went offline')
      this.disconnect()
    })
  }

  /**
   * Setup wake detection using time gaps
   */
  private setupWakeDetection() {
    let lastTime = Date.now()
    
    setInterval(() => {
      const currentTime = Date.now()
      const timeDiff = currentTime - lastTime
      
      // If more than 5 seconds have passed since last check, likely woke from sleep
      if (timeDiff > 5000 && this.isActive) {
        console.log(`⏰ Time gap detected (${timeDiff}ms) - device likely woke from sleep`)
        this.wakeUpDetected = true
        this.handleWakeUp()
      }
      
      lastTime = currentTime
    }, 1000)
  }

  /**
   * Handle wake up from sleep or visibility change
   */
  private handleWakeUp() {
    if (!this.isActive) return

    console.log('🌅 Wake up detected - restoring connection')
    
    // Reset connection attempts on wake
    this.reconnectAttempts = 0
    
    // Immediately check server status
    this.checkServerStatus().then((hasState) => {
      if (hasState) {
        this.connectSSE()
      } else {
        console.log('⚠️ Session may have expired - switching to polling')
        this.startPollingMode()
      }
    })
  }

  /**
   * Start the connection
   */
  async start(
    onProgress: (data: ProgressData) => void,
    onComplete: (data: any) => void,
    onError: (error: string) => void
  ) {
    this.onProgressCallback = onProgress
    this.onCompleteCallback = onComplete
    this.onErrorCallback = onError
    this.isActive = true

    console.log(`🚀 Starting resilient connection for session: ${this.sessionId}`)

    // Check initial server status
    const hasState = await this.checkServerStatus()
    
    if (hasState) {
      // Try SSE first
      this.connectSSE()
    } else {
      // Fall back to polling
      this.startPollingMode()
    }
  }

  /**
   * Check if server has state for this session
   */
  private async checkServerStatus(): Promise<boolean> {
    try {
      const response = await fetch(apiConfig.endpoints.status(this.sessionId))
      if (response.ok) {
        const data = await response.json()
        console.log('📊 Server status check:', data)
        
        if (data.state) {
          this.lastProgressData = data.state
          this.onProgressCallback(data.state)
          return true
        }
      }
    } catch (error) {
      console.error('❌ Server status check failed:', error)
    }
    return false
  }

  /**
   * Connect via SSE
   */
  private connectSSE() {
    if (this.eventSource) {
      this.eventSource.close()
    }

    console.log(`🔌 Connecting SSE for session: ${this.sessionId}`)
    
    const sseUrl = `${apiConfig.endpoints.progress(this.sessionId)}?t=${Date.now()}`
    this.eventSource = new EventSource(sseUrl)

    this.eventSource.onopen = () => {
      console.log('✅ SSE connection established')
      this.reconnectAttempts = 0
      
      // Stop polling if it was running
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval)
        this.pollingInterval = null
      }
    }

    this.eventSource.onmessage = (event) => {
      try {
        const data: ProgressData = JSON.parse(event.data)
        this.handleProgressData(data)
      } catch (error) {
        console.error('Error parsing SSE data:', error)
      }
    }

    this.eventSource.onerror = (error) => {
      console.error('🚨 SSE error:', error)
      this.eventSource?.close()
      this.eventSource = null
      
      // If we're still active, try to recover
      if (this.isActive) {
        this.handleConnectionLoss()
      }
    }
  }

  /**
   * Handle connection loss
   */
  private handleConnectionLoss() {
    this.reconnectAttempts++
    
    console.log(`💔 Connection lost (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Show reconnection status
      this.onProgressCallback({
        type: 'reconnecting',
        stage: 'reconnecting',
        progress: this.lastProgressData?.progress || 0,
        message: `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`
      })

      // Try SSE again with delay
      setTimeout(() => {
        if (this.isActive) {
          this.checkServerStatus().then((hasState) => {
            if (hasState) {
              this.connectSSE()
            } else {
              this.startPollingMode()
            }
          })
        }
      }, Math.min(1000 * this.reconnectAttempts, 5000))
    } else {
      console.log('⚡ Max SSE attempts reached - switching to polling mode')
      this.startPollingMode()
    }
  }

  /**
   * Start polling mode as fallback
   */
  private startPollingMode() {
    if (this.pollingInterval) return // Already polling

    console.log('🔄 Starting polling mode')
    
    this.onProgressCallback({
      type: 'fallback',
      stage: 'polling',
      progress: this.lastProgressData?.progress || 0,
      message: 'Using backup connection method...'
    })

    this.pollingInterval = setInterval(async () => {
      if (!this.isActive) return

      try {
        const response = await fetch(apiConfig.endpoints.status(this.sessionId))
        if (response.ok) {
          const data = await response.json()
          
          if (data.state) {
            this.handleProgressData(data.state)
          } else if (!data.active) {
            // Session is no longer active
            console.log('⏹️ Session is no longer active')
            this.stop()
          }
        }
      } catch (error) {
        console.error('❌ Polling failed:', error)
        
        // If polling fails consistently, show error
        if (this.reconnectAttempts > 5) {
          this.onErrorCallback('Connection lost. Please refresh the page.')
          this.stop()
        }
      }
    }, 2000) // Poll every 2 seconds
  }

  /**
   * Handle progress data from any source
   */
  private handleProgressData(data: ProgressData) {
    // Skip heartbeat and connection messages
    if (data.type === 'heartbeat' || data.type === 'connected') {
      return
    }

    console.log('📨 Progress update:', data)
    this.lastProgressData = data
    this.onProgressCallback(data)

    // Handle completion
    if (data.type === 'complete') {
      console.log('✅ Processing completed')
      this.onCompleteCallback(data.data)
      this.stop()
    } else if (data.type === 'error') {
      console.error('❌ Processing error:', data.error)
      this.onErrorCallback(data.error || 'Processing failed')
      this.stop()
    }
  }

  /**
   * Stop the connection
   */
  stop() {
    console.log('🛑 Stopping resilient connection')
    this.isActive = false
    this.disconnect()
  }

  /**
   * Disconnect all connections
   */
  private disconnect() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  /**
   * Get current progress data (useful for recovery)
   */
  getLastProgress(): ProgressData | null {
    return this.lastProgressData
  }
}

/**
 * Create a resilient connection
 */
export const createResilientConnection = (sessionId: string) => {
  return new ResilientConnection(sessionId)
} 