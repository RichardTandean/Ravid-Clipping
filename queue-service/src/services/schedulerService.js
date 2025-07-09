const { Queue, Worker } = require('bullmq')
const cron = require('node-cron')
const winston = require('winston')

class SchedulerService {
  constructor(redis, logger) {
    this.redis = redis
    this.logger = logger || winston.createLogger()
    
    // Special scheduler queue for managing complex scheduling
    this.schedulerQueue = new Queue('scheduler', { connection: redis })
    
    // Track recurring jobs
    this.recurringJobs = new Map()
    
    // Track job dependencies
    this.dependencies = new Map()
    
    // Initialize scheduler worker
    this.initializeSchedulerWorker()
    
    this.logger.info('📅 Scheduler Service initialized')
  }

  /**
   * Schedule a delayed job
   * @param {string} queueName - Target queue name
   * @param {string} jobType - Job type
   * @param {object} jobData - Job data
   * @param {number|Date} delay - Delay in milliseconds or Date object
   * @param {object} options - Additional job options
   */
  async scheduleDelayedJob(queueName, jobType, jobData, delay, options = {}) {
    try {
      // Calculate delay if Date object provided
      const delayMs = delay instanceof Date ? delay.getTime() - Date.now() : delay
      
      if (delayMs < 0) {
        throw new Error('Cannot schedule job in the past')
      }

      const scheduledJob = await this.schedulerQueue.add('delayed-job', {
        targetQueue: queueName,
        jobType,
        jobData,
        originalOptions: options
      }, {
        delay: delayMs,
        removeOnComplete: 5,
        removeOnFail: 10,
        ...options
      })

      this.logger.info(`⏰ Scheduled delayed job`, {
        jobId: scheduledJob.id,
        targetQueue: queueName,
        jobType,
        delayMs,
        scheduledFor: new Date(Date.now() + delayMs).toISOString()
      })

      return {
        scheduledJobId: scheduledJob.id,
        targetQueue: queueName,
        jobType,
        scheduledFor: new Date(Date.now() + delayMs),
        delay: delayMs
      }
    } catch (error) {
      this.logger.error('Failed to schedule delayed job:', error)
      throw error
    }
  }

  /**
   * Schedule a recurring job using cron expression
   * @param {string} queueName - Target queue name
   * @param {string} jobType - Job type
   * @param {object} jobData - Job data
   * @param {string} cronExpression - Cron expression (e.g., '0 9 * * *' for daily 9 AM)
   * @param {object} options - Additional options
   */
  async scheduleRecurringJob(queueName, jobType, jobData, cronExpression, options = {}) {
    try {
      // Validate cron expression
      if (!cron.validate(cronExpression)) {
        throw new Error('Invalid cron expression')
      }

      const jobId = `recurring-${queueName}-${jobType}-${Date.now()}`
      
      // Store recurring job info
      this.recurringJobs.set(jobId, {
        queueName,
        jobType,
        jobData,
        cronExpression,
        options,
        isActive: true,
        createdAt: new Date(),
        lastRun: null,
        nextRun: this.getNextRunTime(cronExpression)
      })

      // Schedule the cron task
      const task = cron.schedule(cronExpression, async () => {
        await this.executeRecurringJob(jobId)
      }, {
        scheduled: true,
        timezone: options.timezone || 'UTC'
      })

      this.logger.info(`🔄 Scheduled recurring job`, {
        jobId,
        targetQueue: queueName,
        jobType,
        cronExpression,
        nextRun: this.getNextRunTime(cronExpression)
      })

      return {
        recurringJobId: jobId,
        targetQueue: queueName,
        jobType,
        cronExpression,
        nextRun: this.getNextRunTime(cronExpression),
        status: 'active'
      }
    } catch (error) {
      this.logger.error('Failed to schedule recurring job:', error)
      throw error
    }
  }

  /**
   * Create job with dependencies
   * @param {string} queueName - Target queue name
   * @param {string} jobType - Job type
   * @param {object} jobData - Job data
   * @param {array} dependsOn - Array of job IDs this job depends on
   * @param {object} options - Additional options
   */
  async scheduleJobWithDependencies(queueName, jobType, jobData, dependsOn = [], options = {}) {
    try {
      if (!Array.isArray(dependsOn) || dependsOn.length === 0) {
        // No dependencies, schedule normally
        return await this.scheduleRegularJob(queueName, jobType, jobData, options)
      }

      const dependentJobId = `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      
      // Store dependency info
      this.dependencies.set(dependentJobId, {
        queueName,
        jobType,
        jobData,
        dependsOn: [...dependsOn],
        options,
        status: 'waiting',
        createdAt: new Date()
      })

      this.logger.info(`🔗 Created job with dependencies`, {
        dependentJobId,
        targetQueue: queueName,
        jobType,
        dependsOn
      })

      // Check if dependencies are already met
      await this.checkAndExecuteDependentJob(dependentJobId)

      return {
        dependentJobId,
        targetQueue: queueName,
        jobType,
        dependsOn,
        status: 'waiting_for_dependencies'
      }
    } catch (error) {
      this.logger.error('Failed to schedule job with dependencies:', error)
      throw error
    }
  }

  /**
   * Check job completion and trigger dependent jobs
   * @param {string} completedJobId - ID of completed job
   */
  async onJobCompleted(completedJobId) {
    try {
      // Find all jobs that depend on this completed job
      const dependentJobs = Array.from(this.dependencies.entries()).filter(
        ([_, jobInfo]) => jobInfo.dependsOn.includes(completedJobId)
      )

      for (const [dependentJobId, jobInfo] of dependentJobs) {
        // Remove completed job from dependencies
        jobInfo.dependsOn = jobInfo.dependsOn.filter(id => id !== completedJobId)
        
        // Update dependency info
        this.dependencies.set(dependentJobId, jobInfo)
        
        // Check if all dependencies are now met
        await this.checkAndExecuteDependentJob(dependentJobId)
      }
    } catch (error) {
      this.logger.error('Error processing job completion for dependencies:', error)
    }
  }

  /**
   * Get next run time for cron expression
   */
  getNextRunTime(cronExpression) {
    try {
      // Simple calculation - in production, use a proper cron library
      const now = new Date()
      // For demo, just add 1 hour (in real implementation, parse cron properly)
      return new Date(now.getTime() + 60 * 60 * 1000)
    } catch (error) {
      return new Date(Date.now() + 60 * 60 * 1000) // Fallback to 1 hour
    }
  }

  /**
   * Execute a recurring job
   */
  async executeRecurringJob(recurringJobId) {
    try {
      const jobInfo = this.recurringJobs.get(recurringJobId)
      if (!jobInfo || !jobInfo.isActive) {
        return
      }

      // Execute the actual job
      await this.scheduleRegularJob(
        jobInfo.queueName,
        jobInfo.jobType,
        jobInfo.jobData,
        jobInfo.options
      )

      // Update last run time
      jobInfo.lastRun = new Date()
      jobInfo.nextRun = this.getNextRunTime(jobInfo.cronExpression)
      this.recurringJobs.set(recurringJobId, jobInfo)

      this.logger.info(`🔄 Executed recurring job`, {
        recurringJobId,
        targetQueue: jobInfo.queueName,
        jobType: jobInfo.jobType,
        lastRun: jobInfo.lastRun,
        nextRun: jobInfo.nextRun
      })
    } catch (error) {
      this.logger.error('Failed to execute recurring job:', error)
    }
  }

  /**
   * Check and execute dependent job if all dependencies are met
   */
  async checkAndExecuteDependentJob(dependentJobId) {
    try {
      const jobInfo = this.dependencies.get(dependentJobId)
      if (!jobInfo) return

      if (jobInfo.dependsOn.length === 0) {
        // All dependencies met, execute the job
        await this.scheduleRegularJob(
          jobInfo.queueName,
          jobInfo.jobType,
          jobInfo.jobData,
          jobInfo.options
        )

        // Update status and clean up
        jobInfo.status = 'executed'
        jobInfo.executedAt = new Date()
        this.dependencies.set(dependentJobId, jobInfo)

        this.logger.info(`🔗 Executed dependent job`, {
          dependentJobId,
          targetQueue: jobInfo.queueName,
          jobType: jobInfo.jobType
        })

        // Clean up after some time
        setTimeout(() => {
          this.dependencies.delete(dependentJobId)
        }, 24 * 60 * 60 * 1000) // Clean up after 24 hours
      }
    } catch (error) {
      this.logger.error('Failed to check/execute dependent job:', error)
    }
  }

  /**
   * Schedule a regular job (helper method)
   */
  async scheduleRegularJob(queueName, jobType, jobData, options = {}) {
    // This would integrate with the main queue service
    // For now, we'll add to the scheduler queue with immediate execution
    return await this.schedulerQueue.add('immediate-job', {
      targetQueue: queueName,
      jobType,
      jobData,
      originalOptions: options
    }, {
      removeOnComplete: 10,
      removeOnFail: 25,
      ...options
    })
  }

  /**
   * Initialize the scheduler worker to process scheduled jobs
   */
  initializeSchedulerWorker() {
    this.schedulerWorker = new Worker('scheduler', async (job) => {
      const { data } = job
      const { targetQueue, jobType, jobData, originalOptions } = data

      try {
        // Here we would integrate with the main queue service to actually schedule the job
        // For now, we'll simulate the job scheduling
        this.logger.info(`🎯 Processing scheduled job`, {
          jobId: job.id,
          targetQueue,
          jobType,
          jobName: job.name
        })

        // In real implementation, this would call the main queue service
        // to add the job to the appropriate queue
        return {
          success: true,
          targetQueue,
          jobType,
          scheduledAt: new Date()
        }
      } catch (error) {
        this.logger.error('Scheduler worker error:', error)
        throw error
      }
    }, {
      connection: this.redis,
      concurrency: 5
    })

    this.schedulerWorker.on('completed', (job, result) => {
      this.logger.info(`✅ Scheduler job completed`, {
        jobId: job.id,
        result
      })
    })

    this.schedulerWorker.on('failed', (job, error) => {
      this.logger.error(`❌ Scheduler job failed`, {
        jobId: job.id,
        error: error.message
      })
    })
  }

  /**
   * Get status of all scheduled jobs
   */
  async getSchedulingStatus() {
    const recurring = Array.from(this.recurringJobs.entries()).map(([id, info]) => ({
      id,
      ...info,
      type: 'recurring'
    }))

    const dependent = Array.from(this.dependencies.entries()).map(([id, info]) => ({
      id,
      ...info,
      type: 'dependent'
    }))

    const delayed = await this.schedulerQueue.getDelayed()
    const delayedInfo = delayed.map(job => ({
      id: job.id,
      targetQueue: job.data.targetQueue,
      jobType: job.data.jobType,
      scheduledFor: new Date(job.timestamp + job.delay),
      type: 'delayed'
    }))

    return {
      recurring,
      dependent,
      delayed: delayedInfo,
      summary: {
        recurringCount: recurring.length,
        dependentCount: dependent.filter(j => j.status === 'waiting').length,
        delayedCount: delayedInfo.length
      }
    }
  }

  /**
   * Cancel a scheduled job
   */
  async cancelScheduledJob(jobId, type) {
    try {
      switch (type) {
        case 'recurring':
          if (this.recurringJobs.has(jobId)) {
            const jobInfo = this.recurringJobs.get(jobId)
            jobInfo.isActive = false
            this.recurringJobs.set(jobId, jobInfo)
            return { success: true, message: 'Recurring job deactivated' }
          }
          break
          
        case 'dependent':
          if (this.dependencies.has(jobId)) {
            this.dependencies.delete(jobId)
            return { success: true, message: 'Dependent job cancelled' }
          }
          break
          
        case 'delayed':
          const job = await this.schedulerQueue.getJob(jobId)
          if (job) {
            await job.remove()
            return { success: true, message: 'Delayed job cancelled' }
          }
          break
      }
      
      return { success: false, message: 'Job not found' }
    } catch (error) {
      this.logger.error('Failed to cancel scheduled job:', error)
      throw error
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    try {
      await this.schedulerWorker?.close()
      await this.schedulerQueue?.close()
      this.logger.info('📅 Scheduler Service shut down')
    } catch (error) {
      this.logger.error('Error shutting down scheduler service:', error)
    }
  }
}

module.exports = SchedulerService 