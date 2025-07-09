const { Worker } = require('bullmq')
const Redis = require('ioredis')
const winston = require('winston')
const OllamaService = require('./services/ollamaService')
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

// Initialize Ollama service
const ollamaService = new OllamaService()

// Job processor function
async function processAIJob(job) {
  const { type, data } = job.data
  logger.info(`🚀 Processing AI job: ${type}`, { jobId: job.id })
  
  try {
    switch (type) {
      case 'analyze_speech':
        return await handleSpeechAnalysis(job, data)
      
      case 'generate_clips':
        return await handleClipGeneration(job, data)
      
      case 'test_connection':
        return await handleConnectionTest(job, data)
      
      default:
        throw new Error(`Unknown job type: ${type}`)
    }
  } catch (error) {
    logger.error(`❌ Job failed: ${type}`, { 
      jobId: job.id, 
      error: error.message, 
      stack: error.stack 
    })
    throw error
  }
}

/**
 * Handle speech content analysis
 */
async function handleSpeechAnalysis(job, data) {
  const { transcriptData, options = {} } = data
  
  if (!transcriptData) {
    throw new Error('No transcript data provided')
  }

  // Update job progress
  await job.updateProgress({ stage: 'analyzing', progress: 10 })
  
  // Test Ollama connection first
  const connectionTest = await ollamaService.testConnection()
  if (!connectionTest.success) {
    throw new Error(`Ollama connection failed: ${connectionTest.error}`)
  }

  await job.updateProgress({ stage: 'processing', progress: 30 })
  
  // Perform AI analysis
  const analysis = await ollamaService.analyzeSpeechContent(transcriptData, options)
  
  await job.updateProgress({ stage: 'finalizing', progress: 90 })
  
  logger.info(`✅ Speech analysis completed`, { 
    jobId: job.id,
    segmentsAnalyzed: transcriptData.segments?.length || 0,
    topics: analysis.keyTopics?.length || 0
  })

  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  return {
    success: true,
    analysis,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id
    }
  }
}

/**
 * Handle clip generation suggestions
 */
async function handleClipGeneration(job, data) {
  const { transcriptData, options = {} } = data
  
  if (!transcriptData) {
    throw new Error('No transcript data provided')
  }

  await job.updateProgress({ stage: 'analyzing', progress: 20 })
  
  // Generate clip suggestions
  const suggestions = await ollamaService.generateClipSuggestions(transcriptData, options)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Clip suggestions generated`, { 
    jobId: job.id,
    suggestionsCount: suggestions.length
  })
  
  return {
    success: true,
    suggestions,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id
    }
  }
}

/**
 * Handle connection test
 */
async function handleConnectionTest(job, data) {
  await job.updateProgress({ stage: 'testing', progress: 50 })
  
  const result = await ollamaService.testConnection()
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`🔍 Connection test completed`, { 
    jobId: job.id,
    success: result.success
  })
  
  return result
}

// Create worker
const aiWorker = new Worker('ai-analysis', processAIJob, {
  connection: redis,
  concurrency: parseInt(process.env.AI_WORKER_CONCURRENCY) || 2,
  removeOnComplete: 10,
  removeOnFail: 25,
  settings: {
    stalledInterval: 30000,
    maxStalledCount: 1
  }
})

// Worker event handlers
aiWorker.on('ready', () => {
  logger.info('🤖 AI Worker ready and waiting for jobs')
})

aiWorker.on('active', (job) => {
  logger.info(`🔄 Processing job: ${job.id}`, { 
    type: job.data.type,
    attempt: job.attemptsMade + 1
  })
})

aiWorker.on('completed', (job, result) => {
  logger.info(`✅ Job completed: ${job.id}`, { 
    type: job.data.type,
    duration: Date.now() - job.processedOn
  })
})

aiWorker.on('failed', (job, err) => {
  logger.error(`❌ Job failed: ${job.id}`, { 
    type: job.data.type,
    error: err.message,
    attempt: job.attemptsMade
  })
})

aiWorker.on('stalled', (jobId) => {
  logger.warn(`⚠️ Job stalled: ${jobId}`)
})

aiWorker.on('error', (err) => {
  logger.error('🚨 Worker error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...')
  await aiWorker.close()
  await redis.disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...')
  await aiWorker.close()
  await redis.disconnect()
  process.exit(0)
})

// Test Ollama connection on startup
async function initialize() {
  try {
    logger.info('🚀 Starting AI Worker...')
    
    // Test Ollama connection
    const connectionTest = await ollamaService.testConnection()
    if (!connectionTest.success) {
      logger.warn('⚠️ Ollama connection failed, worker will continue but jobs may fail')
      logger.warn(`Connection error: ${connectionTest.error}`)
    }
    
    logger.info('✅ AI Worker initialization complete')
  } catch (error) {
    logger.error('❌ Worker initialization failed:', error)
    process.exit(1)
  }
}

// Initialize and start
initialize().catch(console.error) 