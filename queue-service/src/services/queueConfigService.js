const winston = require('winston')

class QueueConfigService {
  constructor(logger) {
    this.logger = logger || winston.createLogger()
    
    // Define queue-specific configurations
    this.queueConfigs = {
      'ai-analysis': {
        displayName: 'AI Analysis',
        description: 'Ollama-based speech analysis and content processing',
        defaultConcurrency: 2,
        maxConcurrency: 5,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000
          },
          removeOnComplete: 20,
          removeOnFail: 50
        },
        timeouts: {
          default: 300000,      // 5 minutes
          analyze_speech: 180000,    // 3 minutes
          generate_clips: 600000,    // 10 minutes
          test_connection: 30000     // 30 seconds
        },
        retryStrategies: {
          analyze_speech: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 }
          },
          generate_clips: {
            attempts: 2,
            backoff: { type: 'fixed', delay: 5000 }
          },
          test_connection: {
            attempts: 5,
            backoff: { type: 'fixed', delay: 1000 }
          }
        },
        resourceLimits: {
          memoryLimit: '2GB',
          cpuLimit: '2 cores',
          diskSpace: '1GB'
        },
        healthCheck: {
          endpoint: '/health',
          interval: 30000,
          timeout: 5000
        }
      },
      
      'transcription': {
        displayName: 'Audio Transcription',
        description: 'nodejs-whisper based audio transcription',
        defaultConcurrency: 1,
        maxConcurrency: 2,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 10000
          },
          removeOnComplete: 15,
          removeOnFail: 30
        },
        timeouts: {
          default: 1800000,         // 30 minutes  
          transcribe_video: 2400000,     // 40 minutes
          transcribe_audio: 900000,      // 15 minutes
          extract_audio: 300000,         // 5 minutes
          test_service: 10000            // 10 seconds
        },
        retryStrategies: {
          transcribe_video: {
            attempts: 2,
            backoff: { type: 'fixed', delay: 30000 }
          },
          transcribe_audio: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10000 }
          },
          extract_audio: {
            attempts: 3,
            backoff: { type: 'fixed', delay: 5000 }
          }
        },
        resourceLimits: {
          memoryLimit: '4GB',
          cpuLimit: '4 cores',
          diskSpace: '5GB'
        },
        healthCheck: {
          endpoint: '/health',
          interval: 60000,
          timeout: 10000
        }
      },
      
      'whisper-timestamp': {
        displayName: 'Whisper Timestamp',
        description: 'Precise word-level timestamp extraction',
        defaultConcurrency: 1,
        maxConcurrency: 1,
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: 'fixed',
            delay: 15000
          },
          removeOnComplete: 10,
          removeOnFail: 20
        },
        timeouts: {
          default: 3600000,                      // 60 minutes
          transcribe_with_timestamps: 2700000,   // 45 minutes
          transcribe_video_with_timestamps: 3600000, // 60 minutes
          compare_transcriptions: 300000         // 5 minutes
        },
        retryStrategies: {
          transcribe_with_timestamps: {
            attempts: 2,
            backoff: { type: 'fixed', delay: 60000 }
          },
          transcribe_video_with_timestamps: {
            attempts: 1,
            backoff: { type: 'fixed', delay: 120000 }
          },
          compare_transcriptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
          }
        },
        resourceLimits: {
          memoryLimit: '8GB',
          cpuLimit: '6 cores',
          diskSpace: '10GB'
        },
        healthCheck: {
          endpoint: '/health',
          interval: 120000,
          timeout: 15000
        }
      },
      
      'video-processing': {
        displayName: 'Video Processing',
        description: 'FFmpeg-based video processing and manipulation',
        defaultConcurrency: 2,
        maxConcurrency: 4,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000
          },
          removeOnComplete: 25,
          removeOnFail: 50
        },
        timeouts: {
          default: 1800000,           // 30 minutes
          get_video_info: 30000,      // 30 seconds
          create_clip: 900000,        // 15 minutes
          crop_video: 1200000,        // 20 minutes
          extract_audio: 600000,      // 10 minutes
          extract_frame: 60000,       // 1 minute
          generate_thumbnail: 120000, // 2 minutes
          detect_scenes: 1800000,     // 30 minutes
          detect_silence: 900000      // 15 minutes
        },
        retryStrategies: {
          get_video_info: {
            attempts: 5,
            backoff: { type: 'fixed', delay: 2000 }
          },
          create_clip: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10000 }
          },
          crop_video: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 10000 }
          },
          extract_audio: {
            attempts: 3,
            backoff: { type: 'fixed', delay: 5000 }
          },
          extract_frame: {
            attempts: 4,
            backoff: { type: 'fixed', delay: 3000 }
          },
          generate_thumbnail: {
            attempts: 4,
            backoff: { type: 'fixed', delay: 3000 }
          },
          detect_scenes: {
            attempts: 2,
            backoff: { type: 'fixed', delay: 30000 }
          },
          detect_silence: {
            attempts: 2,
            backoff: { type: 'fixed', delay: 15000 }
          }
        },
        resourceLimits: {
          memoryLimit: '6GB',
          cpuLimit: '4 cores',
          diskSpace: '20GB'
        },
        healthCheck: {
          endpoint: '/health',
          interval: 45000,
          timeout: 8000
        }
      }
    }
    
    // Performance profiles for different workload types
    this.performanceProfiles = {
      'low-latency': {
        description: 'Optimized for quick response times',
        concurrencyMultiplier: 1.5,
        timeoutMultiplier: 0.7,
        retryMultiplier: 0.8
      },
      'high-throughput': {
        description: 'Optimized for maximum job processing',
        concurrencyMultiplier: 2.0,
        timeoutMultiplier: 1.2,
        retryMultiplier: 0.6
      },
      'resource-conservative': {
        description: 'Lower resource usage, longer processing times',
        concurrencyMultiplier: 0.5,
        timeoutMultiplier: 1.8,
        retryMultiplier: 1.5
      },
      'balanced': {
        description: 'Balanced performance and resource usage',
        concurrencyMultiplier: 1.0,
        timeoutMultiplier: 1.0,
        retryMultiplier: 1.0
      }
    }
    
    this.logger.info('⚙️ Queue Config Service initialized')
  }

  /**
   * Get configuration for a specific queue
   * @param {string} queueName - Name of the queue
   */
  getQueueConfig(queueName) {
    const config = this.queueConfigs[queueName]
    if (!config) {
      this.logger.warn(`No configuration found for queue: ${queueName}`)
      return this.getDefaultConfig()
    }
    return { ...config, queueName }
  }

  /**
   * Get job-specific options for a queue and job type
   * @param {string} queueName - Name of the queue
   * @param {string} jobType - Type of job
   * @param {object} customOptions - Custom options to override
   */
  getJobOptions(queueName, jobType, customOptions = {}) {
    const queueConfig = this.getQueueConfig(queueName)
    
    // Get job-specific timeout
    const timeout = queueConfig.timeouts[jobType] || queueConfig.timeouts.default
    
    // Get job-specific retry strategy
    const retryStrategy = queueConfig.retryStrategies[jobType] || {
      attempts: queueConfig.defaultJobOptions.attempts,
      backoff: queueConfig.defaultJobOptions.backoff
    }
    
    const jobOptions = {
      ...queueConfig.defaultJobOptions,
      ...retryStrategy,
      delay: timeout,
      jobId: this.generateJobId(queueName, jobType),
      ...customOptions
    }

    this.logger.info(`⚙️ Job options for ${queueName}.${jobType}`, {
      queueName,
      jobType,
      timeout,
      attempts: jobOptions.attempts,
      jobId: jobOptions.jobId
    })

    return jobOptions
  }

  /**
   * Apply performance profile to queue configuration
   * @param {string} queueName - Name of the queue
   * @param {string} profileName - Performance profile name
   */
  applyPerformanceProfile(queueName, profileName) {
    const config = this.getQueueConfig(queueName)
    const profile = this.performanceProfiles[profileName]
    
    if (!profile) {
      throw new Error(`Unknown performance profile: ${profileName}`)
    }

    const optimizedConfig = {
      ...config,
      optimizedConcurrency: Math.round(config.defaultConcurrency * profile.concurrencyMultiplier),
      optimizedTimeouts: {},
      optimizedRetries: {}
    }

    // Apply profile to timeouts
    for (const [jobType, timeout] of Object.entries(config.timeouts)) {
      optimizedConfig.optimizedTimeouts[jobType] = Math.round(timeout * profile.timeoutMultiplier)
    }

    // Apply profile to retry strategies
    for (const [jobType, strategy] of Object.entries(config.retryStrategies)) {
      optimizedConfig.optimizedRetries[jobType] = {
        ...strategy,
        attempts: Math.max(1, Math.round(strategy.attempts * profile.retryMultiplier))
      }
    }

    this.logger.info(`🚀 Applied ${profileName} profile to ${queueName}`, {
      queueName,
      profileName,
      originalConcurrency: config.defaultConcurrency,
      optimizedConcurrency: optimizedConfig.optimizedConcurrency
    })

    return optimizedConfig
  }

  /**
   * Get recommended configuration based on queue load
   * @param {string} queueName - Name of the queue
   * @param {object} queueStats - Current queue statistics
   */
  getLoadBasedRecommendations(queueName, queueStats) {
    const config = this.getQueueConfig(queueName)
    const { waiting = 0, active = 0, failed = 0, completed = 0 } = queueStats
    
    const totalJobs = waiting + active + completed + failed
    const failureRate = totalJobs > 0 ? (failed / totalJobs) * 100 : 0
    const queueBacklog = waiting
    
    const recommendations = []

    // High failure rate - recommend more retries or longer timeouts
    if (failureRate > 20) {
      recommendations.push({
        type: 'high-failure-rate',
        severity: 'warning',
        message: `High failure rate (${failureRate.toFixed(1)}%) detected`,
        suggestion: 'Consider increasing timeout values or retry attempts',
        proposedChanges: {
          timeoutMultiplier: 1.5,
          retryMultiplier: 1.3
        }
      })
    }

    // High backlog - recommend higher concurrency
    if (queueBacklog > config.defaultConcurrency * 10) {
      recommendations.push({
        type: 'high-backlog',
        severity: 'info',
        message: `High queue backlog (${queueBacklog} jobs waiting)`,
        suggestion: 'Consider increasing worker concurrency',
        proposedChanges: {
          concurrency: Math.min(config.maxConcurrency, config.defaultConcurrency * 2)
        }
      })
    }

    // Low activity - recommend resource conservation
    if (totalJobs < 10 && active === 0) {
      recommendations.push({
        type: 'low-activity',
        severity: 'info',
        message: 'Low queue activity detected',
        suggestion: 'Consider reducing worker concurrency to save resources',
        proposedChanges: {
          concurrency: Math.max(1, Math.floor(config.defaultConcurrency * 0.5))
        }
      })
    }

    return {
      queueName,
      currentStats: queueStats,
      currentConfig: config,
      recommendations,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Generate queue-specific job ID
   */
  generateJobId(queueName, jobType) {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 4)
    return `${queueName}-${jobType}-${timestamp}-${random}`
  }

  /**
   * Get default configuration for unknown queues
   */
  getDefaultConfig() {
    return {
      displayName: 'Generic Queue',
      description: 'Default configuration for unspecified queue',
      defaultConcurrency: 1,
      maxConcurrency: 3,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 10,
        removeOnFail: 20
      },
      timeouts: {
        default: 300000  // 5 minutes
      },
      retryStrategies: {
        default: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 }
        }
      },
      resourceLimits: {
        memoryLimit: '1GB',
        cpuLimit: '1 core',
        diskSpace: '1GB'
      }
    }
  }

  /**
   * Validate queue configuration
   */
  validateConfig(queueName, config) {
    const errors = []

    if (!config.defaultConcurrency || config.defaultConcurrency < 1) {
      errors.push('defaultConcurrency must be at least 1')
    }

    if (config.maxConcurrency < config.defaultConcurrency) {
      errors.push('maxConcurrency must be >= defaultConcurrency')
    }

    if (!config.defaultJobOptions || !config.defaultJobOptions.attempts) {
      errors.push('defaultJobOptions.attempts is required')
    }

    if (errors.length > 0) {
      this.logger.error(`Invalid configuration for ${queueName}:`, errors)
      return { valid: false, errors }
    }

    return { valid: true, errors: [] }
  }

  /**
   * Get all queue configurations
   */
  getAllConfigs() {
    return Object.entries(this.queueConfigs).map(([queueName, config]) => ({
      queueName,
      ...config
    }))
  }

  /**
   * Get performance profiles
   */
  getPerformanceProfiles() {
    return this.performanceProfiles
  }

  /**
   * Export configuration for backup/sharing
   */
  exportConfig() {
    return {
      queueConfigs: this.queueConfigs,
      performanceProfiles: this.performanceProfiles,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    }
  }

  /**
   * Get resource usage recommendations
   */
  getResourceRecommendations(queueName) {
    const config = this.getQueueConfig(queueName)
    
    return {
      queueName,
      recommendations: {
        memory: config.resourceLimits.memoryLimit,
        cpu: config.resourceLimits.cpuLimit,
        storage: config.resourceLimits.diskSpace,
        concurrency: `${config.defaultConcurrency}-${config.maxConcurrency} workers`,
        estimatedThroughput: this.estimateThroughput(config)
      },
      scalingGuidelines: {
        scaleUp: 'Increase concurrency when queue backlog > 50 jobs',
        scaleDown: 'Decrease concurrency when queue idle for > 5 minutes',
        memoryAlert: 'Monitor memory usage above 80% of limit',
        cpuAlert: 'Monitor CPU usage above 90% sustained'
      }
    }
  }

  /**
   * Estimate queue throughput based on configuration
   */
  estimateThroughput(config) {
    const avgJobDuration = config.timeouts.default / 1000 // seconds
    const jobsPerWorkerPerMinute = 60 / avgJobDuration
    const totalJobsPerMinute = jobsPerWorkerPerMinute * config.defaultConcurrency
    
    return {
      jobsPerMinute: Math.round(totalJobsPerMinute),
      jobsPerHour: Math.round(totalJobsPerMinute * 60),
      avgJobDuration: `${avgJobDuration}s`,
      basedOnConcurrency: config.defaultConcurrency
    }
  }
}

module.exports = QueueConfigService 