/**
 * Connection health check utilities
 */

import { apiConfig } from './api'

export interface HealthCheckResult {
  isHealthy: boolean
  latency?: number
  sseSupported?: boolean
  error?: string
}

/**
 * Check if the backend is healthy and responsive
 */
export const checkBackendHealth = async (): Promise<HealthCheckResult> => {
  const startTime = Date.now()
  
  try {
    const response = await fetch(apiConfig.endpoints.health, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const latency = Date.now() - startTime
    
    if (response.ok) {
      return {
        isHealthy: true,
        latency,
        sseSupported: true // Assume SSE is supported if health check passes
      }
    } else {
      return {
        isHealthy: false,
        latency,
        error: `HTTP ${response.status}: ${response.statusText}`
      }
    }
  } catch (error) {
    return {
      isHealthy: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Test SSE connection capability
 */
export const testSSEConnection = (sessionId: string): Promise<boolean> => {
  return new Promise((resolve) => {
    const testUrl = `${apiConfig.endpoints.progress(sessionId)}?test=true&t=${Date.now()}`
    const eventSource = new EventSource(testUrl)
    
    const timeout = setTimeout(() => {
      eventSource.close()
      resolve(false)
    }, 5000) // 5 second timeout
    
    eventSource.onopen = () => {
      clearTimeout(timeout)
      eventSource.close()
      resolve(true)
    }
    
    eventSource.onerror = () => {
      clearTimeout(timeout)
      eventSource.close()
      resolve(false)
    }
  })
}

/**
 * Comprehensive connection check
 */
export const performConnectionCheck = async (sessionId?: string): Promise<{
  backend: HealthCheckResult
  sse: boolean
}> => {
  console.log('🔍 Performing connection health check...')
  
  const backendHealth = await checkBackendHealth()
  console.log('🏥 Backend health:', backendHealth)
  
  let sseWorking = false
  if (sessionId && backendHealth.isHealthy) {
    sseWorking = await testSSEConnection(sessionId)
    console.log('📡 SSE test:', sseWorking ? 'PASS' : 'FAIL')
  }
  
  return {
    backend: backendHealth,
    sse: sseWorking
  }
}

/**
 * Show connection status to user
 */
export const getConnectionStatusMessage = (health: HealthCheckResult): string => {
  if (health.isHealthy) {
    return `✅ Connected (${health.latency}ms)`
  } else if (health.error?.includes('fetch')) {
    return '🔌 Backend server is not running'
  } else {
    return `❌ Connection error: ${health.error}`
  }
} 