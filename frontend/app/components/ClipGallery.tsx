'use client'

import { Download, Play, Clock, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { apiConfig } from '../lib/api'
import { useCoin, COIN_COSTS } from '../contexts/CoinContext'

interface Clip {
  id: string
  filename: string
  startTime: number
  endTime: number
  duration: number
  url: string
  thumbnail?: string
  score?: number
  type?: string
  semanticInfo?: {
    text?: string
    confidence: number
    sentences: number
    isComplete: boolean
  }
}

interface ClipGalleryProps {
  clips: Clip[]
  transcript?: any // Add transcript prop for subtitle integration
  onSubtitlesAdded?: (results: any[]) => void
}

export default function ClipGallery({ clips, transcript, onSubtitlesAdded }: ClipGalleryProps) {
  const [addingSubtitles, setAddingSubtitles] = useState(false)
  const { coins, canAfford, deductCoins } = useCoin()
  const handleDownload = async (clip: Clip) => {
    try {
      const response = await fetch(clip.url)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = clip.filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      console.error('Error downloading clip:', error)
      alert('Failed to download clip')
    }
  }

  // Add subtitles to all clips
  const handleAddSubtitlesToClips = async () => {
    if (!transcript || clips.length === 0) return

    const cost = COIN_COSTS.ADD_SUBTITLES_TO_CLIPS * clips.length
    if (!canAfford(cost)) {
      alert(`Insufficient coins! You need ${cost.toLocaleString()} coins but only have ${coins.toLocaleString()}.`)
      return
    }

    setAddingSubtitles(true)

    try {
      // Deduct coins first
      const result = await deductCoins(cost, `Add subtitles to ${clips.length} clips`)
      if (!result.success) {
        alert(result.error || 'Failed to process payment')
        setAddingSubtitles(false)
        return
      }

      const response = await fetch(apiConfig.endpoints.addSubtitlesToClips, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          clips: clips,
          transcript: transcript,
          styleOptions: {
            preset: 'instagram-story',
            position: 'bottom',
            fontSize: 28,
            fontWeight: 'bold',
            textColor: '#FFFFFF',
            backgroundColor: 'rgba(0,0,0,0.7)',
            outline: '2px black',
            maxLines: 2
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to add subtitles to clips')
      }

      const data = await response.json()
      
      if (data.success) {
        alert(`Successfully added subtitles to ${data.summary.successful}/${data.summary.total} clips!`)
        if (onSubtitlesAdded) {
          onSubtitlesAdded(data.results)
        }
      } else {
        throw new Error('Subtitle addition failed')
      }

    } catch (error) {
      console.error('Error adding subtitles to clips:', error)
      alert('Failed to add subtitles to clips. Please try again.')
    } finally {
      setAddingSubtitles(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getClipTypeColor = (type?: string) => {
    switch (type) {
      case 'semantic-complete':
        return 'bg-emerald-100 text-emerald-800'
      case 'semantic-combined':
        return 'bg-blue-100 text-blue-800'
      case 'semantic-split':
        return 'bg-purple-100 text-purple-800'
      case 'speech-segment':
        return 'bg-green-100 text-green-800'
      case 'speech-aware':
        return 'bg-teal-100 text-teal-800'
      case 'scene-based':
        return 'bg-yellow-100 text-yellow-800'
      case 'interval':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getClipTypeLabel = (type?: string) => {
    switch (type) {
      case 'semantic-complete':
        return 'Complete Segment'
      case 'semantic-combined':
        return 'Combined Topics'
      case 'semantic-split':
        return 'Split Segment'
      case 'speech-segment':
        return 'Speech Block'
      case 'speech-aware':
        return 'Smart Cut'
      case 'scene-based':
        return 'Scene Cut'
      case 'interval':
        return 'Time-based'
      default:
        return type || 'Unknown'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-semibold mb-6">
        Generated Clips ({clips.length})
      </h3>
      
      {clips.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Play size={48} className="mx-auto mb-4" />
          <p>No clips generated yet. Upload a video and click "Generate Clips" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clips.map((clip, index) => (
            <div key={clip.id || index} className="border rounded-lg overflow-hidden">
              {/* Video Preview */}
              <div className="bg-black relative">
                <video
                  src={clip.url}
                  className="w-full h-48 object-cover"
                  poster={clip.thumbnail}
                  controls
                  preload="metadata"
                />
                <div className="absolute top-2 right-2 flex space-x-1">
                  {clip.score && (
                    <div className="bg-black bg-opacity-70 text-white px-2 py-1 rounded text-sm">
                      Score: {(clip.score * 100).toFixed(0)}%
                    </div>
                  )}
                  {clip.type && (
                    <div className={`px-2 py-1 rounded text-xs font-medium ${getClipTypeColor(clip.type)}`}>
                      {getClipTypeLabel(clip.type)}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Clip Info */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-base md:text-lg font-medium">
                    Clip {index + 1}
                  </h4>
                  <div className="flex items-center text-xs md:text-sm text-gray-500">
                    <Clock size={14} className="mr-1" />
                    {clip.duration.toFixed(1)}s
                  </div>
                </div>
                
                <div className="text-xs md:text-sm text-gray-600 mb-3">
                  {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                </div>
                
                {/* Semantic Information */}
                {clip.semanticInfo && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    {clip.semanticInfo.text && (
                      <div className="mb-2">
                        <div className="text-xs font-medium text-gray-700 mb-1">Content:</div>
                        <div className="text-xs text-gray-600 italic line-clamp-3">
                          "{clip.semanticInfo.text}"
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex space-x-3">
                        {clip.semanticInfo.confidence > 0 && (
                          <span className="text-gray-600">
                            Confidence: <span className="font-medium">{(clip.semanticInfo.confidence * 100).toFixed(0)}%</span>
                          </span>
                        )}
                        {clip.semanticInfo.sentences > 0 && (
                          <span className="text-gray-600">
                            {clip.semanticInfo.sentences} sentence{clip.semanticInfo.sentences !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      {clip.semanticInfo.isComplete && (
                        <span className="text-green-600 font-medium">✓ Complete</span>
                      )}
                    </div>
                  </div>
                )}
                
                <button
                  onClick={() => handleDownload(clip)}
                  className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <Download size={16} />
                  <span>Download</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {clips.length > 0 && (
        <div className="mt-6 space-y-4">
          {/* Subtitle Actions */}
          {transcript && (
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  <div>
                    <h4 className="font-medium text-gray-900">Add Subtitles to All Clips</h4>
                    <p className="text-sm text-gray-600">
                      Enhance your clips with professional subtitles for social media
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleAddSubtitlesToClips}
                  disabled={addingSubtitles}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {addingSubtitles 
                    ? 'Adding Subtitles...' 
                    : `Add Subtitles (${(COIN_COSTS.ADD_SUBTITLES_TO_CLIPS * clips.length).toLocaleString()} coins)`
                  }
                </button>
              </div>
            </div>
          )}

          {/* Download Actions */}
          <div className="text-center space-y-3">
            <button
              onClick={() => {
                clips.forEach(clip => handleDownload(clip))
              }}
              className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Download All Clips
            </button>
            
            {!transcript && (
              <p className="text-sm text-gray-500">
                💡 Tip: Generate clips with transcript data to add subtitles automatically
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
} 