const winston = require('winston')
const EventEmitter = require('events')

class MonitoringService extends EventEmitter {
  constructor(redis, logger) {
    super()
    this.redis = redis
    this.logger = logger || winston.createLogger()
    
    // Monitoring configuration
    this.config = {
      alertThresholds: {
        highFailureRate: 25,        // % failure rate to trigger alert
        highQueueBacklog: 100,      // number of waiting jobs
        longProcessingTime: 600000, // 10 minutes in ms
        highMemoryUsage: 85,        // % memory usage
        workerDowntime: 300000,     // 5 minutes in ms
        lowThroughput: 5            // jobs per minute threshold
      },
      samplingInterval: 30000,      // 30 seconds
      retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
      enabledAlerts: {
        failureRate: true,
        queueBacklog: true,
        processingTime: true,
        workerHealth: true,
        throughput: true,
        systemHealth: true
      }
    }
    
    // Real-time metrics storage
    this.metrics = {
      queues: new Map(),
      workers: new Map(),
      system: {
        totalJobs: 0,
        totalProcessed: 0,
        totalFailed: 0,
        avgProcessingTime: 0,
        throughput: 0,
        lastUpdate: new Date()
      },
      alerts: {
        active: new Map(),
        history: []
      }
    }
    
    // Alert cooldown to prevent spam
    this.alertCooldowns = new Map()
    
    // Start monitoring
    this.startMonitoring()
    
    this.logger.info('📊 Monitoring Service initialized')
  }

  /**
   * Start the monitoring system
   */
  startMonitoring() {
    // Collect metrics every sampling interval
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics()
    }, this.config.samplingInterval)
    
    // Clean up old data every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData()
    }, 60 * 60 * 1000)
    
    this.logger.info('📊 Monitoring system started')
  }

  /**
   * Collect metrics from all queues and workers
   */
  async collectMetrics() {
    try {
      const timestamp = new Date()
      
      // Update system metrics
      await this.updateSystemMetrics(timestamp)
      
      // Check for alerts
      await this.checkAlerts(timestamp)
      
      // Emit metrics update event
      this.emit('metricsUpdated', {
        timestamp,
        metrics: this.getMetricsSummary()
      })
      
    } catch (error) {
      this.logger.error('Error collecting metrics:', error)
    }
  }

  /**
   * Update system-wide metrics
   */
  async updateSystemMetrics(timestamp) {
    const systemMetrics = {
      totalQueues: this.metrics.queues.size,
      totalWorkers: this.metrics.workers.size,
      timestamp: timestamp,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }
    
    this.metrics.system = { ...this.metrics.system, ...systemMetrics }
  }

  /**
   * Record queue metrics
   */
  recordQueueMetrics(queueName, metrics) {
    const timestamp = new Date()
    
    if (!this.metrics.queues.has(queueName)) {
      this.metrics.queues.set(queueName, {
        name: queueName,
        history: [],
        current: {},
        alerts: []
      })
    }
    
    const queueData = this.metrics.queues.get(queueName)
    
    // Update current metrics
    queueData.current = {
      ...metrics,
      timestamp: timestamp,
      failureRate: metrics.total > 0 ? (metrics.failed / metrics.total) * 100 : 0,
      throughput: this.calculateThroughput(queueData.history, timestamp)
    }
    
    // Add to history
    queueData.history.push({
      timestamp,
      ...queueData.current
    })
    
    // Keep only recent history
    const cutoff = timestamp.getTime() - this.config.retentionPeriod
    queueData.history = queueData.history.filter(h => h.timestamp.getTime() > cutoff)
    
    this.metrics.queues.set(queueName, queueData)
    
    this.logger.debug(`📊 Recorded metrics for ${queueName}`, {
      queueName,
      waiting: metrics.waiting,
      active: metrics.active,
      completed: metrics.completed,
      failed: metrics.failed,
      failureRate: queueData.current.failureRate.toFixed(2),
      throughput: queueData.current.throughput
    })
  }

  /**
   * Record worker metrics
   */
  recordWorkerMetrics(workerName, metrics) {
    const timestamp = new Date()
    
    if (!this.metrics.workers.has(workerName)) {
      this.metrics.workers.set(workerName, {
        name: workerName,
        history: [],
        current: {},
        lastSeen: timestamp,
        status: 'active'
      })
    }
    
    const workerData = this.metrics.workers.get(workerName)
    
    // Update current metrics
    workerData.current = {
      ...metrics,
      timestamp: timestamp
    }
    
    workerData.lastSeen = timestamp
    workerData.status = 'active'
    
    // Add to history
    workerData.history.push({
      timestamp,
      ...workerData.current
    })
    
    // Keep only recent history
    const cutoff = timestamp.getTime() - this.config.retentionPeriod
    workerData.history = workerData.history.filter(h => h.timestamp.getTime() > cutoff)
    
    this.metrics.workers.set(workerName, workerData)
  }

  /**
   * Calculate throughput (jobs per minute)
   */
  calculateThroughput(history, currentTime) {
    if (history.length < 2) return 0
    
    const recentHistory = history.slice(-10) // Last 10 samples
    const timeSpan = currentTime.getTime() - recentHistory[0].timestamp.getTime()
    const completedDiff = recentHistory[recentHistory.length - 1].completed - recentHistory[0].completed
    
    if (timeSpan <= 0) return 0
    
    return Math.round((completedDiff / timeSpan) * 60000) // Convert to per minute
  }

  /**
   * Check for alert conditions
   */
  async checkAlerts(timestamp) {
    if (!this.config.enabledAlerts) return
    
    // Check queue-specific alerts
    for (const [queueName, queueData] of this.metrics.queues) {
      await this.checkQueueAlerts(queueName, queueData, timestamp)
    }
    
    // Check worker alerts
    for (const [workerName, workerData] of this.metrics.workers) {
      await this.checkWorkerAlerts(workerName, workerData, timestamp)
    }
    
    // Check system alerts
    await this.checkSystemAlerts(timestamp)
  }

  /**
   * Check queue-specific alerts
   */
  async checkQueueAlerts(queueName, queueData, timestamp) {
    const { current } = queueData
    const thresholds = this.config.alertThresholds
    
    // High failure rate alert
    if (this.config.enabledAlerts.failureRate && 
        current.failureRate > thresholds.highFailureRate && 
        current.total > 10) {
      await this.triggerAlert('HIGH_FAILURE_RATE', {
        queueName,
        failureRate: current.failureRate,
        threshold: thresholds.highFailureRate,
        totalJobs: current.total,
        failedJobs: current.failed
      }, timestamp)
    }
    
    // High queue backlog alert
    if (this.config.enabledAlerts.queueBacklog && 
        current.waiting > thresholds.highQueueBacklog) {
      await this.triggerAlert('HIGH_QUEUE_BACKLOG', {
        queueName,
        waitingJobs: current.waiting,
        threshold: thresholds.highQueueBacklog
      }, timestamp)
    }
    
    // Low throughput alert
    if (this.config.enabledAlerts.throughput && 
        current.throughput < thresholds.lowThroughput && 
        current.active > 0) {
      await this.triggerAlert('LOW_THROUGHPUT', {
        queueName,
        throughput: current.throughput,
        threshold: thresholds.lowThroughput,
        activeJobs: current.active
      }, timestamp)
    }
  }

  /**
   * Check worker-specific alerts
   */
  async checkWorkerAlerts(workerName, workerData, timestamp) {
    const thresholds = this.config.alertThresholds
    
    // Worker downtime alert
    if (this.config.enabledAlerts.workerHealth) {
      const timeSinceLastSeen = timestamp.getTime() - workerData.lastSeen.getTime()
      
      if (timeSinceLastSeen > thresholds.workerDowntime) {
        workerData.status = 'down'
        
        await this.triggerAlert('WORKER_DOWN', {
          workerName,
          lastSeen: workerData.lastSeen,
          downtime: timeSinceLastSeen
        }, timestamp)
      }
    }
    
    // Long processing time alert
    if (this.config.enabledAlerts.processingTime && 
        workerData.current.avgProcessingTime > thresholds.longProcessingTime) {
      await this.triggerAlert('LONG_PROCESSING_TIME', {
        workerName,
        avgProcessingTime: workerData.current.avgProcessingTime,
        threshold: thresholds.longProcessingTime
      }, timestamp)
    }
  }

  /**
   * Check system-wide alerts
   */
  async checkSystemAlerts(timestamp) {
    if (!this.config.enabledAlerts.systemHealth) return
    
    const memoryUsage = process.memoryUsage()
    const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100
    
    // High memory usage alert
    if (memoryUsagePercent > this.config.alertThresholds.highMemoryUsage) {
      await this.triggerAlert('HIGH_MEMORY_USAGE', {
        memoryUsagePercent: memoryUsagePercent.toFixed(2),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        threshold: this.config.alertThresholds.highMemoryUsage
      }, timestamp)
    }
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(alertType, alertData, timestamp) {
    const alertId = `${alertType}-${alertData.queueName || alertData.workerName || 'system'}-${timestamp.getTime()}`
    
    // Check cooldown
    const cooldownKey = `${alertType}-${alertData.queueName || alertData.workerName || 'system'}`
    const lastAlert = this.alertCooldowns.get(cooldownKey)
    const cooldownPeriod = 5 * 60 * 1000 // 5 minutes
    
    if (lastAlert && (timestamp.getTime() - lastAlert) < cooldownPeriod) {
      return // Still in cooldown
    }
    
    const alert = {
      id: alertId,
      type: alertType,
      severity: this.getAlertSeverity(alertType),
      message: this.generateAlertMessage(alertType, alertData),
      data: alertData,
      timestamp: timestamp,
      status: 'active'
    }
    
    // Store active alert
    this.metrics.alerts.active.set(alertId, alert)
    
    // Add to history
    this.metrics.alerts.history.unshift(alert)
    
    // Keep only recent history (last 1000 alerts)
    if (this.metrics.alerts.history.length > 1000) {
      this.metrics.alerts.history = this.metrics.alerts.history.slice(0, 1000)
    }
    
    // Set cooldown
    this.alertCooldowns.set(cooldownKey, timestamp.getTime())
    
    // Emit alert event
    this.emit('alert', alert)
    
    this.logger.warn(`🚨 Alert triggered: ${alert.type}`, {
      alertId,
      type: alertType,
      severity: alert.severity,
      message: alert.message,
      data: alertData
    })
  }

  /**
   * Get alert severity level
   */
  getAlertSeverity(alertType) {
    const severityMap = {
      'HIGH_FAILURE_RATE': 'critical',
      'HIGH_QUEUE_BACKLOG': 'warning',
      'LOW_THROUGHPUT': 'info',
      'WORKER_DOWN': 'critical',
      'LONG_PROCESSING_TIME': 'warning',
      'HIGH_MEMORY_USAGE': 'warning'
    }
    
    return severityMap[alertType] || 'info'
  }

  /**
   * Generate human-readable alert message
   */
  generateAlertMessage(alertType, alertData) {
    switch (alertType) {
      case 'HIGH_FAILURE_RATE':
        return `Queue "${alertData.queueName}" has ${alertData.failureRate.toFixed(1)}% failure rate (${alertData.failedJobs}/${alertData.totalJobs} jobs)`
      
      case 'HIGH_QUEUE_BACKLOG':
        return `Queue "${alertData.queueName}" has ${alertData.waitingJobs} jobs waiting (threshold: ${alertData.threshold})`
      
      case 'LOW_THROUGHPUT':
        return `Queue "${alertData.queueName}" throughput is ${alertData.throughput} jobs/min (threshold: ${alertData.threshold})`
      
      case 'WORKER_DOWN':
        const downMinutes = Math.round(alertData.downtime / 60000)
        return `Worker "${alertData.workerName}" has been down for ${downMinutes} minutes`
      
      case 'LONG_PROCESSING_TIME':
        const processingMinutes = Math.round(alertData.avgProcessingTime / 60000)
        return `Worker "${alertData.workerName}" avg processing time is ${processingMinutes} minutes`
      
      case 'HIGH_MEMORY_USAGE':
        return `System memory usage is ${alertData.memoryUsagePercent}% (${alertData.heapUsed}MB/${alertData.heapTotal}MB)`
      
      default:
        return `Alert: ${alertType}`
    }
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId, resolution = 'resolved') {
    const alert = this.metrics.alerts.active.get(alertId)
    if (alert) {
      alert.status = 'resolved'
      alert.resolvedAt = new Date()
      alert.resolution = resolution
      
      this.metrics.alerts.active.delete(alertId)
      
      this.emit('alertResolved', alert)
      
      this.logger.info(`✅ Alert resolved: ${alert.type}`, {
        alertId,
        resolution
      })
    }
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary() {
    const summary = {
      system: this.metrics.system,
      queues: {},
      workers: {},
      alerts: {
        active: this.metrics.alerts.active.size,
        total: this.metrics.alerts.history.length
      }
    }
    
    // Summarize queue metrics
    for (const [queueName, queueData] of this.metrics.queues) {
      summary.queues[queueName] = queueData.current
    }
    
    // Summarize worker metrics
    for (const [workerName, workerData] of this.metrics.workers) {
      summary.workers[workerName] = {
        ...workerData.current,
        status: workerData.status,
        lastSeen: workerData.lastSeen
      }
    }
    
    return summary
  }

  /**
   * Get analytics data for a time range
   */
  getAnalytics(startTime, endTime, queueName = null) {
    const analytics = {
      timeRange: { startTime, endTime },
      totalJobs: 0,
      totalCompleted: 0,
      totalFailed: 0,
      avgFailureRate: 0,
      avgThroughput: 0,
      trends: {}
    }
    
    const queues = queueName ? [this.metrics.queues.get(queueName)] : Array.from(this.metrics.queues.values())
    
    for (const queueData of queues.filter(Boolean)) {
      const relevantData = queueData.history.filter(h => 
        h.timestamp >= startTime && h.timestamp <= endTime
      )
      
      if (relevantData.length > 0) {
        const queueAnalytics = this.calculateQueueAnalytics(relevantData)
        analytics.trends[queueData.name] = queueAnalytics
        
        analytics.totalJobs += queueAnalytics.totalJobs
        analytics.totalCompleted += queueAnalytics.totalCompleted
        analytics.totalFailed += queueAnalytics.totalFailed
      }
    }
    
    if (analytics.totalJobs > 0) {
      analytics.avgFailureRate = (analytics.totalFailed / analytics.totalJobs) * 100
    }
    
    return analytics
  }

  /**
   * Calculate analytics for a single queue
   */
  calculateQueueAnalytics(data) {
    if (data.length === 0) return {}
    
    const latest = data[data.length - 1]
    const earliest = data[0]
    
    return {
      totalJobs: latest.total || 0,
      totalCompleted: latest.completed || 0,
      totalFailed: latest.failed || 0,
      failureRate: latest.failureRate || 0,
      avgThroughput: data.reduce((sum, d) => sum + (d.throughput || 0), 0) / data.length,
      trend: {
        jobsProcessed: (latest.completed || 0) - (earliest.completed || 0),
        timeSpan: latest.timestamp.getTime() - earliest.timestamp.getTime()
      }
    }
  }

  /**
   * Get active alerts
   */
  getActiveAlerts() {
    return Array.from(this.metrics.alerts.active.values())
  }

  /**
   * Get alert history
   */
  getAlertHistory(limit = 100) {
    return this.metrics.alerts.history.slice(0, limit)
  }

  /**
   * Clean up old data
   */
  cleanupOldData() {
    const cutoff = new Date(Date.now() - this.config.retentionPeriod)
    
    // Clean up queue history
    for (const queueData of this.metrics.queues.values()) {
      queueData.history = queueData.history.filter(h => h.timestamp > cutoff)
    }
    
    // Clean up worker history
    for (const workerData of this.metrics.workers.values()) {
      workerData.history = workerData.history.filter(h => h.timestamp > cutoff)
    }
    
    // Clean up alert history
    this.metrics.alerts.history = this.metrics.alerts.history.filter(
      alert => alert.timestamp > cutoff
    )
    
    this.logger.info('🧹 Cleaned up old monitoring data', {
      cutoff: cutoff.toISOString()
    })
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('⚙️ Monitoring configuration updated', { config: this.config })
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    
    this.logger.info('📊 Monitoring system stopped')
  }
}

module.exports = MonitoringService 