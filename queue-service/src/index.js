const express = require('express')
const cors = require('cors')
const Redis = require('ioredis')
const { Queue } = require('bullmq')
const { createBullBoard } = require('@bull-board/express')
const { BullMQAdapter } = require('@bull-board/bullmq')
const winston = require('winston')
const SchedulerService = require('./services/schedulerService')
const PriorityService = require('./services/priorityService')
const QueueConfigService = require('./services/queueConfigService')
const MonitoringService = require('./services/monitoringService')
const { ScalingService } = require('./services/scalingService')
const HealthService = require('./services/healthService')
const PerformanceService = require('./services/performanceService')
require('dotenv').config()

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
})

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100
})

// Create Express app
const app = express()
const port = process.env.PORT || 3004

// Middleware
app.use(cors())
app.use(express.json())

// Initialize queues
const queues = {
  'ai-analysis': new Queue('ai-analysis', { connection: redis }),
  'transcription': new Queue('transcription', { connection: redis }),
  'whisper-timestamp': new Queue('whisper-timestamp', { connection: redis }),
  'video-processing': new Queue('video-processing', { connection: redis })
}

// Initialize advanced scheduler service
const schedulerService = new SchedulerService(redis, logger)

// Initialize priority service
const priorityService = new PriorityService(logger)

// Initialize queue configuration service
const queueConfigService = new QueueConfigService(logger)

// Initialize monitoring service
const monitoringService = new MonitoringService(redis, logger)

// Initialize scaling service (with queue and monitoring services)
const scalingService = new ScalingService(
  { 
    getQueueStats: async (queueName) => {
      const queue = queues[queueName]
      if (!queue) return {}
      
      const waiting = await queue.getWaiting()
      const active = await queue.getActive()
      const completed = await queue.getCompleted(0, -1)
      const failed = await queue.getFailed(0, -1)
      
      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        avgWaitTime: waiting.length > 0 ? Date.now() - waiting[0].timestamp : 0
      }
    }
  },
  monitoringService,
  logger
)

// Initialize health service (with scaling and monitoring services)
const healthService = new HealthService(scalingService, monitoringService, logger)

// Initialize performance service (with all related services)
const performanceService = new PerformanceService(
  { 
    getQueueStats: async (queueName) => {
      const queue = queues[queueName]
      if (!queue) return {}
      
      const waiting = await queue.getWaiting()
      const active = await queue.getActive()
      const completed = await queue.getCompleted(0, -1)
      const failed = await queue.getFailed(0, -1)
      
      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        avgProcessingTime: 15000 + Math.random() * 10000, // Simulated
        throughput: Math.floor(Math.random() * 40) + 10,
        errorRate: Math.random() * 10
      }
    }
  },
  scalingService,
  healthService,
  logger
)

// Create Bull Board for queue monitoring (including scheduler queue)
const serverAdapter = createBullBoard({
  queues: [
    ...Object.values(queues).map(queue => new BullMQAdapter(queue)),
    new BullMQAdapter(schedulerService.schedulerQueue)
  ],
  serverAdapter: require('@bull-board/express')()
})

// Mount Bull Board
app.use('/admin/queues', serverAdapter.getRouter())

// Set up monitoring event listeners
for (const [queueName, queue] of Object.entries(queues)) {
  // Collect queue metrics periodically
  setInterval(async () => {
    try {
      const waiting = await queue.getWaiting()
      const active = await queue.getActive()
      const completed = await queue.getCompleted()
      const failed = await queue.getFailed()
      
      const metrics = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length
      }
      
      monitoringService.recordQueueMetrics(queueName, metrics)
    } catch (error) {
      logger.error(`Failed to collect metrics for ${queueName}:`, error)
    }
  }, 30000) // Every 30 seconds
}

// Set up monitoring event handlers
monitoringService.on('alert', (alert) => {
  logger.warn(`🚨 ALERT: ${alert.message}`, {
    type: alert.type,
    severity: alert.severity,
    data: alert.data
  })
})

monitoringService.on('alertResolved', (alert) => {
  logger.info(`✅ Alert resolved: ${alert.message}`, {
    type: alert.type,
    resolution: alert.resolution
  })
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'queue-service'
  })
})

// Queue status endpoint
app.get('/api/queues/status', async (req, res) => {
  try {
    const status = {}
    
    for (const [name, queue] of Object.entries(queues)) {
      const waiting = await queue.getWaiting()
      const active = await queue.getActive()
      const completed = await queue.getCompleted()
      const failed = await queue.getFailed()
      
      status[name] = {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        total: waiting.length + active.length + completed.length + failed.length
      }
    }
    
    res.json(status)
  } catch (error) {
    logger.error('Failed to get queue status:', error)
    res.status(500).json({ error: 'Failed to get queue status' })
  }
})

// Add job endpoint (enhanced with priority support)
app.post('/api/queues/:queueName/jobs', async (req, res) => {
  try {
    const { queueName } = req.params
    const { type, data, options = {}, priority, context = {} } = req.body
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    // Determine priority (user-specified, suggested, or default)
    let finalPriority = priority
    if (!finalPriority) {
      finalPriority = priorityService.suggestPriority(type, context)
    }
    
    // Validate priority
    if (!priorityService.isValidPriority(finalPriority)) {
      return res.status(400).json({ 
        error: `Invalid priority: ${finalPriority}`,
        availablePriorities: priorityService.getAvailablePriorities()
      })
    }
    
    // Get priority-based job options
    const priorityOptions = priorityService.getJobOptions(finalPriority, options)
    
    // Enrich job data with priority information
    const enrichedData = priorityService.enrichJobData({ type, data }, finalPriority, context)
    
    // Add job with priority settings
    const job = await queues[queueName].add(type, enrichedData, priorityOptions)
    
    // Update statistics
    priorityService.updateStats(finalPriority, 'submitted')
    
    const config = priorityService.priorities[finalPriority]
    logger.info(`${config.color} Job added to ${queueName} with ${finalPriority} priority`, { 
      jobId: job.id, 
      type: type,
      queueName: queueName,
      priority: finalPriority,
      priorityLevel: config.level
    })
    
    res.json({
      success: true,
      jobId: job.id,
      queue: queueName,
      type: type,
      priority: finalPriority,
      priorityLevel: config.level,
      estimatedDelay: priorityOptions.delay || 0
    })
    
  } catch (error) {
    logger.error('Failed to add job:', error)
    res.status(500).json({ error: 'Failed to add job', details: error.message })
  }
})

// Get job status endpoint
app.get('/api/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params
    let job = null
    let queueName = null
    
    // Find the job in any queue
    for (const [name, queue] of Object.entries(queues)) {
      try {
        job = await queue.getJob(jobId)
        if (job) {
          queueName = name
          break
        }
      } catch (error) {
        // Continue searching in other queues
      }
    }
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    const jobData = {
      id: job.id,
      name: job.name,
      data: job.data,
      progress: job.progress,
      returnvalue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      opts: job.opts,
      queue: queueName,
      state: await job.getState()
    }
    
    res.json(jobData)
    
  } catch (error) {
    logger.error('Failed to get job:', error)
    res.status(500).json({ error: 'Failed to get job', details: error.message })
  }
})

// Queue statistics endpoint
app.get('/api/queues/:queueName/stats', async (req, res) => {
  try {
    const { queueName } = req.params
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    const queue = queues[queueName]
    const waiting = await queue.getWaiting()
    const active = await queue.getActive()
    const completed = await queue.getCompleted(0, -1)
    const failed = await queue.getFailed(0, -1)
    
    // Calculate some basic metrics
    const completedJobs = completed.slice(-100) // Last 100 completed jobs
    const processingTimes = completedJobs
      .filter(job => job.processedOn && job.finishedOn)
      .map(job => job.finishedOn - job.processedOn)
    
    const avgProcessingTime = processingTimes.length > 0 
      ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length 
      : 0
    
    res.json({
      queue: queueName,
      counts: {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      },
      metrics: {
        avgProcessingTime: Math.round(avgProcessingTime),
        throughput: completedJobs.length,
        errorRate: failed.length > 0 ? (failed.length / (failed.length + completed.length)) * 100 : 0
      }
    })
    
  } catch (error) {
    logger.error('Failed to get queue stats:', error)
    res.status(500).json({ error: 'Failed to get queue stats' })
  }
})

// Queue management endpoints
app.post('/api/queues/:queueName/pause', async (req, res) => {
  try {
    const { queueName } = req.params
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    await queues[queueName].pause()
    logger.info(`Queue ${queueName} paused`)
    
    res.json({ success: true, message: `Queue ${queueName} paused` })
  } catch (error) {
    logger.error('Failed to pause queue:', error)
    res.status(500).json({ error: 'Failed to pause queue' })
  }
})

app.post('/api/queues/:queueName/resume', async (req, res) => {
  try {
    const { queueName } = req.params
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    await queues[queueName].resume()
    logger.info(`Queue ${queueName} resumed`)
    
    res.json({ success: true, message: `Queue ${queueName} resumed` })
  } catch (error) {
    logger.error('Failed to resume queue:', error)
    res.status(500).json({ error: 'Failed to resume queue' })
  }
})

// ============================================================================
// ADVANCED SCHEDULING ENDPOINTS (Phase 2)
// ============================================================================

// Schedule a delayed job
app.post('/api/scheduler/delayed', async (req, res) => {
  try {
    const { queueName, jobType, data, delay, options = {} } = req.body
    
    if (!queueName || !jobType || !data || delay === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: queueName, jobType, data, delay' 
      })
    }
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    const result = await schedulerService.scheduleDelayedJob(
      queueName, jobType, data, delay, options
    )
    
    logger.info(`⏰ Delayed job scheduled`, { result })
    res.json({ success: true, ...result })
    
  } catch (error) {
    logger.error('Failed to schedule delayed job:', error)
    res.status(500).json({ error: 'Failed to schedule delayed job', details: error.message })
  }
})

// Schedule a recurring job
app.post('/api/scheduler/recurring', async (req, res) => {
  try {
    const { queueName, jobType, data, cronExpression, options = {} } = req.body
    
    if (!queueName || !jobType || !data || !cronExpression) {
      return res.status(400).json({ 
        error: 'Missing required fields: queueName, jobType, data, cronExpression' 
      })
    }
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    const result = await schedulerService.scheduleRecurringJob(
      queueName, jobType, data, cronExpression, options
    )
    
    logger.info(`🔄 Recurring job scheduled`, { result })
    res.json({ success: true, ...result })
    
  } catch (error) {
    logger.error('Failed to schedule recurring job:', error)
    res.status(500).json({ error: 'Failed to schedule recurring job', details: error.message })
  }
})

// Schedule a job with dependencies
app.post('/api/scheduler/dependent', async (req, res) => {
  try {
    const { queueName, jobType, data, dependsOn = [], options = {} } = req.body
    
    if (!queueName || !jobType || !data) {
      return res.status(400).json({ 
        error: 'Missing required fields: queueName, jobType, data' 
      })
    }
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    const result = await schedulerService.scheduleJobWithDependencies(
      queueName, jobType, data, dependsOn, options
    )
    
    logger.info(`🔗 Dependent job scheduled`, { result })
    res.json({ success: true, ...result })
    
  } catch (error) {
    logger.error('Failed to schedule dependent job:', error)
    res.status(500).json({ error: 'Failed to schedule dependent job', details: error.message })
  }
})

// Get scheduling status
app.get('/api/scheduler/status', async (req, res) => {
  try {
    const status = await schedulerService.getSchedulingStatus()
    res.json(status)
  } catch (error) {
    logger.error('Failed to get scheduling status:', error)
    res.status(500).json({ error: 'Failed to get scheduling status' })
  }
})

// Cancel a scheduled job
app.delete('/api/scheduler/:type/:jobId', async (req, res) => {
  try {
    const { type, jobId } = req.params
    
    if (!['delayed', 'recurring', 'dependent'].includes(type)) {
      return res.status(400).json({ 
        error: 'Invalid type. Must be: delayed, recurring, or dependent' 
      })
    }
    
    const result = await schedulerService.cancelScheduledJob(jobId, type)
    
    if (result.success) {
      logger.info(`🗑️ Cancelled ${type} job`, { jobId })
      res.json(result)
    } else {
      res.status(404).json(result)
    }
    
  } catch (error) {
    logger.error('Failed to cancel scheduled job:', error)
    res.status(500).json({ error: 'Failed to cancel scheduled job', details: error.message })
  }
})

// ============================================================================
// PRIORITY MANAGEMENT ENDPOINTS (Phase 2) 
// ============================================================================

// Add high-priority job (convenience endpoint)
app.post('/api/queues/:queueName/jobs/high-priority', async (req, res) => {
  try {
    const { queueName } = req.params
    const { type, data, options = {}, context = {} } = req.body
    
    // Force high priority
    req.body.priority = 'high'
    req.body.context = { ...context, isUserWaiting: true }
    
    // Redirect to main job endpoint with high priority
    return await app._router.handle(req, res)
    
  } catch (error) {
    logger.error('Failed to add high-priority job:', error)
    res.status(500).json({ error: 'Failed to add high-priority job' })
  }
})

// Get priority statistics
app.get('/api/priorities/stats', async (req, res) => {
  try {
    const stats = priorityService.getStats()
    res.json(stats)
  } catch (error) {
    logger.error('Failed to get priority stats:', error)
    res.status(500).json({ error: 'Failed to get priority stats' })
  }
})

// Get priority recommendations for a queue
app.get('/api/queues/:queueName/priority-recommendations', async (req, res) => {
  try {
    const { queueName } = req.params
    const recommendations = priorityService.getQueuePriorityRecommendations()
    
    if (!recommendations[queueName]) {
      return res.status(404).json({ error: `No recommendations found for queue: ${queueName}` })
    }
    
    res.json({
      queue: queueName,
      recommendations: recommendations[queueName],
      availablePriorities: priorityService.getAvailablePriorities()
    })
  } catch (error) {
    logger.error('Failed to get priority recommendations:', error)
    res.status(500).json({ error: 'Failed to get priority recommendations' })
  }
})

// Suggest priority for a job type
app.post('/api/priorities/suggest', async (req, res) => {
  try {
    const { jobType, context = {} } = req.body
    
    if (!jobType) {
      return res.status(400).json({ error: 'jobType is required' })
    }
    
    const suggestedPriority = priorityService.suggestPriority(jobType, context)
    const priorityConfig = priorityService.priorities[suggestedPriority]
    
    res.json({
      jobType,
      suggestedPriority,
      priorityConfig,
      context,
      explanation: priorityConfig.description
    })
  } catch (error) {
    logger.error('Failed to suggest priority:', error)
    res.status(500).json({ error: 'Failed to suggest priority' })
  }
})

// Get all available priorities
app.get('/api/priorities', async (req, res) => {
  try {
    const priorities = priorityService.getAvailablePriorities()
    res.json({
      priorities,
      defaultPriority: 'normal'
    })
  } catch (error) {
    logger.error('Failed to get priorities:', error)
    res.status(500).json({ error: 'Failed to get priorities' })
  }
})

// Create delayed job with priority
app.post('/api/queues/:queueName/jobs/delayed', async (req, res) => {
  try {
    const { queueName } = req.params
    const { type, data, delay, priority = 'normal', context = {} } = req.body
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    if (!type || !data || delay === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields: type, data, delay' 
      })
    }
    
    // Create delayed job options with priority
    const delayedOptions = priorityService.createDelayedJobOptions(priority, delay)
    
    // Enrich job data
    const enrichedData = priorityService.enrichJobData({ type, data }, priority, context)
    
    // Add delayed job
    const job = await queues[queueName].add(type, enrichedData, delayedOptions)
    
    // Update statistics
    priorityService.updateStats(priority, 'submitted')
    
    const config = priorityService.priorities[priority]
    logger.info(`⏰ Delayed job with ${priority} priority added to ${queueName}`, {
      jobId: job.id,
      type,
      priority,
      delay: delayedOptions.delay,
      scheduledFor: new Date(Date.now() + delayedOptions.delay).toISOString()
    })
    
    res.json({
      success: true,
      jobId: job.id,
      queue: queueName,
      type,
      priority,
      delay: delayedOptions.delay,
      scheduledFor: new Date(Date.now() + delayedOptions.delay)
    })
    
  } catch (error) {
    logger.error('Failed to create delayed priority job:', error)
    res.status(500).json({ error: 'Failed to create delayed priority job', details: error.message })
  }
})

// ============================================================================
// QUEUE CONFIGURATION ENDPOINTS (Phase 2)
// ============================================================================

// Get configuration for all queues
app.get('/api/queues/configs', async (req, res) => {
  try {
    const configs = queueConfigService.getAllConfigs()
    res.json({
      configs,
      totalQueues: configs.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get queue configs:', error)
    res.status(500).json({ error: 'Failed to get queue configs' })
  }
})

// Get configuration for a specific queue
app.get('/api/queues/:queueName/config', async (req, res) => {
  try {
    const { queueName } = req.params
    const config = queueConfigService.getQueueConfig(queueName)
    
    if (!config) {
      return res.status(404).json({ error: `Configuration not found for queue: ${queueName}` })
    }
    
    res.json({
      queueName,
      config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get queue config:', error)
    res.status(500).json({ error: 'Failed to get queue config' })
  }
})

// Get job options for a specific queue and job type
app.get('/api/queues/:queueName/job-options/:jobType', async (req, res) => {
  try {
    const { queueName, jobType } = req.params
    const { customOptions } = req.query
    
    const parsedOptions = customOptions ? JSON.parse(customOptions) : {}
    const jobOptions = queueConfigService.getJobOptions(queueName, jobType, parsedOptions)
    
    res.json({
      queueName,
      jobType,
      jobOptions,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get job options:', error)
    res.status(500).json({ error: 'Failed to get job options', details: error.message })
  }
})

// Apply performance profile to a queue
app.post('/api/queues/:queueName/performance-profile', async (req, res) => {
  try {
    const { queueName } = req.params
    const { profileName } = req.body
    
    if (!profileName) {
      return res.status(400).json({ error: 'profileName is required' })
    }
    
    const optimizedConfig = queueConfigService.applyPerformanceProfile(queueName, profileName)
    
    logger.info(`🚀 Applied performance profile`, {
      queueName,
      profileName,
      originalConcurrency: optimizedConfig.defaultConcurrency,
      optimizedConcurrency: optimizedConfig.optimizedConcurrency
    })
    
    res.json({
      success: true,
      queueName,
      profileName,
      optimizedConfig,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to apply performance profile:', error)
    res.status(500).json({ error: 'Failed to apply performance profile', details: error.message })
  }
})

// Get performance profiles
app.get('/api/performance-profiles', async (req, res) => {
  try {
    const profiles = queueConfigService.getPerformanceProfiles()
    res.json({
      profiles,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get performance profiles:', error)
    res.status(500).json({ error: 'Failed to get performance profiles' })
  }
})

// Get load-based recommendations for a queue
app.get('/api/queues/:queueName/recommendations', async (req, res) => {
  try {
    const { queueName } = req.params
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    // Get current queue statistics
    const waiting = await queues[queueName].getWaiting()
    const active = await queues[queueName].getActive()
    const completed = await queues[queueName].getCompleted()
    const failed = await queues[queueName].getFailed()
    
    const queueStats = {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length
    }
    
    const recommendations = queueConfigService.getLoadBasedRecommendations(queueName, queueStats)
    
    res.json(recommendations)
  } catch (error) {
    logger.error('Failed to get load recommendations:', error)
    res.status(500).json({ error: 'Failed to get load recommendations' })
  }
})

// Get resource recommendations for a queue
app.get('/api/queues/:queueName/resource-recommendations', async (req, res) => {
  try {
    const { queueName } = req.params
    const recommendations = queueConfigService.getResourceRecommendations(queueName)
    res.json(recommendations)
  } catch (error) {
    logger.error('Failed to get resource recommendations:', error)
    res.status(500).json({ error: 'Failed to get resource recommendations' })
  }
})

// Enhanced job submission with queue configuration
app.post('/api/queues/:queueName/jobs/configured', async (req, res) => {
  try {
    const { queueName } = req.params
    const { type, data, useQueueConfig = true, priority, context = {} } = req.body
    
    if (!queues[queueName]) {
      return res.status(404).json({ error: `Queue ${queueName} not found` })
    }
    
    let jobOptions = {}
    
    if (useQueueConfig) {
      // Use queue-specific configuration
      jobOptions = queueConfigService.getJobOptions(queueName, type)
    }
    
    if (priority) {
      // Apply priority settings on top of queue config
      const priorityOptions = priorityService.getJobOptions(priority)
      jobOptions = { ...jobOptions, ...priorityOptions }
    }
    
    // Enrich job data
    const enrichedData = {
      type,
      data,
      queueConfig: useQueueConfig,
      submittedAt: new Date().toISOString(),
      context
    }
    
    if (priority) {
      enrichedData._priority = {
        level: priority,
        levelNumber: priorityService.priorities[priority]?.level || 2
      }
    }
    
    // Add job with optimized configuration
    const job = await queues[queueName].add(type, enrichedData, jobOptions)
    
    const config = queueConfigService.getQueueConfig(queueName)
    logger.info(`⚙️ Configured job added to ${queueName}`, {
      jobId: job.id,
      type,
      queueName,
      useQueueConfig,
      priority: priority || 'default',
      timeout: jobOptions.delay || config.timeouts[type] || config.timeouts.default
    })
    
    res.json({
      success: true,
      jobId: job.id,
      queue: queueName,
      type,
      configuration: {
        useQueueConfig,
        priority: priority || 'default',
        estimatedTimeout: jobOptions.delay || config.timeouts[type] || config.timeouts.default,
        attempts: jobOptions.attempts || config.defaultJobOptions.attempts
      },
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    logger.error('Failed to add configured job:', error)
    res.status(500).json({ error: 'Failed to add configured job', details: error.message })
  }
})

// Export queue configurations
app.get('/api/queues/export-config', async (req, res) => {
  try {
    const exportData = queueConfigService.exportConfig()
    
    res.setHeader('Content-Disposition', 'attachment; filename=queue-configs.json')
    res.setHeader('Content-Type', 'application/json')
    res.json(exportData)
  } catch (error) {
    logger.error('Failed to export config:', error)
    res.status(500).json({ error: 'Failed to export config' })
  }
})

// ============================================================================
// ADVANCED MONITORING ENDPOINTS (Phase 2)
// ============================================================================

// Get real-time metrics summary
app.get('/api/monitoring/metrics', async (req, res) => {
  try {
    const metrics = monitoringService.getMetricsSummary()
    res.json({
      metrics,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get monitoring metrics:', error)
    res.status(500).json({ error: 'Failed to get monitoring metrics' })
  }
})

// Get active alerts
app.get('/api/monitoring/alerts', async (req, res) => {
  try {
    const activeAlerts = monitoringService.getActiveAlerts()
    res.json({
      alerts: activeAlerts,
      count: activeAlerts.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get active alerts:', error)
    res.status(500).json({ error: 'Failed to get active alerts' })
  }
})

// Get alert history
app.get('/api/monitoring/alerts/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query
    const alertHistory = monitoringService.getAlertHistory(parseInt(limit))
    res.json({
      alerts: alertHistory,
      count: alertHistory.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get alert history:', error)
    res.status(500).json({ error: 'Failed to get alert history' })
  }
})

// Resolve an alert
app.post('/api/monitoring/alerts/:alertId/resolve', async (req, res) => {
  try {
    const { alertId } = req.params
    const { resolution = 'manually resolved' } = req.body
    
    monitoringService.resolveAlert(alertId, resolution)
    
    res.json({
      success: true,
      alertId,
      resolution,
      resolvedAt: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to resolve alert:', error)
    res.status(500).json({ error: 'Failed to resolve alert' })
  }
})

// Get analytics for a time range
app.get('/api/monitoring/analytics', async (req, res) => {
  try {
    const { 
      startTime, 
      endTime, 
      queueName,
      period = '24h' 
    } = req.query
    
    let start, end
    
    if (startTime && endTime) {
      start = new Date(startTime)
      end = new Date(endTime)
    } else {
      // Default to last 24 hours
      end = new Date()
      switch (period) {
        case '1h':
          start = new Date(end.getTime() - 60 * 60 * 1000)
          break
        case '24h':
          start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
          break
        case '7d':
          start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        default:
          start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
      }
    }
    
    const analytics = monitoringService.getAnalytics(start, end, queueName)
    
    res.json({
      analytics,
      period: {
        start,
        end,
        duration: end.getTime() - start.getTime()
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get analytics:', error)
    res.status(500).json({ error: 'Failed to get analytics', details: error.message })
  }
})

// Update monitoring configuration
app.post('/api/monitoring/config', async (req, res) => {
  try {
    const { config } = req.body
    
    if (!config) {
      return res.status(400).json({ error: 'Configuration object is required' })
    }
    
    monitoringService.updateConfig(config)
    
    logger.info('📊 Monitoring configuration updated', { config })
    
    res.json({
      success: true,
      message: 'Monitoring configuration updated',
      config: monitoringService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to update monitoring config:', error)
    res.status(500).json({ error: 'Failed to update monitoring config' })
  }
})

// Get monitoring configuration
app.get('/api/monitoring/config', async (req, res) => {
  try {
    res.json({
      config: monitoringService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get monitoring config:', error)
    res.status(500).json({ error: 'Failed to get monitoring config' })
  }
})

// Get monitoring dashboard data
app.get('/api/monitoring/dashboard', async (req, res) => {
  try {
    const metrics = monitoringService.getMetricsSummary()
    const activeAlerts = monitoringService.getActiveAlerts()
    const recentAlerts = monitoringService.getAlertHistory(10)
    
    // Get recent analytics (last 4 hours)
    const end = new Date()
    const start = new Date(end.getTime() - 4 * 60 * 60 * 1000)
    const analytics = monitoringService.getAnalytics(start, end)
    
    const dashboard = {
      summary: {
        totalQueues: Object.keys(metrics.queues).length,
        totalAlerts: activeAlerts.length,
        systemHealth: activeAlerts.filter(a => a.severity === 'critical').length === 0 ? 'healthy' : 'critical',
        totalJobs: analytics.totalJobs,
        avgFailureRate: analytics.avgFailureRate
      },
      queues: metrics.queues,
      alerts: {
        active: activeAlerts,
        recent: recentAlerts
      },
      system: metrics.system,
      analytics: analytics,
      timestamp: new Date().toISOString()
    }
    
    res.json(dashboard)
  } catch (error) {
    logger.error('Failed to get monitoring dashboard:', error)
    res.status(500).json({ error: 'Failed to get monitoring dashboard' })
  }
})

// Test alert endpoint (for testing purposes)
app.post('/api/monitoring/test-alert', async (req, res) => {
  try {
    const { type = 'TEST_ALERT', data = {} } = req.body
    
    await monitoringService.triggerAlert(type, {
      ...data,
      testAlert: true,
      triggeredBy: 'manual'
    }, new Date())
    
    res.json({
      success: true,
      message: 'Test alert triggered',
      type,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to trigger test alert:', error)
    res.status(500).json({ error: 'Failed to trigger test alert' })
  }
})

// ============================================================================
// SCALING SERVICE ENDPOINTS
// ============================================================================

// Get scaling statistics
app.get('/api/scaling/stats', async (req, res) => {
  try {
    const stats = await scalingService.getScalingStats()
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get scaling stats:', error)
    res.status(500).json({ error: 'Failed to get scaling stats', details: error.message })
  }
})

// Set scaling strategy
app.post('/api/scaling/strategy', async (req, res) => {
  try {
    const { strategy } = req.body
    
    if (!strategy) {
      return res.status(400).json({ 
        error: 'Strategy is required',
        availableStrategies: ['aggressive', 'moderate', 'conservative']
      })
    }
    
    scalingService.setScalingStrategy(strategy)
    
    logger.info(`📈 Scaling strategy changed to: ${strategy}`)
    
    res.json({
      success: true,
      message: `Scaling strategy set to ${strategy}`,
      strategy,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to set scaling strategy:', error)
    res.status(500).json({ error: 'Failed to set scaling strategy', details: error.message })
  }
})

// Update scaling configuration
app.post('/api/scaling/config', async (req, res) => {
  try {
    const { config } = req.body
    
    if (!config) {
      return res.status(400).json({ error: 'Configuration object is required' })
    }
    
    scalingService.updateScalingConfig(config)
    
    logger.info('📈 Scaling configuration updated', { config })
    
    res.json({
      success: true,
      message: 'Scaling configuration updated',
      config: scalingService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to update scaling config:', error)
    res.status(500).json({ error: 'Failed to update scaling config', details: error.message })
  }
})

// Get scaling configuration
app.get('/api/scaling/config', async (req, res) => {
  try {
    res.json({
      success: true,
      config: scalingService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get scaling config:', error)
    res.status(500).json({ error: 'Failed to get scaling config', details: error.message })
  }
})

// Manual scaling trigger for specific queue
app.post('/api/scaling/:queueName/scale', async (req, res) => {
  try {
    const { queueName } = req.params
    const { action, targetWorkers } = req.body
    
    if (!['scale_up', 'scale_down'].includes(action)) {
      return res.status(400).json({ 
        error: 'Invalid action. Must be scale_up or scale_down'
      })
    }
    
    if (targetWorkers && (!Number.isInteger(targetWorkers) || targetWorkers < 1)) {
      return res.status(400).json({ 
        error: 'targetWorkers must be a positive integer'
      })
    }
    
    const currentWorkers = scalingService.getCurrentWorkerCount(queueName)
    const limits = scalingService.config.workerLimits[queueName]
    
    if (!limits) {
      return res.status(404).json({ error: `Queue ${queueName} not configured for scaling` })
    }
    
    let finalTargetWorkers = targetWorkers
    if (!finalTargetWorkers) {
      if (action === 'scale_up') {
        finalTargetWorkers = Math.min(limits.max, currentWorkers + 1)
      } else {
        finalTargetWorkers = Math.max(limits.min, currentWorkers - 1)
      }
    }
    
    // Validate target is within limits
    if (finalTargetWorkers > limits.max || finalTargetWorkers < limits.min) {
      return res.status(400).json({ 
        error: `Target workers (${finalTargetWorkers}) outside limits (${limits.min}-${limits.max})`
      })
    }
    
    const decision = {
      queueName,
      action,
      currentWorkers,
      targetWorkers: finalTargetWorkers,
      reason: 'manual_trigger',
      confidence: 100
    }
    
    await scalingService.executeScalingDecision(decision)
    
    logger.info(`📈 Manual scaling executed`, {
      queueName,
      action,
      from: currentWorkers,
      to: finalTargetWorkers
    })
    
    res.json({
      success: true,
      message: `${action} executed for ${queueName}`,
      scaling: {
        queueName,
        action,
        from: currentWorkers,
        to: finalTargetWorkers
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to execute manual scaling:', error)
    res.status(500).json({ error: 'Failed to execute manual scaling', details: error.message })
  }
})

// Get scaling history
app.get('/api/scaling/history', async (req, res) => {
  try {
    const { limit = 50, queueName } = req.query
    
    let history = scalingService.scalingHistory
    
    if (queueName) {
      history = history.filter(item => item.queueName === queueName)
    }
    
    // Get most recent entries
    const recentHistory = history.slice(-parseInt(limit))
    
    res.json({
      success: true,
      history: recentHistory,
      total: history.length,
      filtered: queueName ? true : false,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get scaling history:', error)
    res.status(500).json({ error: 'Failed to get scaling history', details: error.message })
  }
})

// Set load balancing strategy
app.post('/api/scaling/load-balancing/strategy', async (req, res) => {
  try {
    const { strategy } = req.body
    
    if (!strategy) {
      return res.status(400).json({ 
        error: 'Strategy is required',
        availableStrategies: ['round_robin', 'least_connections', 'weighted_round_robin', 'resource_aware']
      })
    }
    
    scalingService.loadBalancer.setStrategy(strategy)
    
    logger.info(`⚖️ Load balancing strategy changed to: ${strategy}`)
    
    res.json({
      success: true,
      message: `Load balancing strategy set to ${strategy}`,
      strategy,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to set load balancing strategy:', error)
    res.status(500).json({ error: 'Failed to set load balancing strategy', details: error.message })
  }
})

// Get load balancing statistics
app.get('/api/scaling/load-balancing/stats', async (req, res) => {
  try {
    const stats = scalingService.loadBalancer.getLoadBalancingStats()
    
    res.json({
      success: true,
      loadBalancing: stats,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get load balancing stats:', error)
    res.status(500).json({ error: 'Failed to get load balancing stats', details: error.message })
  }
})

// ============================================================================
// HEALTH SERVICE ENDPOINTS
// ============================================================================

// Get health summary
app.get('/api/health/summary', async (req, res) => {
  try {
    const summary = await healthService.getHealthSummary()
    
    res.json({
      success: true,
      health: summary,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get health summary:', error)
    res.status(500).json({ error: 'Failed to get health summary', details: error.message })
  }
})

// Get worker health details
app.get('/api/health/workers/:workerId', async (req, res) => {
  try {
    const { workerId } = req.params
    const details = await healthService.getWorkerHealthDetails(workerId)
    
    if (!details.current) {
      return res.status(404).json({ error: `Worker ${workerId} not found` })
    }
    
    res.json({
      success: true,
      worker: details,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get worker health details:', error)
    res.status(500).json({ error: 'Failed to get worker health details', details: error.message })
  }
})

// Get all worker health status
app.get('/api/health/workers', async (req, res) => {
  try {
    const { status, queueName } = req.query
    const summary = await healthService.getHealthSummary()
    
    let workers = summary.workers
    
    // Filter by status if provided
    if (status) {
      workers = workers.filter(w => w.status === status)
    }
    
    // Filter by queue name if provided
    if (queueName) {
      workers = workers.filter(w => w.queueName === queueName)
    }
    
    res.json({
      success: true,
      workers,
      total: workers.length,
      filters: { status, queueName },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get worker health status:', error)
    res.status(500).json({ error: 'Failed to get worker health status', details: error.message })
  }
})

// Get health alerts
app.get('/api/health/alerts', async (req, res) => {
  try {
    const { severity, workerId, status = 'active' } = req.query
    const summary = await healthService.getHealthSummary()
    
    let alerts = summary.alerts
    
    // Filter by severity if provided
    if (severity) {
      alerts = alerts.filter(a => a.severity === severity)
    }
    
    // Filter by worker ID if provided
    if (workerId) {
      alerts = alerts.filter(a => a.workerId === workerId)
    }
    
    // Filter by status if provided
    if (status) {
      alerts = alerts.filter(a => a.status === status)
    }
    
    res.json({
      success: true,
      alerts,
      total: alerts.length,
      filters: { severity, workerId, status },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get health alerts:', error)
    res.status(500).json({ error: 'Failed to get health alerts', details: error.message })
  }
})

// Get system health
app.get('/api/health/system', async (req, res) => {
  try {
    const summary = await healthService.getHealthSummary()
    
    res.json({
      success: true,
      system: summary.system,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get system health:', error)
    res.status(500).json({ error: 'Failed to get system health', details: error.message })
  }
})

// Trigger manual health check
app.post('/api/health/check/:workerId', async (req, res) => {
  try {
    const { workerId } = req.params
    const { checkType = 'detailed' } = req.body
    
    const allWorkers = healthService.getAllWorkers()
    const worker = allWorkers.find(w => w.id === workerId)
    
    if (!worker) {
      return res.status(404).json({ error: `Worker ${workerId} not found` })
    }
    
    const healthResult = await healthService.checkWorkerHealth(worker, checkType)
    
    // Update worker health data
    healthService.updateWorkerHealth(workerId, healthResult)
    
    logger.info(`💊 Manual health check performed`, {
      workerId,
      checkType,
      status: healthResult.status
    })
    
    res.json({
      success: true,
      message: `Health check completed for worker ${workerId}`,
      health: healthResult,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to perform manual health check:', error)
    res.status(500).json({ error: 'Failed to perform manual health check', details: error.message })
  }
})

// Update health configuration
app.post('/api/health/config', async (req, res) => {
  try {
    const { config } = req.body
    
    if (!config) {
      return res.status(400).json({ error: 'Configuration object is required' })
    }
    
    healthService.updateHealthConfig(config)
    
    logger.info('💊 Health configuration updated', { config })
    
    res.json({
      success: true,
      message: 'Health configuration updated',
      config: healthService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to update health config:', error)
    res.status(500).json({ error: 'Failed to update health config', details: error.message })
  }
})

// Get health configuration
app.get('/api/health/config', async (req, res) => {
  try {
    res.json({
      success: true,
      config: healthService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get health config:', error)
    res.status(500).json({ error: 'Failed to get health config', details: error.message })
  }
})

// Get health metrics history for a worker
app.get('/api/health/workers/:workerId/history', async (req, res) => {
  try {
    const { workerId } = req.params
    const { limit = 50, metric } = req.query
    
    const details = await healthService.getWorkerHealthDetails(workerId)
    
    if (!details.current) {
      return res.status(404).json({ error: `Worker ${workerId} not found` })
    }
    
    let history = details.history
    
    // Limit results
    if (limit) {
      history = history.slice(-parseInt(limit))
    }
    
    // Filter by specific metric if requested
    if (metric) {
      history = history.map(h => ({
        timestamp: h.timestamp,
        metric: h.metrics[metric] || null,
        status: h.status
      })).filter(h => h.metric !== null)
    }
    
    res.json({
      success: true,
      workerId,
      history,
      metric: metric || 'all',
      count: history.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get worker health history:', error)
    res.status(500).json({ error: 'Failed to get worker health history', details: error.message })
  }
})

// Get health dashboard data
app.get('/api/health/dashboard', async (req, res) => {
  try {
    const summary = await healthService.getHealthSummary()
    
    // Calculate additional dashboard metrics
    const criticalWorkers = summary.workers.filter(w => w.status === 'critical')
    const warningWorkers = summary.workers.filter(w => w.status === 'warning')
    const recentAlerts = summary.alerts.filter(a => 
      new Date(a.lastOccurred).getTime() > Date.now() - 3600000 // Last hour
    )
    
    const dashboard = {
      overview: {
        totalWorkers: summary.summary.totalWorkers,
        healthyWorkers: summary.summary.healthyWorkers,
        issueWorkers: summary.summary.warningWorkers + summary.summary.criticalWorkers,
        systemHealth: summary.system.cpu.usage < 80 && summary.system.memory.percentage < 80 ? 'healthy' : 'warning'
      },
      alerts: {
        active: summary.alerts.length,
        critical: summary.alerts.filter(a => a.severity === 'critical').length,
        recentAlerts: recentAlerts.length
      },
      workers: {
        critical: criticalWorkers.map(w => ({ id: w.workerId, queue: w.queueName, issues: w.issues })),
        warning: warningWorkers.map(w => ({ id: w.workerId, queue: w.queueName, issues: w.issues }))
      },
      system: summary.system,
      timestamp: new Date().toISOString()
    }
    
    res.json({
      success: true,
      dashboard,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get health dashboard:', error)
    res.status(500).json({ error: 'Failed to get health dashboard', details: error.message })
  }
})

// ============================================================================
// PERFORMANCE SERVICE ENDPOINTS
// ============================================================================

// Get performance summary
app.get('/api/performance/summary', async (req, res) => {
  try {
    const summary = await performanceService.getPerformanceSummary()
    
    res.json({
      success: true,
      performance: summary,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get performance summary:', error)
    res.status(500).json({ error: 'Failed to get performance summary', details: error.message })
  }
})

// Get cache statistics
app.get('/api/performance/cache/stats', async (req, res) => {
  try {
    const { queueName } = req.query
    const summary = await performanceService.getPerformanceSummary()
    
    if (queueName) {
      const queueCacheStats = summary.caching.cacheStats[queueName]
      if (!queueCacheStats) {
        return res.status(404).json({ error: `Cache stats not found for queue: ${queueName}` })
      }
      
      res.json({
        success: true,
        queueName,
        cache: queueCacheStats,
        timestamp: new Date().toISOString()
      })
    } else {
      res.json({
        success: true,
        caching: summary.caching,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    logger.error('Failed to get cache stats:', error)
    res.status(500).json({ error: 'Failed to get cache stats', details: error.message })
  }
})

// Get resource pool statistics
app.get('/api/performance/pools/stats', async (req, res) => {
  try {
    const { queueName } = req.query
    const summary = await performanceService.getPerformanceSummary()
    
    if (queueName) {
      const queuePoolStats = summary.resourcePooling.poolStats[queueName]
      if (!queuePoolStats) {
        return res.status(404).json({ error: `Pool stats not found for queue: ${queueName}` })
      }
      
      res.json({
        success: true,
        queueName,
        pool: queuePoolStats,
        timestamp: new Date().toISOString()
      })
    } else {
      res.json({
        success: true,
        resourcePooling: summary.resourcePooling,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    logger.error('Failed to get pool stats:', error)
    res.status(500).json({ error: 'Failed to get pool stats', details: error.message })
  }
})

// Get performance bottlenecks
app.get('/api/performance/bottlenecks', async (req, res) => {
  try {
    const { queueName, severity } = req.query
    const summary = await performanceService.getPerformanceSummary()
    
    let bottlenecks = summary.bottlenecks
    
    // Filter by queue name if provided
    if (queueName) {
      bottlenecks = bottlenecks.filter(b => b.queueName === queueName)
    }
    
    // Filter by severity if provided
    if (severity) {
      bottlenecks = bottlenecks.filter(b => b.severity === severity)
    }
    
    res.json({
      success: true,
      bottlenecks,
      total: bottlenecks.length,
      filters: { queueName, severity },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get performance bottlenecks:', error)
    res.status(500).json({ error: 'Failed to get performance bottlenecks', details: error.message })
  }
})

// Get optimization history
app.get('/api/performance/optimizations', async (req, res) => {
  try {
    const { limit = 20, queueName } = req.query
    const summary = await performanceService.getPerformanceSummary()
    
    let optimizations = summary.recentOptimizations
    
    // Filter by queue name if provided
    if (queueName) {
      optimizations = optimizations.filter(opt => 
        opt.optimizations.some(o => o.queueName === queueName)
      )
    }
    
    // Limit results
    if (limit) {
      optimizations = optimizations.slice(-parseInt(limit))
    }
    
    res.json({
      success: true,
      optimizations,
      total: optimizations.length,
      filters: { queueName, limit },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get optimization history:', error)
    res.status(500).json({ error: 'Failed to get optimization history', details: error.message })
  }
})

// Trigger manual performance optimization
app.post('/api/performance/optimize', async (req, res) => {
  try {
    const { queueName, strategy } = req.body
    
    // Trigger manual optimization cycle
    await performanceService.performOptimizationCycle()
    
    logger.info(`⚡ Manual performance optimization triggered`, {
      queueName: queueName || 'all',
      strategy: strategy || 'auto'
    })
    
    res.json({
      success: true,
      message: 'Performance optimization triggered',
      queueName: queueName || 'all',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to trigger manual optimization:', error)
    res.status(500).json({ error: 'Failed to trigger manual optimization', details: error.message })
  }
})

// Cache operations
app.get('/api/performance/cache/:queueName/:key', async (req, res) => {
  try {
    const { queueName, key } = req.params
    
    const value = await performanceService.getCached(queueName, key)
    
    if (value !== null) {
      res.json({
        success: true,
        cached: true,
        key,
        value,
        queueName,
        timestamp: new Date().toISOString()
      })
    } else {
      res.status(404).json({
        success: false,
        cached: false,
        key,
        queueName,
        message: 'Cache miss',
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    logger.error('Failed to get cached value:', error)
    res.status(500).json({ error: 'Failed to get cached value', details: error.message })
  }
})

app.post('/api/performance/cache/:queueName/:key', async (req, res) => {
  try {
    const { queueName, key } = req.params
    const { value, ttl } = req.body
    
    const success = await performanceService.setCached(queueName, key, value, ttl)
    
    if (success) {
      logger.info(`📦 Value cached`, { queueName, key })
      
      res.json({
        success: true,
        message: 'Value cached successfully',
        key,
        queueName,
        ttl: ttl || 'default',
        timestamp: new Date().toISOString()
      })
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to cache value',
        key,
        queueName,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    logger.error('Failed to cache value:', error)
    res.status(500).json({ error: 'Failed to cache value', details: error.message })
  }
})

// Resource pool operations
app.get('/api/performance/pools/:queueName/resource', async (req, res) => {
  try {
    const { queueName } = req.params
    const { resourceType = 'connections' } = req.query
    
    const resource = await performanceService.getPooledResource(queueName, resourceType)
    
    if (resource) {
      res.json({
        success: true,
        resource,
        queueName,
        resourceType,
        timestamp: new Date().toISOString()
      })
    } else {
      res.status(503).json({
        success: false,
        message: 'No available resources in pool',
        queueName,
        resourceType,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    logger.error('Failed to get pooled resource:', error)
    res.status(500).json({ error: 'Failed to get pooled resource', details: error.message })
  }
})

app.post('/api/performance/pools/:queueName/resource/:resourceId/release', async (req, res) => {
  try {
    const { queueName, resourceId } = req.params
    const { resourceType = 'connections' } = req.body
    
    const success = await performanceService.releasePooledResource(queueName, resourceId, resourceType)
    
    if (success) {
      res.json({
        success: true,
        message: 'Resource released successfully',
        resourceId,
        queueName,
        resourceType,
        timestamp: new Date().toISOString()
      })
    } else {
      res.status(404).json({
        success: false,
        message: 'Resource not found or already released',
        resourceId,
        queueName,
        timestamp: new Date().toISOString()
      })
    }
  } catch (error) {
    logger.error('Failed to release pooled resource:', error)
    res.status(500).json({ error: 'Failed to release pooled resource', details: error.message })
  }
})

// Update performance configuration
app.post('/api/performance/config', async (req, res) => {
  try {
    const { config } = req.body
    
    if (!config) {
      return res.status(400).json({ error: 'Configuration object is required' })
    }
    
    performanceService.updatePerformanceConfig(config)
    
    logger.info('⚡ Performance configuration updated', { config })
    
    res.json({
      success: true,
      message: 'Performance configuration updated',
      config: performanceService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to update performance config:', error)
    res.status(500).json({ error: 'Failed to update performance config', details: error.message })
  }
})

// Get performance configuration
app.get('/api/performance/config', async (req, res) => {
  try {
    res.json({
      success: true,
      config: performanceService.config,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get performance config:', error)
    res.status(500).json({ error: 'Failed to get performance config', details: error.message })
  }
})

// Performance dashboard
app.get('/api/performance/dashboard', async (req, res) => {
  try {
    const summary = await performanceService.getPerformanceSummary()
    
    // Calculate dashboard metrics
    const totalBottlenecks = summary.bottlenecks.length
    const criticalBottlenecks = summary.bottlenecks.filter(b => b.severity === 'critical').length
    const overallCacheHitRate = Object.values(summary.caching.cacheStats).reduce((acc, stats) => {
      return acc + (stats.hitRate || 0)
    }, 0) / Object.keys(summary.caching.cacheStats).length || 0
    
    const dashboard = {
      overview: {
        optimizationEnabled: summary.overview.optimizationEnabled,
        lastOptimization: summary.overview.lastOptimization,
        totalOptimizations: summary.overview.totalOptimizations,
        activeBottlenecks: totalBottlenecks,
        criticalBottlenecks
      },
      performance: {
        overallCacheHitRate: Math.round(overallCacheHitRate),
        totalCaches: summary.caching.totalCaches,
        totalResourcePools: summary.resourcePooling.totalPools,
        avgResourceUtilization: Object.values(summary.resourcePooling.poolStats).reduce((acc, stats) => {
          return acc + (stats.utilizationRate || 0)
        }, 0) / Object.keys(summary.resourcePooling.poolStats).length || 0
      },
      bottlenecks: {
        total: totalBottlenecks,
        critical: criticalBottlenecks,
        warning: summary.bottlenecks.filter(b => b.severity === 'warning').length,
        byQueue: summary.bottlenecks.reduce((acc, b) => {
          acc[b.queueName] = (acc[b.queueName] || 0) + 1
          return acc
        }, {})
      },
      recentOptimizations: summary.recentOptimizations.slice(-5),
      timestamp: new Date().toISOString()
    }
    
    res.json({
      success: true,
      dashboard,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    logger.error('Failed to get performance dashboard:', error)
    res.status(500).json({ error: 'Failed to get performance dashboard', details: error.message })
  }
})

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...')
  
  // Stop health service
  await healthService.shutdown()
  
  // Stop scaling service
  await scalingService.shutdown()
  
  // Stop monitoring service
  monitoringService.stopMonitoring()
  
  // Close scheduler service
  await schedulerService.shutdown()
  
  // Close all queues
  for (const queue of Object.values(queues)) {
    await queue.close()
  }
  
  await redis.disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...')
  
  // Stop health service
  await healthService.shutdown()
  
  // Stop scaling service
  await scalingService.shutdown()
  
  // Stop monitoring service
  monitoringService.stopMonitoring()
  
  // Close scheduler service
  await schedulerService.shutdown()
  
  // Close all queues
  for (const queue of Object.values(queues)) {
    await queue.close()
  }
  
  await redis.disconnect()
  process.exit(0)
})

// Start server
app.listen(port, () => {
  logger.info(`🚀 Queue Service running on port ${port}`)
  logger.info(`📊 Queue Dashboard available at http://localhost:${port}/admin/queues`)
  logger.info(`🔍 API available at http://localhost:${port}/api`)
})

// Redis connection event handlers
redis.on('connect', () => {
  logger.info('✅ Connected to Redis')
})

redis.on('error', (error) => {
  logger.error('❌ Redis connection error:', error)
})

redis.on('close', () => {
  logger.warn('⚠️ Redis connection closed')
}) 