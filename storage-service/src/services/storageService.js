const fs = require('fs-extra')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const winston = require('winston')
const crypto = require('crypto')

class StorageService {
  constructor(config, logger) {
    this.config = {
      defaultBackend: 'local',
      backends: {
        local: {
          enabled: true,
          basePath: './storage',
          maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB
          allowedExtensions: ['.mp4', '.avi', '.mov', '.mp3', '.wav', '.jpg', '.png', '.txt', '.json']
        },
        s3: {
          enabled: false,
          bucket: process.env.S3_BUCKET || '',
          region: process.env.S3_REGION || 'us-east-1',
          accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
        },
        gcs: {
          enabled: false,
          bucket: process.env.GCS_BUCKET || '',
          keyFilename: process.env.GCS_KEY_FILE || '',
          projectId: process.env.GCS_PROJECT_ID || ''
        }
      },
      policies: {
        video: {
          backend: 'local',
          retention: 30 * 24 * 60 * 60 * 1000, // 30 days
          compressionEnabled: false,
          encryptionEnabled: false,
          maxFileSize: 2 * 1024 * 1024 * 1024 // 2GB
        },
        audio: {
          backend: 'local',
          retention: 14 * 24 * 60 * 60 * 1000, // 14 days
          compressionEnabled: true,
          encryptionEnabled: false,
          maxFileSize: 500 * 1024 * 1024 // 500MB
        },
        temp: {
          backend: 'local',
          retention: 24 * 60 * 60 * 1000, // 24 hours
          compressionEnabled: false,
          encryptionEnabled: false,
          maxFileSize: 1 * 1024 * 1024 * 1024 // 1GB
        },
        output: {
          backend: 'local',
          retention: 7 * 24 * 60 * 60 * 1000, // 7 days
          compressionEnabled: true,
          encryptionEnabled: false,
          maxFileSize: 1 * 1024 * 1024 * 1024 // 1GB
        },
        logs: {
          backend: 'local',
          retention: 7 * 24 * 60 * 60 * 1000, // 7 days
          compressionEnabled: true,
          encryptionEnabled: false,
          maxFileSize: 100 * 1024 * 1024 // 100MB
        }
      },
      ...config
    }
    
    this.logger = logger || winston.createLogger()
    this.fileRegistry = new Map() // Track all files
    this.backends = {}
    
    this.initializeBackends()
    this.startCleanupScheduler()
    
    this.logger.info('🗄️ Storage Service initialized', {
      defaultBackend: this.config.defaultBackend,
      enabledBackends: Object.keys(this.backends),
      policies: Object.keys(this.config.policies)
    })
  }

  /**
   * Initialize storage backends
   */
  async initializeBackends() {
    // Local backend
    if (this.config.backends.local.enabled) {
      this.backends.local = new LocalStorageBackend(this.config.backends.local, this.logger)
      await this.backends.local.initialize()
    }
    
    // S3 backend (conditional)
    if (this.config.backends.s3.enabled) {
      const S3Backend = require('./backends/s3Backend')
      this.backends.s3 = new S3Backend(this.config.backends.s3, this.logger)
      await this.backends.s3.initialize()
    }
    
    // Google Cloud Storage backend (conditional)
    if (this.config.backends.gcs.enabled) {
      const GCSBackend = require('./backends/gcsBackend')
      this.backends.gcs = new GCSBackend(this.config.backends.gcs, this.logger)
      await this.backends.gcs.initialize()
    }
  }

  /**
   * Store a file with automatic policy application
   * @param {string|Buffer|ReadableStream} fileData - File data to store
   * @param {string} filename - Original filename
   * @param {string} fileType - File type (video, audio, temp, output, logs)
   * @param {object} metadata - Additional metadata
   */
  async storeFile(fileData, filename, fileType = 'temp', metadata = {}) {
    try {
      const policy = this.config.policies[fileType] || this.config.policies.temp
      const backend = this.backends[policy.backend] || this.backends[this.config.defaultBackend]
      
      if (!backend) {
        throw new Error(`No backend available for file type: ${fileType}`)
      }
      
      // Generate unique file ID
      const fileId = uuidv4()
      const extension = path.extname(filename)
      const sanitizedFilename = this.sanitizeFilename(filename)
      
      // Validate file
      await this.validateFile(fileData, filename, policy)
      
      // Prepare file metadata
      const fileMetadata = {
        id: fileId,
        originalName: filename,
        sanitizedName: sanitizedFilename,
        extension: extension,
        fileType: fileType,
        size: this.getDataSize(fileData),
        mimeType: this.getMimeType(extension),
        backend: policy.backend,
        policy: fileType,
        uploadedAt: new Date(),
        expiresAt: new Date(Date.now() + policy.retention),
        checksum: await this.calculateChecksum(fileData),
        ...metadata
      }
      
      // Store file
      const storagePath = this.generateStoragePath(fileId, fileType, extension)
      await backend.storeFile(storagePath, fileData, fileMetadata)
      
      // Register file
      this.fileRegistry.set(fileId, {
        ...fileMetadata,
        storagePath: storagePath,
        status: 'stored',
        accessCount: 0,
        lastAccessed: null
      })
      
      this.logger.info(`📁 File stored successfully`, {
        fileId,
        originalName: filename,
        fileType,
        backend: policy.backend,
        size: fileMetadata.size,
        expiresAt: fileMetadata.expiresAt
      })
      
      return {
        fileId,
        storagePath,
        metadata: fileMetadata,
        url: this.generateFileUrl(fileId)
      }
      
    } catch (error) {
      this.logger.error('Failed to store file:', error)
      throw error
    }
  }

  /**
   * Retrieve a file by ID
   * @param {string} fileId - File ID
   * @param {object} options - Retrieval options
   */
  async retrieveFile(fileId, options = {}) {
    try {
      const fileInfo = this.fileRegistry.get(fileId)
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`)
      }
      
      // Check if file has expired
      if (fileInfo.expiresAt && new Date() > fileInfo.expiresAt) {
        await this.deleteFile(fileId)
        throw new Error(`File expired: ${fileId}`)
      }
      
      const backend = this.backends[fileInfo.backend]
      if (!backend) {
        throw new Error(`Backend not available: ${fileInfo.backend}`)
      }
      
      // Retrieve file data
      const fileData = await backend.retrieveFile(fileInfo.storagePath, options)
      
      // Update access tracking
      fileInfo.accessCount++
      fileInfo.lastAccessed = new Date()
      this.fileRegistry.set(fileId, fileInfo)
      
      this.logger.info(`📁 File retrieved`, {
        fileId,
        originalName: fileInfo.originalName,
        accessCount: fileInfo.accessCount
      })
      
      return {
        data: fileData,
        metadata: fileInfo
      }
      
    } catch (error) {
      this.logger.error('Failed to retrieve file:', error)
      throw error
    }
  }

  /**
   * Delete a file by ID
   * @param {string} fileId - File ID
   */
  async deleteFile(fileId) {
    try {
      const fileInfo = this.fileRegistry.get(fileId)
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`)
      }
      
      const backend = this.backends[fileInfo.backend]
      if (backend) {
        await backend.deleteFile(fileInfo.storagePath)
      }
      
      // Remove from registry
      this.fileRegistry.delete(fileId)
      
      this.logger.info(`🗑️ File deleted`, {
        fileId,
        originalName: fileInfo.originalName,
        backend: fileInfo.backend
      })
      
      return true
      
    } catch (error) {
      this.logger.error('Failed to delete file:', error)
      throw error
    }
  }

  /**
   * List files with filtering
   * @param {object} filters - Filtering options
   */
  async listFiles(filters = {}) {
    try {
      const { fileType, backend, status, limit = 100, offset = 0 } = filters
      
      let files = Array.from(this.fileRegistry.values())
      
      // Apply filters
      if (fileType) {
        files = files.filter(f => f.fileType === fileType)
      }
      if (backend) {
        files = files.filter(f => f.backend === backend)
      }
      if (status) {
        files = files.filter(f => f.status === status)
      }
      
      // Sort by upload date (newest first)
      files.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      
      // Pagination
      const totalFiles = files.length
      const paginatedFiles = files.slice(offset, offset + limit)
      
      return {
        files: paginatedFiles,
        pagination: {
          total: totalFiles,
          limit,
          offset,
          hasMore: offset + limit < totalFiles
        }
      }
      
    } catch (error) {
      this.logger.error('Failed to list files:', error)
      throw error
    }
  }

  /**
   * Get file metadata by ID
   * @param {string} fileId - File ID
   */
  async getFileMetadata(fileId) {
    const fileInfo = this.fileRegistry.get(fileId)
    if (!fileInfo) {
      throw new Error(`File not found: ${fileId}`)
    }
    
    return fileInfo
  }

  /**
   * Update file metadata
   * @param {string} fileId - File ID
   * @param {object} updates - Metadata updates
   */
  async updateFileMetadata(fileId, updates) {
    const fileInfo = this.fileRegistry.get(fileId)
    if (!fileInfo) {
      throw new Error(`File not found: ${fileId}`)
    }
    
    const updatedInfo = { ...fileInfo, ...updates, updatedAt: new Date() }
    this.fileRegistry.set(fileId, updatedInfo)
    
    this.logger.info(`📝 File metadata updated`, {
      fileId,
      updates: Object.keys(updates)
    })
    
    return updatedInfo
  }

  /**
   * Move file to different backend
   * @param {string} fileId - File ID
   * @param {string} targetBackend - Target backend name
   */
  async moveFile(fileId, targetBackend) {
    try {
      const fileInfo = this.fileRegistry.get(fileId)
      if (!fileInfo) {
        throw new Error(`File not found: ${fileId}`)
      }
      
      if (fileInfo.backend === targetBackend) {
        return fileInfo // Already on target backend
      }
      
      const sourceBackend = this.backends[fileInfo.backend]
      const destBackend = this.backends[targetBackend]
      
      if (!sourceBackend || !destBackend) {
        throw new Error(`Backend not available`)
      }
      
      // Retrieve file from source
      const fileData = await sourceBackend.retrieveFile(fileInfo.storagePath)
      
      // Store in destination
      const newStoragePath = this.generateStoragePath(fileInfo.id, fileInfo.fileType, fileInfo.extension)
      await destBackend.storeFile(newStoragePath, fileData, fileInfo)
      
      // Delete from source
      await sourceBackend.deleteFile(fileInfo.storagePath)
      
      // Update registry
      const updatedInfo = {
        ...fileInfo,
        backend: targetBackend,
        storagePath: newStoragePath,
        movedAt: new Date()
      }
      this.fileRegistry.set(fileId, updatedInfo)
      
      this.logger.info(`📦 File moved between backends`, {
        fileId,
        from: fileInfo.backend,
        to: targetBackend
      })
      
      return updatedInfo
      
    } catch (error) {
      this.logger.error('Failed to move file:', error)
      throw error
    }
  }

  /**
   * Cleanup expired files
   */
  async cleanupExpiredFiles() {
    try {
      const now = new Date()
      const expiredFiles = []
      
      for (const [fileId, fileInfo] of this.fileRegistry) {
        if (fileInfo.expiresAt && now > fileInfo.expiresAt) {
          expiredFiles.push(fileId)
        }
      }
      
      this.logger.info(`🧹 Starting cleanup of ${expiredFiles.length} expired files`)
      
      let cleanedCount = 0
      for (const fileId of expiredFiles) {
        try {
          await this.deleteFile(fileId)
          cleanedCount++
        } catch (error) {
          this.logger.error(`Failed to cleanup file ${fileId}:`, error)
        }
      }
      
      this.logger.info(`🧹 Cleanup completed: ${cleanedCount}/${expiredFiles.length} files cleaned`)
      
      return {
        total: expiredFiles.length,
        cleaned: cleanedCount,
        failed: expiredFiles.length - cleanedCount
      }
      
    } catch (error) {
      this.logger.error('Failed to cleanup expired files:', error)
      throw error
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    try {
      const stats = {
        totalFiles: this.fileRegistry.size,
        byType: {},
        byBackend: {},
        totalSize: 0,
        expiredFiles: 0
      }
      
      const now = new Date()
      
      for (const fileInfo of this.fileRegistry.values()) {
        // By type
        stats.byType[fileInfo.fileType] = (stats.byType[fileInfo.fileType] || 0) + 1
        
        // By backend
        stats.byBackend[fileInfo.backend] = (stats.byBackend[fileInfo.backend] || 0) + 1
        
        // Total size
        stats.totalSize += fileInfo.size || 0
        
        // Expired files
        if (fileInfo.expiresAt && now > fileInfo.expiresAt) {
          stats.expiredFiles++
        }
      }
      
      // Backend-specific stats
      stats.backendStats = {}
      for (const [name, backend] of Object.entries(this.backends)) {
        if (backend.getStats) {
          stats.backendStats[name] = await backend.getStats()
        }
      }
      
      return stats
      
    } catch (error) {
      this.logger.error('Failed to get storage stats:', error)
      throw error
    }
  }

  /**
   * Validate file before storage
   */
  async validateFile(fileData, filename, policy) {
    const extension = path.extname(filename).toLowerCase()
    const size = this.getDataSize(fileData)
    
    // Check file extension
    const allowedExtensions = this.config.backends[policy.backend]?.allowedExtensions || []
    if (allowedExtensions.length > 0 && !allowedExtensions.includes(extension)) {
      throw new Error(`File extension not allowed: ${extension}`)
    }
    
    // Check file size
    if (size > policy.maxFileSize) {
      throw new Error(`File too large: ${size} bytes (max: ${policy.maxFileSize})`)
    }
    
    return true
  }

  /**
   * Generate storage path for file
   */
  generateStoragePath(fileId, fileType, extension) {
    const date = new Date()
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    
    return `${fileType}/${year}/${month}/${day}/${fileId}${extension}`
  }

  /**
   * Generate file URL
   */
  generateFileUrl(fileId) {
    return `/storage/files/${fileId}`
  }

  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_')
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(data) {
    const hash = crypto.createHash('sha256')
    
    if (Buffer.isBuffer(data)) {
      hash.update(data)
    } else if (typeof data === 'string') {
      hash.update(data, 'utf8')
    }
    
    return hash.digest('hex')
  }

  /**
   * Get data size
   */
  getDataSize(data) {
    if (Buffer.isBuffer(data)) {
      return data.length
    } else if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8')
    }
    return 0
  }

  /**
   * Get MIME type from extension
   */
  getMimeType(extension) {
    const mimeTypes = {
      '.mp4': 'video/mp4',
      '.avi': 'video/avi',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.txt': 'text/plain',
      '.json': 'application/json'
    }
    
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream'
  }

  /**
   * Start cleanup scheduler
   */
  startCleanupScheduler() {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredFiles().catch(error => {
        this.logger.error('Scheduled cleanup failed:', error)
      })
    }, 60 * 60 * 1000)
    
    this.logger.info('🕐 Cleanup scheduler started (runs every hour)')
  }

  /**
   * Stop cleanup scheduler
   */
  stopCleanupScheduler() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
      this.logger.info('🕐 Cleanup scheduler stopped')
    }
  }

  /**
   * Shutdown storage service
   */
  async shutdown() {
    try {
      this.stopCleanupScheduler()
      
      // Shutdown all backends
      for (const backend of Object.values(this.backends)) {
        if (backend.shutdown) {
          await backend.shutdown()
        }
      }
      
      this.logger.info('🗄️ Storage Service shut down')
    } catch (error) {
      this.logger.error('Error shutting down storage service:', error)
    }
  }
}

/**
 * Local Storage Backend
 */
class LocalStorageBackend {
  constructor(config, logger) {
    this.config = config
    this.logger = logger
    this.basePath = path.resolve(config.basePath)
  }

  async initialize() {
    await fs.ensureDir(this.basePath)
    this.logger.info(`💾 Local storage backend initialized: ${this.basePath}`)
  }

  async storeFile(storagePath, fileData, metadata) {
    const fullPath = path.join(this.basePath, storagePath)
    await fs.ensureDir(path.dirname(fullPath))
    
    if (Buffer.isBuffer(fileData)) {
      await fs.writeFile(fullPath, fileData)
    } else if (typeof fileData === 'string') {
      await fs.writeFile(fullPath, fileData, 'utf8')
    } else {
      throw new Error('Unsupported file data type')
    }
    
    // Store metadata alongside
    const metadataPath = fullPath + '.meta'
    await fs.writeJson(metadataPath, metadata, { spaces: 2 })
  }

  async retrieveFile(storagePath, options = {}) {
    const fullPath = path.join(this.basePath, storagePath)
    
    if (!await fs.pathExists(fullPath)) {
      throw new Error(`File not found: ${storagePath}`)
    }
    
    if (options.stream) {
      return fs.createReadStream(fullPath)
    } else {
      return await fs.readFile(fullPath)
    }
  }

  async deleteFile(storagePath) {
    const fullPath = path.join(this.basePath, storagePath)
    const metadataPath = fullPath + '.meta'
    
    await fs.remove(fullPath)
    await fs.remove(metadataPath)
  }

  async getStats() {
    try {
      const stats = await fs.stat(this.basePath)
      return {
        type: 'local',
        basePath: this.basePath,
        accessible: true,
        totalSpace: null, // Not easily available for directories
        usedSpace: null
      }
    } catch (error) {
      return {
        type: 'local',
        basePath: this.basePath,
        accessible: false,
        error: error.message
      }
    }
  }
}

module.exports = StorageService 