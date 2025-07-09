'use client'

import { useState, useRef } from 'react'
import { Upload, Film, Youtube, Link, Settings, Download, Play, Coins, AlertCircle } from 'lucide-react'
import { apiConfig } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { useCoin, COIN_COSTS } from '../contexts/CoinContext'

interface VideoUploadProps {
  onVideoUpload: (file: File) => void
  onYouTubeProcess: (url: string, options: any) => void
  onYouTubeDownload: (url: string, options: any) => void
}

interface VideoFormats {
  title: string
  duration: number
  thumbnail: string
  resolutions: Array<{
    value: string
    label: string
    height: number
  }>
  extensions: string[]
  frameRates: number[]
}

export default function VideoUpload({ onVideoUpload, onYouTubeProcess, onYouTubeDownload }: VideoUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [activeTab, setActiveTab] = useState<'upload' | 'youtube'>('upload')
  const [loadingFormats, setLoadingFormats] = useState(false)
  const [videoFormats, setVideoFormats] = useState<VideoFormats | null>(null)
  const [selectedOptions, setSelectedOptions] = useState({
    resolution: '',
    extension: '',
    fps: ''
  })

  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Authentication and Coin System
  const { user } = useAuth()
  const { coins, canAfford, deductCoins } = useCoin()

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleFileSelect(files[0])
    }
  }

  const handleFileSelect = async (file: File) => {
    console.log('🎬 [VideoUpload] File selection started:', {
      fileName: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      fileType: file.type,
      userAuthenticated: !!user
    })

    // Check authentication
    if (!user) {
      console.log('❌ [VideoUpload] User not authenticated')
      alert('Please sign in to upload videos')
      return
    }

    // Check if file is a video
    if (!file.type.startsWith('video/')) {
      console.log('❌ [VideoUpload] Invalid file type:', file.type)
      alert('Please select a video file')
      return
    }

    // Calculate coin cost for regular clipping
    const totalCost = COIN_COSTS.GENERATE_CLIPS
    console.log('💰 [VideoUpload] Cost calculation:', {
      cost: totalCost,
      userCoins: coins
    })

    // Check if user can afford
    if (!canAfford(totalCost)) {
      console.log('❌ [VideoUpload] Insufficient coins:', {
        required: totalCost,
        available: coins,
        deficit: totalCost - coins
      })
      alert(`Insufficient coins! You need ${totalCost.toLocaleString()} coins but only have ${coins.toLocaleString()}. Please top up your account.`)
      return
    }

    console.log('💳 [VideoUpload] Processing payment:', {
      cost: totalCost,
      mode: 'Video upload processing'
    })

    // Deduct coins and proceed
    const result = await deductCoins(totalCost, 'Video upload processing')
    if (result.success) {
      console.log('✅ [VideoUpload] Payment successful, proceeding with upload')
      onVideoUpload(file)
    } else {
      console.log('❌ [VideoUpload] Payment failed:', result.error)
      alert(result.error || 'Failed to process payment')
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleGetFormats = async () => {
    if (!youtubeUrl.trim() || !isValidYouTubeUrl(youtubeUrl)) {
      alert('Please enter a valid YouTube URL')
      return
    }

    setLoadingFormats(true)
    try {
      const response = await fetch(apiConfig.endpoints.youtubeFormats, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      })

      if (!response.ok) {
        throw new Error('Failed to get video formats')
      }

      const result = await response.json()
      setVideoFormats(result.formats)
      
      // Set default selections to highest quality
      setSelectedOptions({
        resolution: result.formats.resolutions[0]?.value || '',
        extension: result.formats.extensions.includes('mp4') ? 'mp4' : result.formats.extensions[0] || '',
        fps: result.formats.frameRates[0]?.toString() || ''
      })
    } catch (error) {
      console.error('Error getting formats:', error)
      alert('Failed to get video formats. Please check the URL and try again.')
    } finally {
      setLoadingFormats(false)
    }
  }

  const handleDownloadAndProcess = async () => {
    if (!videoFormats || !user) return
    
    // Calculate coin cost for regular clipping
    const processCost = COIN_COSTS.GENERATE_CLIPS
    
    if (!canAfford(processCost)) {
      alert(`Insufficient coins! You need ${processCost.toLocaleString()} coins to process this video.`)
      return
    }

    const options = {
      resolution: selectedOptions.resolution,
      extension: selectedOptions.extension,
      fps: selectedOptions.fps ? parseInt(selectedOptions.fps) : undefined
    }
    
    // Deduct coins for processing
    const result = await deductCoins(processCost, 'YouTube video processing')
    if (result.success) {
      onYouTubeProcess(youtubeUrl.trim(), options)
      
      // Reset state
      setVideoFormats(null)
      setYoutubeUrl('')
      setSelectedOptions({ resolution: '', extension: '', fps: '' })
    } else {
      alert(result.error || 'Failed to process payment')
    }
  }

  const handleDownloadOnly = async () => {
    if (!videoFormats || !user) return
    
    // Calculate coin cost for download (based on video duration)
    const downloadCost = Math.ceil(videoFormats.duration * COIN_COSTS.DOWNLOAD_CLIPS_PER_SECOND)
    
    if (!canAfford(downloadCost)) {
      alert(`Insufficient coins! You need ${downloadCost.toLocaleString()} coins to download this video.`)
      return
    }

    const options = {
      resolution: selectedOptions.resolution,
      extension: selectedOptions.extension,
      fps: selectedOptions.fps ? parseInt(selectedOptions.fps) : undefined
    }
    
    // Deduct coins for download
    const result = await deductCoins(downloadCost, `YouTube video download (${formatDuration(videoFormats.duration)})`)
    if (result.success) {
      onYouTubeDownload(youtubeUrl.trim(), options)
      
      // Reset state
      setVideoFormats(null)
      setYoutubeUrl('')
      setSelectedOptions({ resolution: '', extension: '', fps: '' })
    } else {
      alert(result.error || 'Failed to process payment')
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const isValidYouTubeUrl = (url: string) => {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/
    return youtubeRegex.test(url)
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('upload')}
          className={`flex-1 flex items-center justify-center space-x-2 py-4 px-6 border-b-2 transition-colors ${
            activeTab === 'upload'
              ? 'border-blue-500 text-blue-600 bg-blue-50'
              : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Upload size={20} />
          <span className="font-medium">Upload File</span>
        </button>
        <button
          onClick={() => setActiveTab('youtube')}
          className={`flex-1 flex items-center justify-center space-x-2 py-4 px-6 border-b-2 transition-colors ${
            activeTab === 'youtube'
              ? 'border-red-500 text-red-600 bg-red-50'
              : 'border-transparent text-gray-600 hover:text-gray-800 hover:bg-gray-50'
          }`}
        >
          <Youtube size={20} />
          <span className="font-medium">YouTube URL</span>
        </button>
      </div>

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className="p-8">
          <div
            className={`upload-area p-12 text-center cursor-pointer transition-all duration-200 ${
              isDragging 
                ? 'bg-blue-50 border-2 border-blue-300 border-dashed' 
                : 'bg-gray-50 border-2 border-gray-200 border-dashed hover:bg-gray-100 hover:border-gray-300'
            } rounded-xl`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleClick}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleInputChange}
              className="hidden"
            />
            
            <div className="flex flex-col items-center space-y-6">
              <div className={`p-6 rounded-full transition-colors ${
                isDragging ? 'bg-blue-100' : 'bg-white shadow-sm'
              }`}>
                <Film size={48} className={isDragging ? 'text-blue-600' : 'text-gray-600'} />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-gray-900">
                  Upload Your Video
                </h3>
                <p className="text-gray-600">
                  Drag and drop your video file here, or click to browse
                </p>
              </div>

              <div className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
                <Upload size={20} />
                <span className="font-medium">Choose File</span>
              </div>

              {/* Cost Display */}
              {user && (
                <div className="flex items-center justify-center space-x-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2">
                    <Coins size={20} className="text-yellow-600" />
                    <span className="font-medium text-gray-700">
                      Cost: {COIN_COSTS.GENERATE_CLIPS.toLocaleString()} coins
                    </span>
                  </div>
                  {!canAfford(COIN_COSTS.GENERATE_CLIPS) && (
                    <div className="flex items-center space-x-1 text-red-600">
                      <AlertCircle size={16} />
                      <span className="text-sm">Insufficient coins</span>
                    </div>
                  )}
                </div>
              )}

              {/* Authentication Warning */}
              {!user && (
                <div className="flex items-center justify-center space-x-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertCircle size={20} className="text-yellow-600" />
                  <span className="text-sm text-yellow-800 font-medium">Sign in required to upload videos</span>
                </div>
              )}

              <div className="text-sm text-gray-500 bg-white px-4 py-2 rounded-lg border">
                Supported: MP4, AVI, MOV, MKV • Max size: 500MB
              </div>
            </div>
          </div>
        </div>
      )}

      {/* YouTube Tab */}
      {activeTab === 'youtube' && (
        <div className="p-8">
          {!videoFormats ? (
            // Step 1: Enter URL and get formats
            <div className="flex flex-col items-center space-y-6 max-w-md mx-auto">
              <div className="p-6 bg-red-100 rounded-full">
                <Youtube size={48} className="text-red-600" />
              </div>
              
              <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-gray-900">
                  Enter YouTube URL
                </h3>
                <p className="text-gray-600">
                  Get available formats for your video
                </p>
              </div>
              
              <div className="w-full space-y-4">
                <div className="relative">
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    required
                  />
                  <Link size={20} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
                
                <button
                  onClick={handleGetFormats}
                  disabled={!youtubeUrl || !isValidYouTubeUrl(youtubeUrl) || loadingFormats}
                  className="w-full bg-red-600 text-white py-3 px-6 rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  {loadingFormats ? (
                    <>
                      <div className="loading-spinner"></div>
                      <span>Getting Formats...</span>
                    </>
                  ) : (
                    <>
                      <Settings size={20} />
                      <span>Get Format Options</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // Step 2: Show format selection
            <div className="space-y-6 max-w-md mx-auto">
              {/* Video Info */}
              <div className="bg-gray-50 rounded-lg p-4 border">
                <div className="flex items-center space-x-4">
                  {videoFormats.thumbnail && (
                    <img 
                      src={videoFormats.thumbnail} 
                      alt="Video thumbnail"
                      className="w-20 h-15 object-cover rounded"
                    />
                  )}
                  <div className="flex-1 text-left">
                    <h4 className="font-medium text-gray-800 mb-1 line-clamp-2">
                      {videoFormats.title}
                    </h4>
                    <p className="text-sm text-gray-600">
                      Duration: {formatDuration(videoFormats.duration)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Format Selection */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Download Options
                </h3>
                
                {/* Resolution */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Resolution
                  </label>
                  <select
                    value={selectedOptions.resolution}
                    onChange={(e) => setSelectedOptions({...selectedOptions, resolution: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    {videoFormats.resolutions.map(res => (
                      <option key={res.value} value={res.value}>{res.label}</option>
                    ))}
                  </select>
                </div>

                {/* Format */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    File Format
                  </label>
                  <select
                    value={selectedOptions.extension}
                    onChange={(e) => setSelectedOptions({...selectedOptions, extension: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    {videoFormats.extensions.map(ext => (
                      <option key={ext} value={ext}>{ext.toUpperCase()}</option>
                    ))}
                  </select>
                </div>

                {/* Frame Rate */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frame Rate (FPS)
                  </label>
                  <select
                    value={selectedOptions.fps}
                    onChange={(e) => setSelectedOptions({...selectedOptions, fps: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    {videoFormats.frameRates.map(fps => (
                      <option key={fps} value={fps}>{fps} FPS</option>
                    ))}
                  </select>
                </div>

                {/* Cost Display */}
                {user && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-center space-x-2">
                        <Download size={16} className="text-blue-600" />
                        <span className="text-sm font-medium text-gray-700">Download:</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Coins size={16} className="text-yellow-600" />
                        <span className="text-sm font-semibold">
                          {Math.ceil(videoFormats.duration * COIN_COSTS.DOWNLOAD_CLIPS_PER_SECOND).toLocaleString()} coins
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center space-x-2">
                        <Play size={16} className="text-green-600" />
                        <span className="text-sm font-medium text-gray-700">Process:</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Coins size={16} className="text-yellow-600" />
                        <span className="text-sm font-semibold">
                          {COIN_COSTS.GENERATE_CLIPS.toLocaleString()} coins
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Authentication Warning */}
                {!user && (
                  <div className="flex items-center justify-center space-x-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <AlertCircle size={16} className="text-yellow-600" />
                    <span className="text-sm text-yellow-800">Sign in required to download videos</span>
                  </div>
                )}

                {/* Download Buttons */}
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleDownloadOnly}
                      disabled={!user || (user && !canAfford(Math.ceil(videoFormats.duration * COIN_COSTS.DOWNLOAD_CLIPS_PER_SECOND)))}
                      className="bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <Download size={18} />
                      <span className="text-sm font-medium">Download</span>
                    </button>
                    <button
                      onClick={handleDownloadAndProcess}
                      disabled={!user || (user && !canAfford(COIN_COSTS.GENERATE_CLIPS))}
                      className="bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      <Play size={18} />
                      <span className="text-sm font-medium">Process</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setVideoFormats(null)}
                    className="w-full bg-gray-500 text-white py-2 px-6 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
} 