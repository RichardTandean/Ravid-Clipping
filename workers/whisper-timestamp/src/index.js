const { Worker } = require('bullmq')
const Redis = require('ioredis')
const winston = require('winston')
const WhisperTimestampService = require('./services/whisperTimestampService')
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

// Initialize whisper timestamp service
const whisperTimestampService = new WhisperTimestampService()

// Job processor function
async function processWhisperTimestampJob(job) {
  const { type, data } = job.data
  logger.info(`🚀 Processing whisper-timestamp job: ${type}`, { jobId: job.id })
  
  try {
    switch (type) {
      case 'transcribe_with_timestamps':
        return await handleTimestampTranscription(job, data)
      
      case 'transcribe_video_with_timestamps':
        return await handleVideoTimestampTranscription(job, data)
      
      case 'compare_transcriptions':
        return await handleTranscriptionComparison(job, data)
      
      case 'test_installation':
        return await handleInstallationTest(job, data)
      
      case 'get_service_info':
        return await handleServiceInfo(job, data)
      
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
 * Handle audio transcription with precise timestamps
 */
async function handleTimestampTranscription(job, data) {
  const { audioPath, options = {} } = data
  
  if (!audioPath) {
    throw new Error('No audio path provided')
  }

  await job.updateProgress({ stage: 'preparing', progress: 10 })
  
  // Transcribe with precise timestamps
  const transcriptData = await whisperTimestampService.transcribeWithTimestamps(audioPath, options)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Timestamp transcription completed`, { 
    jobId: job.id,
    words: transcriptData.words?.length || 0,
    segments: transcriptData.segments?.length || 0,
    language: transcriptData.language
  })
  
  return {
    success: true,
    transcriptData,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      audioPath: audioPath,
      service: 'whisper-timestamp'
    }
  }
}

/**
 * Handle video transcription with precise timestamps
 */
async function handleVideoTimestampTranscription(job, data) {
  const { videoPath, outputDir, options = {} } = data
  
  if (!videoPath || !outputDir) {
    throw new Error('Video path and output directory required')
  }

  await job.updateProgress({ stage: 'extracting_audio', progress: 20 })
  
  // Process video with timestamps
  const transcriptData = await whisperTimestampService.processVideoWithTimestamps(
    videoPath, 
    outputDir, 
    options
  )
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Video timestamp transcription completed`, { 
    jobId: job.id,
    words: transcriptData.words?.length || 0,
    segments: transcriptData.segments?.length || 0,
    language: transcriptData.language
  })
  
  return {
    success: true,
    transcriptData,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath,
      service: 'whisper-timestamp'
    }
  }
}

/**
 * Handle transcription comparison between regular and timestamped versions
 */
async function handleTranscriptionComparison(job, data) {
  const { audioPath, regularTranscriptData, options = {} } = data
  
  if (!audioPath || !regularTranscriptData) {
    throw new Error('Audio path and regular transcript data required')
  }

  await job.updateProgress({ stage: 'comparing', progress: 30 })
  
  // Compare transcriptions
  const comparisonResult = await whisperTimestampService.compareWithRegularTranscription(
    audioPath, 
    regularTranscriptData, 
    options
  )
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Transcription comparison completed`, { 
    jobId: job.id,
    textSimilarity: comparisonResult.comparison.accuracy.textSimilarity,
    wordCountDiff: comparisonResult.comparison.accuracy.wordCountDifference
  })
  
  return {
    success: true,
    ...comparisonResult,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      service: 'whisper-timestamp'
    }
  }
}

/**
 * Handle installation test
 */
async function handleInstallationTest(job, data) {
  await job.updateProgress({ stage: 'testing', progress: 50 })
  
  const result = await whisperTimestampService.testInstallation()
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`🔍 Installation test completed`, { 
    jobId: job.id,
    success: result.success
  })
  
  return result
}

/**
 * Handle service info request
 */
async function handleServiceInfo(job, data) {
  await job.updateProgress({ stage: 'gathering_info', progress: 50 })
  
  const serviceInfo = await whisperTimestampService.getServiceInfo()
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`ℹ️ Service info request completed`, { 
    jobId: job.id,
    installation: serviceInfo.installation?.success
  })
  
  return serviceInfo
}

// Create worker
const whisperTimestampWorker = new Worker('whisper-timestamp', processWhisperTimestampJob, {
  connection: redis,
  concurrency: parseInt(process.env.WHISPER_TIMESTAMP_WORKER_CONCURRENCY) || 1, // CPU intensive, so limit concurrency
  removeOnComplete: 10,
  removeOnFail: 25,
  settings: {
    stalledInterval: 90000, // Longer interval for transcription jobs
    maxStalledCount: 1
  }
})

// Worker event handlers
whisperTimestampWorker.on('ready', () => {
  logger.info('🎯 Whisper Timestamp Worker ready and waiting for jobs')
})

whisperTimestampWorker.on('active', (job) => {
  logger.info(`🔄 Processing job: ${job.id}`, { 
    type: job.data.type,
    attempt: job.attemptsMade + 1
  })
})

whisperTimestampWorker.on('completed', (job, result) => {
  logger.info(`✅ Job completed: ${job.id}`, { 
    type: job.data.type,
    duration: Date.now() - job.processedOn
  })
})

whisperTimestampWorker.on('failed', (job, err) => {
  logger.error(`❌ Job failed: ${job.id}`, { 
    type: job.data.type,
    error: err.message,
    attempt: job.attemptsMade
  })
})

whisperTimestampWorker.on('stalled', (jobId) => {
  logger.warn(`⚠️ Job stalled: ${jobId}`)
})

whisperTimestampWorker.on('error', (err) => {
  logger.error('🚨 Worker error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...')
  await whisperTimestampWorker.close()
  await redis.disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...')
  await whisperTimestampWorker.close()
  await redis.disconnect()
  process.exit(0)
})

// Test service on startup
async function initialize() {
  try {
    logger.info('🚀 Starting Whisper Timestamp Worker...')
    
    // Test whisper-timestamped installation
    const installationTest = await whisperTimestampService.testInstallation()
    if (!installationTest.success) {
      logger.warn('⚠️ Whisper-timestamped installation test failed, worker will continue but jobs may fail')
      logger.warn(`Installation error: ${installationTest.error}`)
      logger.info('💡 To install whisper-timestamped, run: pip install whisper-timestamped')
    } else {
      logger.info('✅ Whisper-timestamped service ready')
    }
    
    logger.info('✅ Whisper Timestamp Worker initialization complete')
  } catch (error) {
    logger.error('❌ Worker initialization failed:', error)
    process.exit(1)
  }
}

// Initialize and start
initialize().catch(console.error) 