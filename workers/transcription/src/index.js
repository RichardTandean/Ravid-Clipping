const { Worker } = require('bullmq')
const Redis = require('ioredis')
const winston = require('winston')
const TranscriptionService = require('./services/transcriptionService')
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

// Initialize transcription service
const transcriptionService = new TranscriptionService()

// Job processor function
async function processTranscriptionJob(job) {
  const { type, data } = job.data
  logger.info(`🚀 Processing transcription job: ${type}`, { jobId: job.id })
  
  try {
    switch (type) {
      case 'transcribe_video':
        return await handleVideoTranscription(job, data)
      
      case 'transcribe_audio':
        return await handleAudioTranscription(job, data)
      
      case 'extract_audio':
        return await handleAudioExtraction(job, data)
      
      case 'test_service':
        return await handleServiceTest(job, data)
      
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
 * Handle video transcription (extract audio + transcribe)
 */
async function handleVideoTranscription(job, data) {
  const { videoPath, outputDir, options = {} } = data
  
  if (!videoPath) {
    throw new Error('No video path provided')
  }

  // Update job progress
  await job.updateProgress({ stage: 'extracting_audio', progress: 10 })
  
  // Process video (extract audio + transcribe)
  const transcriptData = await transcriptionService.processVideo(videoPath, outputDir, {
    ...options,
    onProgress: async (stage, progress) => {
      await job.updateProgress({ stage, progress })
    }
  })
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Video transcription completed`, { 
    jobId: job.id,
    segments: transcriptData.segments?.length || 0,
    words: transcriptData.words?.length || 0,
    language: transcriptData.language,
    confidence: transcriptData.confidence
  })
  
  return {
    success: true,
    transcriptData,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath
    }
  }
}

/**
 * Handle audio-only transcription
 */
async function handleAudioTranscription(job, data) {
  const { audioPath, options = {} } = data
  
  if (!audioPath) {
    throw new Error('No audio path provided')
  }

  await job.updateProgress({ stage: 'transcribing', progress: 20 })
  
  // Transcribe audio directly
  const transcriptData = await transcriptionService.transcribeAudio(audioPath, options)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Audio transcription completed`, { 
    jobId: job.id,
    segments: transcriptData.segments?.length || 0,
    words: transcriptData.words?.length || 0,
    language: transcriptData.language,
    confidence: transcriptData.confidence
  })
  
  return {
    success: true,
    transcriptData,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      audioPath: audioPath
    }
  }
}

/**
 * Handle audio extraction from video
 */
async function handleAudioExtraction(job, data) {
  const { videoPath, outputDir } = data
  
  if (!videoPath || !outputDir) {
    throw new Error('Video path and output directory required')
  }

  await job.updateProgress({ stage: 'extracting', progress: 30 })
  
  // Extract audio only
  const audioPath = await transcriptionService.extractAudio(videoPath, outputDir)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Audio extraction completed`, { 
    jobId: job.id,
    audioPath: audioPath
  })
  
  return {
    success: true,
    audioPath,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath
    }
  }
}

/**
 * Handle service test
 */
async function handleServiceTest(job, data) {
  await job.updateProgress({ stage: 'testing', progress: 50 })
  
  const result = await transcriptionService.testTranscription(data.options || {})
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`🔍 Service test completed`, { 
    jobId: job.id,
    success: result.success,
    model: result.model
  })
  
  return result
}

// Create worker
const transcriptionWorker = new Worker('transcription', processTranscriptionJob, {
  connection: redis,
  concurrency: parseInt(process.env.TRANSCRIPTION_WORKER_CONCURRENCY) || 1, // CPU intensive, so limit concurrency
  removeOnComplete: 10,
  removeOnFail: 25,
  settings: {
    stalledInterval: 60000, // Longer interval for transcription jobs
    maxStalledCount: 1
  }
})

// Worker event handlers
transcriptionWorker.on('ready', () => {
  logger.info('🎤 Transcription Worker ready and waiting for jobs')
})

transcriptionWorker.on('active', (job) => {
  logger.info(`🔄 Processing job: ${job.id}`, { 
    type: job.data.type,
    attempt: job.attemptsMade + 1
  })
})

transcriptionWorker.on('completed', (job, result) => {
  logger.info(`✅ Job completed: ${job.id}`, { 
    type: job.data.type,
    duration: Date.now() - job.processedOn
  })
})

transcriptionWorker.on('failed', (job, err) => {
  logger.error(`❌ Job failed: ${job.id}`, { 
    type: job.data.type,
    error: err.message,
    attempt: job.attemptsMade
  })
})

transcriptionWorker.on('stalled', (jobId) => {
  logger.warn(`⚠️ Job stalled: ${jobId}`)
})

transcriptionWorker.on('error', (err) => {
  logger.error('🚨 Worker error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...')
  await transcriptionWorker.close()
  await redis.disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...')
  await transcriptionWorker.close()
  await redis.disconnect()
  process.exit(0)
})

// Test service on startup
async function initialize() {
  try {
    logger.info('🚀 Starting Transcription Worker...')
    
    // Test transcription service
    const serviceTest = await transcriptionService.testTranscription()
    if (!serviceTest.success) {
      logger.warn('⚠️ Transcription service test failed, worker will continue but jobs may fail')
      logger.warn(`Service error: ${serviceTest.error}`)
    } else {
      logger.info(`✅ Transcription service ready with model: ${serviceTest.model}`)
    }
    
    logger.info('✅ Transcription Worker initialization complete')
  } catch (error) {
    logger.error('❌ Worker initialization failed:', error)
    process.exit(1)
  }
}

// Initialize and start
initialize().catch(console.error) 