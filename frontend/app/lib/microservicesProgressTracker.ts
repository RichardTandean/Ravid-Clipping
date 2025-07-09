/**
 * Microservices Progress Tracker
 * Handles progress tracking across distributed microservices with real-time updates
 */

import { getWebSocketConnection, ProgressData } from './websocketConnection';
import { apiCall, submitJob } from './api';

export interface JobProgress {
  jobId: string;
  type: string;
  queueName: string;
  status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | 'cancelled';
  progress: number;
  stage: string;
  message: string;
  createdAt: Date;
  updatedAt: Date;
  data?: any;
  error?: string;
  estimatedCompletion?: Date;
  dependencies?: string[];
}

export interface VideoProcessingJob {
  videoId: string;
  originalFile: File;
  config: VideoProcessingConfig;
  jobs: {
    upload?: JobProgress;
    transcription?: JobProgress;
    aiAnalysis?: JobProgress;
    videoProcessing?: JobProgress;
    timestamping?: JobProgress;
  };
  overallProgress: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results?: any;
}

export interface VideoProcessingConfig {
  clipDuration?: number;
  maxClips?: number;
  generateSubtitles?: boolean;
  analysisLevel?: 'basic' | 'detailed' | 'comprehensive';
  outputFormat?: 'mp4' | 'webm';
  quality?: 'low' | 'medium' | 'high';
  cropSettings?: {
    enabled: boolean;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export class MicroservicesProgressTracker {
  private webSocket = getWebSocketConnection();
  private jobs = new Map<string, JobProgress>();
  private videoJobs = new Map<string, VideoProcessingJob>();
  private subscribers = new Map<string, Set<(job: JobProgress) => void>>();
  private videoSubscribers = new Map<string, Set<(videoJob: VideoProcessingJob) => void>>();

  constructor() {
    this.initializeWebSocket();
  }

  /**
   * Initialize WebSocket connection and set up global listeners
   */
  private async initializeWebSocket(): Promise<void> {
    try {
      await this.webSocket.connect();
      
      // Subscribe to global job status updates
      this.webSocket.subscribe('job_status', this.handleJobStatusUpdate.bind(this));
      this.webSocket.subscribe('progress', this.handleProgressUpdate.bind(this));
      this.webSocket.subscribe('error', this.handleErrorUpdate.bind(this));
      
      console.log('✅ Microservices progress tracker initialized');
    } catch (error) {
      console.error('❌ Failed to initialize progress tracker:', error);
    }
  }

  /**
   * Process a video file through the microservices pipeline
   */
  async processVideo(
    file: File, 
    config: VideoProcessingConfig,
    onProgress?: (videoJob: VideoProcessingJob) => void
  ): Promise<VideoProcessingJob> {
    const videoId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const videoJob: VideoProcessingJob = {
      videoId,
      originalFile: file,
      config,
      jobs: {},
      overallProgress: 0,
      status: 'pending',
    };

    this.videoJobs.set(videoId, videoJob);

    // Subscribe to updates for this video job
    if (onProgress) {
      this.subscribeToVideoJob(videoId, onProgress);
    }

    try {
      // Step 1: Upload file to storage service
      videoJob.jobs.upload = await this.startJob('storage-upload', 'upload_file', {
        videoId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });

      // Upload the actual file
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('videoId', videoId);
      uploadFormData.append('metadata', JSON.stringify({
        originalName: file.name,
        processingConfig: config,
      }));

      const uploadResult = await fetch('/api/storage/upload', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadResult.ok) {
        throw new Error('File upload failed');
      }

      const { fileId } = await uploadResult.json();

      // Step 2: Start parallel processing jobs
      const processingJobs = await Promise.all([
        // Transcription job
        this.startJob('transcription', 'transcribe_video', {
          videoId,
          fileId,
          language: 'auto',
          model: 'medium',
        }),
        
        // Video processing job
        this.startJob('video-processing', 'process_video', {
          videoId,
          fileId,
          config,
        }),
      ]);

      videoJob.jobs.transcription = processingJobs[0];
      videoJob.jobs.videoProcessing = processingJobs[1];

      // Step 3: Wait for transcription to complete, then start dependent jobs
      this.subscribeToJob(videoJob.jobs.transcription.jobId, async (transcriptionJob) => {
        if (transcriptionJob.status === 'completed') {
          // Start AI analysis (depends on transcription)
          videoJob.jobs.aiAnalysis = await this.startJob('ai-analysis', 'analyze_speech', {
            videoId,
            fileId,
            transcriptionJobId: transcriptionJob.jobId,
            analysisLevel: config.analysisLevel || 'detailed',
          });

          // Start whisper timestamping (if enabled)
          if (config.generateSubtitles) {
            videoJob.jobs.timestamping = await this.startJob('whisper-timestamp', 'transcribe_with_timestamps', {
              videoId,
              fileId,
              transcriptionJobId: transcriptionJob.jobId,
            });
          }

          this.updateVideoJobProgress(videoId);
        }
      });

      videoJob.status = 'processing';
      this.updateVideoJobProgress(videoId);

      return videoJob;

    } catch (error) {
      console.error('❌ Error processing video:', error);
      videoJob.status = 'failed';
      this.updateVideoJobProgress(videoId);
      throw error;
    }
  }

  /**
   * Start a new job in a specific queue
   */
  private async startJob(queueName: string, jobType: string, data: any, priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'): Promise<JobProgress> {
    try {
      const response = await submitJob(queueName, jobType, data, priority);
      
      const job: JobProgress = {
        jobId: response.jobId,
        type: jobType,
        queueName,
        status: 'pending',
        progress: 0,
        stage: 'queued',
        message: 'Job queued for processing',
        createdAt: new Date(),
        updatedAt: new Date(),
        data: response.data,
      };

      this.jobs.set(job.jobId, job);
      
      // Subscribe to job progress updates
      this.webSocket.subscribeToJobProgress(job.jobId, (progressData) => {
        this.handleJobProgressUpdate(job.jobId, progressData);
      });

      console.log(`✅ Started job ${job.jobId} in queue ${queueName}`);
      return job;

    } catch (error) {
      console.error(`❌ Failed to start job in queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Handle job status updates from WebSocket
   */
  private handleJobStatusUpdate(data: any): void {
    const { jobId, status, updatedAt } = data;
    const job = this.jobs.get(jobId);
    
    if (job) {
      job.status = status;
      job.updatedAt = new Date(updatedAt);
      
      this.notifyJobSubscribers(jobId, job);
      this.updateRelatedVideoJobs(jobId);
    }
  }

  /**
   * Handle progress updates from WebSocket
   */
  private handleProgressUpdate(data: ProgressData): void {
    if (data.jobId) {
      this.handleJobProgressUpdate(data.jobId, data);
    }
  }

  /**
   * Handle error updates from WebSocket
   */
  private handleErrorUpdate(data: any): void {
    const { jobId, error } = data;
    const job = this.jobs.get(jobId);
    
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.updatedAt = new Date();
      
      this.notifyJobSubscribers(jobId, job);
      this.updateRelatedVideoJobs(jobId);
    }
  }

  /**
   * Handle individual job progress updates
   */
  private handleJobProgressUpdate(jobId: string, progressData: ProgressData): void {
    const job = this.jobs.get(jobId);
    
    if (job) {
      job.progress = progressData.progress;
      job.stage = progressData.stage;
      job.message = progressData.message;
      job.updatedAt = new Date();
      
      if (progressData.data) {
        job.data = { ...job.data, ...progressData.data };
      }

      // Update status based on progress
      if (progressData.progress === 100 || progressData.type === 'complete') {
        job.status = 'completed';
      } else if (progressData.error) {
        job.status = 'failed';
        job.error = progressData.error;
      } else if (progressData.progress > 0) {
        job.status = 'active';
      }

      this.notifyJobSubscribers(jobId, job);
      this.updateRelatedVideoJobs(jobId);
    }
  }

  /**
   * Update video job progress based on individual job updates
   */
  private updateRelatedVideoJobs(jobId: string): void {
    this.videoJobs.forEach((videoJob, videoId) => {
      // Check if this job belongs to this video
      const jobBelongsToVideo = Object.values(videoJob.jobs).some(j => j?.jobId === jobId);
      
      if (jobBelongsToVideo) {
        this.updateVideoJobProgress(videoId);
      }
    });
  }

  /**
   * Calculate and update overall video job progress
   */
  private updateVideoJobProgress(videoId: string): void {
    const videoJob = this.videoJobs.get(videoId);
    if (!videoJob) return;

    const jobs = Object.values(videoJob.jobs).filter(j => j !== undefined) as JobProgress[];
    
    if (jobs.length === 0) {
      videoJob.overallProgress = 0;
      return;
    }

    // Calculate weighted progress
    const totalProgress = jobs.reduce((sum, job) => sum + job.progress, 0);
    videoJob.overallProgress = Math.round(totalProgress / jobs.length);

    // Update overall status
    const completedJobs = jobs.filter(j => j.status === 'completed').length;
    const failedJobs = jobs.filter(j => j.status === 'failed').length;
    
    if (failedJobs > 0) {
      videoJob.status = 'failed';
    } else if (completedJobs === jobs.length) {
      videoJob.status = 'completed';
      // Collect results from all jobs
      videoJob.results = {
        transcription: videoJob.jobs.transcription?.data,
        aiAnalysis: videoJob.jobs.aiAnalysis?.data,
        videoProcessing: videoJob.jobs.videoProcessing?.data,
        timestamping: videoJob.jobs.timestamping?.data,
      };
    } else {
      videoJob.status = 'processing';
    }

    this.notifyVideoJobSubscribers(videoId, videoJob);
  }

  /**
   * Subscribe to job updates
   */
  subscribeToJob(jobId: string, callback: (job: JobProgress) => void): () => void {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, new Set());
    }
    this.subscribers.get(jobId)!.add(callback);

    return () => {
      const jobSubscribers = this.subscribers.get(jobId);
      if (jobSubscribers) {
        jobSubscribers.delete(callback);
        if (jobSubscribers.size === 0) {
          this.subscribers.delete(jobId);
        }
      }
    };
  }

  /**
   * Subscribe to video job updates
   */
  subscribeToVideoJob(videoId: string, callback: (videoJob: VideoProcessingJob) => void): () => void {
    if (!this.videoSubscribers.has(videoId)) {
      this.videoSubscribers.set(videoId, new Set());
    }
    this.videoSubscribers.get(videoId)!.add(callback);

    return () => {
      const videoSubscribers = this.videoSubscribers.get(videoId);
      if (videoSubscribers) {
        videoSubscribers.delete(callback);
        if (videoSubscribers.size === 0) {
          this.videoSubscribers.delete(videoId);
        }
      }
    };
  }

  /**
   * Notify job subscribers
   */
  private notifyJobSubscribers(jobId: string, job: JobProgress): void {
    const jobSubscribers = this.subscribers.get(jobId);
    if (jobSubscribers) {
      jobSubscribers.forEach(callback => {
        try {
          callback(job);
        } catch (error) {
          console.error(`Error in job subscriber callback for ${jobId}:`, error);
        }
      });
    }
  }

  /**
   * Notify video job subscribers
   */
  private notifyVideoJobSubscribers(videoId: string, videoJob: VideoProcessingJob): void {
    const videoSubscribers = this.videoSubscribers.get(videoId);
    if (videoSubscribers) {
      videoSubscribers.forEach(callback => {
        try {
          callback(videoJob);
        } catch (error) {
          console.error(`Error in video job subscriber callback for ${videoId}:`, error);
        }
      });
    }
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): JobProgress | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get video job by ID
   */
  getVideoJob(videoId: string): VideoProcessingJob | undefined {
    return this.videoJobs.get(videoId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): JobProgress[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get all video jobs
   */
  getAllVideoJobs(): VideoProcessingJob[] {
    return Array.from(this.videoJobs.values());
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<void> {
    try {
      await apiCall(`/api/queue/jobs/${jobId}/cancel`, { method: 'POST' });
      
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'cancelled';
        job.updatedAt = new Date();
        this.notifyJobSubscribers(jobId, job);
        this.updateRelatedVideoJobs(jobId);
      }
    } catch (error) {
      console.error(`Failed to cancel job ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Clean up completed jobs and video jobs
   */
  cleanup(): void {
    // Remove completed jobs older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    Array.from(this.jobs.entries()).forEach(([jobId, job]) => {
      if ((job.status === 'completed' || job.status === 'failed') && job.updatedAt < oneHourAgo) {
        this.jobs.delete(jobId);
        this.subscribers.delete(jobId);
      }
    });

    Array.from(this.videoJobs.entries()).forEach(([videoId, videoJob]) => {
      const allJobsCompleted = Object.values(videoJob.jobs).every(job => 
        !job || job.status === 'completed' || job.status === 'failed'
      );
      
      if (allJobsCompleted && videoJob.status !== 'processing') {
        // Keep video jobs longer (24 hours) for results access
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const latestJobUpdate = Math.max(
          ...Object.values(videoJob.jobs).map(job => job?.updatedAt?.getTime() || 0)
        );
        
        if (latestJobUpdate < oneDayAgo.getTime()) {
          this.videoJobs.delete(videoId);
          this.videoSubscribers.delete(videoId);
        }
      }
    });
  }
}

// Global progress tracker instance
let globalProgressTracker: MicroservicesProgressTracker | null = null;

/**
 * Get or create global progress tracker
 */
export const getProgressTracker = (): MicroservicesProgressTracker => {
  if (!globalProgressTracker) {
    globalProgressTracker = new MicroservicesProgressTracker();
  }
  return globalProgressTracker;
}; 