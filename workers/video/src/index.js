const { Worker } = require('bullmq')
const Redis = require('ioredis')
const winston = require('winston')
const VideoProcessingService = require('./services/videoProcessingService')
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

// Initialize video processing service
const videoProcessingService = new VideoProcessingService()

// Job processor function
async function processVideoJob(job) {
  const { type, data } = job.data
  logger.info(`🚀 Processing video job: ${type}`, { jobId: job.id })
  
  try {
    switch (type) {
      case 'get_video_info':
        return await handleGetVideoInfo(job, data)
      
      case 'create_clip':
        return await handleCreateClip(job, data)
      
      case 'crop_video':
        return await handleCropVideo(job, data)
      
      case 'extract_audio':
        return await handleExtractAudio(job, data)
      
      case 'extract_frame':
        return await handleExtractFrame(job, data)
      
      case 'generate_thumbnail':
        return await handleGenerateThumbnail(job, data)
      
      case 'detect_scenes':
        return await handleDetectScenes(job, data)
      
      case 'detect_silence':
        return await handleDetectSilence(job, data)
      
      case 'analyze_audio_levels':
        return await handleAnalyzeAudioLevels(job, data)
      
      case 'test_ffmpeg':
        return await handleTestFFmpeg(job, data)
      
      case 'get_service_info':
        return await handleGetServiceInfo(job, data)
      
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
 * Handle getting video information
 */
async function handleGetVideoInfo(job, data) {
  const { videoPath } = data
  
  if (!videoPath) {
    throw new Error('No video path provided')
  }

  await job.updateProgress({ stage: 'analyzing', progress: 50 })
  
  const videoInfo = await videoProcessingService.getVideoInfo(videoPath)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Video info extraction completed`, { 
    jobId: job.id,
    duration: videoInfo.duration,
    resolution: `${videoInfo.video?.width}x${videoInfo.video?.height}`
  })
  
  return {
    success: true,
    videoInfo,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath
    }
  }
}

/**
 * Handle creating video clip
 */
async function handleCreateClip(job, data) {
  const { inputPath, outputPath, startTime, duration, options = {} } = data
  
  if (!inputPath || !outputPath || startTime === undefined || !duration) {
    throw new Error('Missing required parameters for clip creation')
  }

  await job.updateProgress({ stage: 'processing', progress: 10 })
  
  // Add progress callback
  const progressOptions = {
    ...options,
    onProgress: async (percent) => {
      await job.updateProgress({ stage: 'creating_clip', progress: Math.max(10, percent) })
    }
  }
  
  const resultPath = await videoProcessingService.createClip(
    inputPath, 
    outputPath, 
    startTime, 
    duration, 
    progressOptions
  )
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Video clip creation completed`, { 
    jobId: job.id,
    startTime: startTime,
    duration: duration,
    outputPath: resultPath
  })
  
  return {
    success: true,
    outputPath: resultPath,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      inputPath: inputPath,
      startTime: startTime,
      duration: duration
    }
  }
}

/**
 * Handle video cropping
 */
async function handleCropVideo(job, data) {
  const { inputPath, outputPath, cropOptions, processingOptions = {} } = data
  
  if (!inputPath || !outputPath || !cropOptions) {
    throw new Error('Missing required parameters for video cropping')
  }

  await job.updateProgress({ stage: 'processing', progress: 10 })
  
  // Add progress callback
  const progressOptions = {
    ...processingOptions,
    onProgress: async (percent) => {
      await job.updateProgress({ stage: 'cropping', progress: Math.max(10, percent) })
    }
  }
  
  const resultPath = await videoProcessingService.cropVideo(
    inputPath, 
    outputPath, 
    cropOptions, 
    progressOptions
  )
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Video cropping completed`, { 
    jobId: job.id,
    cropOptions: cropOptions,
    outputPath: resultPath
  })
  
  return {
    success: true,
    outputPath: resultPath,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      inputPath: inputPath,
      cropOptions: cropOptions
    }
  }
}

/**
 * Handle audio extraction
 */
async function handleExtractAudio(job, data) {
  const { videoPath, outputPath, options = {} } = data
  
  if (!videoPath || !outputPath) {
    throw new Error('Video path and output path required')
  }

  await job.updateProgress({ stage: 'extracting', progress: 20 })
  
  // Add progress callback
  const extractOptions = {
    ...options,
    onProgress: async (percent) => {
      await job.updateProgress({ stage: 'extracting_audio', progress: Math.max(20, percent) })
    }
  }
  
  const resultPath = await videoProcessingService.extractAudio(videoPath, outputPath, extractOptions)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Audio extraction completed`, { 
    jobId: job.id,
    outputPath: resultPath
  })
  
  return {
    success: true,
    audioPath: resultPath,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath
    }
  }
}

/**
 * Handle frame extraction
 */
async function handleExtractFrame(job, data) {
  const { videoPath, timestamp, outputPath } = data
  
  if (!videoPath || timestamp === undefined || !outputPath) {
    throw new Error('Video path, timestamp, and output path required')
  }

  await job.updateProgress({ stage: 'extracting', progress: 30 })
  
  const resultPath = await videoProcessingService.extractFrame(videoPath, timestamp, outputPath)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Frame extraction completed`, { 
    jobId: job.id,
    timestamp: timestamp,
    outputPath: resultPath
  })
  
  return {
    success: true,
    framePath: resultPath,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath,
      timestamp: timestamp
    }
  }
}

/**
 * Handle thumbnail generation
 */
async function handleGenerateThumbnail(job, data) {
  const { videoPath, outputPath, options = {} } = data
  
  if (!videoPath || !outputPath) {
    throw new Error('Video path and output path required')
  }

  await job.updateProgress({ stage: 'generating', progress: 40 })
  
  const resultPath = await videoProcessingService.generateThumbnail(videoPath, outputPath, options)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Thumbnail generation completed`, { 
    jobId: job.id,
    outputPath: resultPath
  })
  
  return {
    success: true,
    thumbnailPath: resultPath,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath
    }
  }
}

/**
 * Handle scene detection
 */
async function handleDetectScenes(job, data) {
  const { videoPath, threshold } = data
  
  if (!videoPath) {
    throw new Error('Video path required')
  }

  await job.updateProgress({ stage: 'detecting', progress: 30 })
  
  const scenes = await videoProcessingService.detectScenes(videoPath, threshold)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Scene detection completed`, { 
    jobId: job.id,
    scenesDetected: scenes.length
  })
  
  return {
    success: true,
    scenes,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath,
      threshold: threshold
    }
  }
}

/**
 * Handle silence detection
 */
async function handleDetectSilence(job, data) {
  const { videoPath, silenceThreshold, minSilenceDuration } = data
  
  if (!videoPath) {
    throw new Error('Video path required')
  }

  await job.updateProgress({ stage: 'detecting', progress: 30 })
  
  const silencePeriods = await videoProcessingService.detectSilence(
    videoPath, 
    silenceThreshold, 
    minSilenceDuration
  )
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Silence detection completed`, { 
    jobId: job.id,
    silencePeriodsDetected: silencePeriods.length
  })
  
  return {
    success: true,
    silencePeriods,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath
    }
  }
}

/**
 * Handle audio level analysis
 */
async function handleAnalyzeAudioLevels(job, data) {
  const { videoPath } = data
  
  if (!videoPath) {
    throw new Error('Video path required')
  }

  await job.updateProgress({ stage: 'analyzing', progress: 40 })
  
  const audioLevels = await videoProcessingService.analyzeAudioLevels(videoPath)
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`✅ Audio level analysis completed`, { 
    jobId: job.id,
    audioLevels: audioLevels
  })
  
  return {
    success: true,
    audioLevels,
    metadata: {
      processedAt: new Date().toISOString(),
      jobId: job.id,
      videoPath: videoPath
    }
  }
}

/**
 * Handle FFmpeg test
 */
async function handleTestFFmpeg(job, data) {
  await job.updateProgress({ stage: 'testing', progress: 50 })
  
  const result = await videoProcessingService.testFFmpeg()
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`🔍 FFmpeg test completed`, { 
    jobId: job.id,
    success: result.success
  })
  
  return result
}

/**
 * Handle service info request
 */
async function handleGetServiceInfo(job, data) {
  await job.updateProgress({ stage: 'gathering_info', progress: 50 })
  
  const serviceInfo = await videoProcessingService.getServiceInfo()
  
  await job.updateProgress({ stage: 'complete', progress: 100 })
  
  logger.info(`ℹ️ Service info request completed`, { 
    jobId: job.id,
    ffmpegWorking: serviceInfo.ffmpegTest?.success
  })
  
  return serviceInfo
}

// Create worker
const videoWorker = new Worker('video-processing', processVideoJob, {
  connection: redis,
  concurrency: parseInt(process.env.VIDEO_WORKER_CONCURRENCY) || 2, // CPU/IO intensive
  removeOnComplete: 10,
  removeOnFail: 25,
  settings: {
    stalledInterval: 60000, // Longer interval for video processing jobs
    maxStalledCount: 1
  }
})

// Worker event handlers
videoWorker.on('ready', () => {
  logger.info('🎬 Video Processing Worker ready and waiting for jobs')
})

videoWorker.on('active', (job) => {
  logger.info(`🔄 Processing job: ${job.id}`, { 
    type: job.data.type,
    attempt: job.attemptsMade + 1
  })
})

videoWorker.on('completed', (job, result) => {
  logger.info(`✅ Job completed: ${job.id}`, { 
    type: job.data.type,
    duration: Date.now() - job.processedOn
  })
})

videoWorker.on('failed', (job, err) => {
  logger.error(`❌ Job failed: ${job.id}`, { 
    type: job.data.type,
    error: err.message,
    attempt: job.attemptsMade
  })
})

videoWorker.on('stalled', (jobId) => {
  logger.warn(`⚠️ Job stalled: ${jobId}`)
})

videoWorker.on('error', (err) => {
  logger.error('🚨 Worker error:', err)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...')
  await videoWorker.close()
  await redis.disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...')
  await videoWorker.close()
  await redis.disconnect()
  process.exit(0)
})

// Test service on startup
async function initialize() {
  try {
    logger.info('🚀 Starting Video Processing Worker...')
    
    // Test FFmpeg installation
    const ffmpegTest = await videoProcessingService.testFFmpeg()
    if (!ffmpegTest.success) {
      logger.warn('⚠️ FFmpeg test failed, worker will continue but jobs may fail')
      logger.warn(`FFmpeg error: ${ffmpegTest.error}`)
      logger.info('💡 To install FFmpeg, visit: https://ffmpeg.org/download.html')
    } else {
      logger.info('✅ FFmpeg service ready')
    }
    
    logger.info('✅ Video Processing Worker initialization complete')
  } catch (error) {
    logger.error('❌ Worker initialization failed:', error)
    process.exit(1)
  }
}

// Initialize and start
initialize().catch(console.error) 