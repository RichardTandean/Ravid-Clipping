'use client'

import { useState, useEffect } from 'react'
import { Play, Scissors, Loader2, Upload, AlertCircle } from 'lucide-react'
import { useCoin, COIN_COSTS } from '../contexts/CoinContext'
import { getProgressTracker, VideoProcessingJob, VideoProcessingConfig } from '../lib/microservicesProgressTracker'
import { getErrorHandler, ServiceError } from '../lib/errorHandler'
import { useAuth } from '../lib/authService'

interface VideoProcessorProps {
  video: File
  onClipsGenerated: (clips: any[]) => void
  processing: boolean
  setProcessing: (processing: boolean) => void
  onChangeVideo?: () => void
}

export default function VideoProcessor({ 
  video, 
  onClipsGenerated, 
  processing, 
  setProcessing,
  onChangeVideo
}: VideoProcessorProps) {
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [videoJob, setVideoJob] = useState<VideoProcessingJob | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  
  // Services
  const progressTracker = getProgressTracker()
  const errorHandler = getErrorHandler()
  const { status: authStatus, hasPermission } = useAuth()
  
  // Coin system
  const { coins, canAfford, deductCoins } = useCoin()

  useEffect(() => {
    if (video) {
      const url = URL.createObjectURL(video)
      setVideoUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [video])

  // Reset error when video changes
  useEffect(() => {
    setError(null)
    setRetryCount(0)
  }, [video])

  const handleGenerateClips = async () => {
    console.log('🔥 [VideoProcessor] Generate clips initiated (microservices):', {
      videoName: video.name,
      videoSize: `${(video.size / (1024 * 1024)).toFixed(2)} MB`,
      clipConfig: (video as any).clipConfig,
      authStatus,
      userCoins: coins
    })

    // Check authentication
    if (authStatus !== 'authenticated') {
      setError('Please log in to process videos')
      return
    }

    // Check permissions
    if (!hasPermission('video:process')) {
      setError('You do not have permission to process videos')
      return
    }

    // Calculate cost for regular clipping
    const currentCost = COIN_COSTS.GENERATE_CLIPS
    
    console.log('💰 [VideoProcessor] Processing cost calculation:', {
      mode: 'Microservices Processing',
      cost: currentCost,
      userCoins: coins,
      canAfford: canAfford(currentCost)
    })
    
    // Check if user can afford
    if (!canAfford(currentCost)) {
      console.log('❌ [VideoProcessor] Insufficient coins for processing')
      setError(`Insufficient coins! You need ${currentCost.toLocaleString()} coins but only have ${coins.toLocaleString()}. Please top up your account.`)
      return
    }

    // Deduct coins first
    console.log('💳 [VideoProcessor] Deducting coins for processing...')
    const result = await deductCoins(currentCost, 'Video clip generation (microservices)')
    if (!result.success) {
      console.log('❌ [VideoProcessor] Payment failed:', result.error)
      setError(result.error || 'Failed to process payment')
      return
    }

    console.log('✅ [VideoProcessor] Payment successful, starting microservices processing')

    setProcessing(true)
    setError(null)
    
    try {
      // Prepare processing configuration
      const clipConfig = (video as any).clipConfig
      const processingConfig: VideoProcessingConfig = {
        clipDuration: clipConfig?.clipDuration || 30,
        maxClips: clipConfig?.maxClips || 5,
        generateSubtitles: clipConfig?.generateSubtitles || true,
        analysisLevel: clipConfig?.analysisLevel || 'detailed',
        outputFormat: 'mp4',
        quality: clipConfig?.quality || 'medium',
        cropSettings: clipConfig?.cropSettings,
      }

      console.log('📤 [VideoProcessor] Starting microservices pipeline:', {
        processingConfig,
        fileName: video.name,
        fileSize: video.size
      })
      
      // Start video processing through microservices
      const job = await progressTracker.processVideo(
        video,
        processingConfig,
        (updatedJob) => {
          console.log('📊 [VideoProcessor] Job progress update:', {
            videoId: updatedJob.videoId,
            overallProgress: updatedJob.overallProgress,
            status: updatedJob.status,
            jobStates: Object.entries(updatedJob.jobs).map(([key, job]) => ({
              type: key,
              status: job?.status,
              progress: job?.progress,
              stage: job?.stage
            }))
          })

          setVideoJob(updatedJob)

          // Handle completion
          if (updatedJob.status === 'completed' && updatedJob.results) {
            console.log('✅ [VideoProcessor] Processing completed:', updatedJob.results)
            
            // Extract clips from results
            const clips = extractClipsFromResults(updatedJob.results)
            onClipsGenerated(clips)
            setProcessing(false)
          }

          // Handle errors
          if (updatedJob.status === 'failed') {
            console.error('❌ [VideoProcessor] Processing failed')
            const errorMessage = extractErrorFromJob(updatedJob)
            setError(errorMessage)
            setProcessing(false)
          }
        }
      )

      setVideoJob(job)
      console.log('✅ [VideoProcessor] Microservices processing started:', {
        videoId: job.videoId,
        jobCount: Object.keys(job.jobs).length
      })
      
    } catch (error) {
      console.error('❌ [VideoProcessor] Error starting microservices processing:', error)
      
      // Handle error with error service
      const serviceError = errorHandler.handleError(error, {
        action: 'process_video',
        service: 'video-processor',
        additionalData: { fileName: video.name, fileSize: video.size }
      })

      setError(serviceError.userMessage || 'Failed to start video processing')
      setProcessing(false)
      setRetryCount(prev => prev + 1)
    }
  }

  const handleRetry = async () => {
    if (retryCount >= 3) {
      setError('Maximum retry attempts reached. Please try again later or contact support.')
      return
    }

    console.log(`🔄 [VideoProcessor] Retrying processing (attempt ${retryCount + 1}/3)`)
    await handleGenerateClips()
  }

  const handleCancel = async () => {
    if (videoJob) {
      try {
        // Cancel all active jobs
        const activeJobs = Object.values(videoJob.jobs).filter(job => 
          job && (job.status === 'pending' || job.status === 'active')
        )

        for (const job of activeJobs) {
          if (job) {
            await progressTracker.cancelJob(job.jobId)
          }
        }

        console.log('✅ [VideoProcessor] Processing cancelled')
      } catch (error) {
        console.error('❌ [VideoProcessor] Error cancelling jobs:', error)
      }
    }

    setProcessing(false)
    setVideoJob(null)
    setError(null)
  }

  /**
   * Extract clips from microservices results
   */
  const extractClipsFromResults = (results: any): any[] => {
    const clips: any[] = []

    // Get clips from video processing results
    if (results.videoProcessing?.clips) {
      clips.push(...results.videoProcessing.clips)
    }

    // Enhance clips with AI analysis and transcription data
    if (results.aiAnalysis?.clips) {
      results.aiAnalysis.clips.forEach((aiClip: any, index: number) => {
        if (clips[index]) {
          clips[index] = {
            ...clips[index],
            aiAnalysis: aiClip,
            score: aiClip.score,
            keywords: aiClip.keywords,
            sentiment: aiClip.sentiment,
          }
        }
      })
    }

    // Add transcription data
    if (results.transcription?.segments) {
      clips.forEach((clip, index) => {
        const clipStart = clip.startTime || 0
        const clipEnd = clip.endTime || clip.startTime + (clip.duration || 30)
        
        // Find transcription segments that overlap with this clip
        const relevantSegments = results.transcription.segments.filter((segment: any) =>
          segment.start < clipEnd && segment.end > clipStart
        )

        if (relevantSegments.length > 0) {
          clips[index] = {
            ...clip,
            transcription: {
              text: relevantSegments.map((s: any) => s.text).join(' '),
              segments: relevantSegments,
            }
          }
        }
      })
    }

    // Add timestamp data if available
    if (results.timestamping?.words) {
      clips.forEach((clip, index) => {
        const clipStart = clip.startTime || 0
        const clipEnd = clip.endTime || clip.startTime + (clip.duration || 30)
        
        // Find words that fall within this clip
        const clipWords = results.timestamping.words.filter((word: any) =>
          word.start >= clipStart && word.end <= clipEnd
        )

        if (clipWords.length > 0) {
          clips[index] = {
            ...clip,
            timestamps: clipWords,
            subtitleData: generateSubtitleData(clipWords, clipStart),
          }
        }
      })
    }

    return clips
  }

  /**
   * Extract error message from job
   */
  const extractErrorFromJob = (job: VideoProcessingJob): string => {
    const failedJobs = Object.values(job.jobs).filter(j => j?.status === 'failed')
    
    if (failedJobs.length > 0) {
      const firstFailedJob = failedJobs[0]
      if (firstFailedJob?.error) {
        return `${firstFailedJob.type.replace('_', ' ')} failed: ${firstFailedJob.error}`
      }
    }

    return 'Video processing failed. Please try again.'
  }

  /**
   * Generate subtitle data from timestamped words
   */
  const generateSubtitleData = (words: any[], clipStartTime: number) => {
    const subtitles: any[] = []
    let currentSubtitle = { start: 0, end: 0, text: '' }
    let wordCount = 0

    words.forEach((word) => {
      if (wordCount === 0) {
        currentSubtitle.start = word.start - clipStartTime
        currentSubtitle.text = word.word
      } else {
        currentSubtitle.text += ' ' + word.word
      }

      currentSubtitle.end = word.end - clipStartTime
      wordCount++

      // Create a new subtitle every 8 words or at punctuation
      if (wordCount >= 8 || /[.!?]/.test(word.word)) {
        subtitles.push({ ...currentSubtitle })
        currentSubtitle = { start: 0, end: 0, text: '' }
        wordCount = 0
      }
    })

    // Add final subtitle if there are remaining words
    if (wordCount > 0) {
      subtitles.push(currentSubtitle)
    }

    return subtitles
  }

  /**
   * Render job progress for debugging
   */
  const renderJobProgress = () => {
    if (!videoJob) return null

    return (
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">Processing Pipeline</h4>
        <div className="space-y-2">
          {Object.entries(videoJob.jobs).map(([jobType, job]) => (
            job && (
              <div key={jobType} className="flex items-center justify-between text-sm">
                <span className="capitalize">{jobType.replace(/([A-Z])/g, ' $1').trim()}</span>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    job.status === 'completed' ? 'bg-green-100 text-green-800' :
                    job.status === 'active' ? 'bg-blue-100 text-blue-800' :
                    job.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {job.status}
                  </span>
                  <span className="text-gray-600">{job.progress}%</span>
                </div>
              </div>
            )
          ))}
        </div>
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center justify-between">
            <span className="font-medium">Overall Progress</span>
            <span className="text-lg font-bold text-blue-600">{videoJob.overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
              style={{ width: `${videoJob.overallProgress}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Video Preview */}
      {videoUrl && (
        <div className="relative">
          <video
            src={videoUrl}
            controls
            className="w-full max-w-2xl mx-auto rounded-lg shadow-lg"
            style={{ maxHeight: '400px' }}
          />
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 mr-3" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800">Processing Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              {retryCount < 3 && (
                <button
                  onClick={handleRetry}
                  className="mt-2 text-sm bg-red-100 hover:bg-red-200 text-red-800 px-3 py-1 rounded transition-colors"
                >
                  Retry ({retryCount}/3)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Processing Status */}
      {processing && videoJob && renderJobProgress()}

      {/* Control Buttons */}
      <div className="flex items-center justify-center space-x-4">
        {!processing ? (
          <>
            <button
              onClick={handleGenerateClips}
              disabled={authStatus !== 'authenticated'}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <Scissors className="w-5 h-5" />
              <span>Generate Clips (Microservices)</span>
            </button>
            
            {onChangeVideo && (
              <button
                onClick={onChangeVideo}
                className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                <Upload className="w-5 h-5" />
                <span>Change Video</span>
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-blue-600">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing through microservices...</span>
            </div>
            <button
              onClick={handleCancel}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Coin Cost Info */}
      <div className="text-center text-sm text-gray-600">
        <p>Cost: {COIN_COSTS.GENERATE_CLIPS.toLocaleString()} coins</p>
        <p>Your balance: {coins.toLocaleString()} coins</p>
        {authStatus !== 'authenticated' && (
          <p className="text-red-600 mt-1">Please log in to process videos</p>
        )}
      </div>
    </div>
  )
} 