const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs-extra')
const { v4: uuidv4 } = require('uuid')
require('dotenv').config()

const videoProcessor = require('./services/videoProcessor')
const clipGenerator = require('./services/clipGenerator')
const youtubeDownloader = require('./services/youtubeDownloader')
const SubtitleGenerator = require('./services/subtitleGenerator')
const { nodewhisper } = require('nodejs-whisper')


const app = express()
const PORT = process.env.PORT || 3001

// Initialize subtitle generator
const subtitleGenerator = new SubtitleGenerator()

// Store active progress sessions and their state
const progressSessions = new Map()
const sessionStates = new Map() // Store last known state for each session

// Middleware
const isProduction = process.env.NODE_ENV === 'production'
const corsOptions = {
  origin: isProduction 
    ? [process.env.FRONTEND_URL].filter(Boolean) // Production: only allow specific domain
    : true, // Development: allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}

console.log('CORS Configuration:', isProduction ? 'Production (restricted)' : 'Development (open)')
if (isProduction && process.env.FRONTEND_URL) {
  console.log('Allowed origin:', process.env.FRONTEND_URL)
} else if (!isProduction) {
  console.log('Allowed origins: All (development mode)')
}

app.use(cors(corsOptions))
app.use(express.json())

// Ensure directories exist
const uploadsDir = path.join(__dirname, '../uploads')
const outputDir = path.join(__dirname, '../output')
fs.ensureDirSync(uploadsDir)
fs.ensureDirSync(outputDir)

// Serve static files
app.use('/uploads', express.static(uploadsDir))
app.use('/output', express.static(outputDir))

// Download endpoint for direct file download
app.get('/api/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename
    const filePath = path.join(uploadsDir, filename)
    
    // Check if file exists
    if (!await fs.pathExists(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }
    
    const stats = await fs.stat(filePath)
    
    // Set headers for download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Length', stats.size)
    
    // Stream the file
    const fileStream = fs.createReadStream(filePath)
    fileStream.pipe(res)
    
  } catch (error) {
    console.error('Download error:', error)
    res.status(500).json({ error: 'Failed to download file' })
  }
})

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`
    cb(null, uniqueName)
  }
})

const upload = multer({ 
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      cb(null, true)
    } else {
      cb(new Error('Only video and audio files are allowed'))
    }
  }
})

// Server-Sent Events endpoint for progress tracking
app.get('/api/progress/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  })

  // Send initial connection
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`)

  // Send any stored state immediately upon connection
  const storedState = sessionStates.get(sessionId)
  if (storedState) {
    console.log(`Sending stored state for session ${sessionId}:`, storedState)
    res.write(`data: ${JSON.stringify(storedState)}\n\n`)
  }

  // Store the response object for this session
  progressSessions.set(sessionId, res)

  // Keep connection alive with periodic heartbeat
  const heartbeat = setInterval(() => {
    if (progressSessions.has(sessionId)) {
      try {
        res.write(`data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`)
      } catch (error) {
        console.log(`Heartbeat failed for session ${sessionId}, cleaning up`)
        progressSessions.delete(sessionId)
        clearInterval(heartbeat)
      }
    } else {
      clearInterval(heartbeat)
    }
  }, 30000) // Send heartbeat every 30 seconds

  // Handle connection close
  req.on('close', () => {
    console.log(`SSE connection closed for session: ${sessionId}`)
    progressSessions.delete(sessionId)
    clearInterval(heartbeat)
  })

  // Handle connection errors
  req.on('error', (error) => {
    console.error(`SSE connection error for session ${sessionId}:`, error)
    progressSessions.delete(sessionId)
    clearInterval(heartbeat)
  })
})

// Helper function to send progress updates
function sendProgress(sessionId, data) {
  // Store the latest state for this session
  sessionStates.set(sessionId, {
    ...data,
    timestamp: Date.now()
  })

  const res = progressSessions.get(sessionId)
  if (res) {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`)
      
      // If this is a completion or error, close the connection after a brief delay
      if (data.type === 'complete' || data.type === 'error') {
        setTimeout(() => {
          try {
            res.write(`data: ${JSON.stringify({ type: 'close' })}\n\n`)
            res.end()
          } catch (err) {
            console.log('Connection already closed')
          }
          progressSessions.delete(sessionId)
          // Keep session state for a while in case of reconnection
          setTimeout(() => {
            sessionStates.delete(sessionId)
          }, 60000) // Keep state for 1 minute after completion
        }, 1000) // Wait 1 second before closing
      }
    } catch (error) {
      console.error(`Error sending progress for session ${sessionId}:`, error)
      progressSessions.delete(sessionId)
    }
  } else {
    console.warn(`No active SSE connection found for session: ${sessionId}`)
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Video Clipper API Server',
    status: 'running',
    version: '1.0.0',
    features: ['file-upload', 'youtube-download', 'semantic-clipping']
  })
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  })
})

// YouTube video info endpoint
app.post('/api/youtube/info', async (req, res) => {
  try {
    const { url } = req.body
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' })
    }
    
    console.log('Getting YouTube video info for:', url)
    const info = await youtubeDownloader.getVideoInfo(url)
    
    res.json({
      success: true,
      info
    })
    
  } catch (error) {
    console.error('Error getting YouTube info:', error)
    res.status(500).json({ 
      error: 'Failed to get YouTube video info',
      details: error.message 
    })
  }
})

// YouTube video formats endpoint
app.post('/api/youtube/formats', async (req, res) => {
  try {
    const { url } = req.body
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' })
    }
    
    console.log('Getting YouTube video formats for:', url)
    const formats = await youtubeDownloader.getAvailableFormats(url)
    
    res.json({
      success: true,
      formats
    })
    
  } catch (error) {
    console.error('Error getting YouTube formats:', error)
    res.status(500).json({ 
      error: 'Failed to get YouTube video formats',
      details: error.message 
    })
  }
})

// YouTube video download and process endpoint
app.post('/api/youtube/process', async (req, res) => {
  try {
    const { url, options = {}, clipConfig = {} } = req.body
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' })
    }
    
    // Generate session ID for progress tracking
    const sessionId = uuidv4()
    
    console.log('Processing YouTube video:', url)
    console.log('With options:', options)
    console.log('Session ID:', sessionId)
    
    // Send session ID immediately so frontend can start listening for progress
    res.json({
      success: true,
      sessionId,
      message: 'Processing started'
    })
    
    // Continue processing in background
    processYouTubeVideo(url, options, sessionId, clipConfig)
    
  } catch (error) {
    console.error('Error starting YouTube video processing:', error)
    res.status(500).json({ 
      error: 'Failed to start YouTube video processing',
      details: error.message 
    })
  }
})

// YouTube video download-only endpoint
app.post('/api/youtube/download', async (req, res) => {
  try {
    const { url, options = {}, clipConfig = {} } = req.body
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' })
    }
    
    // Generate session ID for progress tracking
    const sessionId = uuidv4()
    
    console.log('Downloading YouTube video (download-only):', url)
    console.log('With options:', options)
    console.log('Session ID:', sessionId)
    
    // Send session ID immediately so frontend can start listening for progress
    res.json({
      success: true,
      sessionId,
      message: 'Download started'
    })
    
    // Continue download in background
    downloadYouTubeVideoOnly(url, options, sessionId, clipConfig)
    
  } catch (error) {
    console.error('Error starting YouTube video download:', error)
    res.status(500).json({ 
      error: 'Failed to start YouTube video download',
      details: error.message 
    })
  }
})

// Process existing downloaded video endpoint
app.post('/api/process-downloaded-video', async (req, res) => {
  try {
    const { filename, clipConfig = {} } = req.body
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' })
    }
    
    // Generate session ID for progress tracking
    const sessionId = uuidv4()
    
    console.log('Processing downloaded video:', filename)
    console.log('Session ID:', sessionId)
    
    // Send session ID immediately so frontend can start listening for progress
    res.json({
      success: true,
      sessionId,
      message: 'Processing started'
    })
    
    // Continue processing in background
    processDownloadedVideo(filename, sessionId, clipConfig)
    
  } catch (error) {
    console.error('Error starting downloaded video processing:', error)
    res.status(500).json({ 
      error: 'Failed to start downloaded video processing',
      details: error.message 
    })
  }
})

// Audio transcription endpoint using nodejs-whisper
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    console.log('POST /api/transcribe hit')
    
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' })
    }

    console.log('Transcribing file:', req.file.originalname, 'Size:', req.file.size)
    const audioPath = req.file.path
    
    // Use nodejs-whisper for transcription
    const transcript = await nodewhisper(audioPath, {
      modelName: 'medium', // You can change this to 'small', 'medium', 'large' for better accuracy
      autoDownloadModelName: 'medium', // Auto-download model if not exists
      verbose: false,
      removeWavFileAfterTranscription: false,
      withCuda: false, // Set to true if you have CUDA GPU support
      whisperOptions: {
        outputInText: true,
        outputInVtt: false,
        outputInSrt: false,
        outputInCsv: false,
        translateToEnglish: false,
        language: 'en',
        wordTimestamps: false,
        timestamps_length: 60
      }
    })

    console.log('Transcription completed successfully')
    
    // Get file size before cleanup for duration estimation
    const estimatedDuration = Math.round(req.file.size / 32000) // Rough estimation based on file size
    
    // Clean up uploaded file
    try {
      fs.unlinkSync(audioPath)
    } catch (cleanupError) {
      console.warn('Failed to cleanup audio file:', cleanupError.message)
    }
    
    res.json({
      text: transcript || '',
      duration: estimatedDuration,
      language: 'en',
      model: 'whisper-base.en',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Transcription error:', error)
    
    // Clean up file if it exists
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path)
      } catch (cleanupError) {
        console.warn('Failed to cleanup audio file after error:', cleanupError.message)
      }
    }
    
    res.status(500).json({ 
      error: 'Transcription failed',
      details: error.message 
    })
  }
})

// Video cropping endpoint
app.post('/api/crop', upload.single('video'), async (req, res) => {
  try {
    const videoFile = req.file
    const cropData = JSON.parse(req.body.cropData)
    
    if (!videoFile) {
      return res.status(400).json({ error: 'No video file provided' })
    }
    
    if (!cropData || typeof cropData.x !== 'number' || typeof cropData.y !== 'number' || 
        typeof cropData.width !== 'number' || typeof cropData.height !== 'number') {
      return res.status(400).json({ error: 'Invalid crop data provided' })
    }
    
    console.log('🎬 Video crop request:', {
      originalFile: videoFile.filename,
      cropData: cropData
    })
    
    // Generate output filename
    const outputFilename = `cropped_${Date.now()}_${videoFile.filename}`
    const outputPath = path.join(outputDir, outputFilename)
    
    // Crop the video
    await videoProcessor.cropVideo(
      videoFile.path, 
      outputPath, 
      cropData,
      (progress) => {
        console.log(`Crop progress: ${progress}%`)
      }
    )
    
    // Return success with download URL
    const videoUrl = `/output/${outputFilename}`
    
    res.json({
      success: true,
      message: 'Video cropped successfully',
      videoUrl: videoUrl,
      filename: outputFilename
    })
    
    // Clean up original file after successful crop
    setTimeout(() => {
      fs.remove(videoFile.path).catch(err => 
        console.warn('Failed to cleanup original file:', err)
      )
    }, 5000)
    
  } catch (error) {
    console.error('Video crop error:', error)
    res.status(500).json({ 
      error: 'Failed to crop video',
      details: error.message 
    })
  }
})


// Background YouTube processing function
async function processYouTubeVideo(url, options, sessionId, clipConfig = {}) {
  try {
    // Step 1: Download the video with user options
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'downloading',
      progress: 0,
      message: 'Starting download...'
    })
    
    const downloadResult = await youtubeDownloader.downloadVideo(url, uploadsDir, options, (downloadInfo) => {
      // Send real-time download progress
      let message = `Downloading... ${downloadInfo.progress.toFixed(1)}%`
      if (downloadInfo.downloadedFormatted && downloadInfo.totalFormatted) {
        message = `Downloading ${downloadInfo.downloadedFormatted} of ${downloadInfo.totalFormatted}`
      }
      if (downloadInfo.speed) {
        message += ` at ${downloadInfo.speed}`
      }
      
      sendProgress(sessionId, {
        type: 'progress',
        stage: 'downloading',
        progress: Math.round(downloadInfo.progress),
        message,
        downloadInfo
      })
    })
    
    const videoPath = downloadResult.path
    const videoId = uuidv4()
    
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'downloading',
      progress: 100,
      message: 'Download completed!'
    })
    
    // Step 2: Analyze video for metadata
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'analyzing',
      progress: 0,
      message: 'Analyzing video...'
    })
    
    const videoInfo = await videoProcessor.getVideoInfo(videoPath)
    console.log('Video info:', videoInfo)
    
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'analyzing',
      progress: 100,
      message: 'Analysis completed!'
    })
    
    // Step 3: Generate clips
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'clipping',
      progress: 0,
      message: 'Generating clips...'
    })
    
    const clips = await clipGenerator.generateClips(videoPath, videoId, {
      duration: videoInfo.duration,
      outputDir,
      clipConfig,
      onProgress: (clipIndex, totalClips, clipProgress) => {
        // Handle transcription/segmentation phase (totalClips = 0)
        if (totalClips === 0) {
          sendProgress(sessionId, {
            type: 'progress',
            stage: 'clipping',
            progress: Math.round(clipProgress),
            message: clipProgress < 40 ? 'Transcribing audio...' : 
                     clipProgress < 70 ? 'Analyzing speech segments...' : 
                     'Generating clip candidates...',
            clipIndex: 0,
            totalClips: 0,
            clipProgress
          })
        } else {
          // Handle actual clip generation phase
          const completedClips = Math.max(0, clipIndex - 1)
          const overallProgress = (completedClips / totalClips * 100) + (clipProgress / totalClips)
          sendProgress(sessionId, {
            type: 'progress',
            stage: 'clipping',
            progress: Math.round(Math.min(99, overallProgress)), // Cap at 99% until complete
            message: `Generating clip ${clipIndex}/${totalClips}... ${clipProgress}%`,
            clipIndex,
            totalClips,
            clipProgress
          })
        }
      }
    })
    
    // Extract clips array from result
    const generatedClips = clips.clips || []
    console.log(`Generated ${generatedClips.length} clips from YouTube video`)
    
    // Step 4: Send completion
    sendProgress(sessionId, {
      type: 'complete',
      stage: 'complete',
      progress: 100,
      message: 'Processing completed!',
      data: {
        success: true,
        source: 'youtube',
        originalUrl: url,
        downloadInfo: downloadResult,
        videoInfo,
        clips: generatedClips.map(clip => ({
          ...clip,
          url: `http://localhost:${PORT}/output/${clip.filename}`
        }))
      }
    })
    
  } catch (error) {
    console.error('Error processing YouTube video:', error)
    sendProgress(sessionId, {
      type: 'error',
      stage: 'error',
      progress: 0,
      message: 'Processing failed',
      error: error.message
    })
  }
}

// Background YouTube download-only function
async function downloadYouTubeVideoOnly(url, options, sessionId, clipConfig = {}) {
  try {
    // Download the video with user options
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'downloading',
      progress: 0,
      message: 'Starting download...'
    })
    
    const downloadResult = await youtubeDownloader.downloadVideo(url, uploadsDir, options, (downloadInfo) => {
      // Send real-time download progress
      let message = `Downloading... ${downloadInfo.progress.toFixed(1)}%`
      if (downloadInfo.downloadedFormatted && downloadInfo.totalFormatted) {
        message = `Downloading ${downloadInfo.downloadedFormatted} of ${downloadInfo.totalFormatted}`
      }
      if (downloadInfo.speed) {
        message += ` at ${downloadInfo.speed}`
      }
      
      sendProgress(sessionId, {
        type: 'progress',
        stage: 'downloading',
        progress: Math.round(downloadInfo.progress),
        message,
        downloadInfo
      })
    })
    
    // Send completion for download-only
    sendProgress(sessionId, {
      type: 'complete',
      stage: 'complete',
      progress: 100,
      message: 'Download completed!',
      data: {
        success: true,
        source: 'youtube-download',
        originalUrl: url,
        downloadInfo: downloadResult,
        downloadOnly: true
      }
    })
    
  } catch (error) {
    console.error('Error downloading YouTube video:', error)
    sendProgress(sessionId, {
      type: 'error',
      stage: 'error',
      progress: 0,
      message: 'Download failed',
      error: error.message
    })
  }
}

// Background processing function for downloaded videos
async function processDownloadedVideo(filename, sessionId, clipConfig = {}) {
  try {
    const videoPath = path.join(uploadsDir, filename)
    
    // Check if file exists
    if (!fs.existsSync(videoPath)) {
      throw new Error('Downloaded video file not found')
    }
    
    console.log('Processing existing video file:', videoPath)
    const videoId = uuidv4()
    
    // Step 1: Analyze video for metadata
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'analyzing',
      progress: 0,
      message: 'Analyzing video...'
    })
    
    const videoInfo = await videoProcessor.getVideoInfo(videoPath)
    console.log('Video info:', videoInfo)
    
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'analyzing',
      progress: 100,
      message: 'Analysis completed!'
    })
    
    // Step 2: Generate clips
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'clipping',
      progress: 0,
      message: 'Generating clips...'
    })
    
    const clips = await clipGenerator.generateClips(videoPath, videoId, {
      duration: videoInfo.duration,
      outputDir,
      clipConfig,
      onProgress: (clipIndex, totalClips, clipProgress) => {
        // Handle transcription/segmentation phase (totalClips = 0)
        if (totalClips === 0) {
          sendProgress(sessionId, {
            type: 'progress',
            stage: 'clipping',
            progress: Math.round(clipProgress),
            message: clipProgress < 40 ? 'Transcribing audio...' : 
                     clipProgress < 70 ? 'Analyzing speech segments...' : 
                     'Generating clip candidates...',
            clipIndex: 0,
            totalClips: 0,
            clipProgress
          })
        } else {
          // Handle actual clip generation phase
          const completedClips = Math.max(0, clipIndex - 1)
          const overallProgress = (completedClips / totalClips * 100) + (clipProgress / totalClips)
          sendProgress(sessionId, {
            type: 'progress',
            stage: 'clipping',
            progress: Math.round(Math.min(99, overallProgress)), // Cap at 99% until complete
            message: `Generating clip ${clipIndex}/${totalClips}... ${clipProgress}%`,
            clipIndex,
            totalClips,
            clipProgress
          })
        }
      }
    })
    
    console.log(`Generated ${clips.length} clips from downloaded video`)
    
    // Step 3: Send completion
    sendProgress(sessionId, {
      type: 'complete',
      stage: 'complete',
      progress: 100,
      message: 'Processing completed!',
      data: {
        success: true,
        source: 'downloaded-video',
        originalFilename: filename,
        videoInfo,
        clips: clips.map(clip => ({
          ...clip,
          url: `http://localhost:${PORT}/output/${clip.filename}`
        }))
      }
    })
    
  } catch (error) {
    console.error('Error processing downloaded video:', error)
    sendProgress(sessionId, {
      type: 'error',
      stage: 'error',
      progress: 0,
      message: 'Processing failed',
      error: error.message
    })
  }
}

app.post('/api/process-video', upload.single('video'), async (req, res) => {
  try {
    console.log('🎬 [Backend] POST /api/process-video endpoint hit')
    
    if (!req.file) {
      console.log('❌ [Backend] No video file uploaded')
      return res.status(400).json({ error: 'No video file uploaded' })
    }

    // Extract clip configuration from form data
    let clipConfig = {}
    if (req.body.clipConfig) {
      try {
        clipConfig = JSON.parse(req.body.clipConfig)
        console.log('🔧 [Backend] Parsed clipConfig from form data:', clipConfig)
      } catch (error) {
        console.warn('⚠️ [Backend] Failed to parse clipConfig, using defaults:', error.message)
        clipConfig = {
          preset: '30s-1m',
          minDuration: 30,
          maxDuration: 60,
          avgDuration: 45,
          language: 'auto'
        }
      }
    } else {
      // Fallback to legacy format if clipConfig not provided
      clipConfig = {
        preset: '30s-1m',
        minDuration: req.body.minDuration ? parseInt(req.body.minDuration) : 30,
        maxDuration: req.body.maxDuration ? parseInt(req.body.maxDuration) : 60,
        avgDuration: req.body.clipDuration ? parseInt(req.body.clipDuration) : 45,
        language: req.body.language || 'auto'
      }
    }
    
    console.log('📊 [Backend] Video processing request details:', {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: `${(req.file.size / (1024 * 1024)).toFixed(2)} MB`,
      mimetype: req.file.mimetype,
      clipConfig: clipConfig,
      processingMode: 'SEMANTIC CLIPPING'
    })
    
    // Generate session ID for progress tracking
    const sessionId = uuidv4()
    
    console.log('🔗 [Backend] Generated session ID for tracking:', sessionId)
    console.log('🚀 [Backend] Starting background processing')
    
    // Send session ID immediately so frontend can start listening for progress
    res.json({
      success: true,
      sessionId,
      message: 'Processing started'
    })
    
    // Continue processing in background
    processUploadedVideo(req.file.path, sessionId, clipConfig)
    
  } catch (error) {
    console.error('Error starting video processing:', error)
    res.status(500).json({ 
      error: 'Failed to start video processing',
      details: error.message 
    })
  }
})

// Background video processing function
async function processUploadedVideo(videoPath, sessionId, clipConfig = {}) {
  try {
    console.log('🎥 [Backend] processUploadedVideo started:', {
      videoPath: videoPath,
      sessionId: sessionId,
      clipConfig: clipConfig,
      processingMode: 'SEMANTIC CLIPPING'
    })

    const videoId = uuidv4()
    
    // Step 1: Analyze video for metadata
    console.log('📊 [Backend] Step 1: Analyzing video metadata...')
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'analyzing',
      progress: 0,
      message: 'Analyzing video...'
    })
    
    const videoInfo = await videoProcessor.getVideoInfo(videoPath)
    console.log('✅ [Backend] Video metadata extracted:', {
      duration: `${Math.floor(videoInfo.duration / 60)}:${(videoInfo.duration % 60).toFixed(0).padStart(2, '0')}`,
      format: videoInfo.format,
      size: videoInfo.size ? `${(videoInfo.size / (1024 * 1024)).toFixed(2)} MB` : 'unknown',
      video: videoInfo.video ? `${videoInfo.video.width}x${videoInfo.video.height}` : 'unknown',
      audio: videoInfo.audio ? `${videoInfo.audio.codec}` : 'unknown'
    })
    
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'analyzing',
      progress: 100,
      message: 'Analysis completed!'
    })
    
    // Step 2: Generate clips
    console.log('🔥 [Backend] Step 2: Starting clip generation')
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'clipping',
      progress: 0,
      message: 'Generating clips...'
    })
    
    console.log('🎬 [Backend] Calling clipGenerator.generateClips with:', {
      videoPath: videoPath,
      videoId: videoId,
      duration: videoInfo.duration,
      clipConfig: clipConfig
    })

    const clipResult = await clipGenerator.generateClips(videoPath, videoId, {
      duration: videoInfo.duration,
      outputDir,
      clipConfig,
      onProgress: (clipIndex, totalClips, clipProgress) => {
        // Handle transcription/segmentation phase (totalClips = 0)
        if (totalClips === 0) {
          sendProgress(sessionId, {
            type: 'progress',
            stage: 'clipping',
            progress: Math.round(clipProgress),
            message: clipProgress < 40 ? 'Transcribing audio...' : 
                     clipProgress < 70 ? 'Analyzing speech segments...' : 
                     'Generating clip candidates...',
            clipIndex: 0,
            totalClips: 0,
            clipProgress
          })
        } else {
          // Handle actual clip generation phase
          const completedClips = Math.max(0, clipIndex - 1)
          const overallProgress = (completedClips / totalClips * 100) + (clipProgress / totalClips)
          sendProgress(sessionId, {
            type: 'progress',
            stage: 'clipping',
            progress: Math.round(Math.min(99, overallProgress)), // Cap at 99% until complete
            message: `Generating clip ${clipIndex}/${totalClips}... ${clipProgress}%`,
            clipIndex,
            totalClips,
            clipProgress
          })
        }
      }
    })
    
    // Handle the clipResult structure
    const clips = clipResult.clips || clipResult || []

    console.log(`✅ [Backend] Clip generation completed!`, {
      totalClips: clips.length,
      processingMode: 'SEMANTIC CLIPPING',
      sessionId: sessionId
    })

    // Log individual clips for debugging
    clips.forEach((clip, index) => {
      console.log(`📎 [Backend] Clip ${index + 1}:`, {
        filename: clip.filename,
        duration: `${clip.duration.toFixed(1)}s`,
        startTime: `${clip.startTime.toFixed(1)}s`,
        endTime: `${clip.endTime.toFixed(1)}s`,
        type: clip.type,
        score: clip.score ? `${(clip.score * 100).toFixed(0)}%` : 'N/A'
      })
    })
    
    // Step 3: Send completion
    console.log('📤 [Backend] Sending completion response to frontend...')
    const responseData = {
      success: true,
      source: 'upload',
      videoInfo,
      clips: clips.map(clip => ({
        ...clip,
        url: `http://localhost:${PORT}/output/${clip.filename}`
      }))
    }

    sendProgress(sessionId, {
      type: 'complete',
      stage: 'complete',
      progress: 100,
      message: 'Processing completed!',
      data: responseData
    })
    
  } catch (error) {
    console.error('Error processing uploaded video:', error)
    sendProgress(sessionId, {
      type: 'error',
      stage: 'error',
      progress: 0,
      message: 'Processing failed',
      error: error.message
    })
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// Cleanup endpoint to delete all uploads and outputs
app.post('/api/cleanup', async (req, res) => {
  try {
    console.log('🧹 Cleaning up uploads and output directories...')
    
    // Clean uploads directory
    const uploadsFiles = await fs.readdir(uploadsDir)
    let deletedUploads = 0
    for (const file of uploadsFiles) {
      if (file !== '.gitkeep') { // Keep .gitkeep file
        await fs.unlink(path.join(uploadsDir, file))
        deletedUploads++
      }
    }
    
    // Clean output directory  
    const outputFiles = await fs.readdir(outputDir)
    let deletedOutputs = 0
    for (const file of outputFiles) {
      if (file !== '.gitkeep') { // Keep .gitkeep file
        await fs.unlink(path.join(outputDir, file))
        deletedOutputs++
      }
    }
    
    console.log(`✅ Cleanup completed: ${deletedUploads} uploads, ${deletedOutputs} clips deleted`)
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      deletedFiles: {
        uploads: deletedUploads,
        outputs: deletedOutputs
      }
    })
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error)
    res.status(500).json({ 
      error: 'Failed to cleanup files',
      details: error.message 
    })
  }
})

// Status polling endpoint as fallback for SSE failures
app.get('/api/status/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId
  
  // Check if session is active
  const hasActiveConnection = progressSessions.has(sessionId)
  const storedState = sessionStates.get(sessionId)
  
  res.json({
    sessionId,
    active: hasActiveConnection,
    state: storedState,
    timestamp: Date.now()
  })
})

// ============================================
// SUBTITLE HELPER FUNCTIONS
// ============================================

// Generate transcript asynchronously with progress updates
async function generateTranscriptAsync(videoPath, sessionId, options = {}) {
  const speechAnalyzer = require('./services/speechAnalyzer')
  
  try {
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'transcribing',
      progress: 0,
      message: 'Starting transcription...'
    })

    const tempDir = path.join(__dirname, '../temp')
    await fs.ensureDir(tempDir)

    // Generate transcript using speech analyzer
    const result = await speechAnalyzer.analyzeVideoSpeech(videoPath, tempDir, {
      language: options.language || 'auto',
      onProgress: (progress) => {
        sendProgress(sessionId, {
          type: 'progress',
          stage: 'transcribing',
          progress: Math.round(progress),
          message: progress < 50 ? 'Extracting audio...' : 
                   progress < 80 ? 'Transcribing with AI...' : 
                   'Processing transcript...'
        })
      }
    })

    // Clean up uploaded video file
    await fs.remove(videoPath)

    // Validate result structure
    if (!result || !result.transcriptData) {
      throw new Error('Invalid transcription result: missing transcriptData')
    }

    const transcriptData = result.transcriptData
    
    sendProgress(sessionId, {
      type: 'complete',
      stage: 'complete',
      progress: 100,
      message: 'Transcript generated successfully!',
      data: {
        success: true,
        transcript: transcriptData,
        fullTranscript: transcriptData.fullText || transcriptData.text || '',
        language: transcriptData.language || 'auto',
        segmentCount: (transcriptData.segments && Array.isArray(transcriptData.segments)) ? transcriptData.segments.length : 0
      }
    })

  } catch (error) {
    console.error('Error generating transcript:', error)
    sendProgress(sessionId, {
      type: 'error',
      stage: 'error',
      progress: 0,
      message: 'Transcript generation failed',
      error: error.message
    })
  }
}

// Burn subtitles asynchronously with progress updates
async function burnSubtitlesAsync(videoPath, transcript, sessionId, styleOptions) {
  try {
    sendProgress(sessionId, {
      type: 'progress',
      stage: 'burning',
      progress: 0,
      message: 'Preparing subtitle burning...'
    })

    const outputFilename = `subtitled_${uuidv4()}.mp4`
    const outputPath = path.join(outputDir, outputFilename)

    // Optimize transcript timing for better subtitle display
    const optimizedTranscript = subtitleGenerator.optimizeSubtitleTiming(transcript, {
      minDuration: 1.0,
      maxDuration: 4.0,
      readingSpeed: 200
    })

    const result = await subtitleGenerator.burnSubtitlesIntoVideo(
      videoPath,
      optimizedTranscript,
      outputPath,
      styleOptions,
      (progress) => {
        sendProgress(sessionId, {
          type: 'progress',
          stage: 'burning',
          progress: Math.round(progress),
          message: `Burning subtitles into video... ${progress}%`
        })
      }
    )

    // Clean up uploaded video file
    await fs.remove(videoPath)

    sendProgress(sessionId, {
      type: 'complete',
      stage: 'complete',
      progress: 100,
      message: 'Subtitles burned successfully!',
      data: {
        success: true,
        filename: outputFilename,
        downloadUrl: `http://localhost:${PORT}/output/${outputFilename}`,
        style: result.style,
        subtitleCount: result.subtitleCount
      }
    })

  } catch (error) {
    console.error('Error burning subtitles:', error)
    sendProgress(sessionId, {
      type: 'error',
      stage: 'error',
      progress: 0,
      message: 'Subtitle burning failed',
      error: error.message
    })
  }
}

// Extract transcript segments for a specific time range (for clips)
function extractTranscriptForClip(transcript, startTime, endTime) {
  const clipSegments = transcript.segments.filter(segment => {
    return (segment.start >= startTime && segment.start <= endTime) ||
           (segment.end >= startTime && segment.end <= endTime) ||
           (segment.start <= startTime && segment.end >= endTime)
  }).map(segment => {
    // Adjust timestamps relative to clip start
    return {
      ...segment,
      start: Math.max(0, segment.start - startTime),
      end: Math.min(endTime - startTime, segment.end - startTime),
      duration: Math.min(endTime - startTime, segment.end - startTime) - Math.max(0, segment.start - startTime)
    }
  }).filter(segment => segment.duration > 0.5) // Filter out very short segments

  return {
    ...transcript,
    segments: clipSegments,
    fullText: clipSegments.map(s => s.text).join(' ')
  }
}

// ============================================
// SUBTITLE GENERATION ENDPOINTS
// ============================================

// Get available social media presets
app.get('/api/subtitle-presets', (req, res) => {
  try {
    const presets = subtitleGenerator.getSocialMediaPresets()
    res.json({
      success: true,
      presets: presets
    })
  } catch (error) {
    console.error('Error getting subtitle presets:', error)
    res.status(500).json({ error: 'Failed to get subtitle presets' })
  }
})

// Get supported languages
app.get('/api/subtitle-languages', (req, res) => {
  try {
    const languages = subtitleGenerator.getSupportedLanguages()
    res.json({
      success: true,
      languages: languages
    })
  } catch (error) {
    console.error('Error getting supported languages:', error)
    res.status(500).json({ error: 'Failed to get supported languages' })
  }
})

// Generate transcript only (for subtitle editor)
app.post('/api/generate-transcript', upload.single('video'), async (req, res) => {
  const sessionId = uuidv4()
  
  try {
    console.log('📝 POST /api/generate-transcript - Session:', sessionId)
    
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' })
    }

    const videoPath = req.file.path
    const options = req.body.options ? JSON.parse(req.body.options) : {}
    
    console.log('🎬 Generating transcript for video:', req.file.originalname)
    console.log('🔧 Options:', options)

    // Start transcript generation in background
    res.json({ 
      success: true, 
      sessionId: sessionId,
      message: 'Transcript generation started'
    })
    
    // Generate transcript using speech analyzer
    generateTranscriptAsync(videoPath, sessionId, options)
    
  } catch (error) {
    console.error('Error starting transcript generation:', error)
    res.status(500).json({ error: 'Failed to start transcript generation' })
  }
})

// Generate subtitle files (SRT/VTT)
app.post('/api/generate-subtitle-file', async (req, res) => {
  try {
    console.log('📝 POST /api/generate-subtitle-file')
    
    const { transcript, format = 'srt', options = {} } = req.body
    
    if (!transcript || !transcript.segments) {
      return res.status(400).json({ error: 'Invalid transcript data provided' })
    }

    const outputFilename = `subtitles_${uuidv4()}.${format}`
    const outputPath = path.join(outputDir, outputFilename)
    
    let result
    if (format === 'vtt') {
      result = await subtitleGenerator.generateVTT(transcript, outputPath, options)
    } else if (format === 'ass') {
      result = await subtitleGenerator.generateASS(transcript, outputPath, options)
    } else {
      result = await subtitleGenerator.generateSRT(transcript, outputPath, options)
    }
    
    console.log(`✅ Generated ${format.toUpperCase()} subtitle file:`, outputFilename)
    
    res.json({
      success: true,
      filename: outputFilename,
      downloadUrl: `http://localhost:${PORT}/output/${outputFilename}`,
      ...result
    })
    
  } catch (error) {
    console.error('Error generating subtitle file:', error)
    res.status(500).json({ error: 'Failed to generate subtitle file' })
  }
})

// Burn subtitles into video
app.post('/api/burn-subtitles', upload.single('video'), async (req, res) => {
  const sessionId = uuidv4()
  
  try {
    console.log('🔥 POST /api/burn-subtitles - Session:', sessionId)
    
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' })
    }

    const videoPath = req.file.path
    const { transcript, styleOptions = {} } = JSON.parse(req.body.data || '{}')

    console.log('styleOptions in api: ', styleOptions)
    
    if (!transcript || !transcript.segments) {
      return res.status(400).json({ error: 'Invalid transcript data provided' })
    }

    // Start subtitle burning in background
    res.json({ 
      success: true, 
      sessionId: sessionId,
      message: 'Subtitle burning started'
    })
    
    // Burn subtitles in background
    burnSubtitlesAsync(videoPath, transcript, sessionId, styleOptions)
    
  } catch (error) {
    console.error('Error starting subtitle burning:', error)
    res.status(500).json({ error: 'Failed to start subtitle burning' })
  }
})

// Generate subtitles for existing clips
app.post('/api/add-subtitles-to-clips', async (req, res) => {
  try {
    console.log('📝 POST /api/add-subtitles-to-clips')
    
    const { clips, transcript, styleOptions = {} } = req.body
    
    if (!clips || !Array.isArray(clips) || !transcript) {
      return res.status(400).json({ error: 'Invalid clips or transcript data' })
    }

    console.log(`🎬 Adding subtitles to ${clips.length} clips`)

    const results = []
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const clipPath = path.join(outputDir, clip.filename)
      
      // Extract transcript segment for this clip
      const clipTranscript = extractTranscriptForClip(transcript, clip.startTime, clip.endTime)
      
      if (clipTranscript.segments.length > 0) {
        const outputFilename = `subtitled_${clip.filename}`
        const outputPath = path.join(outputDir, outputFilename)
        
        try {
          await subtitleGenerator.burnSubtitlesIntoVideo(
            clipPath, 
            clipTranscript, 
            outputPath, 
            styleOptions
          )
          
          results.push({
            originalClip: clip.filename,
            subtitledClip: outputFilename,
            downloadUrl: `http://localhost:${PORT}/output/${outputFilename}`,
            success: true
          })
          
          console.log(`✅ Added subtitles to clip ${i + 1}/${clips.length}: ${outputFilename}`)
        } catch (error) {
          console.error(`❌ Failed to add subtitles to clip ${clip.filename}:`, error)
          results.push({
            originalClip: clip.filename,
            success: false,
            error: error.message
          })
        }
      } else {
        results.push({
          originalClip: clip.filename,
          success: false,
          error: 'No transcript segments found for this clip timeframe'
        })
      }
    }
    
    const successCount = results.filter(r => r.success).length
    console.log(`📊 Subtitle addition completed: ${successCount}/${clips.length} clips successful`)
    
    res.json({
      success: true,
      results: results,
      summary: {
        total: clips.length,
        successful: successCount,
        failed: clips.length - successCount
      }
    })
    
  } catch (error) {
    console.error('Error adding subtitles to clips:', error)
    res.status(500).json({ error: 'Failed to add subtitles to clips' })
  }
})

// Test ASS generation endpoint for debugging
app.post('/api/test-ass-generation', async (req, res) => {
  try {
    console.log('🧪 POST /api/test-ass-generation')
    
    const { transcript, options = {} } = req.body
    
    if (!transcript || !transcript.segments) {
      return res.status(400).json({ error: 'Invalid transcript data provided' })
    }

    const outputFilename = `test_karaoke_${uuidv4()}.ass`
    const outputPath = path.join(outputDir, outputFilename)
    
    console.log('🎤 Testing ASS generation with options:', options)
    
    const result = await subtitleGenerator.generateASS(transcript, outputPath, {
      fontSize: options.fontSize || 32,
      primaryColor: options.primaryColor || '#FFFFFF',
      highlightColor: options.highlightColor || '#FFD700',
      outlineColor: options.outlineColor || '#000000',
      backgroundColor: options.backgroundColor || 'rgba(0,0,0,0.7)',
      outline: options.outline || 2,
      alignment: options.alignment || 2,
      marginV: options.marginV || 80,
      karaokeDuration: options.karaokeDuration || 0.3,
      ...options
    })
    
    // Read the generated file content for debugging
    const fileContent = await fs.readFile(outputPath, 'utf8')
    
    console.log(`✅ Generated test ASS file: ${outputFilename}`)
    
    res.json({
      success: true,
      filename: outputFilename,
      downloadUrl: `http://localhost:${PORT}/output/${outputFilename}`,
      content: fileContent, // Include content for debugging
      ...result
    })
    
  } catch (error) {
    console.error('Error testing ASS generation:', error)
    res.status(500).json({ 
      error: 'Failed to test ASS generation',
      details: error.message 
    })
  }
})

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 500MB.' })
    }
  }
  
  console.error('Server error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`Video Clipper Backend running on port ${PORT}`)
  console.log(`Upload directory: ${uploadsDir}`)
  console.log(`Output directory: ${outputDir}`)
  console.log('Features: File Upload, YouTube Download, AI Clipping')
}) 