const EventEmitter = require('events')
const winston = require('winston')

class ScalingService extends EventEmitter {
  constructor(queueService, monitoringService, logger) {
    super()
    
    this.queueService = queueService
    this.monitoringService = monitoringService
    this.logger = logger || winston.createLogger()
    
    // Scaling configuration
    this.config = {
      enabled: true,
      checkInterval: 30000, // 30 seconds
      
      // Scaling thresholds
      thresholds: {
        scaleUp: {
          queueLength: 50,        // Jobs in queue
          waitTime: 300000,       // 5 minutes wait time
          cpuUsage: 80,           // 80% CPU usage
          memoryUsage: 85,        // 85% memory usage
          failureRate: 10         // 10% failure rate
        },
        scaleDown: {
          queueLength: 5,         // Low queue length
          waitTime: 60000,        // 1 minute wait time  
          cpuUsage: 30,           // 30% CPU usage
          memoryUsage: 40,        // 40% memory usage
          idleTime: 600000        // 10 minutes idle
        }
      },
      
      // Worker limits per queue
      workerLimits: {
        'ai-analysis': { min: 1, max: 5, optimal: 2 },
        'transcription': { min: 1, max: 3, optimal: 1 },
        'whisper-timestamp': { min: 1, max: 2, optimal: 1 },
        'video-processing': { min: 1, max: 4, optimal: 2 }
      },
      
      // Scaling strategies
      strategies: {
        aggressive: {
          scaleUpFactor: 2,      // Double workers
          scaleDownFactor: 0.5,  // Halve workers
          cooldownPeriod: 120000 // 2 minutes
        },
        moderate: {
          scaleUpFactor: 1.5,    // 50% more workers
          scaleDownFactor: 0.75, // 25% fewer workers
          cooldownPeriod: 300000 // 5 minutes
        },
        conservative: {
          scaleUpFactor: 1.25,   // 25% more workers
          scaleDownFactor: 0.9,  // 10% fewer workers
          cooldownPeriod: 600000 // 10 minutes
        }
      },
      
      currentStrategy: 'moderate'
    }
    
    // Track worker instances and scaling state
    this.workerInstances = new Map() // queueName -> [worker instances]
    this.scalingHistory = []
    this.lastScaleTime = new Map() // queueName -> timestamp
    this.scalingMetrics = new Map()
    this.loadBalancer = new LoadBalancer(this.logger)
    
    this.startScalingMonitor()
    
    this.logger.info('📈 Scaling Service initialized', {
      strategy: this.config.currentStrategy,
      checkInterval: this.config.checkInterval,
      workerLimits: this.config.workerLimits
    })
  }

  /**
   * Start the scaling monitor
   */
  startScalingMonitor() {
    if (!this.config.enabled) {
      this.logger.info('📈 Scaling monitoring disabled')
      return
    }
    
    this.scalingInterval = setInterval(async () => {
      try {
        await this.evaluateScaling()
      } catch (error) {
        this.logger.error('Scaling evaluation failed:', error)
      }
    }, this.config.checkInterval)
    
    this.logger.info('📈 Scaling monitor started')
  }

  /**
   * Evaluate scaling needs for all queues
   */
  async evaluateScaling() {
    try {
      const queueNames = Object.keys(this.config.workerLimits)
      const scalingDecisions = []
      
      for (const queueName of queueNames) {
        const decision = await this.evaluateQueueScaling(queueName)
        if (decision.action !== 'none') {
          scalingDecisions.push(decision)
        }
      }
      
      // Execute scaling decisions
      for (const decision of scalingDecisions) {
        await this.executeScalingDecision(decision)
      }
      
      // Update metrics
      await this.updateScalingMetrics(scalingDecisions)
      
      if (scalingDecisions.length > 0) {
        this.logger.info('📈 Scaling evaluation completed', {
          decisions: scalingDecisions.length,
          actions: scalingDecisions.map(d => `${d.queueName}: ${d.action}`)
        })
      }
      
    } catch (error) {
      this.logger.error('Failed to evaluate scaling:', error)
    }
  }

  /**
   * Evaluate scaling for a specific queue
   */
  async evaluateQueueScaling(queueName) {
    try {
      // Get current metrics
      const queueStats = await this.queueService.getQueueStats(queueName)
      const workerHealth = await this.getWorkerHealth(queueName)
      const currentWorkers = this.getCurrentWorkerCount(queueName)
      const limits = this.config.workerLimits[queueName]
      
      // Check cooldown period
      const lastScale = this.lastScaleTime.get(queueName) || 0
      const strategy = this.config.strategies[this.config.currentStrategy]
      const cooldownRemaining = (lastScale + strategy.cooldownPeriod) - Date.now()
      
      if (cooldownRemaining > 0) {
        return {
          queueName,
          action: 'none',
          reason: `Cooldown active (${Math.ceil(cooldownRemaining / 1000)}s remaining)`
        }
      }
      
      // Calculate scaling score
      const scalingFactors = this.calculateScalingFactors(queueStats, workerHealth)
      const recommendation = this.getScalingRecommendation(
        scalingFactors, 
        currentWorkers, 
        limits
      )
      
      return {
        queueName,
        action: recommendation.action,
        reason: recommendation.reason,
        currentWorkers,
        targetWorkers: recommendation.targetWorkers,
        factors: scalingFactors,
        confidence: recommendation.confidence
      }
      
    } catch (error) {
      this.logger.error(`Failed to evaluate scaling for ${queueName}:`, error)
      return { queueName, action: 'none', reason: 'evaluation_failed' }
    }
  }

  /**
   * Calculate scaling factors based on metrics
   */
  calculateScalingFactors(queueStats, workerHealth) {
    const factors = {
      queuePressure: 0,      // 0-100: queue load pressure
      responsiveness: 0,     // 0-100: how quickly jobs are processed
      resourceStress: 0,     // 0-100: CPU/memory stress
      reliability: 0,        // 0-100: failure rate impact
      efficiency: 0          // 0-100: worker utilization
    }
    
    // Queue pressure (waiting jobs / processing capacity)
    const waitingJobs = queueStats.waiting || 0
    const activeJobs = queueStats.active || 0
    const completedJobs = queueStats.completed || 0
    const failedJobs = queueStats.failed || 0
    
    if (waitingJobs > 0) {
      factors.queuePressure = Math.min(100, (waitingJobs / this.config.thresholds.scaleUp.queueLength) * 100)
    }
    
    // Responsiveness (average wait time)
    const avgWaitTime = queueStats.avgWaitTime || 0
    if (avgWaitTime > 0) {
      factors.responsiveness = Math.min(100, (avgWaitTime / this.config.thresholds.scaleUp.waitTime) * 100)
    }
    
    // Resource stress (CPU/memory from workers)
    if (workerHealth.length > 0) {
      const avgCpu = workerHealth.reduce((sum, w) => sum + (w.cpu || 0), 0) / workerHealth.length
      const avgMemory = workerHealth.reduce((sum, w) => sum + (w.memory || 0), 0) / workerHealth.length
      
      factors.resourceStress = Math.max(
        (avgCpu / this.config.thresholds.scaleUp.cpuUsage) * 100,
        (avgMemory / this.config.thresholds.scaleUp.memoryUsage) * 100
      )
    }
    
    // Reliability (failure rate)
    const totalJobs = completedJobs + failedJobs
    if (totalJobs > 0) {
      const failureRate = (failedJobs / totalJobs) * 100
      factors.reliability = Math.min(100, (failureRate / this.config.thresholds.scaleUp.failureRate) * 100)
    }
    
    // Efficiency (active workers vs idle)
    const activeWorkers = workerHealth.filter(w => w.status === 'processing').length
    const totalWorkers = workerHealth.length
    if (totalWorkers > 0) {
      factors.efficiency = (activeWorkers / totalWorkers) * 100
    }
    
    return factors
  }

  /**
   * Get scaling recommendation based on factors
   */
  getScalingRecommendation(factors, currentWorkers, limits) {
    // Calculate overall pressure score
    const pressureScore = (
      factors.queuePressure * 0.3 +      // Queue backlog weight
      factors.responsiveness * 0.25 +    // Response time weight  
      factors.resourceStress * 0.25 +    // Resource usage weight
      factors.reliability * 0.1 +        // Failure rate weight
      (100 - factors.efficiency) * 0.1   // Inefficiency weight
    )
    
    const strategy = this.config.strategies[this.config.currentStrategy]
    
    // Scale up decision
    if (pressureScore >= 70 && currentWorkers < limits.max) {
      const targetWorkers = Math.min(
        limits.max,
        Math.ceil(currentWorkers * strategy.scaleUpFactor)
      )
      
      return {
        action: 'scale_up',
        targetWorkers,
        reason: `High pressure (${Math.round(pressureScore)}%)`,
        confidence: Math.min(100, pressureScore)
      }
    }
    
    // Scale down decision
    if (pressureScore <= 20 && currentWorkers > limits.min) {
      const targetWorkers = Math.max(
        limits.min,
        Math.floor(currentWorkers * strategy.scaleDownFactor)
      )
      
      return {
        action: 'scale_down',
        targetWorkers,
        reason: `Low pressure (${Math.round(pressureScore)}%)`,
        confidence: Math.min(100, 100 - pressureScore)
      }
    }
    
    return {
      action: 'none',
      targetWorkers: currentWorkers,
      reason: `Pressure balanced (${Math.round(pressureScore)}%)`,
      confidence: 50
    }
  }

  /**
   * Execute scaling decision
   */
  async executeScalingDecision(decision) {
    try {
      const { queueName, action, targetWorkers, currentWorkers } = decision
      
      if (action === 'scale_up') {
        const workersToAdd = targetWorkers - currentWorkers
        await this.scaleUpWorkers(queueName, workersToAdd)
        
      } else if (action === 'scale_down') {
        const workersToRemove = currentWorkers - targetWorkers
        await this.scaleDownWorkers(queueName, workersToRemove)
      }
      
      // Record scaling action
      this.recordScalingAction(decision)
      this.lastScaleTime.set(queueName, Date.now())
      
      // Emit scaling event
      this.emit('scaled', {
        queueName,
        action,
        from: currentWorkers,
        to: targetWorkers,
        timestamp: new Date()
      })
      
      this.logger.info(`📈 Scaling executed`, {
        queueName,
        action,
        from: currentWorkers,
        to: targetWorkers,
        reason: decision.reason
      })
      
    } catch (error) {
      this.logger.error('Failed to execute scaling decision:', error)
    }
  }

  /**
   * Scale up workers for a queue
   */
  async scaleUpWorkers(queueName, workersToAdd) {
    try {
      const instances = this.workerInstances.get(queueName) || []
      
      for (let i = 0; i < workersToAdd; i++) {
        const workerInstance = await this.createWorkerInstance(queueName)
        instances.push(workerInstance)
      }
      
      this.workerInstances.set(queueName, instances)
      
      this.logger.info(`🚀 Scaled up ${queueName}`, {
        workersAdded: workersToAdd,
        totalWorkers: instances.length
      })
      
    } catch (error) {
      this.logger.error(`Failed to scale up ${queueName}:`, error)
      throw error
    }
  }

  /**
   * Scale down workers for a queue
   */
  async scaleDownWorkers(queueName, workersToRemove) {
    try {
      const instances = this.workerInstances.get(queueName) || []
      const workersToTerminate = instances.slice(-workersToRemove)
      
      for (const worker of workersToTerminate) {
        await this.terminateWorkerInstance(worker)
      }
      
      const remainingInstances = instances.slice(0, -workersToRemove)
      this.workerInstances.set(queueName, remainingInstances)
      
      this.logger.info(`🔻 Scaled down ${queueName}`, {
        workersRemoved: workersToRemove,
        totalWorkers: remainingInstances.length
      })
      
    } catch (error) {
      this.logger.error(`Failed to scale down ${queueName}:`, error)
      throw error
    }
  }

  /**
   * Create a new worker instance
   */
  async createWorkerInstance(queueName) {
    // This would integrate with container orchestration (Docker, Kubernetes)
    // For now, simulate worker creation
    
    const workerId = `${queueName}-worker-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
    
    const workerInstance = {
      id: workerId,
      queueName,
      status: 'starting',
      createdAt: new Date(),
      health: {
        cpu: 0,
        memory: 0,
        status: 'healthy'
      },
      // In real implementation, this would be container/process info
      containerInfo: {
        image: `worker-${queueName}:latest`,
        port: 3000 + Math.floor(Math.random() * 1000),
        environment: process.env.NODE_ENV || 'development'
      }
    }
    
    // Simulate startup time
    setTimeout(() => {
      workerInstance.status = 'running'
      this.logger.info(`🚀 Worker instance started`, {
        workerId,
        queueName
      })
    }, 5000)
    
    return workerInstance
  }

  /**
   * Terminate a worker instance
   */
  async terminateWorkerInstance(workerInstance) {
    try {
      // Graceful shutdown process
      workerInstance.status = 'terminating'
      
      // In real implementation, send SIGTERM to container/process
      // Wait for graceful shutdown, then SIGKILL if needed
      
      this.logger.info(`🛑 Worker instance terminated`, {
        workerId: workerInstance.id,
        queueName: workerInstance.queueName,
        uptime: Date.now() - workerInstance.createdAt.getTime()
      })
      
    } catch (error) {
      this.logger.error('Failed to terminate worker instance:', error)
      throw error
    }
  }

  /**
   * Get worker health for a queue
   */
  async getWorkerHealth(queueName) {
    const instances = this.workerInstances.get(queueName) || []
    
    return instances.map(instance => ({
      id: instance.id,
      status: instance.status,
      cpu: Math.random() * 100, // Simulated - would be real metrics
      memory: Math.random() * 100,
      uptime: Date.now() - instance.createdAt.getTime(),
      health: instance.health.status
    }))
  }

  /**
   * Get current worker count for a queue
   */
  getCurrentWorkerCount(queueName) {
    const instances = this.workerInstances.get(queueName) || []
    return instances.filter(i => i.status === 'running' || i.status === 'starting').length
  }

  /**
   * Record scaling action for history
   */
  recordScalingAction(decision) {
    this.scalingHistory.push({
      ...decision,
      timestamp: new Date(),
      id: `scale-${Date.now()}`
    })
    
    // Keep last 1000 scaling actions
    if (this.scalingHistory.length > 1000) {
      this.scalingHistory = this.scalingHistory.slice(-1000)
    }
  }

  /**
   * Update scaling metrics
   */
  async updateScalingMetrics(decisions) {
    for (const decision of decisions) {
      const { queueName } = decision
      
      let queueMetrics = this.scalingMetrics.get(queueName) || {
        totalScalingActions: 0,
        scaleUpActions: 0,
        scaleDownActions: 0,
        avgWorkerCount: 0,
        lastUpdate: new Date()
      }
      
      queueMetrics.totalScalingActions++
      
      if (decision.action === 'scale_up') {
        queueMetrics.scaleUpActions++
      } else if (decision.action === 'scale_down') {
        queueMetrics.scaleDownActions++
      }
      
      queueMetrics.avgWorkerCount = this.getCurrentWorkerCount(queueName)
      queueMetrics.lastUpdate = new Date()
      
      this.scalingMetrics.set(queueName, queueMetrics)
    }
  }

  /**
   * Get scaling statistics
   */
  async getScalingStats() {
    const stats = {
      enabled: this.config.enabled,
      strategy: this.config.currentStrategy,
      totalWorkers: 0,
      queues: {},
      history: {
        total: this.scalingHistory.length,
        recent: this.scalingHistory.slice(-10)
      }
    }
    
    for (const [queueName, limits] of Object.entries(this.config.workerLimits)) {
      const currentWorkers = this.getCurrentWorkerCount(queueName)
      const health = await this.getWorkerHealth(queueName)
      const metrics = this.scalingMetrics.get(queueName) || {}
      
      stats.totalWorkers += currentWorkers
      stats.queues[queueName] = {
        currentWorkers,
        limits,
        health,
        metrics,
        instances: this.workerInstances.get(queueName) || []
      }
    }
    
    return stats
  }

  /**
   * Set scaling strategy
   */
  setScalingStrategy(strategy) {
    if (!this.config.strategies[strategy]) {
      throw new Error(`Unknown scaling strategy: ${strategy}`)
    }
    
    this.config.currentStrategy = strategy
    
    this.logger.info(`📈 Scaling strategy changed`, {
      strategy,
      config: this.config.strategies[strategy]
    })
  }

  /**
   * Update scaling configuration
   */
  updateScalingConfig(updates) {
    Object.assign(this.config, updates)
    
    this.logger.info(`📈 Scaling configuration updated`, {
      updates: Object.keys(updates)
    })
  }

  /**
   * Stop scaling monitor
   */
  stopScalingMonitor() {
    if (this.scalingInterval) {
      clearInterval(this.scalingInterval)
      this.scalingInterval = null
      this.logger.info('📈 Scaling monitor stopped')
    }
  }

  /**
   * Shutdown scaling service
   */
  async shutdown() {
    try {
      this.stopScalingMonitor()
      
      // Gracefully terminate all worker instances
      for (const [queueName, instances] of this.workerInstances) {
        for (const instance of instances) {
          await this.terminateWorkerInstance(instance)
        }
      }
      
      this.logger.info('📈 Scaling Service shut down')
    } catch (error) {
      this.logger.error('Error shutting down scaling service:', error)
    }
  }
}

/**
 * Load Balancer for intelligent job distribution
 */
class LoadBalancer {
  constructor(logger) {
    this.logger = logger
    this.routingStrategies = {
      round_robin: this.roundRobinStrategy.bind(this),
      least_connections: this.leastConnectionsStrategy.bind(this),
      weighted_round_robin: this.weightedRoundRobinStrategy.bind(this),
      resource_aware: this.resourceAwareStrategy.bind(this)
    }
    
    this.currentStrategy = 'resource_aware'
    this.workerStats = new Map() // workerId -> stats
    this.roundRobinCounters = new Map() // queueName -> counter
  }

  /**
   * Select best worker for job based on strategy
   */
  selectWorker(queueName, workers, jobData = {}) {
    if (!workers || workers.length === 0) {
      return null
    }
    
    if (workers.length === 1) {
      return workers[0]
    }
    
    const strategy = this.routingStrategies[this.currentStrategy]
    if (!strategy) {
      return this.roundRobinStrategy(queueName, workers, jobData)
    }
    
    return strategy(queueName, workers, jobData)
  }

  /**
   * Round robin strategy
   */
  roundRobinStrategy(queueName, workers, jobData) {
    let counter = this.roundRobinCounters.get(queueName) || 0
    const worker = workers[counter % workers.length]
    
    this.roundRobinCounters.set(queueName, counter + 1)
    return worker
  }

  /**
   * Least connections strategy
   */
  leastConnectionsStrategy(queueName, workers, jobData) {
    return workers.reduce((best, worker) => {
      const workerStats = this.workerStats.get(worker.id) || { activeJobs: 0 }
      const bestStats = this.workerStats.get(best.id) || { activeJobs: 0 }
      
      return workerStats.activeJobs < bestStats.activeJobs ? worker : best
    })
  }

  /**
   * Weighted round robin strategy
   */
  weightedRoundRobinStrategy(queueName, workers, jobData) {
    // Weight based on worker health and performance
    const weights = workers.map(worker => {
      const stats = this.workerStats.get(worker.id) || {}
      const cpuWeight = Math.max(0.1, 1 - (stats.cpu || 0) / 100)
      const memoryWeight = Math.max(0.1, 1 - (stats.memory || 0) / 100)
      const loadWeight = Math.max(0.1, 1 - (stats.activeJobs || 0) / 10)
      
      return cpuWeight * memoryWeight * loadWeight
    })
    
    // Select based on cumulative weights
    const totalWeight = weights.reduce((sum, w) => sum + w, 0)
    let random = Math.random() * totalWeight
    
    for (let i = 0; i < workers.length; i++) {
      random -= weights[i]
      if (random <= 0) {
        return workers[i]
      }
    }
    
    return workers[0]
  }

  /**
   * Resource-aware strategy (most sophisticated)
   */
  resourceAwareStrategy(queueName, workers, jobData) {
    const healthyWorkers = workers.filter(w => w.health === 'healthy')
    
    if (healthyWorkers.length === 0) {
      return workers[0] // Fallback to any worker
    }
    
    // Score workers based on multiple factors
    const scoredWorkers = healthyWorkers.map(worker => {
      const stats = this.workerStats.get(worker.id) || {}
      
      // Resource utilization score (lower is better)
      const cpuScore = 100 - (stats.cpu || 0)
      const memoryScore = 100 - (stats.memory || 0)
      
      // Load score (lower active jobs is better)
      const loadScore = Math.max(0, 100 - (stats.activeJobs || 0) * 10)
      
      // Performance score (based on job completion times)
      const perfScore = stats.avgCompletionTime ? 
        Math.max(0, 100 - stats.avgCompletionTime / 1000) : 50
      
      // Reliability score (based on failure rate)
      const reliabilityScore = stats.failureRate ? 
        Math.max(0, 100 - stats.failureRate * 100) : 100
      
      // Combined score with weights
      const totalScore = (
        cpuScore * 0.25 +
        memoryScore * 0.25 +
        loadScore * 0.3 +
        perfScore * 0.1 +
        reliabilityScore * 0.1
      )
      
      return { worker, score: totalScore }
    })
    
    // Sort by score (highest first) and return best worker
    scoredWorkers.sort((a, b) => b.score - a.score)
    return scoredWorkers[0].worker
  }

  /**
   * Update worker statistics
   */
  updateWorkerStats(workerId, stats) {
    this.workerStats.set(workerId, {
      ...this.workerStats.get(workerId),
      ...stats,
      lastUpdate: new Date()
    })
  }

  /**
   * Get load balancing statistics
   */
  getLoadBalancingStats() {
    return {
      strategy: this.currentStrategy,
      workerStats: Object.fromEntries(this.workerStats),
      strategies: Object.keys(this.routingStrategies)
    }
  }

  /**
   * Set load balancing strategy
   */
  setStrategy(strategy) {
    if (!this.routingStrategies[strategy]) {
      throw new Error(`Unknown load balancing strategy: ${strategy}`)
    }
    
    this.currentStrategy = strategy
    this.logger.info(`⚖️ Load balancing strategy changed to: ${strategy}`)
  }
}

module.exports = { ScalingService, LoadBalancer } 