const express = require('express')
const cors = require('cors')
const multer = require('multer')
const winston = require('winston')
const path = require('path')
const StorageService = require('./services/storageService')
require('dotenv').config()

// Initialize Express app
const app = express()
const port = process.env.STORAGE_SERVICE_PORT || 3005

// Configure logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/storage-service.log',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5
    })
  ]
})

// Middleware
app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024, // 2GB
    files: 10
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.mp4', '.avi', '.mov', '.mp3', '.wav', '.jpg', '.png', '.txt', '.json']
    const extension = path.extname(file.originalname).toLowerCase()
    
    if (allowedExtensions.includes(extension)) {
      cb(null, true)
    } else {
      cb(new Error(`File extension not allowed: ${extension}`))
    }
  }
})

// Initialize Storage Service
const storageService = new StorageService({}, logger)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'storage-service',
    version: '1.0.0'
  })
})

// ============================================================================
// FILE UPLOAD ENDPOINTS
// ============================================================================

// Upload single file
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' })
    }
    
    const { fileType = 'temp', metadata = '{}' } = req.body
    const parsedMetadata = JSON.parse(metadata)
    
    const result = await storageService.storeFile(
      req.file.buffer,
      req.file.originalname,
      fileType,
      {
        ...parsedMetadata,
        uploadedBy: req.headers['x-user-id'] || 'unknown',
        originalSize: req.file.size,
        mimeType: req.file.mimetype
      }
    )
    
    logger.info(`📁 File uploaded via API`, {
      fileId: result.fileId,
      originalName: req.file.originalname,
      fileType,
      size: req.file.size
    })
    
    res.json({
      success: true,
      ...result
    })
    
  } catch (error) {
    logger.error('File upload failed:', error)
    res.status(500).json({
      error: 'File upload failed',
      details: error.message
    })
  }
})

// Upload multiple files
app.post('/api/files/upload/multiple', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' })
    }
    
    const { fileType = 'temp', metadata = '{}' } = req.body
    const parsedMetadata = JSON.parse(metadata)
    
    const results = []
    const errors = []
    
    for (const file of req.files) {
      try {
        const result = await storageService.storeFile(
          file.buffer,
          file.originalname,
          fileType,
          {
            ...parsedMetadata,
            uploadedBy: req.headers['x-user-id'] || 'unknown',
            originalSize: file.size,
            mimeType: file.mimetype
          }
        )
        results.push(result)
      } catch (error) {
        errors.push({
          filename: file.originalname,
          error: error.message
        })
      }
    }
    
    logger.info(`📁 Multiple files uploaded via API`, {
      successful: results.length,
      failed: errors.length,
      fileType
    })
    
    res.json({
      success: true,
      results,
      errors,
      summary: {
        uploaded: results.length,
        failed: errors.length,
        total: req.files.length
      }
    })
    
  } catch (error) {
    logger.error('Multiple file upload failed:', error)
    res.status(500).json({
      error: 'Multiple file upload failed',
      details: error.message
    })
  }
})

// ============================================================================
// FILE RETRIEVAL ENDPOINTS
// ============================================================================

// Download file by ID
app.get('/api/files/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params
    const { stream = false } = req.query
    
    const fileResult = await storageService.retrieveFile(fileId, { stream: stream === 'true' })
    
    // Set appropriate headers
    res.setHeader('Content-Type', fileResult.metadata.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${fileResult.metadata.originalName}"`)
    
    if (fileResult.metadata.size) {
      res.setHeader('Content-Length', fileResult.metadata.size)
    }
    
    // Send file data
    if (stream && typeof fileResult.data.pipe === 'function') {
      fileResult.data.pipe(res)
    } else {
      res.send(fileResult.data)
    }
    
    logger.info(`📁 File downloaded via API`, {
      fileId,
      filename: fileResult.metadata.originalName,
      size: fileResult.metadata.size
    })
    
  } catch (error) {
    logger.error('File download failed:', error)
    
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'File not found' })
    } else if (error.message.includes('expired')) {
      res.status(410).json({ error: 'File expired' })
    } else {
      res.status(500).json({ error: 'File download failed', details: error.message })
    }
  }
})

// Get file metadata
app.get('/api/files/:fileId/metadata', async (req, res) => {
  try {
    const { fileId } = req.params
    const metadata = await storageService.getFileMetadata(fileId)
    
    res.json({
      success: true,
      metadata
    })
    
  } catch (error) {
    logger.error('Get file metadata failed:', error)
    
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'File not found' })
    } else {
      res.status(500).json({ error: 'Failed to get file metadata', details: error.message })
    }
  }
})

// ============================================================================
// FILE MANAGEMENT ENDPOINTS
// ============================================================================

// List files with filtering
app.get('/api/files', async (req, res) => {
  try {
    const filters = {
      fileType: req.query.fileType,
      backend: req.query.backend,
      status: req.query.status,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    }
    
    const result = await storageService.listFiles(filters)
    
    res.json({
      success: true,
      ...result
    })
    
  } catch (error) {
    logger.error('List files failed:', error)
    res.status(500).json({ error: 'Failed to list files', details: error.message })
  }
})

// Delete file
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params
    
    await storageService.deleteFile(fileId)
    
    logger.info(`🗑️ File deleted via API`, { fileId })
    
    res.json({
      success: true,
      message: 'File deleted successfully'
    })
    
  } catch (error) {
    logger.error('File deletion failed:', error)
    
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'File not found' })
    } else {
      res.status(500).json({ error: 'File deletion failed', details: error.message })
    }
  }
})

// Update file metadata
app.patch('/api/files/:fileId/metadata', async (req, res) => {
  try {
    const { fileId } = req.params
    const updates = req.body
    
    // Remove read-only fields
    delete updates.id
    delete updates.uploadedAt
    delete updates.checksum
    delete updates.size
    
    const updatedMetadata = await storageService.updateFileMetadata(fileId, updates)
    
    logger.info(`📝 File metadata updated via API`, {
      fileId,
      updates: Object.keys(updates)
    })
    
    res.json({
      success: true,
      metadata: updatedMetadata
    })
    
  } catch (error) {
    logger.error('Update file metadata failed:', error)
    
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'File not found' })
    } else {
      res.status(500).json({ error: 'Failed to update file metadata', details: error.message })
    }
  }
})

// Move file to different backend
app.post('/api/files/:fileId/move', async (req, res) => {
  try {
    const { fileId } = req.params
    const { targetBackend } = req.body
    
    if (!targetBackend) {
      return res.status(400).json({ error: 'targetBackend is required' })
    }
    
    const result = await storageService.moveFile(fileId, targetBackend)
    
    logger.info(`📦 File moved via API`, {
      fileId,
      targetBackend
    })
    
    res.json({
      success: true,
      metadata: result
    })
    
  } catch (error) {
    logger.error('File move failed:', error)
    
    if (error.message.includes('not found')) {
      res.status(404).json({ error: 'File not found' })
    } else {
      res.status(500).json({ error: 'File move failed', details: error.message })
    }
  }
})

// ============================================================================
// STORAGE MANAGEMENT ENDPOINTS
// ============================================================================

// Get storage statistics
app.get('/api/storage/stats', async (req, res) => {
  try {
    const stats = await storageService.getStorageStats()
    
    res.json({
      success: true,
      stats
    })
    
  } catch (error) {
    logger.error('Get storage stats failed:', error)
    res.status(500).json({ error: 'Failed to get storage stats', details: error.message })
  }
})

// Trigger cleanup of expired files
app.post('/api/storage/cleanup', async (req, res) => {
  try {
    const result = await storageService.cleanupExpiredFiles()
    
    logger.info(`🧹 Cleanup triggered via API`, {
      cleaned: result.cleaned,
      failed: result.failed,
      total: result.total
    })
    
    res.json({
      success: true,
      cleanup: result
    })
    
  } catch (error) {
    logger.error('Storage cleanup failed:', error)
    res.status(500).json({ error: 'Storage cleanup failed', details: error.message })
  }
})

// Get storage configuration
app.get('/api/storage/config', async (req, res) => {
  try {
    res.json({
      success: true,
      config: {
        defaultBackend: storageService.config.defaultBackend,
        enabledBackends: Object.keys(storageService.backends),
        policies: storageService.config.policies,
        backends: Object.fromEntries(
          Object.entries(storageService.config.backends).map(([key, config]) => [
            key,
            {
              enabled: config.enabled,
              maxFileSize: config.maxFileSize,
              allowedExtensions: config.allowedExtensions
            }
          ])
        )
      }
    })
    
  } catch (error) {
    logger.error('Get storage config failed:', error)
    res.status(500).json({ error: 'Failed to get storage config', details: error.message })
  }
})

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

// Force file system check
app.post('/api/admin/fsck', async (req, res) => {
  try {
    // This would check file system integrity
    // For now, just verify all registered files exist
    
    const allFiles = await storageService.listFiles({ limit: 10000 })
    const issues = []
    
    for (const file of allFiles.files) {
      try {
        await storageService.getFileMetadata(file.id)
      } catch (error) {
        issues.push({
          fileId: file.id,
          issue: error.message
        })
      }
    }
    
    res.json({
      success: true,
      fsck: {
        totalFiles: allFiles.files.length,
        issues: issues.length,
        details: issues
      }
    })
    
  } catch (error) {
    logger.error('FSCK failed:', error)
    res.status(500).json({ error: 'FSCK failed', details: error.message })
  }
})

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Handle multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' })
    } else if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({ error: 'Too many files' })
    }
  }
  
  logger.error('Unhandled error:', error)
  res.status(500).json({ error: 'Internal server error' })
})

// ============================================================================
// STARTUP
// ============================================================================

// Start server
app.listen(port, () => {
  logger.info(`🗄️ Storage Service running on port ${port}`)
  logger.info(`📁 File upload endpoint: http://localhost:${port}/api/files/upload`)
  logger.info(`📊 Storage stats: http://localhost:${port}/api/storage/stats`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Received SIGTERM, shutting down gracefully...')
  await storageService.shutdown()
  process.exit(0)
})

process.on('SIGINT', async () => {
  logger.info('🛑 Received SIGINT, shutting down gracefully...')
  await storageService.shutdown()
  process.exit(0)
}) 