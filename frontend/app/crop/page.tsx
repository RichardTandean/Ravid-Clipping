'use client'

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useCoin } from '../contexts/CoinContext'
import VideoCropper from '../components/VideoCropper'
import { Upload, Scissors, Info } from 'lucide-react'

export default function CropPage() {
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null)
  const [cropping, setCropping] = useState(false)
  const { user } = useAuth()
  const { coins } = useCoin()

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file && file.type.startsWith('video/')) {
      setUploadedVideo(file)
    } else {
      alert('Please select a valid video file')
    }
  }

  const handleRemoveVideo = () => {
    setUploadedVideo(null)
    setCropping(false)
  }

  const handleCropComplete = () => {
    // Reset the form after successful crop
    setUploadedVideo(null)
    setCropping(false)
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Page Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="p-3 bg-purple-100 rounded-full">
              <Scissors className="w-8 h-8 text-purple-600" />
            </div>
            <h1 className="text-4xl font-bold text-gray-900">Video Cropper</h1>
          </div>
          <p className="text-xl text-gray-600 mb-6">
            Crop your videos to perfect aspect ratios for social media platforms
          </p>
          
          {/* Pricing Info */}
          <div className="inline-flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2 text-yellow-800">
            <Info className="w-4 h-4" />
            <span className="font-medium">200 coins per crop</span>
            <span className="text-yellow-600">• Your balance: {coins.toLocaleString()} coins</span>
          </div>
        </div>

        {/* Main Content */}
        {!uploadedVideo ? (
          /* Upload Section */
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-xl shadow-lg border-2 border-dashed border-gray-300 p-8 text-center hover:border-purple-400 transition-colors">
              <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                Upload Video to Crop
              </h3>
              <p className="text-gray-600 mb-6">
                Select a video file to start cropping
              </p>
              
              <label className="inline-block">
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  className="hidden"
                />
                <div className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium cursor-pointer transition-colors">
                  Select Video File
                </div>
              </label>
              
              <p className="text-sm text-gray-500 mt-4">
                Supported formats: MP4, MOV, AVI, WebM
              </p>
            </div>
          </div>
        ) : (
          /* Cropping Interface */
          <VideoCropper
            video={uploadedVideo}
            onCropComplete={handleCropComplete}
            onCancel={handleRemoveVideo}
            cropping={cropping}
            setCropping={setCropping}
          />
        )}

        {/* Feature Highlights */}
        {!uploadedVideo && (
          <div className="mt-16 grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Scissors className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Smart Cropping</h3>
              <p className="text-gray-600">
                Interactive crop box with real-time preview
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-6 h-6 bg-green-600 rounded" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Aspect Ratios</h3>
              <p className="text-gray-600">
                Presets for Instagram, TikTok, YouTube, and more
              </p>
            </div>
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <div className="w-6 h-6 border-2 border-purple-600 rounded" />
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">High Quality</h3>
              <p className="text-gray-600">
                Maintains original video quality after cropping
              </p>
            </div>
          </div>
        )}
    </div>
  )
} 