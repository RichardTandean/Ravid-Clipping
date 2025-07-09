'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Cropper, { Area, Point } from 'react-easy-crop'
import { useCoin, COIN_COSTS } from '../contexts/CoinContext'
import { Scissors, Download, X, Square, Monitor, Smartphone, Camera } from 'lucide-react'
import { apiConfig } from '../lib/api'

interface VideoCropperProps {
  video: File
  onCropComplete: () => void
  onCancel: () => void
  cropping: boolean
  setCropping: (cropping: boolean) => void
}

interface AspectRatio {
  label: string
  value: number | null
  icon: React.ReactNode
  description: string
}

const aspectRatios: AspectRatio[] = [
  { label: 'Instagram Square', value: 1, icon: <Square className="w-4 h-4" />, description: '1:1' },
  { label: 'Instagram Stories', value: 9/16, icon: <Smartphone className="w-4 h-4" />, description: '9:16' },
  { label: 'TikTok/Reels', value: 9/16, icon: <Smartphone className="w-4 h-4" />, description: '9:16' },
  { label: 'YouTube', value: 16/9, icon: <Monitor className="w-4 h-4" />, description: '16:9' },
  { label: 'Instagram Post', value: 4/5, icon: <Camera className="w-4 h-4" />, description: '4:5' },
  { label: 'Portrait', value: 3/4, icon: <Smartphone className="w-4 h-4" />, description: '3:4' },
  { label: 'Cinematic', value: 21/9, icon: <Monitor className="w-4 h-4" />, description: '21:9' }
]

export default function VideoCropper({ 
  video, 
  onCropComplete, 
  onCancel, 
  cropping, 
  setCropping 
}: VideoCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  // Changed zoom to be 100-300% where 100% = normal (1x), 300% = zoomed in (3x)
  const [zoomPercent, setZoomPercent] = useState(100) // Default to 100% (normal)
  const [aspect, setAspect] = useState<number | undefined>(16/9)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [selectedRatio, setSelectedRatio] = useState(3) // YouTube as default
  const [cropProgress, setCropProgress] = useState(0)
  const [croppedVideoUrl, setCroppedVideoUrl] = useState<string>('')
  
  const { coins, canAfford, deductCoins } = useCoin()
  const videoRef = useRef<HTMLVideoElement>(null)

  // Convert zoom percentage to actual zoom value for react-easy-crop
  const actualZoom = zoomPercent / 100 // 100% = 1x zoom, 300% = 3x zoom

  useEffect(() => {
    if (video) {
      const url = URL.createObjectURL(video)
      setVideoUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [video])

  const onCropChange = useCallback((crop: Point) => {
    setCrop(crop)
  }, [])

  const onZoomChange = useCallback((zoom: number) => {
    // Convert actual zoom back to percentage for display
    const percent = zoom * 100
    setZoomPercent(Math.round(percent))
  }, [])

  const onCropAreaChange = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleAspectRatioChange = (index: number, ratio: number | null) => {
    console.log('Changing aspect ratio to:', ratio, 'at index:', index)
    setSelectedRatio(index)
    setAspect(ratio || undefined)
    
    // Reset crop position when aspect ratio changes
    setCrop({ x: 0, y: 0 })
    setZoomPercent(100) // Reset to 100% (normal)
  }

  const handleCropVideo = async () => {
    if (!croppedAreaPixels) {
      alert('Please select a crop area')
      return
    }

    // Check if user can afford
    if (!canAfford(COIN_COSTS.CROP_VIDEO)) {
      alert(`Insufficient coins! You need ${COIN_COSTS.CROP_VIDEO.toLocaleString()} coins but only have ${coins.toLocaleString()}. Please top up your account.`)
      return
    }

    // Deduct coins first
    const result = await deductCoins(COIN_COSTS.CROP_VIDEO, 'Video cropping')
    if (!result.success) {
      alert(result.error || 'Failed to process payment')
      return
    }

    setCropping(true)
    setCropProgress(0)

    try {
      const formData = new FormData()
      formData.append('video', video)
      formData.append('cropData', JSON.stringify({
        x: Math.round(croppedAreaPixels.x),
        y: Math.round(croppedAreaPixels.y),
        width: Math.round(croppedAreaPixels.width),
        height: Math.round(croppedAreaPixels.height)
      }))

      console.log('Sending crop request to:', apiConfig.endpoints.crop)
      console.log('Crop data:', {
        x: Math.round(croppedAreaPixels.x),
        y: Math.round(croppedAreaPixels.y),
        width: Math.round(croppedAreaPixels.width),
        height: Math.round(croppedAreaPixels.height)
      })

      const response = await fetch(apiConfig.endpoints.crop, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Server error: ${response.status} - ${errorText}`)
      }

      const result = await response.json()
      
      if (result.success && result.videoUrl) {
        // Fixed: Ensure the URL is complete and uses the correct backend URL
        let fullVideoUrl = result.videoUrl
        if (!fullVideoUrl.startsWith('http')) {
          // Remove leading slash if present to avoid double slashes
          const cleanPath = fullVideoUrl.startsWith('/') ? fullVideoUrl.slice(1) : fullVideoUrl
          fullVideoUrl = `${apiConfig.baseURL}/${cleanPath}`
        }
        
        console.log('Cropped video URL:', fullVideoUrl)
        setCroppedVideoUrl(fullVideoUrl)
        setCropProgress(100)
        alert('Video cropped successfully!')
      } else {
        throw new Error(result.error || 'Failed to crop video')
      }
      
    } catch (error) {
      console.error('Error cropping video:', error)
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          alert('Cannot connect to backend server. Please make sure the backend is running on port 3001.')
        } else {
          alert(`Failed to crop video: ${error.message}`)
        }
      } else {
        alert('Failed to crop video. Please try again.')
      }
    } finally {
      setCropping(false)
    }
  }

  const downloadCroppedVideo = () => {
    if (croppedVideoUrl) {
      console.log('Downloading from URL:', croppedVideoUrl)
      const link = document.createElement('a')
      link.href = croppedVideoUrl
      link.download = `cropped_${video.name}`
      link.target = '_blank' // Open in new tab if direct download fails
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 md:p-6 w-full max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900">Crop Video</h2>
        <button
          onClick={onCancel}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Aspect Ratio Selection */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Choose Aspect Ratio</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {aspectRatios.map((ratio, index) => (
            <button
              key={index}
              onClick={() => handleAspectRatioChange(index, ratio.value)}
              className={`p-3 rounded-lg border transition-all ${
                selectedRatio === index
                  ? 'border-purple-500 bg-purple-50 text-purple-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {ratio.icon}
                <span className="font-medium text-sm">{ratio.description}</span>
              </div>
              <div className="text-xs opacity-75">{ratio.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Video Cropper */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Position Crop Area</h3>
        <div className="relative bg-black rounded-lg overflow-hidden w-full">
          {/* Make container responsive */}
          <div className="relative w-full" style={{ 
            height: 'min(70vh, 500px)', 
            maxHeight: '500px',
            minHeight: '300px'
          }}>
            {videoUrl && (
              <Cropper
                video={videoUrl}
                crop={crop}
                zoom={actualZoom}
                aspect={aspect}
                onCropChange={onCropChange}
                onZoomChange={onZoomChange}
                onCropAreaChange={onCropAreaChange}
                showGrid={true}
                style={{
                  containerStyle: {
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#000'
                  },
                  mediaStyle: {
                    objectFit: 'contain'
                  }
                }}
                // Fixed: Ensure video is still and crop area is draggable
                disableAutomaticStylesInjection={false}
                restrictPosition={true}
                cropSize={undefined}
                objectFit="contain"
                // Additional props to ensure video stays still
                mediaProps={{
                  autoPlay: false,
                  muted: true,
                  playsInline: true,
                  controls: false,
                  preload: 'metadata'
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Zoom Control */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Zoom: {zoomPercent}% {zoomPercent === 100 ? '(Normal)' : zoomPercent === 300 ? '(Max Zoom In)' : ''}
        </label>
        <input
          type="range"
          min={100}
          max={300}
          step={1}
          value={zoomPercent}
          onChange={(e) => setZoomPercent(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>100% (Normal)</span>
          <span>300% (Max Zoom In)</span>
        </div>
      </div>

      {/* Progress Bar */}
      {cropping && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Cropping video...</span>
            <span className="text-sm text-gray-600">{cropProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${cropProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Result */}
      {croppedVideoUrl && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Scissors className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h4 className="font-semibold text-green-900">Video Cropped Successfully!</h4>
                <p className="text-sm text-green-700">Your video has been cropped and is ready for download.</p>
              </div>
            </div>
            <button
              onClick={downloadCroppedVideo}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-end">
        <button
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleCropVideo}
          disabled={cropping || !croppedAreaPixels}
          className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors"
        >
          <Scissors className="w-4 h-4" />
          {cropping ? 'Cropping...' : `Crop Video (${COIN_COSTS.CROP_VIDEO} coins)`}
        </button>
      </div>
    </div>
  )
} 