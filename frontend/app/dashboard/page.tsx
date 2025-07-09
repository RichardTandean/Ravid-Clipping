'use client'

import { useState, useEffect } from 'react'
import VideoUpload from '../components/VideoUpload'
import VideoProcessor from '../components/VideoProcessor'
import ClipGallery from '../components/ClipGallery'
import ClipSettings from '../components/ClipSettings'
import { apiConfig } from '../lib/api'
import { createResilientConnection, ProgressData } from '../lib/resilientConnection'
import { Clapperboard, Settings, Upload, Clock, Play, Download } from 'lucide-react'



export default function Dashboard() {
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null)
  const [youtubeUrl, setYoutubeUrl] = useState<string>('')
  const [clips, setClips] = useState<any[]>([])
  const [processing, setProcessing] = useState(false)
  const [processingType, setProcessingType] = useState<'upload' | 'youtube' | 'youtube-download' | 'downloaded-video' | null>(null)
  const [progressData, setProgressData] = useState<ProgressData | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [downloadResult, setDownloadResult] = useState<any>(null)
  const [selectedPreset, setSelectedPreset] = useState('30s-1m') // Default to 30s-1m
  const [selectedLanguage, setSelectedLanguage] = useState('auto') // Default to auto-detect
  const [resilientConnection, setResilientConnection] = useState<any>(null)

  // Handle preset change from ClipSettings component
  const handlePresetChange = (preset: any) => {
    setSelectedPreset(preset.id)
  }

  // Handle language change from ClipSettings component
  const handleLanguageChange = (language: string) => {
    setSelectedLanguage(language)
  }

  // Get current preset data
  const getCurrentPreset = () => {
    const presets = [
      { id: '30s-1m', minDuration: 30, maxDuration: 60, avgDuration: 45 },
      { id: '1-2m', minDuration: 60, maxDuration: 120, avgDuration: 90 },
      { id: '2-3m', minDuration: 120, maxDuration: 180, avgDuration: 150 },
      { id: '3-4m', minDuration: 180, maxDuration: 240, avgDuration: 210 },
      { id: '4-5m', minDuration: 240, maxDuration: 300, avgDuration: 270 }
    ]
    return presets.find(p => p.id === selectedPreset) || presets[0]
  }

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
        if (data?.downloadOnly) {
          setDownloadResult(data)
        } else {
          setClips(data?.clips || [])
        }
        setProcessing(false)
        setSessionId(null)
      },
      // onError
      (error: string) => {
        console.error('❌ Processing failed:', error)
        alert(`Processing failed: ${error}`)
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

  const handleVideoUpload = (file: File) => {
    const currentPreset = getCurrentPreset()
    
    console.log('📋 [Dashboard] Video upload handler called:', {
      fileName: file.name,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
      selectedPreset: selectedPreset,
      selectedLanguage: selectedLanguage,
      presetData: currentPreset
    })
    
    // Create a config object to avoid any potential variable conflicts
    const clipConfig = {
      preset: selectedPreset,
      minDuration: currentPreset.minDuration,
      maxDuration: currentPreset.maxDuration,
      avgDuration: currentPreset.avgDuration,
      language: selectedLanguage
    }
    
    ;(file as any).clipConfig = clipConfig
    
    console.log('✅ [Dashboard] Video configuration applied to file:', {
      attachedClipConfig: (file as any).clipConfig,
      processingType: 'upload'
    })
    
    setUploadedVideo(file)
    setYoutubeUrl('')
    setClips([])
    setProcessingType('upload')
    setProgressData(null)
    setSessionId(null)
  }

  const handleYouTubeProcess = async (url: string, options: any) => {
    const currentPreset = getCurrentPreset()
    
    console.log('📺 [Dashboard] YouTube processing started:', {
      url: url.trim(),
      options: options,
      selectedPreset: selectedPreset,
      selectedLanguage: selectedLanguage,
      presetData: currentPreset
    })

    setYoutubeUrl(url)
    setUploadedVideo(null)
    setClips([])
    setProcessingType('youtube')
    setProcessing(true)
    setProgressData(null)

    try {
      const response = await fetch(apiConfig.endpoints.youtubeProcess, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: url.trim(), 
          options,
          clipConfig: {
            preset: selectedPreset,
            minDuration: currentPreset.minDuration,
            maxDuration: currentPreset.maxDuration,
            avgDuration: currentPreset.avgDuration,
            language: selectedLanguage
          }
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start YouTube processing')
      }

      const result = await response.json()
      
      if (!result.sessionId) {
        throw new Error('No session ID received from server')
      }
      
      console.log('YouTube processing started with session ID:', result.sessionId)
      setSessionId(result.sessionId)
      
    } catch (error) {
      console.error('Error starting YouTube processing:', error)
      alert('Failed to start YouTube processing. Make sure the backend server is running.')
      setProcessing(false)
      setProgressData(null)
    }
  }

  const handleYouTubeDownload = async (url: string, options: any) => {
    const currentPreset = getCurrentPreset()
    
    setYoutubeUrl(url)
    setUploadedVideo(null)
    setClips([])
    setProcessingType('youtube-download')
    setProcessing(true)
    setProgressData(null)
    setDownloadResult(null)

    try {
      const response = await fetch(apiConfig.endpoints.youtubeDownload, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url: url.trim(), 
          options,
          clipConfig: {
            preset: selectedPreset,
            minDuration: currentPreset.minDuration,
            maxDuration: currentPreset.maxDuration,
            avgDuration: currentPreset.avgDuration,
            language: selectedLanguage
          }
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start YouTube download')
      }

      const result = await response.json()
      
      if (!result.sessionId) {
        throw new Error('No session ID received from server')
      }
      
      console.log('YouTube download started with session ID:', result.sessionId)
      setSessionId(result.sessionId)
      
    } catch (error) {
      console.error('Error starting YouTube download:', error)
      alert('Failed to start YouTube download. Make sure the backend server is running.')
      setProcessing(false)
      setProgressData(null)
    }
  }

  const handleClipsGenerated = (data: any) => {
    setClips(data?.clips || data || [])
    setProcessing(false)
    setProgressData(null)
  }

  const handleChangeVideo = () => {
    setUploadedVideo(null)
    setClips([])
    setProcessing(false)
    setProgressData(null)
    setSessionId(null)
    setDownloadResult(null)
  }

  const getProgressBarColor = (stage: string) => {
    switch (stage) {
      case 'downloading':
      case 'youtube-dl':
        return 'bg-blue-500'
      case 'analyzing':
      case 'speech':
        return 'bg-purple-500'
      case 'generating':
      case 'clips':
        return 'bg-green-500'
      case 'complete':
        return 'bg-emerald-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStageDescription = (stage: string) => {
    switch (stage) {
      case 'downloading':
        return 'Downloading video...'
      case 'youtube-dl':
        return 'Processing YouTube URL...'
      case 'analyzing':
        return 'Analyzing video content...'
      case 'speech':
        return 'Processing audio & speech...'
      case 'generating':
        return 'Generating clips...'
      case 'clips':
        return 'Creating final clips...'
      case 'complete':
        return 'Processing complete!'
      case 'error':
        return 'Processing failed'
      default:
        return 'Processing...'
    }
  }

  const handleDownloadedVideoProcess = async (downloadData: any) => {
    const currentPreset = getCurrentPreset()
    
    setProcessingType('downloaded-video')
    setProcessing(true)
    setProgressData(null)
    setDownloadResult(null)

    try {
      const response = await fetch(apiConfig.endpoints.processDownloadedVideo, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          downloadData,
          clipConfig: {
            preset: selectedPreset,
            minDuration: currentPreset.minDuration,
            maxDuration: currentPreset.maxDuration,
            avgDuration: currentPreset.avgDuration,
            language: selectedLanguage
          }
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start processing downloaded video')
      }

      const result = await response.json()
      
      if (!result.sessionId) {
        throw new Error('No session ID received from server')
      }
      
      console.log('Downloaded video processing started with session ID:', result.sessionId)
      setSessionId(result.sessionId)
      
    } catch (error) {
      console.error('Error starting downloaded video processing:', error)
      alert('Failed to start video processing. Make sure the backend server is running.')
      setProcessing(false)
      setProgressData(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Clapperboard className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-semibold text-gray-900">Video Clipper</h1>
                <p className="text-xs md:text-sm text-gray-600">Intelligent clip generation</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Upload and Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* Upload Section - Show only if no video is uploaded */}
            {!uploadedVideo && (
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Upload className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Upload Video</h2>
                    <p className="text-sm text-gray-600">Choose your video source</p>
                  </div>
                </div>
                <VideoUpload 
                  onVideoUpload={handleVideoUpload}
                  onYouTubeProcess={handleYouTubeProcess}
                  onYouTubeDownload={handleYouTubeDownload}
                />
              </div>
            )}

            {/* Video Processor - Show when video is uploaded but no clips generated yet */}
            {uploadedVideo && clips.length === 0 && (
              <VideoProcessor 
                video={uploadedVideo}
                onClipsGenerated={handleClipsGenerated}
                processing={processing}
                setProcessing={setProcessing}
                onChangeVideo={handleChangeVideo}
              />
            )}

            {/* Progress Display for YouTube/Download Processing */}
            {processing && (processingType === 'youtube' || processingType === 'youtube-download' || processingType === 'downloaded-video') && progressData && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">
                    {processingType === 'youtube' && 'Processing YouTube Video'}
                    {processingType === 'youtube-download' && 'Downloading YouTube Video'}
                    {processingType === 'downloaded-video' && 'Processing Downloaded Video'}
                  </h3>
                  
                  <div className="relative mb-6">
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div 
                        className={`h-4 rounded-full transition-all duration-500 ease-out ${getProgressBarColor(progressData.stage)}`}
                        style={{ width: `${progressData.progress}%` }}
                      ></div>
                    </div>
                    <div className="mt-2 text-sm font-medium text-gray-700">
                      {progressData.progress}%
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <p className="text-gray-600">
                      {progressData.message || getStageDescription(progressData.stage)}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      Stage: {progressData.stage?.replace('-', ' ') || 'Processing'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Download Result Display */}
            {downloadResult && processingType === 'youtube-download' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="text-center space-y-4">
                  <div className="p-3 bg-green-100 rounded-full w-16 h-16 mx-auto flex items-center justify-center">
                    <Download className="w-8 h-8 text-green-600" />
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Download Complete!
                    </h3>
                    <p className="text-gray-600 mb-4">
                      Your video has been downloaded successfully.
                    </p>
                  </div>
                  
                  {downloadResult.videoPath && (
                    <div className="space-y-3">
                      <div className="bg-gray-50 rounded-lg p-4 text-left">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">File:</span>
                            <span className="font-medium">{downloadResult.filename}</span>
                          </div>
                          {downloadResult.duration && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Duration:</span>
                              <span className="font-medium">{Math.floor(downloadResult.duration / 60)}:{(downloadResult.duration % 60).toString().padStart(2, '0')}</span>
                            </div>
                          )}
                          {downloadResult.resolution && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Resolution:</span>
                              <span className="font-medium">{downloadResult.resolution}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleDownloadedVideoProcess(downloadResult)}
                          className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                        >
                          <Play size={18} />
                          <span>Generate Clips</span>
                        </button>
                        
                        {downloadResult.downloadUrl && (
                          <a
                            href={downloadResult.downloadUrl}
                            download={downloadResult.filename}
                            className="flex-1 bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                          >
                            <Download size={18} />
                            <span>Download</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Clips Gallery */}
            {clips.length > 0 && (
              <div className="space-y-6">
                {/* Action buttons when clips are displayed */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-center justify-center space-x-3">
                    {uploadedVideo && (
                      <button
                        onClick={() => {
                          setClips([])
                          setProcessing(false)
                          setProgressData(null)
                        }}
                        className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
                      >
                        <Play size={16} />
                        <span>Generate More Clips</span>
                      </button>
                    )}
                    <button
                      onClick={handleChangeVideo}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      <Upload size={16} />
                      <span>New Video</span>
                    </button>
                  </div>
                </div>
                
                <ClipGallery clips={clips} />
              </div>
            )}
          </div>

          {/* Right Column - Settings - Show only when no clips are generated */}
          {clips.length === 0 && (
            <div className="space-y-6">
              <div>
                <div className="flex items-center space-x-3 mb-4">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Settings className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Clip Settings</h2>
                    <p className="text-sm text-gray-600">Configure clip generation</p>
                  </div>
                </div>
                
                <ClipSettings
                    selectedPreset={selectedPreset}
                    onPresetChange={handlePresetChange}
                    selectedLanguage={selectedLanguage}
                    onLanguageChange={handleLanguageChange}
                  />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
} 