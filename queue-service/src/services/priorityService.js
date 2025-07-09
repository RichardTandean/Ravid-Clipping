const winston = require('winston')

class PriorityService {
  constructor(logger) {
    this.logger = logger || winston.createLogger()
    
    // Define priority levels with their configurations
    this.priorities = {
      critical: {
        level: 4,
        description: 'Critical system operations',
        concurrency: 10,
        timeout: 60000,    // 1 minute
        retries: 5,
        backoffType: 'exponential',
        color: '🔥'
      },
      high: {
        level: 3,
        description: 'User-facing operations',
        concurrency: 5,
        timeout: 300000,   // 5 minutes
        retries: 3,
        backoffType: 'exponential',
        color: '🚨'
      },
      normal: {
        level: 2,
        description: 'Regular processing tasks',
        concurrency: 3,
        timeout: 600000,   // 10 minutes
        retries: 2,
        backoffType: 'fixed',
        color: '📊'
      },
      low: {
        level: 1,
        description: 'Background maintenance',
        concurrency: 1,
        timeout: 1800000,  // 30 minutes
        retries: 1,
        backoffType: 'fixed',
        color: '🧹'
      }
    }
    
    // Track priority-based job statistics
    this.stats = {
      total: 0,
      byPriority: {
        critical: { submitted: 0, completed: 0, failed: 0 },
        high: { submitted: 0, completed: 0, failed: 0 },
        normal: { submitted: 0, completed: 0, failed: 0 },
        low: { submitted: 0, completed: 0, failed: 0 }
      }
    }
    
    this.logger.info('🎯 Priority Service initialized')
  }

  /**
   * Get job options based on priority level
   * @param {string} priority - Priority level (critical, high, normal, low)
   * @param {object} customOptions - Custom options to override defaults
   */
  getJobOptions(priority = 'normal', customOptions = {}) {
    const priorityConfig = this.priorities[priority]
    
    if (!priorityConfig) {
      this.logger.warn(`Unknown priority level: ${priority}, using 'normal'`)
      priority = 'normal'
    }
    
    const config = this.priorities[priority]
    
    const jobOptions = {
      priority: config.level,
      attempts: config.retries + 1,
      backoff: {
        type: config.backoffType,
        delay: config.backoffType === 'exponential' ? 2000 : 5000
      },
      removeOnComplete: this.getRemoveOnComplete(priority),
      removeOnFail: this.getRemoveOnFail(priority),
      jobId: this.generatePriorityJobId(priority),
      // Add priority metadata
      data: {
        priority: priority,
        priorityLevel: config.level,
        submittedAt: new Date().toISOString()
      },
      ...customOptions
    }

    // Add delay if specified
    if (customOptions.delay) {
      jobOptions.delay = customOptions.delay
    }

    this.logger.info(`${config.color} Job options created for ${priority} priority`, {
      priority,
      level: config.level,
      attempts: jobOptions.attempts,
      jobId: jobOptions.jobId
    })

    return jobOptions
  }

  /**
   * Generate priority-based job ID
   */
  generatePriorityJobId(priority) {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6)
    return `${priority}-${timestamp}-${random}`
  }

  /**
   * Get retention settings based on priority
   */
  getRemoveOnComplete(priority) {
    switch (priority) {
      case 'critical': return 100  // Keep more critical job history
      case 'high': return 50
      case 'normal': return 20
      case 'low': return 5
      default: return 20
    }
  }

  getRemoveOnFail(priority) {
    switch (priority) {
      case 'critical': return 200  // Keep more failed critical jobs for analysis
      case 'high': return 100
      case 'normal': return 50
      case 'low': return 10
      default: return 50
    }
  }

  /**
   * Create a delayed job with priority
   * @param {string} priority - Priority level
   * @param {number|Date} delay - Delay in milliseconds or Date
   * @param {object} customOptions - Additional options
   */
  createDelayedJobOptions(priority = 'normal', delay, customOptions = {}) {
    const delayMs = delay instanceof Date ? delay.getTime() - Date.now() : delay
    
    if (delayMs < 0) {
      throw new Error('Cannot schedule job in the past')
    }

    const options = this.getJobOptions(priority, customOptions)
    options.delay = delayMs
    
    // Adjust priority for delayed jobs (slightly lower)
    if (priority !== 'critical') {
      options.priority = Math.max(1, options.priority - 1)
    }

    this.logger.info(`⏰ Delayed job options created`, {
      priority,
      delay: delayMs,
      scheduledFor: new Date(Date.now() + delayMs).toISOString()
    })

    return options
  }

  /**
   * Analyze job priority based on job type and context
   * @param {string} jobType - Type of job
   * @param {object} context - Job context data
   */
  suggestPriority(jobType, context = {}) {
    const suggestions = {
      // User-facing operations (high priority)
      user_upload: 'high',
      live_processing: 'critical',
      preview_generation: 'high',
      
      // Analysis operations (normal priority)  
      analyze_speech: 'normal',
      transcribe_video: 'normal',
      transcribe_audio: 'normal',
      
      // Video processing (varies by size)
      create_clip: context.duration > 600 ? 'low' : 'normal', // 10+ min videos = low priority
      crop_video: 'normal',
      extract_audio: 'normal',
      
      // Maintenance operations (low priority)
      cleanup_temp_files: 'low',
      archive_old_files: 'low',
      generate_reports: 'low',
      
      // System operations (critical)
      health_check: 'critical',
      backup_data: 'high'
    }

    const suggested = suggestions[jobType] || 'normal'
    
    // Adjust based on context
    if (context.isUserWaiting) {
      return this.raisePriority(suggested)
    }
    
    if (context.isBackground) {
      return this.lowerPriority(suggested) 
    }

    this.logger.info(`🎯 Priority suggestion for ${jobType}:`, {
      jobType,
      suggested,
      context
    })

    return suggested
  }

  /**
   * Raise priority by one level
   */
  raisePriority(priority) {
    const levels = ['low', 'normal', 'high', 'critical']
    const currentIndex = levels.indexOf(priority)
    return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : priority
  }

  /**
   * Lower priority by one level  
   */
  lowerPriority(priority) {
    const levels = ['low', 'normal', 'high', 'critical']
    const currentIndex = levels.indexOf(priority)
    return currentIndex > 0 ? levels[currentIndex - 1] : priority
  }

  /**
   * Update job statistics
   */
  updateStats(priority, event) {
    if (!this.priorities[priority]) return
    
    this.stats.byPriority[priority][event]++
    
    if (event === 'submitted') {
      this.stats.total++
    }
  }

  /**
   * Get priority statistics
   */
  getStats() {
    // Calculate percentages
    const statsWithPercentages = {}
    
    for (const [priority, stats] of Object.entries(this.stats.byPriority)) {
      const total = stats.submitted
      statsWithPercentages[priority] = {
        ...stats,
        successRate: total > 0 ? ((stats.completed / total) * 100).toFixed(2) : 0,
        failureRate: total > 0 ? ((stats.failed / total) * 100).toFixed(2) : 0,
        config: this.priorities[priority]
      }
    }

    return {
      total: this.stats.total,
      byPriority: statsWithPercentages,
      priorityLevels: this.priorities
    }
  }

  /**
   * Get queue-specific priority recommendations
   */
  getQueuePriorityRecommendations() {
    return {
      'ai-analysis': {
        defaultPriority: 'normal',
        jobTypes: {
          'analyze_speech': 'normal',
          'generate_clips': 'normal',
          'test_connection': 'low'
        }
      },
      'transcription': {
        defaultPriority: 'normal', 
        jobTypes: {
          'transcribe_video': 'normal',
          'transcribe_audio': 'high',  // Audio is faster, prioritize
          'extract_audio': 'normal',
          'test_service': 'low'
        }
      },
      'whisper-timestamp': {
        defaultPriority: 'normal',
        jobTypes: {
          'transcribe_with_timestamps': 'normal',
          'transcribe_video_with_timestamps': 'low',  // More resource intensive
          'compare_transcriptions': 'low'
        }
      },
      'video-processing': {
        defaultPriority: 'normal',
        jobTypes: {
          'get_video_info': 'high',      // Fast, user needs immediately
          'create_clip': 'normal',
          'crop_video': 'normal', 
          'extract_audio': 'normal',
          'extract_frame': 'high',       // Fast operation
          'generate_thumbnail': 'high',  // User needs quickly
          'detect_scenes': 'low',        // CPU intensive
          'detect_silence': 'low'        // CPU intensive
        }
      }
    }
  }

  /**
   * Validate priority level
   */
  isValidPriority(priority) {
    return Object.keys(this.priorities).includes(priority)
  }

  /**
   * Get all available priority levels
   */
  getAvailablePriorities() {
    return Object.keys(this.priorities).map(key => ({
      name: key,
      ...this.priorities[key]
    })).sort((a, b) => b.level - a.level) // Sort by level descending
  }

  /**
   * Create priority-aware job data
   */
  enrichJobData(originalData, priority, context = {}) {
    return {
      ...originalData,
      _priority: {
        level: priority,
        levelNumber: this.priorities[priority]?.level || 2,
        submittedAt: new Date().toISOString(),
        context: context
      }
    }
  }
}

module.exports = PriorityService 