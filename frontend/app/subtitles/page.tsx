'use client'

import { useState } from 'react'
import { Upload, Play, Settings, Download, X, Info } from 'lucide-react'
import SubtitleEditor from '../components/SubtitleEditor'

export default function SubtitlesPage() {
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedVideo(file)
    }
  }

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
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('video/')) {
      setSelectedVideo(file)
    }
  }

  const handleComplete = (result: any) => {
    console.log('Subtitle generation complete:', result)
    // Handle completion (download, etc.)
  }

  const handleCancel = () => {
    setSelectedVideo(null)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-3 tracking-tight">
            Professional Subtitle Generator
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Create stunning subtitles with AI-powered word-level timing and professional styling
          </p>
        </div>

        {!selectedVideo ? (
          <div className="space-y-8">
            {/* Upload Section */}
            <div 
              className={`
                bg-white rounded-xl shadow-sm border-2 border-dashed transition-all duration-200
                ${isDragging ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}
                p-8 text-center
              `}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="max-w-md mx-auto">
                <div className="mb-6">
                  <div className="relative">
                    <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-8 h-8 text-purple-600" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                    Upload Your Video
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Drag and drop your video file here, or click to browse
                  </p>
                  
                  <label className="inline-flex items-center px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-full cursor-pointer transition-all duration-200 hover:shadow-lg">
                    <Upload className="w-5 h-5 mr-2" />
                    Choose Video File
                    <input
                      type="file"
                      accept="video/*"
                      onChange={handleVideoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="text-sm text-gray-500">
                  Supports MP4, MOV, AVI, MKV up to 2GB
                </div>
              </div>
            </div>

            {/* Features Grid */}
            <div className="bg-white rounded-xl shadow-sm p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <Info className="w-5 h-5 mr-2 text-purple-600" />
                  Why Choose Our Subtitle Generator?
                </h3>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 p-6 rounded-xl hover:shadow-md transition-all duration-200">
                  <div className="flex items-center mb-3">
                    <Play className="w-5 h-5 text-blue-600 mr-2" />
                    <h4 className="font-semibold text-blue-900">
                      Karaoke-Style Timing
                    </h4>
                  </div>
                  <p className="text-blue-700/90 leading-relaxed">
                    Words are highlighted in perfect sync with speech using advanced AI timing detection
                  </p>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100/50 p-6 rounded-xl hover:shadow-md transition-all duration-200">
                  <div className="flex items-center mb-3">
                    <Settings className="w-5 h-5 text-green-600 mr-2" />
                    <h4 className="font-semibold text-green-900">
                      Professional Styling
                    </h4>
                  </div>
                  <p className="text-green-700/90 leading-relaxed">
                    Full control over fonts, colors, animations, and positioning for both active and inactive words
                  </p>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 p-6 rounded-xl hover:shadow-md transition-all duration-200">
                  <div className="flex items-center mb-3">
                    <Play className="w-5 h-5 text-purple-600 mr-2" />
                    <h4 className="font-semibold text-purple-900">
                      Real-Time Preview
                    </h4>
                  </div>
                  <p className="text-purple-700/90 leading-relaxed">
                    See your subtitle styling changes instantly with our live preview feature
                  </p>
                </div>
                
                <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 p-6 rounded-xl hover:shadow-md transition-all duration-200">
                  <div className="flex items-center mb-3">
                    <Download className="w-5 h-5 text-amber-600 mr-2" />
                    <h4 className="font-semibold text-amber-900">
                      Multiple Export Options
                    </h4>
                  </div>
                  <p className="text-amber-700/90 leading-relaxed">
                    Export as SRT, ASS with karaoke effects, or burn subtitles directly into your video
                  </p>
                </div>
              </div>

              {/* Quick Tips */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <div className="flex items-center text-sm text-gray-600">
                  <Info className="w-4 h-4 mr-2 text-purple-600" />
                  <span>
                    <strong>Pro tip:</strong> For best results, use videos with clear audio and minimal background noise
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <SubtitleEditor
              video={selectedVideo}
              onComplete={handleComplete}
              onCancel={handleCancel}
              mode="standalone"
            />
          </div>
        )}
      </div>
    </div>
  )
} 