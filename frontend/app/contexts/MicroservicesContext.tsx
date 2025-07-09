'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { getWebSocketConnection } from '../lib/websocketConnection'
import { getProgressTracker } from '../lib/microservicesProgressTracker'
import { getErrorHandler } from '../lib/errorHandler'

interface QueueStats {
  name: string
  pending: number
  active: number
  completed: number
  failed: number
  throughput: number
  avgProcessingTime: number
  lastUpdate: Date
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  services: {
    [serviceName: string]: {
      status: 'up' | 'down' | 'degraded'
      responseTime: number
      lastCheck: Date
      errorRate: number
    }
  }
  overallMetrics: {
    totalJobs: number
    successRate: number
    avgResponseTime: number
    activeConnections: number
  }
  lastUpdate: Date
}

interface ConnectionStatus {
  websocket: 'connected' | 'connecting' | 'disconnected' | 'error'
  apiGateway: 'healthy' | 'degraded' | 'unhealthy'
  lastPing: Date | null
}

interface MicroservicesContextType {
  // Connection status
  connectionStatus: ConnectionStatus
  
  // Real-time data
  queueStats: QueueStats[]
  systemHealth: SystemHealth | null
  activeJobs: number
  
  // Actions
  refreshSystemHealth: () => Promise<void>
  refreshQueueStats: () => Promise<void>
  
  // Subscriptions
  subscribeToQueue: (queueName: string) => () => void
  subscribeToSystemHealth: () => () => void
}

const MicroservicesContext = createContext<MicroservicesContextType | null>(null)

interface MicroservicesProviderProps {
  children: ReactNode
}

export function MicroservicesProvider({ children }: MicroservicesProviderProps) {
  // State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    websocket: 'disconnected',
    apiGateway: 'healthy',
    lastPing: null,
  })
  
  const [queueStats, setQueueStats] = useState<QueueStats[]>([])
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [activeJobs, setActiveJobs] = useState(0)

  // Services
  const webSocket = getWebSocketConnection()
  const progressTracker = getProgressTracker()
  const errorHandler = getErrorHandler()

  // Initialize WebSocket connection and monitoring
  useEffect(() => {
    initializeConnection()
    
    // Set up periodic health checks
    const healthCheckInterval = setInterval(refreshSystemHealth, 30000) // Every 30 seconds
    const queueStatsInterval = setInterval(refreshQueueStats, 10000) // Every 10 seconds
    
    return () => {
      clearInterval(healthCheckInterval)
      clearInterval(queueStatsInterval)
      webSocket.disconnect()
    }
  }, [])

  /**
   * Initialize WebSocket connection and set up global listeners
   */
  const initializeConnection = async () => {
    try {
      setConnectionStatus(prev => ({ ...prev, websocket: 'connecting' }))
      
      await webSocket.connect()
      
      setConnectionStatus(prev => ({ 
        ...prev, 
        websocket: 'connected',
        lastPing: new Date()
      }))

      // Subscribe to global system events
      webSocket.subscribe('system_health', handleSystemHealthUpdate)
      webSocket.subscribe('queue_stats', handleQueueStatsUpdate)
      webSocket.subscribe('connection_failed', handleConnectionFailed)
      webSocket.subscribe('reconnecting', handleReconnecting)

      console.log('✅ Microservices monitoring initialized')
      
      // Initial data fetch
      await Promise.all([
        refreshSystemHealth(),
        refreshQueueStats()
      ])

    } catch (error) {
      console.error('❌ Failed to initialize microservices connection:', error)
      setConnectionStatus(prev => ({ ...prev, websocket: 'error' }))
      
      errorHandler.handleError(error, {
        action: 'initialize_connection',
        service: 'websocket',
      })
    }
  }

  /**
   * Handle system health updates from WebSocket
   */
  const handleSystemHealthUpdate = (data: any) => {
    console.log('📊 System health update received:', data)
    
    const healthData: SystemHealth = {
      status: data.status || 'healthy',
      services: data.services || {},
      overallMetrics: {
        totalJobs: data.totalJobs || 0,
        successRate: data.successRate || 0,
        avgResponseTime: data.avgResponseTime || 0,
        activeConnections: data.activeConnections || 0,
      },
      lastUpdate: new Date(data.timestamp || Date.now()),
    }

    setSystemHealth(healthData)
    
    // Update API Gateway status based on overall health
    setConnectionStatus(prev => ({
      ...prev,
      apiGateway: healthData.status === 'healthy' ? 'healthy' : 
                  healthData.status === 'degraded' ? 'degraded' : 'unhealthy'
    }))
  }

  /**
   * Handle queue statistics updates from WebSocket
   */
  const handleQueueStatsUpdate = (data: any) => {
    console.log('📈 Queue stats update received:', data)
    
    if (data.queueName) {
      // Update specific queue
      setQueueStats(prev => {
        const updated = prev.filter(q => q.name !== data.queueName)
        updated.push({
          name: data.queueName,
          pending: data.pending || 0,
          active: data.active || 0,
          completed: data.completed || 0,
          failed: data.failed || 0,
          throughput: data.throughput || 0,
          avgProcessingTime: data.avgProcessingTime || 0,
          lastUpdate: new Date(data.timestamp || Date.now()),
        })
        return updated
      })

      // Update active jobs count
      setActiveJobs(data.active || 0)
    } else if (data.queues) {
      // Update all queues
      const allQueues = Object.entries(data.queues).map(([name, stats]: [string, any]) => ({
        name,
        pending: stats.pending || 0,
        active: stats.active || 0,
        completed: stats.completed || 0,
        failed: stats.failed || 0,
        throughput: stats.throughput || 0,
        avgProcessingTime: stats.avgProcessingTime || 0,
        lastUpdate: new Date(data.timestamp || Date.now()),
      }))
      
      setQueueStats(allQueues)
      setActiveJobs(allQueues.reduce((sum, queue) => sum + queue.active, 0))
    }
  }

  /**
   * Handle connection failure
   */
  const handleConnectionFailed = (data: any) => {
    console.error('🚨 WebSocket connection failed:', data)
    setConnectionStatus(prev => ({ ...prev, websocket: 'error' }))
  }

  /**
   * Handle reconnection attempts
   */
  const handleReconnecting = (data: any) => {
    console.log('🔄 WebSocket reconnecting:', data)
    setConnectionStatus(prev => ({ ...prev, websocket: 'connecting' }))
  }

  /**
   * Refresh system health data
   */
  const refreshSystemHealth = async (): Promise<void> => {
    try {
      const response = await fetch('/api/health/summary')
      if (response.ok) {
        const data = await response.json()
        handleSystemHealthUpdate(data)
        
        setConnectionStatus(prev => ({ 
          ...prev, 
          lastPing: new Date(),
          apiGateway: data.status === 'healthy' ? 'healthy' : 
                     data.status === 'degraded' ? 'degraded' : 'unhealthy'
        }))
      }
    } catch (error) {
      console.error('Failed to refresh system health:', error)
      setConnectionStatus(prev => ({ 
        ...prev, 
        apiGateway: 'unhealthy' 
      }))
    }
  }

  /**
   * Refresh queue statistics
   */
  const refreshQueueStats = async (): Promise<void> => {
    try {
      const response = await fetch('/api/queue/queues/status')
      if (response.ok) {
        const data = await response.json()
        handleQueueStatsUpdate(data)
      }
    } catch (error) {
      console.error('Failed to refresh queue stats:', error)
    }
  }

  /**
   * Subscribe to specific queue updates
   */
  const subscribeToQueue = (queueName: string): () => void => {
    console.log(`📡 Subscribing to queue updates: ${queueName}`)
    
    const unsubscribe = webSocket.subscribeToQueueStats(queueName, (data) => {
      handleQueueStatsUpdate({ queueName, ...data })
    })

    return unsubscribe
  }

  /**
   * Subscribe to system health updates
   */
  const subscribeToSystemHealth = (): () => void => {
    console.log('📡 Subscribing to system health updates')
    
    const unsubscribe = webSocket.subscribeToSystemHealth((data) => {
      handleSystemHealthUpdate(data)
    })

    return unsubscribe
  }

  const contextValue: MicroservicesContextType = {
    connectionStatus,
    queueStats,
    systemHealth,
    activeJobs,
    refreshSystemHealth,
    refreshQueueStats,
    subscribeToQueue,
    subscribeToSystemHealth,
  }

  return (
    <MicroservicesContext.Provider value={contextValue}>
      {children}
    </MicroservicesContext.Provider>
  )
}

/**
 * Hook to use microservices context
 */
export const useMicroservices = (): MicroservicesContextType => {
  const context = useContext(MicroservicesContext)
  if (!context) {
    throw new Error('useMicroservices must be used within MicroservicesProvider')
  }
  return context
}

/**
 * Component to display connection status
 */
export function ConnectionStatusIndicator() {
  const { connectionStatus, systemHealth, activeJobs } = useMicroservices()

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
      case 'healthy':
        return 'text-green-600'
      case 'connecting':
      case 'degraded':
        return 'text-yellow-600'
      case 'disconnected':
      case 'unhealthy':
      case 'error':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
      case 'healthy':
        return '🟢'
      case 'connecting':
      case 'degraded':
        return '🟡'
      case 'disconnected':
      case 'unhealthy':
      case 'error':
        return '🔴'
      default:
        return '⚫'
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <h3 className="text-sm font-medium text-gray-900 mb-3">System Status</h3>
      
      <div className="space-y-2">
        {/* WebSocket Connection */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">WebSocket</span>
          <div className="flex items-center space-x-1">
            <span>{getStatusIcon(connectionStatus.websocket)}</span>
            <span className={getStatusColor(connectionStatus.websocket)}>
              {connectionStatus.websocket}
            </span>
          </div>
        </div>

        {/* API Gateway */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">API Gateway</span>
          <div className="flex items-center space-x-1">
            <span>{getStatusIcon(connectionStatus.apiGateway)}</span>
            <span className={getStatusColor(connectionStatus.apiGateway)}>
              {connectionStatus.apiGateway}
            </span>
          </div>
        </div>

        {/* System Health */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">System Health</span>
          <div className="flex items-center space-x-1">
            <span>{getStatusIcon(systemHealth?.status || 'unknown')}</span>
            <span className={getStatusColor(systemHealth?.status || 'unknown')}>
              {systemHealth?.status || 'unknown'}
            </span>
          </div>
        </div>

        {/* Active Jobs */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Active Jobs</span>
          <span className="font-medium text-blue-600">{activeJobs}</span>
        </div>

        {/* Last Update */}
        {connectionStatus.lastPing && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Last ping</span>
            <span>{connectionStatus.lastPing.toLocaleTimeString()}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Component to display queue statistics
 */
export function QueueStatsDisplay() {
  const { queueStats } = useMicroservices()

  if (queueStats.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Queue Statistics</h3>
        <p className="text-sm text-gray-500">No queue data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <h3 className="text-sm font-medium text-gray-900 mb-3">Queue Statistics</h3>
      
      <div className="space-y-3">
        {queueStats.map((queue) => (
          <div key={queue.name} className="border-b border-gray-100 pb-2 last:border-b-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900 capitalize">
                {queue.name.replace('-', ' ')}
              </span>
              <span className="text-xs text-gray-500">
                {queue.lastUpdate.toLocaleTimeString()}
              </span>
            </div>
            
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-center">
                <div className="text-yellow-600 font-medium">{queue.pending}</div>
                <div className="text-gray-500">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-blue-600 font-medium">{queue.active}</div>
                <div className="text-gray-500">Active</div>
              </div>
              <div className="text-center">
                <div className="text-green-600 font-medium">{queue.completed}</div>
                <div className="text-gray-500">Done</div>
              </div>
              <div className="text-center">
                <div className="text-red-600 font-medium">{queue.failed}</div>
                <div className="text-gray-500">Failed</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 