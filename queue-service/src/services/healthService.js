const EventEmitter = require('events')
const winston = require('winston')
const os = require('os')

class HealthService extends EventEmitter {
  constructor(scalingService, monitoringService, logger) {
    super()
    
    this.scalingService = scalingService
    this.monitoringService = monitoringService
    this.logger = logger || winston.createLogger()
    
    // Health monitoring configuration
    this.config = {
      enabled: true,
      healthCheckInterval: 15000,      // 15 seconds
      metricsRetention: 7 * 24 * 60 * 60 * 1000, // 7 days
      detailedHealthInterval: 60000,   // 1 minute for detailed checks
      
      // Health thresholds
      thresholds: {
        cpu: {
          warning: 70,    // 70% CPU usage
          critical: 90    // 90% CPU usage
        },
        memory: {
          warning: 80,    // 80% memory usage
          critical: 95    // 95% memory usage
        },
        responseTime: {
          warning: 5000,  // 5 seconds
          critical: 10000 // 10 seconds
        },
        errorRate: {
          warning: 5,     // 5% error rate
          critical: 15    // 15% error rate
        },
        queueLength: {
          warning: 100,   // 100 jobs in queue
          critical: 500   // 500 jobs in queue
        }
      },
      
      // Health check types
      healthChecks: {
        basic: ['ping', 'status'],
        detailed: ['ping', 'status', 'metrics', 'resources', 'performance'],
        deep: ['ping', 'status', 'metrics', 'resources', 'performance', 'diagnostics']
      }
    }
    
    // Worker health data storage
    this.workerHealth = new Map()     // workerId -> health data
    this.healthHistory = new Map()    // workerId -> historical metrics
    this.healthAlerts = new Map()     // workerId -> active alerts
    this.performanceBaselines = new Map() // workerId -> performance baselines
    
    // System health tracking
    this.systemHealth = {
      lastUpdate: null,
      cpu: { usage: 0, cores: os.cpus().length },
      memory: { total: os.totalmem(), used: 0, free: 0 },
      disk: { total: 0, used: 0, free: 0 },
      network: { bytesIn: 0, bytesOut: 0 },
      processes: { total: 0, active: 0 }
    }
    
    this.startHealthMonitoring()
    
    this.logger.info('💊 Health Service initialized', {
      healthCheckInterval: this.config.healthCheckInterval,
      detailedHealthInterval: this.config.detailedHealthInterval,
      thresholds: this.config.thresholds
    })
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (!this.config.enabled) {
      this.logger.info('💊 Health monitoring disabled')
      return
    }
    
    // Basic health checks (every 15 seconds)
    this.basicHealthInterval = setInterval(async () => {
      try {
        await this.performBasicHealthChecks()
      } catch (error) {
        this.logger.error('Basic health check failed:', error)
      }
    }, this.config.healthCheckInterval)
    
    // Detailed health checks (every 1 minute)
    this.detailedHealthInterval = setInterval(async () => {
      try {
        await this.performDetailedHealthChecks()
      } catch (error) {
        this.logger.error('Detailed health check failed:', error)
      }
    }, this.config.detailedHealthInterval)
    
    // System health monitoring (every 30 seconds)
    this.systemHealthInterval = setInterval(async () => {
      try {
        await this.updateSystemHealth()
      } catch (error) {
        this.logger.error('System health update failed:', error)
      }
    }, 30000)
    
    this.logger.info('💊 Health monitoring started')
  }

  /**
   * Perform basic health checks on all workers
   */
  async performBasicHealthChecks() {
    try {
      const allWorkers = this.getAllWorkers()
      const healthResults = []
      
      for (const worker of allWorkers) {
        try {
          const health = await this.checkWorkerHealth(worker, 'basic')
          healthResults.push(health)
          
          // Update worker health data
          this.updateWorkerHealth(worker.id, health)
          
          // Check for health issues
          await this.evaluateWorkerHealth(worker.id, health)
          
        } catch (error) {
          this.logger.error(`Health check failed for worker ${worker.id}:`, error)
          
          // Mark worker as unhealthy
          const unhealthyStatus = {
            workerId: worker.id,
            queueName: worker.queueName,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date(),
            lastSeen: new Date()
          }
          
          this.updateWorkerHealth(worker.id, unhealthyStatus)
        }
      }
      
      // Emit health check completed event
      this.emit('healthCheckCompleted', {
        type: 'basic',
        workers: healthResults.length,
        healthy: healthResults.filter(h => h.status === 'healthy').length,
        timestamp: new Date()
      })
      
    } catch (error) {
      this.logger.error('Failed to perform basic health checks:', error)
    }
  }

  /**
   * Perform detailed health checks with metrics collection
   */
  async performDetailedHealthChecks() {
    try {
      const allWorkers = this.getAllWorkers()
      const detailedResults = []
      
      for (const worker of allWorkers) {
        try {
          const health = await this.checkWorkerHealth(worker, 'detailed')
          detailedResults.push(health)
          
          // Store detailed metrics in history
          this.storeHealthHistory(worker.id, health)
          
          // Update performance baselines
          await this.updatePerformanceBaseline(worker.id, health)
          
          // Advanced health analysis
          await this.performAdvancedHealthAnalysis(worker.id, health)
          
        } catch (error) {
          this.logger.error(`Detailed health check failed for worker ${worker.id}:`, error)
        }
      }
      
      // Emit detailed health check completed event
      this.emit('detailedHealthCheckCompleted', {
        type: 'detailed',
        workers: detailedResults.length,
        timestamp: new Date()
      })
      
    } catch (error) {
      this.logger.error('Failed to perform detailed health checks:', error)
    }
  }

  /**
   * Check individual worker health
   */
  async checkWorkerHealth(worker, checkType = 'basic') {
    const healthData = {
      workerId: worker.id,
      queueName: worker.queueName,
      status: 'unknown',
      timestamp: new Date(),
      checkType,
      metrics: {},
      issues: []
    }
    
    try {
      const checks = this.config.healthChecks[checkType] || this.config.healthChecks.basic
      
      for (const check of checks) {
        switch (check) {
          case 'ping':
            healthData.metrics.ping = await this.pingWorker(worker)
            break
          case 'status':
            healthData.metrics.status = await this.getWorkerStatus(worker)
            break
          case 'metrics':
            healthData.metrics.performance = await this.getWorkerMetrics(worker)
            break
          case 'resources':
            healthData.metrics.resources = await this.getWorkerResources(worker)
            break
          case 'performance':
            healthData.metrics.performance = await this.getWorkerPerformance(worker)
            break
          case 'diagnostics':
            healthData.metrics.diagnostics = await this.getWorkerDiagnostics(worker)
            break
        }
      }
      
      // Determine overall health status
      healthData.status = this.calculateHealthStatus(healthData.metrics)
      
      // Identify specific issues
      healthData.issues = this.identifyHealthIssues(healthData.metrics)
      
      return healthData
      
    } catch (error) {
      healthData.status = 'error'
      healthData.error = error.message
      return healthData
    }
  }

  /**
   * Ping worker to check basic connectivity
   */
  async pingWorker(worker) {
    const startTime = Date.now()
    
    try {
      // Simulate worker ping - in real implementation, this would be HTTP/TCP ping
      // For now, simulate based on worker status
      const isHealthy = worker.status === 'running'
      const responseTime = isHealthy ? Math.random() * 100 + 10 : Math.random() * 5000 + 1000
      
      await new Promise(resolve => setTimeout(resolve, Math.min(responseTime, 100)))
      
      return {
        success: isHealthy,
        responseTime: Date.now() - startTime,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        success: false,
        responseTime: Date.now() - startTime,
        error: error.message,
        timestamp: new Date()
      }
    }
  }

  /**
   * Get worker status information
   */
  async getWorkerStatus(worker) {
    try {
      // In real implementation, this would query the worker directly
      return {
        status: worker.status || 'unknown',
        uptime: Date.now() - (worker.createdAt?.getTime() || Date.now()),
        version: '1.0.0',
        lastActivity: worker.lastActivity || new Date(),
        activeJobs: Math.floor(Math.random() * 5), // Simulated
        totalJobs: Math.floor(Math.random() * 1000) + 100,
        queue: worker.queueName
      }
    } catch (error) {
      throw new Error(`Failed to get worker status: ${error.message}`)
    }
  }

  /**
   * Get worker performance metrics
   */
  async getWorkerMetrics(worker) {
    try {
      // Simulate performance metrics - in real implementation, get from worker
      const baselineCpu = 20 + Math.random() * 40 // 20-60% baseline
      const baselineMemory = 30 + Math.random() * 30 // 30-60% baseline
      
      return {
        cpu: {
          usage: baselineCpu + (worker.status === 'processing' ? Math.random() * 30 : 0),
          cores: os.cpus().length
        },
        memory: {
          usage: baselineMemory + (worker.status === 'processing' ? Math.random() * 20 : 0),
          total: 1024 * 1024 * 1024, // 1GB
          available: 1024 * 1024 * 500 // 500MB available
        },
        network: {
          bytesIn: Math.floor(Math.random() * 1000000),
          bytesOut: Math.floor(Math.random() * 500000)
        },
        disk: {
          readBytes: Math.floor(Math.random() * 10000000),
          writeBytes: Math.floor(Math.random() * 5000000),
          usage: 40 + Math.random() * 20 // 40-60% disk usage
        }
      }
    } catch (error) {
      throw new Error(`Failed to get worker metrics: ${error.message}`)
    }
  }

  /**
   * Get worker resource utilization
   */
  async getWorkerResources(worker) {
    try {
      const metrics = await this.getWorkerMetrics(worker)
      
      return {
        cpu: {
          percentage: metrics.cpu.usage,
          status: this.getResourceStatus(metrics.cpu.usage, this.config.thresholds.cpu)
        },
        memory: {
          percentage: metrics.memory.usage,
          status: this.getResourceStatus(metrics.memory.usage, this.config.thresholds.memory)
        },
        disk: {
          percentage: metrics.disk.usage,
          status: this.getResourceStatus(metrics.disk.usage, { warning: 80, critical: 95 })
        },
        overall: this.calculateOverallResourceStatus(metrics)
      }
    } catch (error) {
      throw new Error(`Failed to get worker resources: ${error.message}`)
    }
  }

  /**
   * Get worker performance statistics
   */
  async getWorkerPerformance(worker) {
    try {
      // Simulate performance data
      const jobsPerMinute = Math.floor(Math.random() * 20) + 5
      const avgProcessingTime = Math.floor(Math.random() * 30000) + 5000 // 5-35 seconds
      const errorRate = Math.random() * 10 // 0-10%
      
      return {
        throughput: {
          jobsPerMinute,
          jobsPerHour: jobsPerMinute * 60,
          status: jobsPerMinute > 10 ? 'good' : jobsPerMinute > 5 ? 'warning' : 'critical'
        },
        responseTime: {
          average: avgProcessingTime,
          median: avgProcessingTime * 0.8,
          p95: avgProcessingTime * 1.5,
          status: this.getResponseTimeStatus(avgProcessingTime)
        },
        reliability: {
          errorRate,
          successRate: 100 - errorRate,
          status: this.getErrorRateStatus(errorRate)
        },
        efficiency: {
          cpuEfficiency: Math.random() * 40 + 60, // 60-100%
          memoryEfficiency: Math.random() * 30 + 70, // 70-100%
          overall: Math.random() * 20 + 75 // 75-95%
        }
      }
    } catch (error) {
      throw new Error(`Failed to get worker performance: ${error.message}`)
    }
  }

  /**
   * Get worker diagnostic information
   */
  async getWorkerDiagnostics(worker) {
    try {
      return {
        logs: {
          errorCount: Math.floor(Math.random() * 10),
          warningCount: Math.floor(Math.random() * 50),
          lastError: Math.random() > 0.7 ? 'Timeout processing job abc123' : null
        },
        connections: {
          redis: Math.random() > 0.1 ? 'connected' : 'disconnected',
          database: Math.random() > 0.05 ? 'connected' : 'disconnected',
          storage: Math.random() > 0.02 ? 'connected' : 'disconnected'
        },
        queues: {
          activeConnections: Math.floor(Math.random() * 3) + 1,
          processedJobs: Math.floor(Math.random() * 1000) + 100,
          failedJobs: Math.floor(Math.random() * 50)
        },
        system: {
          nodeVersion: process.version,
          platform: os.platform(),
          architecture: os.arch(),
          uptime: os.uptime()
        }
      }
    } catch (error) {
      throw new Error(`Failed to get worker diagnostics: ${error.message}`)
    }
  }

  /**
   * Calculate overall health status from metrics
   */
  calculateHealthStatus(metrics) {
    const issues = this.identifyHealthIssues(metrics)
    const criticalIssues = issues.filter(i => i.severity === 'critical')
    const warningIssues = issues.filter(i => i.severity === 'warning')
    
    if (criticalIssues.length > 0) {
      return 'critical'
    } else if (warningIssues.length > 0) {
      return 'warning'
    } else if (metrics.ping?.success === false) {
      return 'unhealthy'
    } else {
      return 'healthy'
    }
  }

  /**
   * Identify specific health issues
   */
  identifyHealthIssues(metrics) {
    const issues = []
    
    // Check ping issues
    if (metrics.ping && !metrics.ping.success) {
      issues.push({
        type: 'connectivity',
        severity: 'critical',
        message: 'Worker not responding to ping',
        value: metrics.ping.responseTime,
        threshold: null
      })
    }
    
    // Check response time issues
    if (metrics.ping && metrics.ping.responseTime > this.config.thresholds.responseTime.critical) {
      issues.push({
        type: 'response_time',
        severity: 'critical',
        message: 'Response time exceeds critical threshold',
        value: metrics.ping.responseTime,
        threshold: this.config.thresholds.responseTime.critical
      })
    } else if (metrics.ping && metrics.ping.responseTime > this.config.thresholds.responseTime.warning) {
      issues.push({
        type: 'response_time',
        severity: 'warning',
        message: 'Response time exceeds warning threshold',
        value: metrics.ping.responseTime,
        threshold: this.config.thresholds.responseTime.warning
      })
    }
    
    // Check resource issues
    if (metrics.resources) {
      if (metrics.resources.cpu.percentage > this.config.thresholds.cpu.critical) {
        issues.push({
          type: 'cpu',
          severity: 'critical',
          message: 'CPU usage exceeds critical threshold',
          value: metrics.resources.cpu.percentage,
          threshold: this.config.thresholds.cpu.critical
        })
      } else if (metrics.resources.cpu.percentage > this.config.thresholds.cpu.warning) {
        issues.push({
          type: 'cpu',
          severity: 'warning',
          message: 'CPU usage exceeds warning threshold',
          value: metrics.resources.cpu.percentage,
          threshold: this.config.thresholds.cpu.warning
        })
      }
      
      if (metrics.resources.memory.percentage > this.config.thresholds.memory.critical) {
        issues.push({
          type: 'memory',
          severity: 'critical',
          message: 'Memory usage exceeds critical threshold',
          value: metrics.resources.memory.percentage,
          threshold: this.config.thresholds.memory.critical
        })
      } else if (metrics.resources.memory.percentage > this.config.thresholds.memory.warning) {
        issues.push({
          type: 'memory',
          severity: 'warning',
          message: 'Memory usage exceeds warning threshold',
          value: metrics.resources.memory.percentage,
          threshold: this.config.thresholds.memory.warning
        })
      }
    }
    
    // Check performance issues
    if (metrics.performance && metrics.performance.reliability) {
      const errorRate = metrics.performance.reliability.errorRate
      
      if (errorRate > this.config.thresholds.errorRate.critical) {
        issues.push({
          type: 'error_rate',
          severity: 'critical',
          message: 'Error rate exceeds critical threshold',
          value: errorRate,
          threshold: this.config.thresholds.errorRate.critical
        })
      } else if (errorRate > this.config.thresholds.errorRate.warning) {
        issues.push({
          type: 'error_rate',
          severity: 'warning',
          message: 'Error rate exceeds warning threshold',
          value: errorRate,
          threshold: this.config.thresholds.errorRate.warning
        })
      }
    }
    
    return issues
  }

  /**
   * Get all workers from scaling service
   */
  getAllWorkers() {
    const allWorkers = []
    
    for (const [queueName, instances] of this.scalingService.workerInstances) {
      for (const instance of instances) {
        allWorkers.push({
          id: instance.id,
          queueName,
          status: instance.status,
          createdAt: instance.createdAt,
          ...instance
        })
      }
    }
    
    return allWorkers
  }

  /**
   * Update worker health data
   */
  updateWorkerHealth(workerId, healthData) {
    this.workerHealth.set(workerId, {
      ...this.workerHealth.get(workerId),
      ...healthData,
      lastUpdate: new Date()
    })
  }

  /**
   * Store health history for trending
   */
  storeHealthHistory(workerId, healthData) {
    let history = this.healthHistory.get(workerId) || []
    
    history.push({
      timestamp: new Date(),
      metrics: healthData.metrics,
      status: healthData.status,
      issues: healthData.issues
    })
    
    // Keep only recent history (based on retention policy)
    const cutoffTime = Date.now() - this.config.metricsRetention
    history = history.filter(h => h.timestamp.getTime() > cutoffTime)
    
    this.healthHistory.set(workerId, history)
  }

  /**
   * Evaluate worker health and trigger alerts
   */
  async evaluateWorkerHealth(workerId, healthData) {
    const criticalIssues = healthData.issues?.filter(i => i.severity === 'critical') || []
    const warningIssues = healthData.issues?.filter(i => i.severity === 'warning') || []
    
    // Handle critical issues
    if (criticalIssues.length > 0) {
      await this.handleWorkerHealthAlert(workerId, 'critical', criticalIssues, healthData)
    }
    
    // Handle warning issues
    if (warningIssues.length > 0) {
      await this.handleWorkerHealthAlert(workerId, 'warning', warningIssues, healthData)
    }
    
    // Clear alerts if worker is healthy
    if (healthData.status === 'healthy') {
      await this.clearWorkerHealthAlerts(workerId)
    }
  }

  /**
   * Handle worker health alerts
   */
  async handleWorkerHealthAlert(workerId, severity, issues, healthData) {
    const alertKey = `${workerId}_${severity}`
    const existingAlert = this.healthAlerts.get(alertKey)
    
    if (!existingAlert) {
      const alert = {
        workerId,
        queueName: healthData.queueName,
        severity,
        issues,
        firstOccurred: new Date(),
        lastOccurred: new Date(),
        count: 1,
        status: 'active'
      }
      
      this.healthAlerts.set(alertKey, alert)
      
      // Emit health alert event
      this.emit('healthAlert', alert)
      
      this.logger.warn(`💊 Worker health alert`, {
        workerId,
        severity,
        issues: issues.map(i => i.message)
      })
    } else {
      // Update existing alert
      existingAlert.lastOccurred = new Date()
      existingAlert.count++
      existingAlert.issues = issues
    }
  }

  /**
   * Clear worker health alerts
   */
  async clearWorkerHealthAlerts(workerId) {
    const alertsToRemove = []
    
    for (const [alertKey, alert] of this.healthAlerts) {
      if (alert.workerId === workerId) {
        alert.status = 'resolved'
        alert.resolvedAt = new Date()
        
        this.emit('healthAlertResolved', alert)
        alertsToRemove.push(alertKey)
      }
    }
    
    // Remove resolved alerts
    for (const alertKey of alertsToRemove) {
      this.healthAlerts.delete(alertKey)
    }
  }

  /**
   * Update system health metrics
   */
  async updateSystemHealth() {
    try {
      const memUsage = process.memoryUsage()
      const systemMem = {
        total: os.totalmem(),
        free: os.freemem()
      }
      
      this.systemHealth = {
        lastUpdate: new Date(),
        cpu: {
          usage: await this.getCpuUsage(),
          cores: os.cpus().length,
          loadAverage: os.loadavg()
        },
        memory: {
          total: systemMem.total,
          used: systemMem.total - systemMem.free,
          free: systemMem.free,
          percentage: ((systemMem.total - systemMem.free) / systemMem.total) * 100,
          process: {
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external
          }
        },
        system: {
          platform: os.platform(),
          architecture: os.arch(),
          uptime: os.uptime(),
          hostname: os.hostname()
        }
      }
    } catch (error) {
      this.logger.error('Failed to update system health:', error)
    }
  }

  /**
   * Get CPU usage percentage
   */
  async getCpuUsage() {
    return new Promise((resolve) => {
      const startMeasure = this.cpuAverage()
      
      setTimeout(() => {
        const endMeasure = this.cpuAverage()
        const idleDifference = endMeasure.idle - startMeasure.idle
        const totalDifference = endMeasure.total - startMeasure.total
        const usage = 100 - ~~(100 * idleDifference / totalDifference)
        resolve(usage)
      }, 100)
    })
  }

  /**
   * Calculate CPU average
   */
  cpuAverage() {
    const cpus = os.cpus()
    let idle = 0
    let total = 0
    
    for (const cpu of cpus) {
      for (const type in cpu.times) {
        total += cpu.times[type]
      }
      idle += cpu.times.idle
    }
    
    return { idle: idle / cpus.length, total: total / cpus.length }
  }

  /**
   * Get resource status based on thresholds
   */
  getResourceStatus(value, thresholds) {
    if (value >= thresholds.critical) {
      return 'critical'
    } else if (value >= thresholds.warning) {
      return 'warning'
    } else {
      return 'healthy'
    }
  }

  /**
   * Calculate overall resource status
   */
  calculateOverallResourceStatus(metrics) {
    const cpuStatus = this.getResourceStatus(metrics.cpu.usage, this.config.thresholds.cpu)
    const memoryStatus = this.getResourceStatus(metrics.memory.usage, this.config.thresholds.memory)
    
    if (cpuStatus === 'critical' || memoryStatus === 'critical') {
      return 'critical'
    } else if (cpuStatus === 'warning' || memoryStatus === 'warning') {
      return 'warning'
    } else {
      return 'healthy'
    }
  }

  /**
   * Get response time status
   */
  getResponseTimeStatus(responseTime) {
    return this.getResourceStatus(responseTime, this.config.thresholds.responseTime)
  }

  /**
   * Get error rate status
   */
  getErrorRateStatus(errorRate) {
    return this.getResourceStatus(errorRate, this.config.thresholds.errorRate)
  }

  /**
   * Update performance baseline for worker
   */
  async updatePerformanceBaseline(workerId, healthData) {
    let baseline = this.performanceBaselines.get(workerId) || {
      cpu: { min: 100, max: 0, avg: 0, samples: 0 },
      memory: { min: 100, max: 0, avg: 0, samples: 0 },
      responseTime: { min: Infinity, max: 0, avg: 0, samples: 0 },
      throughput: { min: Infinity, max: 0, avg: 0, samples: 0 }
    }
    
    if (healthData.metrics.resources) {
      const cpu = healthData.metrics.resources.cpu.percentage
      const memory = healthData.metrics.resources.memory.percentage
      
      baseline.cpu = this.updateMetricBaseline(baseline.cpu, cpu)
      baseline.memory = this.updateMetricBaseline(baseline.memory, memory)
    }
    
    if (healthData.metrics.ping) {
      baseline.responseTime = this.updateMetricBaseline(baseline.responseTime, healthData.metrics.ping.responseTime)
    }
    
    if (healthData.metrics.performance?.throughput) {
      baseline.throughput = this.updateMetricBaseline(baseline.throughput, healthData.metrics.performance.throughput.jobsPerMinute)
    }
    
    this.performanceBaselines.set(workerId, baseline)
  }

  /**
   * Update metric baseline statistics
   */
  updateMetricBaseline(baseline, newValue) {
    baseline.min = Math.min(baseline.min, newValue)
    baseline.max = Math.max(baseline.max, newValue)
    baseline.avg = ((baseline.avg * baseline.samples) + newValue) / (baseline.samples + 1)
    baseline.samples++
    
    return baseline
  }

  /**
   * Perform advanced health analysis
   */
  async performAdvancedHealthAnalysis(workerId, healthData) {
    const history = this.healthHistory.get(workerId) || []
    
    if (history.length < 5) return // Need at least 5 data points
    
    // Trend analysis
    const trends = this.analyzeTrends(history)
    
    // Anomaly detection
    const anomalies = this.detectAnomalies(workerId, healthData, history)
    
    // Performance degradation detection
    const degradation = this.detectPerformanceDegradation(workerId, history)
    
    // Emit advanced analysis results
    if (trends.declining.length > 0 || anomalies.length > 0 || degradation) {
      this.emit('advancedHealthAnalysis', {
        workerId,
        trends,
        anomalies,
        degradation,
        timestamp: new Date()
      })
    }
  }

  /**
   * Analyze health trends
   */
  analyzeTrends(history) {
    const recentHistory = history.slice(-10) // Last 10 measurements
    
    const trends = {
      improving: [],
      declining: [],
      stable: []
    }
    
    // Analyze CPU trend
    const cpuValues = recentHistory.map(h => h.metrics.resources?.cpu?.percentage || 0)
    const cpuTrend = this.calculateTrend(cpuValues)
    
    if (cpuTrend.slope > 5) {
      trends.declining.push({ metric: 'cpu', trend: cpuTrend })
    } else if (cpuTrend.slope < -5) {
      trends.improving.push({ metric: 'cpu', trend: cpuTrend })
    } else {
      trends.stable.push({ metric: 'cpu', trend: cpuTrend })
    }
    
    // Analyze memory trend
    const memoryValues = recentHistory.map(h => h.metrics.resources?.memory?.percentage || 0)
    const memoryTrend = this.calculateTrend(memoryValues)
    
    if (memoryTrend.slope > 5) {
      trends.declining.push({ metric: 'memory', trend: memoryTrend })
    } else if (memoryTrend.slope < -5) {
      trends.improving.push({ metric: 'memory', trend: memoryTrend })
    } else {
      trends.stable.push({ metric: 'memory', trend: memoryTrend })
    }
    
    return trends
  }

  /**
   * Calculate trend slope using linear regression
   */
  calculateTrend(values) {
    const n = values.length
    const sumX = (n * (n - 1)) / 2
    const sumY = values.reduce((sum, val) => sum + val, 0)
    const sumXY = values.reduce((sum, val, index) => sum + (index * val), 0)
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    return { slope, intercept }
  }

  /**
   * Detect anomalies in worker behavior
   */
  detectAnomalies(workerId, currentHealth, history) {
    const baseline = this.performanceBaselines.get(workerId)
    const anomalies = []
    
    if (!baseline || baseline.cpu.samples < 10) return anomalies
    
    // Check for CPU anomalies
    if (currentHealth.metrics.resources?.cpu) {
      const currentCpu = currentHealth.metrics.resources.cpu.percentage
      const cpuStdDev = this.calculateStandardDeviation(history.map(h => h.metrics.resources?.cpu?.percentage || 0))
      
      if (Math.abs(currentCpu - baseline.cpu.avg) > 2 * cpuStdDev) {
        anomalies.push({
          type: 'cpu',
          value: currentCpu,
          baseline: baseline.cpu.avg,
          deviation: Math.abs(currentCpu - baseline.cpu.avg),
          severity: Math.abs(currentCpu - baseline.cpu.avg) > 3 * cpuStdDev ? 'critical' : 'warning'
        })
      }
    }
    
    return anomalies
  }

  /**
   * Calculate standard deviation
   */
  calculateStandardDeviation(values) {
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length
    const squaredDiffs = values.map(val => Math.pow(val - avg, 2))
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length
    return Math.sqrt(avgSquaredDiff)
  }

  /**
   * Detect performance degradation
   */
  detectPerformanceDegradation(workerId, history) {
    const recentHistory = history.slice(-5)
    const olderHistory = history.slice(-15, -5)
    
    if (recentHistory.length < 5 || olderHistory.length < 5) return null
    
    const recentAvgCpu = recentHistory.reduce((sum, h) => sum + (h.metrics.resources?.cpu?.percentage || 0), 0) / recentHistory.length
    const olderAvgCpu = olderHistory.reduce((sum, h) => sum + (h.metrics.resources?.cpu?.percentage || 0), 0) / olderHistory.length
    
    const degradationThreshold = 20 // 20% increase is considered degradation
    
    if (recentAvgCpu - olderAvgCpu > degradationThreshold) {
      return {
        type: 'performance_degradation',
        metric: 'cpu',
        recentAvg: recentAvgCpu,
        previousAvg: olderAvgCpu,
        degradation: recentAvgCpu - olderAvgCpu,
        severity: recentAvgCpu - olderAvgCpu > 30 ? 'critical' : 'warning'
      }
    }
    
    return null
  }

  /**
   * Get comprehensive health summary
   */
  async getHealthSummary() {
    const allWorkers = this.getAllWorkers()
    const workerHealthData = []
    
    for (const worker of allWorkers) {
      const health = this.workerHealth.get(worker.id)
      if (health) {
        workerHealthData.push(health)
      }
    }
    
    const healthByStatus = workerHealthData.reduce((acc, health) => {
      acc[health.status] = (acc[health.status] || 0) + 1
      return acc
    }, {})
    
    const activeAlerts = Array.from(this.healthAlerts.values()).filter(alert => alert.status === 'active')
    
    return {
      summary: {
        totalWorkers: allWorkers.length,
        healthyWorkers: healthByStatus.healthy || 0,
        warningWorkers: healthByStatus.warning || 0,
        criticalWorkers: healthByStatus.critical || 0,
        unhealthyWorkers: healthByStatus.unhealthy || 0,
        activeAlerts: activeAlerts.length
      },
      system: this.systemHealth,
      workers: workerHealthData,
      alerts: activeAlerts,
      timestamp: new Date()
    }
  }

  /**
   * Get worker health details
   */
  async getWorkerHealthDetails(workerId) {
    const health = this.workerHealth.get(workerId)
    const history = this.healthHistory.get(workerId) || []
    const baseline = this.performanceBaselines.get(workerId)
    const alerts = Array.from(this.healthAlerts.values()).filter(alert => alert.workerId === workerId)
    
    return {
      current: health,
      history: history.slice(-50), // Last 50 measurements
      baseline,
      alerts,
      timestamp: new Date()
    }
  }

  /**
   * Update health configuration
   */
  updateHealthConfig(updates) {
    Object.assign(this.config, updates)
    
    this.logger.info('💊 Health configuration updated', {
      updates: Object.keys(updates)
    })
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.basicHealthInterval) {
      clearInterval(this.basicHealthInterval)
      this.basicHealthInterval = null
    }
    
    if (this.detailedHealthInterval) {
      clearInterval(this.detailedHealthInterval)
      this.detailedHealthInterval = null
    }
    
    if (this.systemHealthInterval) {
      clearInterval(this.systemHealthInterval)
      this.systemHealthInterval = null
    }
    
    this.logger.info('💊 Health monitoring stopped')
  }

  /**
   * Shutdown health service
   */
  async shutdown() {
    try {
      this.stopHealthMonitoring()
      this.logger.info('💊 Health Service shut down')
    } catch (error) {
      this.logger.error('Error shutting down health service:', error)
    }
  }
}

module.exports = HealthService 