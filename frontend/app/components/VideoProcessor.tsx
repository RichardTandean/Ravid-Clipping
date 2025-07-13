'use client'

import { useState, useEffect } from 'react'
import { Play, Scissors, Loader2, Upload, AlertCircle } from 'lucide-react'
import { useCoin, COIN_COSTS } from '../contexts/CoinContext'
import { useAuth } from '../contexts/AuthContext'
import { apiConfig } from '../lib/api'
import { createResilientConnection, ProgressData } from '../lib/resilientConnection'

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
  const { user } = useAuth()
  const { coins, deductCoins, canAfford } = useCoin()
  const [error, setError] = useState<string | null>(null)
  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [resilientConnection, setResilientConnection] = useState<any>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [videoUrl, setVideoUrl] = useState<string>('')

  const isAuthenticated = !!user

  // Create video URL for preview
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

  // Handle progress tracking with resilient connection
  useEffect(() => {
    if (!sessionId) {
      // Clean up previous connection
      if (resilientConnection) {
        resilientConnection.stop()
        setResilientConnection(null)
      }
      return
    }

    console.log(`🚀 Setting up resilient connection for session: ${sessionId}`)
    
    const connection = createResilientConnection(sessionId)
    setResilientConnection(connection)

    connection.start(
      // onProgress
      (data: ProgressData) => {
        setProgressData(data)
      },
      // onComplete
      (data: any) => {
        onClipsGenerated(data?.clips || [])
        setProcessing(false)
        setSessionId(null)
      },
      // onError
      (error: string) => {
        console.error('❌ Processing failed:', error)
        setError(`Processing failed: ${error}`)
        setProcessing(false)
        setSessionId(null)
      }
    ).catch((error) => {
      console.error('Failed to start resilient connection:', error)
      setProcessing(false)
      setSessionId(null)
    })

    // Cleanup function
    return () => {
      if (connection) {
        connection.stop()
      }
    }
  }, [sessionId])

  const handleGenerateClips = async () => {
    console.log('🔥 [VideoProcessor] Generate clips initiated:', {
      videoName: video.name,
      videoSize: `${(video.size / (1024 * 1024)).toFixed(2)} MB`,
      clipConfig: (video as any).clipConfig,
      isAuthenticated,
      userCoins: coins
    })

    // Check authentication
    if (!isAuthenticated) {
      setError('Please log in to process videos')
      return
    }

    // Calculate cost for regular clipping
    const currentCost = COIN_COSTS.GENERATE_CLIPS
    
    console.log('💰 [VideoProcessor] Processing cost calculation:', {
      mode: 'Standard Processing',
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
    const result = await deductCoins(currentCost, 'Video clip generation')
    if (!result.success) {
      console.log('❌ [VideoProcessor] Payment failed:', result.error)
      setError(result.error || 'Failed to process payment')
      return
    }

    console.log('✅ [VideoProcessor] Payment successful, starting processing')

    setProcessing(true)
    setError(null)
    
    try {
      // Prepare form data
      const formData = new FormData()
      formData.append('video', video)
      
      // Add clip configuration
      const clipConfig = (video as any).clipConfig || {
        preset: '30s-1m',
        minDuration: 30,
        maxDuration: 60,
        avgDuration: 45,
        language: 'auto'
      }
      
      formData.append('clipConfig', JSON.stringify(clipConfig))

      console.log('📤 [VideoProcessor] Starting video processing:', {
        fileName: video.name,
        fileSize: video.size,
        clipConfig
      })

      // Send to monolithic backend
      const response = await fetch(apiConfig.endpoints.processVideo, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Upload failed: ${errorText}`)
      }

      const data = await response.json()
      console.log('✅ [VideoProcessor] Upload successful, starting progress tracking:', data)
      
      // Start progress tracking
      setSessionId(data.sessionId)
      
    } catch (error: any) {
      console.error('❌ [VideoProcessor] Error starting processing:', error)
      setError(error.message || 'Failed to start video processing')
      setProcessing(false)
      setRetryCount((prev: number) => prev + 1)
    }
  }

  const handleRetry = async () => {
    console.log('🔄 [VideoProcessor] Retrying processing...')
    setError(null)
    await handleGenerateClips()
  }

  const handleCancel = async () => {
    console.log('🛑 [VideoProcessor] Canceling processing...')
    setProcessing(false)
    setSessionId(null)
    if (resilientConnection) {
      resilientConnection.stop()
    }
  }

  const getProgressBarColor = (stage: string): string => {
    const stageColors: Record<string, string> = {
      'uploading': 'bg-blue-500',
      'processing': 'bg-yellow-500',
      'transcription': 'bg-purple-500',
      'analysis': 'bg-green-500',
      'generation': 'bg-orange-500',
      'complete': 'bg-green-600',
      'error': 'bg-red-500'
    }
    return stageColors[stage] || 'bg-blue-500'
  }

  const renderProgress = () => {
    if (!progressData) return null

    return (
      <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">
            {progressData.stage}
          </span>
          <span className="text-sm text-gray-500">
            {Math.round(progressData.progress)}%
          </span>
        </div>
        
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${getProgressBarColor(progressData.stage)}`}
            style={{ width: `${progressData.progress}%` }}
          />
        </div>
        
        {progressData.message && (
          <p className="text-sm text-gray-600">
            {progressData.message}
          </p>
        )}
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
          >
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-red-700">{error}</p>
            {retryCount < 3 && (
              <button
                onClick={handleRetry}
                className="mt-2 text-red-600 hover:text-red-800 font-medium text-sm underline"
              >
                Try Again
              </button>
            )}
          </div>
        </div>
      )}

      {/* Video Info */}
      <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
        <Play className="w-8 h-8 text-blue-500" />
        <div>
          <h3 className="font-medium text-gray-900">{video.name}</h3>
          <p className="text-sm text-gray-500">
            {(video.size / (1024 * 1024)).toFixed(2)} MB
          </p>
        </div>
      </div>

      {/* Progress Display */}
      {processing && renderProgress()}

      {/* Control Buttons */}
      <div className="flex items-center justify-center space-x-4">
        {!processing ? (
          <>
            <button
              onClick={handleGenerateClips}
              disabled={!isAuthenticated}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              <Scissors className="w-5 h-5" />
              <span>Generate Clips</span>
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
              <span>Processing...</span>
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
        {!isAuthenticated && (
          <p className="text-red-600 mt-1">Please log in to process videos</p>
        )}
      </div>
    </div>
  )
} 