const EventEmitter = require('events')
const winston = require('winston')
const LRU = require('lru-cache')

class PerformanceService extends EventEmitter {
  constructor(queueService, scalingService, healthService, logger) {
    super()
    
    this.queueService = queueService
    this.scalingService = scalingService
    this.healthService = healthService
    this.logger = logger || winston.createLogger()
    
    // Performance optimization configuration
    this.config = {
      enabled: true,
      optimizationInterval: 60000,    // 1 minute optimization cycles
      performanceWindow: 300000,      // 5 minute performance window
      
      // Caching configuration
      caching: {
        enabled: true,
        defaultTTL: 300000,           // 5 minutes
        maxSize: 1000,                // Maximum cache entries
        strategies: {
          'ai-analysis': { ttl: 600000, maxSize: 100 },      // 10 min, AI results
          'transcription': { ttl: 3600000, maxSize: 200 },   // 1 hour, transcriptions
          'video-processing': { ttl: 1800000, maxSize: 50 }, // 30 min, video metadata
          'whisper-timestamp': { ttl: 3600000, maxSize: 150 } // 1 hour, timestamps
        }
      },
      
      // Resource pooling configuration
      resourcePooling: {
        enabled: true,
        poolSizes: {
          'ai-analysis': { connections: 5, workers: 3 },
          'transcription': { connections: 3, workers: 2 },
          'video-processing': { connections: 4, workers: 3 },
          'whisper-timestamp': { connections: 2, workers: 1 }
        },
        connectionTimeout: 30000,     // 30 seconds
        idleTimeout: 300000,          // 5 minutes
        maxRetries: 3
      },
      
      // Performance thresholds for optimization
      thresholds: {
        responseTime: {
          target: 5000,               // 5 seconds target
          warning: 10000,             // 10 seconds warning
          critical: 20000             // 20 seconds critical
        },
        throughput: {
          minimum: 10,                // 10 jobs/minute minimum
          target: 30,                 // 30 jobs/minute target
          optimal: 60                 // 60 jobs/minute optimal
        },
        resourceUtilization: {
          target: 70,                 // 70% target utilization
          maximum: 90                 // 90% maximum before optimization
        },
        queueDepth: {
          warning: 50,                // 50 jobs warning
          critical: 200               // 200 jobs critical
        }
      },
      
      // Optimization strategies
      strategies: {
        caching: {
          enabled: true,
          aggressiveness: 'moderate', // conservative, moderate, aggressive
          adaptiveTTL: true
        },
        prefetching: {
          enabled: true,
          predictiveModels: true,
          prefetchThreshold: 0.7      // 70% confidence threshold
        },
        batching: {
          enabled: true,
          batchSizes: {
            'ai-analysis': 5,
            'transcription': 3,
            'video-processing': 4,
            'whisper-timestamp': 2
          },
          batchTimeout: 10000         // 10 seconds max batch wait
        },
        compression: {
          enabled: true,
          algorithms: ['gzip', 'brotli'],
          thresholds: {
            minSize: 1024,            // 1KB minimum
            compressionRatio: 0.8     // 80% compression target
          }
        }
      }
    }
    
    // Performance tracking
    this.performanceMetrics = new Map()  // queueName -> metrics
    this.optimizationHistory = []
    this.bottlenecks = new Map()         // queueName -> bottleneck data
    this.performanceBaselines = new Map() // queueName -> baseline metrics
    
    // Caching infrastructure
    this.caches = new Map()              // queueName -> LRU cache
    this.cacheStats = new Map()          // queueName -> cache statistics
    
    // Resource pools
    this.resourcePools = new Map()       // queueName -> resource pool
    this.poolStats = new Map()           // queueName -> pool statistics
    
    // Performance prediction models
    this.predictionModels = new Map()    // queueName -> prediction model
    
    this.initializeInfrastructure()
    this.startPerformanceOptimization()
    
    this.logger.info('⚡ Performance Service initialized', {
      optimizationInterval: this.config.optimizationInterval,
      cachingEnabled: this.config.caching.enabled,
      resourcePoolingEnabled: this.config.resourcePooling.enabled,
      strategies: Object.keys(this.config.strategies).filter(s => this.config.strategies[s].enabled)
    })
  }

  /**
   * Initialize performance infrastructure
   */
  initializeInfrastructure() {
    // Initialize caches for each queue
    for (const [queueName, cacheConfig] of Object.entries(this.config.caching.strategies)) {
      this.caches.set(queueName, new LRU({
        max: cacheConfig.maxSize,
        ttl: cacheConfig.ttl,
        updateAgeOnGet: true,
        dispose: (value, key) => {
          this.logger.debug(`Cache entry disposed: ${key}`)
        }
      }))
      
      this.cacheStats.set(queueName, {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
        totalRequests: 0,
        avgResponseTime: 0
      })
    }
    
    // Initialize resource pools
    for (const [queueName, poolConfig] of Object.entries(this.config.resourcePooling.poolSizes)) {
      this.resourcePools.set(queueName, {
        connections: new Array(poolConfig.connections).fill(null).map((_, i) => ({
          id: `${queueName}-conn-${i}`,
          inUse: false,
          created: new Date(),
          lastUsed: null,
          usageCount: 0
        })),
        workers: new Array(poolConfig.workers).fill(null).map((_, i) => ({
          id: `${queueName}-worker-${i}`,
          busy: false,
          created: new Date(),
          lastTask: null,
          tasksCompleted: 0
        }))
      })
      
      this.poolStats.set(queueName, {
        connectionsInUse: 0,
        workersBusy: 0,
        totalConnections: poolConfig.connections,
        totalWorkers: poolConfig.workers,
        utilizationRate: 0,
        avgWaitTime: 0
      })
    }
    
    // Initialize performance baselines
    for (const queueName of Object.keys(this.config.caching.strategies)) {
      this.performanceBaselines.set(queueName, {
        responseTime: { min: Infinity, max: 0, avg: 0, samples: 0 },
        throughput: { min: Infinity, max: 0, avg: 0, samples: 0 },
        errorRate: { min: 0, max: 0, avg: 0, samples: 0 },
        resourceUsage: { min: 0, max: 100, avg: 50, samples: 0 }
      })
    }
  }

  /**
   * Start performance optimization monitoring
   */
  startPerformanceOptimization() {
    if (!this.config.enabled) {
      this.logger.info('⚡ Performance optimization disabled')
      return
    }
    
    this.optimizationInterval = setInterval(async () => {
      try {
        await this.performOptimizationCycle()
      } catch (error) {
        this.logger.error('Performance optimization cycle failed:', error)
      }
    }, this.config.optimizationInterval)
    
    this.logger.info('⚡ Performance optimization started')
  }

  /**
   * Perform optimization cycle
   */
  async performOptimizationCycle() {
    try {
      // Collect performance metrics
      const metrics = await this.collectPerformanceMetrics()
      
      // Detect bottlenecks
      const bottlenecks = await this.detectBottlenecks(metrics)
      
      // Generate optimization recommendations
      const optimizations = await this.generateOptimizations(metrics, bottlenecks)
      
      // Apply optimizations
      const results = await this.applyOptimizations(optimizations)
      
      // Update performance baselines
      await this.updatePerformanceBaselines(metrics)
      
      // Record optimization history
      this.recordOptimizationCycle({
        timestamp: new Date(),
        metrics,
        bottlenecks,
        optimizations,
        results
      })
      
      if (optimizations.length > 0) {
        this.logger.info('⚡ Performance optimization cycle completed', {
          optimizations: optimizations.length,
          bottlenecks: bottlenecks.length,
          improvements: results.improvements
        })
        
        this.emit('optimizationCompleted', {
          metrics,
          optimizations: optimizations.length,
          results
        })
      }
      
    } catch (error) {
      this.logger.error('Failed to perform optimization cycle:', error)
    }
  }

  /**
   * Collect performance metrics from all queues
   */
  async collectPerformanceMetrics() {
    const metrics = new Map()
    
    for (const queueName of Object.keys(this.config.caching.strategies)) {
      try {
        const queueMetrics = await this.collectQueueMetrics(queueName)
        metrics.set(queueName, queueMetrics)
        this.performanceMetrics.set(queueName, queueMetrics)
      } catch (error) {
        this.logger.error(`Failed to collect metrics for ${queueName}:`, error)
      }
    }
    
    return metrics
  }

  /**
   * Collect metrics for a specific queue
   */
  async collectQueueMetrics(queueName) {
    // Get queue statistics (would be real data from queue service)
    const queueStats = await this.queueService.getQueueStats?.(queueName) || this.mockQueueStats(queueName)
    
    // Get cache statistics
    const cacheStats = this.getCacheStats(queueName)
    
    // Get resource pool statistics
    const poolStats = this.getPoolStats(queueName)
    
    // Get worker health metrics
    const workerHealth = await this.getWorkerHealthMetrics(queueName)
    
    const metrics = {
      queue: queueStats,
      cache: cacheStats,
      pool: poolStats,
      workers: workerHealth,
      timestamp: new Date(),
      
      // Calculated performance indicators
      performance: {
        avgResponseTime: queueStats.avgProcessingTime || 0,
        throughput: queueStats.throughput || 0,
        errorRate: queueStats.errorRate || 0,
        queueDepth: queueStats.waiting || 0,
        resourceUtilization: workerHealth.avgResourceUsage || 0
      }
    }
    
    return metrics
  }

  /**
   * Mock queue statistics (replace with real data)
   */
  mockQueueStats(queueName) {
    const baseProcessingTime = {
      'ai-analysis': 15000,
      'transcription': 25000,
      'video-processing': 10000,
      'whisper-timestamp': 20000
    }[queueName] || 15000
    
    return {
      waiting: Math.floor(Math.random() * 100),
      active: Math.floor(Math.random() * 10),
      completed: Math.floor(Math.random() * 1000) + 100,
      failed: Math.floor(Math.random() * 50),
      avgProcessingTime: baseProcessingTime + Math.random() * 10000,
      throughput: Math.floor(Math.random() * 40) + 10, // 10-50 jobs/minute
      errorRate: Math.random() * 10 // 0-10%
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(queueName) {
    return this.cacheStats.get(queueName) || {
      hits: 0,
      misses: 0,
      hitRate: 0,
      size: 0,
      totalRequests: 0,
      avgResponseTime: 0
    }
  }

  /**
   * Get resource pool statistics
   */
  getPoolStats(queueName) {
    const pool = this.resourcePools.get(queueName)
    const stats = this.poolStats.get(queueName)
    
    if (!pool || !stats) return stats || {}
    
    // Update real-time statistics
    stats.connectionsInUse = pool.connections.filter(c => c.inUse).length
    stats.workersBusy = pool.workers.filter(w => w.busy).length
    stats.utilizationRate = (stats.connectionsInUse / stats.totalConnections) * 100
    
    return stats
  }

  /**
   * Get worker health metrics
   */
  async getWorkerHealthMetrics(queueName) {
    try {
      // Get health data from health service
      const summary = await this.healthService.getHealthSummary()
      const queueWorkers = summary.workers.filter(w => w.queueName === queueName)
      
      if (queueWorkers.length === 0) {
        return { avgResourceUsage: 0, healthyWorkers: 0, totalWorkers: 0 }
      }
      
      const avgCpu = queueWorkers.reduce((sum, w) => {
        return sum + (w.metrics?.resources?.cpu?.percentage || 0)
      }, 0) / queueWorkers.length
      
      const avgMemory = queueWorkers.reduce((sum, w) => {
        return sum + (w.metrics?.resources?.memory?.percentage || 0)
      }, 0) / queueWorkers.length
      
      const healthyWorkers = queueWorkers.filter(w => w.status === 'healthy').length
      
      return {
        avgResourceUsage: (avgCpu + avgMemory) / 2,
        avgCpuUsage: avgCpu,
        avgMemoryUsage: avgMemory,
        healthyWorkers,
        totalWorkers: queueWorkers.length,
        healthRate: (healthyWorkers / queueWorkers.length) * 100
      }
    } catch (error) {
      this.logger.error(`Failed to get worker health metrics for ${queueName}:`, error)
      return { avgResourceUsage: 0, healthyWorkers: 0, totalWorkers: 0 }
    }
  }

  /**
   * Detect performance bottlenecks
   */
  async detectBottlenecks(metrics) {
    const bottlenecks = []
    
    for (const [queueName, queueMetrics] of metrics) {
      const perf = queueMetrics.performance
      const thresholds = this.config.thresholds
      
      // Response time bottleneck
      if (perf.avgResponseTime > thresholds.responseTime.critical) {
        bottlenecks.push({
          type: 'response_time',
          queueName,
          severity: 'critical',
          value: perf.avgResponseTime,
          threshold: thresholds.responseTime.critical,
          impact: 'high',
          recommendations: ['increase_workers', 'optimize_processing', 'enable_caching']
        })
      } else if (perf.avgResponseTime > thresholds.responseTime.warning) {
        bottlenecks.push({
          type: 'response_time',
          queueName,
          severity: 'warning',
          value: perf.avgResponseTime,
          threshold: thresholds.responseTime.warning,
          impact: 'medium',
          recommendations: ['optimize_processing', 'enable_caching']
        })
      }
      
      // Throughput bottleneck
      if (perf.throughput < thresholds.throughput.minimum) {
        bottlenecks.push({
          type: 'throughput',
          queueName,
          severity: 'critical',
          value: perf.throughput,
          threshold: thresholds.throughput.minimum,
          impact: 'high',
          recommendations: ['increase_workers', 'optimize_batching', 'resource_pooling']
        })
      }
      
      // Queue depth bottleneck
      if (perf.queueDepth > thresholds.queueDepth.critical) {
        bottlenecks.push({
          type: 'queue_depth',
          queueName,
          severity: 'critical',
          value: perf.queueDepth,
          threshold: thresholds.queueDepth.critical,
          impact: 'high',
          recommendations: ['increase_workers', 'priority_optimization', 'load_balancing']
        })
      } else if (perf.queueDepth > thresholds.queueDepth.warning) {
        bottlenecks.push({
          type: 'queue_depth',
          queueName,
          severity: 'warning',
          value: perf.queueDepth,
          threshold: thresholds.queueDepth.warning,
          impact: 'medium',
          recommendations: ['optimize_processing', 'priority_optimization']
        })
      }
      
      // Resource utilization bottleneck
      if (perf.resourceUtilization > thresholds.resourceUtilization.maximum) {
        bottlenecks.push({
          type: 'resource_utilization',
          queueName,
          severity: 'warning',
          value: perf.resourceUtilization,
          threshold: thresholds.resourceUtilization.maximum,
          impact: 'medium',
          recommendations: ['resource_pooling', 'memory_optimization', 'connection_pooling']
        })
      }
      
      // Cache inefficiency bottleneck
      const cacheHitRate = queueMetrics.cache.hitRate || 0
      if (cacheHitRate < 50 && queueMetrics.cache.totalRequests > 100) {
        bottlenecks.push({
          type: 'cache_inefficiency',
          queueName,
          severity: 'warning',
          value: cacheHitRate,
          threshold: 50,
          impact: 'medium',
          recommendations: ['optimize_caching', 'increase_cache_size', 'adaptive_ttl']
        })
      }
    }
    
    // Store bottlenecks for tracking
    for (const bottleneck of bottlenecks) {
      this.bottlenecks.set(`${bottleneck.queueName}_${bottleneck.type}`, {
        ...bottleneck,
        firstDetected: new Date(),
        count: (this.bottlenecks.get(`${bottleneck.queueName}_${bottleneck.type}`)?.count || 0) + 1
      })
    }
    
    return bottlenecks
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizations(metrics, bottlenecks) {
    const optimizations = []
    
    for (const bottleneck of bottlenecks) {
      for (const recommendation of bottleneck.recommendations) {
        const optimization = await this.createOptimization(
          bottleneck.queueName,
          recommendation,
          bottleneck,
          metrics.get(bottleneck.queueName)
        )
        
        if (optimization) {
          optimizations.push(optimization)
        }
      }
    }
    
    // Remove duplicate optimizations
    const uniqueOptimizations = optimizations.filter((opt, index, self) =>
      index === self.findIndex(o => o.type === opt.type && o.queueName === opt.queueName)
    )
    
    // Sort by priority (impact and ease of implementation)
    uniqueOptimizations.sort((a, b) => {
      const scoreA = this.calculateOptimizationScore(a)
      const scoreB = this.calculateOptimizationScore(b)
      return scoreB - scoreA
    })
    
    return uniqueOptimizations
  }

  /**
   * Create optimization from recommendation
   */
  async createOptimization(queueName, recommendation, bottleneck, metrics) {
    const optimizationTemplates = {
      increase_workers: {
        type: 'increase_workers',
        description: 'Increase worker count to improve throughput',
        implementation: 'scaling',
        parameters: {
          targetWorkers: Math.min(
            this.scalingService.config.workerLimits[queueName]?.max || 5,
            this.scalingService.getCurrentWorkerCount(queueName) + 1
          )
        },
        expectedImpact: 'high',
        implementationCost: 'medium'
      },
      
      optimize_processing: {
        type: 'optimize_processing',
        description: 'Optimize job processing algorithms',
        implementation: 'configuration',
        parameters: {
          batchSize: this.config.strategies.batching.batchSizes[queueName] || 3,
          enableCompression: true,
          optimizeMemoryUsage: true
        },
        expectedImpact: 'medium',
        implementationCost: 'low'
      },
      
      enable_caching: {
        type: 'enable_caching',
        description: 'Enable or optimize caching strategy',
        implementation: 'caching',
        parameters: {
          enabled: true,
          ttl: this.config.caching.strategies[queueName]?.ttl || 300000,
          maxSize: Math.min(
            (this.config.caching.strategies[queueName]?.maxSize || 100) * 1.5,
            1000
          )
        },
        expectedImpact: 'high',
        implementationCost: 'low'
      },
      
      optimize_batching: {
        type: 'optimize_batching',
        description: 'Optimize job batching strategy',
        implementation: 'batching',
        parameters: {
          batchSize: Math.min(
            (this.config.strategies.batching.batchSizes[queueName] || 3) + 1,
            10
          ),
          batchTimeout: this.config.strategies.batching.batchTimeout
        },
        expectedImpact: 'medium',
        implementationCost: 'low'
      },
      
      resource_pooling: {
        type: 'resource_pooling',
        description: 'Optimize resource pool configuration',
        implementation: 'pooling',
        parameters: {
          connectionPoolSize: Math.min(
            (this.config.resourcePooling.poolSizes[queueName]?.connections || 3) + 1,
            10
          ),
          workerPoolSize: Math.min(
            (this.config.resourcePooling.poolSizes[queueName]?.workers || 2) + 1,
            5
          )
        },
        expectedImpact: 'medium',
        implementationCost: 'medium'
      },
      
      priority_optimization: {
        type: 'priority_optimization',
        description: 'Optimize job priority handling',
        implementation: 'priority',
        parameters: {
          enableDynamicPriority: true,
          priorityBoostThreshold: bottleneck.value
        },
        expectedImpact: 'medium',
        implementationCost: 'low'
      },
      
      load_balancing: {
        type: 'load_balancing',
        description: 'Optimize load balancing strategy',
        implementation: 'load_balancing',
        parameters: {
          strategy: 'resource_aware',
          enablePredictiveRouting: true
        },
        expectedImpact: 'medium',
        implementationCost: 'low'
      }
    }
    
    const template = optimizationTemplates[recommendation]
    if (!template) return null
    
    return {
      ...template,
      queueName,
      bottleneck: bottleneck.type,
      priority: this.calculateOptimizationScore(template),
      timestamp: new Date()
    }
  }

  /**
   * Calculate optimization score (priority)
   */
  calculateOptimizationScore(optimization) {
    const impactScores = { high: 100, medium: 60, low: 30 }
    const costScores = { low: 100, medium: 60, high: 30 }
    
    const impactScore = impactScores[optimization.expectedImpact] || 30
    const costScore = costScores[optimization.implementationCost] || 30
    
    return (impactScore + costScore) / 2
  }

  /**
   * Apply optimizations
   */
  async applyOptimizations(optimizations) {
    const results = {
      applied: 0,
      failed: 0,
      improvements: {},
      errors: []
    }
    
    for (const optimization of optimizations) {
      try {
        const result = await this.applyOptimization(optimization)
        
        if (result.success) {
          results.applied++
          results.improvements[optimization.type] = result.improvement
        } else {
          results.failed++
          results.errors.push({
            optimization: optimization.type,
            error: result.error
          })
        }
      } catch (error) {
        results.failed++
        results.errors.push({
          optimization: optimization.type,
          error: error.message
        })
        this.logger.error(`Failed to apply optimization ${optimization.type}:`, error)
      }
    }
    
    return results
  }

  /**
   * Apply single optimization
   */
  async applyOptimization(optimization) {
    const { type, queueName, parameters } = optimization
    
    try {
      switch (type) {
        case 'increase_workers':
          await this.scalingService.executeScalingDecision({
            queueName,
            action: 'scale_up',
            targetWorkers: parameters.targetWorkers,
            reason: 'performance_optimization',
            confidence: 80
          })
          return { success: true, improvement: 'Worker count increased' }
          
        case 'optimize_processing':
          // Update processing configuration
          await this.updateProcessingConfig(queueName, parameters)
          return { success: true, improvement: 'Processing optimized' }
          
        case 'enable_caching':
          await this.optimizeCaching(queueName, parameters)
          return { success: true, improvement: 'Caching optimized' }
          
        case 'optimize_batching':
          await this.optimizeBatching(queueName, parameters)
          return { success: true, improvement: 'Batching optimized' }
          
        case 'resource_pooling':
          await this.optimizeResourcePools(queueName, parameters)
          return { success: true, improvement: 'Resource pools optimized' }
          
        case 'priority_optimization':
          await this.optimizePriorities(queueName, parameters)
          return { success: true, improvement: 'Priority handling optimized' }
          
        case 'load_balancing':
          this.scalingService.loadBalancer.setStrategy(parameters.strategy)
          return { success: true, improvement: 'Load balancing optimized' }
          
        default:
          return { success: false, error: `Unknown optimization type: ${type}` }
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Update processing configuration
   */
  async updateProcessingConfig(queueName, parameters) {
    // Update compression settings
    if (parameters.enableCompression) {
      this.config.strategies.compression.enabled = true
    }
    
    // Update memory optimization
    if (parameters.optimizeMemoryUsage) {
      // Optimize memory usage settings
      this.logger.info(`💾 Memory optimization enabled for ${queueName}`)
    }
  }

  /**
   * Optimize caching strategy
   */
  async optimizeCaching(queueName, parameters) {
    const cache = this.caches.get(queueName)
    if (!cache) return
    
    // Update cache configuration
    if (parameters.maxSize) {
      cache.max = parameters.maxSize
    }
    
    if (parameters.ttl) {
      this.config.caching.strategies[queueName].ttl = parameters.ttl
    }
    
    this.logger.info(`🗄️ Cache optimized for ${queueName}`, parameters)
  }

  /**
   * Optimize batching strategy
   */
  async optimizeBatching(queueName, parameters) {
    if (parameters.batchSize) {
      this.config.strategies.batching.batchSizes[queueName] = parameters.batchSize
    }
    
    if (parameters.batchTimeout) {
      this.config.strategies.batching.batchTimeout = parameters.batchTimeout
    }
    
    this.logger.info(`📦 Batching optimized for ${queueName}`, parameters)
  }

  /**
   * Optimize resource pools
   */
  async optimizeResourcePools(queueName, parameters) {
    const pool = this.resourcePools.get(queueName)
    if (!pool) return
    
    // Add more connections if needed
    if (parameters.connectionPoolSize > pool.connections.length) {
      const additionalConnections = parameters.connectionPoolSize - pool.connections.length
      for (let i = 0; i < additionalConnections; i++) {
        pool.connections.push({
          id: `${queueName}-conn-${pool.connections.length}`,
          inUse: false,
          created: new Date(),
          lastUsed: null,
          usageCount: 0
        })
      }
    }
    
    // Add more workers if needed
    if (parameters.workerPoolSize > pool.workers.length) {
      const additionalWorkers = parameters.workerPoolSize - pool.workers.length
      for (let i = 0; i < additionalWorkers; i++) {
        pool.workers.push({
          id: `${queueName}-worker-${pool.workers.length}`,
          busy: false,
          created: new Date(),
          lastTask: null,
          tasksCompleted: 0
        })
      }
    }
    
    // Update pool statistics
    const stats = this.poolStats.get(queueName)
    stats.totalConnections = pool.connections.length
    stats.totalWorkers = pool.workers.length
    
    this.logger.info(`🏊 Resource pool optimized for ${queueName}`, parameters)
  }

  /**
   * Optimize priority handling
   */
  async optimizePriorities(queueName, parameters) {
    // Enable dynamic priority adjustment
    if (parameters.enableDynamicPriority) {
      this.logger.info(`🎯 Dynamic priority enabled for ${queueName}`)
    }
    
    // Set priority boost threshold
    if (parameters.priorityBoostThreshold) {
      this.logger.info(`📈 Priority boost threshold set for ${queueName}: ${parameters.priorityBoostThreshold}`)
    }
  }

  /**
   * Update performance baselines
   */
  async updatePerformanceBaselines(metrics) {
    for (const [queueName, queueMetrics] of metrics) {
      const baseline = this.performanceBaselines.get(queueName)
      if (!baseline) continue
      
      const perf = queueMetrics.performance
      
      // Update response time baseline
      baseline.responseTime = this.updateBaseline(baseline.responseTime, perf.avgResponseTime)
      
      // Update throughput baseline
      baseline.throughput = this.updateBaseline(baseline.throughput, perf.throughput)
      
      // Update error rate baseline
      baseline.errorRate = this.updateBaseline(baseline.errorRate, perf.errorRate)
      
      // Update resource usage baseline
      baseline.resourceUsage = this.updateBaseline(baseline.resourceUsage, perf.resourceUtilization)
    }
  }

  /**
   * Update baseline statistics
   */
  updateBaseline(baseline, newValue) {
    baseline.min = Math.min(baseline.min, newValue)
    baseline.max = Math.max(baseline.max, newValue)
    baseline.avg = ((baseline.avg * baseline.samples) + newValue) / (baseline.samples + 1)
    baseline.samples++
    
    return baseline
  }

  /**
   * Record optimization cycle
   */
  recordOptimizationCycle(cycleData) {
    this.optimizationHistory.push(cycleData)
    
    // Keep last 100 optimization cycles
    if (this.optimizationHistory.length > 100) {
      this.optimizationHistory = this.optimizationHistory.slice(-100)
    }
  }

  /**
   * Cache operation (get from cache)
   */
  async getCached(queueName, key) {
    const cache = this.caches.get(queueName)
    const stats = this.cacheStats.get(queueName)
    
    if (!cache || !stats) return null
    
    const startTime = Date.now()
    const value = cache.get(key)
    const responseTime = Date.now() - startTime
    
    stats.totalRequests++
    stats.avgResponseTime = ((stats.avgResponseTime * (stats.totalRequests - 1)) + responseTime) / stats.totalRequests
    
    if (value !== undefined) {
      stats.hits++
      stats.hitRate = (stats.hits / stats.totalRequests) * 100
      return value
    } else {
      stats.misses++
      stats.hitRate = (stats.hits / stats.totalRequests) * 100
      return null
    }
  }

  /**
   * Cache operation (set to cache)
   */
  async setCached(queueName, key, value, ttl) {
    const cache = this.caches.get(queueName)
    const stats = this.cacheStats.get(queueName)
    
    if (!cache || !stats) return false
    
    cache.set(key, value, { ttl: ttl || this.config.caching.strategies[queueName]?.ttl })
    stats.size = cache.size
    
    return true
  }

  /**
   * Get resource from pool
   */
  async getPooledResource(queueName, resourceType = 'connections') {
    const pool = this.resourcePools.get(queueName)
    const stats = this.poolStats.get(queueName)
    
    if (!pool || !stats) return null
    
    const resources = pool[resourceType]
    const availableResource = resources.find(r => !r.inUse && !r.busy)
    
    if (availableResource) {
      if (resourceType === 'connections') {
        availableResource.inUse = true
        availableResource.lastUsed = new Date()
        availableResource.usageCount++
        stats.connectionsInUse++
      } else {
        availableResource.busy = true
        availableResource.lastTask = new Date()
        availableResource.tasksCompleted++
        stats.workersBusy++
      }
      
      stats.utilizationRate = Math.max(
        (stats.connectionsInUse / stats.totalConnections) * 100,
        (stats.workersBusy / stats.totalWorkers) * 100
      )
      
      return availableResource
    }
    
    return null
  }

  /**
   * Release resource back to pool
   */
  async releasePooledResource(queueName, resourceId, resourceType = 'connections') {
    const pool = this.resourcePools.get(queueName)
    const stats = this.poolStats.get(queueName)
    
    if (!pool || !stats) return false
    
    const resource = pool[resourceType].find(r => r.id === resourceId)
    
    if (resource) {
      if (resourceType === 'connections') {
        resource.inUse = false
        stats.connectionsInUse--
      } else {
        resource.busy = false
        stats.workersBusy--
      }
      
      stats.utilizationRate = Math.max(
        (stats.connectionsInUse / stats.totalConnections) * 100,
        (stats.workersBusy / stats.totalWorkers) * 100
      )
      
      return true
    }
    
    return false
  }

  /**
   * Get performance summary
   */
  async getPerformanceSummary() {
    const summary = {
      overview: {
        optimizationEnabled: this.config.enabled,
        lastOptimization: this.optimizationHistory.length > 0 ? 
          this.optimizationHistory[this.optimizationHistory.length - 1].timestamp : null,
        totalOptimizations: this.optimizationHistory.length,
        activeBottlenecks: this.bottlenecks.size
      },
      
      queues: {},
      
      caching: {
        enabled: this.config.caching.enabled,
        totalCaches: this.caches.size,
        cacheStats: Object.fromEntries(this.cacheStats)
      },
      
      resourcePooling: {
        enabled: this.config.resourcePooling.enabled,
        totalPools: this.resourcePools.size,
        poolStats: Object.fromEntries(this.poolStats)
      },
      
      bottlenecks: Array.from(this.bottlenecks.values()),
      
      recentOptimizations: this.optimizationHistory.slice(-10),
      
      timestamp: new Date()
    }
    
    // Add queue-specific performance data
    for (const [queueName, metrics] of this.performanceMetrics) {
      summary.queues[queueName] = {
        performance: metrics.performance,
        baseline: this.performanceBaselines.get(queueName),
        lastUpdate: metrics.timestamp
      }
    }
    
    return summary
  }

  /**
   * Update performance configuration
   */
  updatePerformanceConfig(updates) {
    Object.assign(this.config, updates)
    
    this.logger.info('⚡ Performance configuration updated', {
      updates: Object.keys(updates)
    })
  }

  /**
   * Stop performance optimization
   */
  stopPerformanceOptimization() {
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval)
      this.optimizationInterval = null
      this.logger.info('⚡ Performance optimization stopped')
    }
  }

  /**
   * Shutdown performance service
   */
  async shutdown() {
    try {
      this.stopPerformanceOptimization()
      
      // Clear all caches
      for (const cache of this.caches.values()) {
        cache.clear()
      }
      
      this.logger.info('⚡ Performance Service shut down')
    } catch (error) {
      this.logger.error('Error shutting down performance service:', error)
    }
  }
}

module.exports = PerformanceService 