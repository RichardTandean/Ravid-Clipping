'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Upload,
  FileText,
  Eye,
  X,
  Settings,
  Download,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  Volume2
} from 'lucide-react'
import { apiConfig } from '../lib/api'
import { useCoin, COIN_COSTS } from '../contexts/CoinContext'

interface SubtitleEditorProps {
  video: File | null
  transcript?: any
  onComplete?: (result: any) => void
  onCancel?: () => void
  mode?: 'standalone' | 'integrated'
}

// Simplified ASS-based styling options
interface StyleOptions {
  preset: string
  // Mode selection
  subtitleMode?: 'normal' | 'social-media'
  // Normal ASS-based options
  fontname: string
  fontsize: number
  primaryColour: string
  secondaryColour: string
  outlineColour: string
  backColour: string
  bold: boolean
  italic: boolean
  borderStyle: 1 | 3
  outline: number
  shadow: number
  alignment: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  marginL: number
  marginR: number
  marginV: number
  karaokeEnabled: boolean
  // Social media options
  maxWordsPerSubtitle: number
  emphasizeKeyWords: boolean
  position: 'top' | 'center' | 'bottom'
  socialMediaPreset: string
}

interface SubtitlePreset {
  id: string
  name: string
  displayStyle: React.CSSProperties
  settings: StyleOptions
}

// Built-in simplified presets
const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: 'impact-yellow',
    name: 'Impact Yellow',
    displayStyle: {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#000000',
      backgroundColor: '#FFD700',
      padding: '6px 12px',
      borderRadius: '4px',
      border: '2px solid #FFFFFF',
      textTransform: 'uppercase'
    },
    settings: {
      preset: 'impact-yellow',
      subtitleMode: 'normal' as const,
      fontname: 'Impact',
      fontsize: 32,
      primaryColour: '#000000',
      secondaryColour: '#FFD700',
      outlineColour: '#FFFFFF',
      backColour: '#FFD700',
      bold: true,
      italic: false,
      borderStyle: 3,
      outline: 2,
      shadow: 0,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 60,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 10,
      emphasizeKeyWords: true,
      position: 'top',
      socialMediaPreset: 'twitter'
    }
  },
  {
    id: 'clean-white',
    name: 'Clean White',
    displayStyle: {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontWeight: 'normal',
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.7)',
      padding: '6px 12px',
      borderRadius: '4px',
      border: '1px solid #333333'
    },
    settings: {
      preset: 'clean-white',
      subtitleMode: 'normal' as const,
      fontname: 'Arial',
      fontsize: 24,
      primaryColour: '#FFFFFF',
      secondaryColour: '#CCCCCC',
      outlineColour: '#000000',
      backColour: 'rgba(0,0,0,0.7)',
      bold: false,
      italic: false,
      borderStyle: 1,
      outline: 1,
      shadow: 1,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 60,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 10,
      emphasizeKeyWords: true,
      position: 'top',
      socialMediaPreset: 'instagram'
    }
  },
  {
    id: 'retro-neon',
    name: 'Retro Neon',
    displayStyle: {
      fontFamily: 'Courier New, monospace',
      fontSize: '16px',
      fontWeight: 'bold',
      color: '#00FFFF',
      backgroundColor: 'rgba(0,0,0,0.9)',
      padding: '6px 12px',
      borderRadius: '4px',
      border: '2px solid #00FFFF',
      textShadow: '0 0 10px #00FFFF',
      textTransform: 'uppercase'
    },
    settings: {
      preset: 'retro-neon',
      subtitleMode: 'normal' as const,
      fontname: 'Courier New',
      fontsize: 28,
      primaryColour: '#00FFFF',
      secondaryColour: '#0080FF',
      outlineColour: '#00FFFF',
      backColour: 'rgba(0,0,0,0.9)',
      bold: true,
      italic: false,
      borderStyle: 1,
      outline: 2,
      shadow: 2,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 60,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 10,
      emphasizeKeyWords: true,
      position: 'top',
      socialMediaPreset: 'facebook'
    }
  },
  {
    id: 'elegant-serif',
    name: 'Elegant Serif',
    displayStyle: {
      fontFamily: 'Georgia, serif',
      fontSize: '16px',
      fontWeight: 'normal',
      color: '#F5F5F5',
      backgroundColor: 'rgba(139,69,19,0.8)',
      padding: '6px 12px',
      borderRadius: '4px',
      fontStyle: 'italic'
    },
    settings: {
      preset: 'elegant-serif',
      fontname: 'Georgia',
      fontsize: 26,
      primaryColour: '#F5F5F5',
      secondaryColour: '#CCCCCC',
      outlineColour: '#8B4513',
      backColour: 'rgba(139,69,19,0.8)',
      bold: false,
      italic: true,
      borderStyle: 3,
      outline: 1,
      shadow: 1,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 60,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 10,
      emphasizeKeyWords: true,
      position: 'top',
      socialMediaPreset: 'instagram'
    }
  },
  {
    id: 'bold-red',
    name: 'Bold Red',
    displayStyle: {
      fontFamily: 'Arial Black, sans-serif',
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#FFFFFF',
      backgroundColor: '#FF0000',
      padding: '6px 12px',
      borderRadius: '4px',
      border: '2px solid #FFFFFF',
      textTransform: 'uppercase'
    },
    settings: {
      preset: 'bold-red',
      fontname: 'Arial Black',
      fontsize: 30,
      primaryColour: '#FFFFFF',
      secondaryColour: '#FFB3B3',
      outlineColour: '#FFFFFF',
      backColour: '#FF0000',
      bold: true,
      italic: false,
      borderStyle: 3,
      outline: 2,
      shadow: 1,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 60,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 10,
      emphasizeKeyWords: true,
      position: 'top',
      socialMediaPreset: 'twitter'
    }
  },
  {
    id: 'custom',
    name: 'Custom',
    displayStyle: {
      fontFamily: 'Arial, sans-serif',
      fontSize: '16px',
      fontWeight: 'normal',
      color: '#333333',
      backgroundColor: '#F0F0F0',
      padding: '6px 12px',
      borderRadius: '4px',
      border: '2px dashed #999999'
    },
    settings: {
      preset: 'custom',
      fontname: 'Arial',
      fontsize: 24,
      primaryColour: '#FFFFFF',
      secondaryColour: '#CCCCCC',
      outlineColour: '#000000',
      backColour: 'rgba(0,0,0,0.7)',
      bold: false,
      italic: false,
      borderStyle: 1,
      outline: 1,
      shadow: 1,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 60,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 10,
      emphasizeKeyWords: true,
      position: 'top',
      socialMediaPreset: 'instagram'
    }
  },
  {
    id: 'social-impact',
    name: 'Social Impact',
    displayStyle: {
      fontFamily: 'Impact, Arial Black, sans-serif',
      fontSize: '20px',
      fontWeight: 'bold',
      color: '#FFFFFF',
      backgroundColor: '#FF6B6B',
      padding: '8px 16px',
      borderRadius: '8px',
      border: '3px solid #FFFFFF',
      textTransform: 'uppercase',
      textAlign: 'center'
    },
    settings: {
      preset: 'social-impact',
      subtitleMode: 'social-media' as const,
      fontname: 'Impact',
      fontsize: 36,
      primaryColour: '#FFFFFF',
      secondaryColour: '#FFD700',
      outlineColour: '#000000',
      backColour: '#FF6B6B',
      bold: true,
      italic: false,
      borderStyle: 3,
      outline: 3,
      shadow: 2,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 80,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 1,
      emphasizeKeyWords: true,
      position: 'center',
      socialMediaPreset: 'impact'
    }
  },
  {
    id: 'social-minimal',
    name: 'Social Minimal',
    displayStyle: {
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontSize: '18px',
      fontWeight: '600',
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.8)',
      padding: '6px 12px',
      borderRadius: '6px',
      textAlign: 'center'
    },
    settings: {
      preset: 'social-minimal',
      subtitleMode: 'social-media' as const,
      fontname: 'Helvetica',
      fontsize: 28,
      primaryColour: '#FFFFFF',
      secondaryColour: '#00AAFF',
      outlineColour: '#000000',
      backColour: 'rgba(0,0,0,0.8)',
      bold: false,
      italic: false,
      borderStyle: 1,
      outline: 1,
      shadow: 1,
      alignment: 2,
      marginL: 20,
      marginR: 20,
      marginV: 60,
      karaokeEnabled: true,
      maxWordsPerSubtitle: 2,
      emphasizeKeyWords: false,
      position: 'bottom',
      socialMediaPreset: 'minimal'
    }
  }
]

const FONT_OPTIONS = [
  // Modern Sans-Serif Fonts
  'Arial', 'Helvetica', 'Roboto', 'Montserrat', 'Open Sans', 'Poppins',
  // Bold Impact Fonts
  'Impact', 'Anton', 'Bebas Neue', 'Oswald',
  // Clean Modern Fonts
  'Nunito Sans', 'Inter', 'DM Sans', 'SF Pro Display',
  // Creative Fonts
  'Quicksand', 'Comfortaa', 'Righteous',
  // Traditional Fonts
  'Georgia', 'Times New Roman'
]

const ALIGNMENT_OPTIONS = [
  { value: 7, label: 'Top Left' },
  { value: 8, label: 'Top Center' },
  { value: 9, label: 'Top Right' },
  { value: 4, label: 'Middle Left' },
  { value: 5, label: 'Middle Center' },
  { value: 6, label: 'Middle Right' },
  { value: 1, label: 'Bottom Left' },
  { value: 2, label: 'Bottom Center' },
  { value: 3, label: 'Bottom Right' }
]

export default function SubtitleEditor({ 
  video, 
  transcript: initialTranscript, 
  onComplete, 
  onCancel,
  mode = 'standalone'
}: SubtitleEditorProps) {
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [transcript, setTranscript] = useState<any>(initialTranscript)
  const [languages, setLanguages] = useState<any[]>([])
  const [selectedLanguage, setSelectedLanguage] = useState('auto')
  const [styleOptions, setStyleOptions] = useState<StyleOptions>(SUBTITLE_PRESETS[0].settings)
  const [transcribing, setTranscribing] = useState(false)
  const [burning, setBurning] = useState(false)
  const [progress, setProgress] = useState({ progress: 0, message: '', stage: '' })
  const [activeTab, setActiveTab] = useState<'transcript' | 'styling' | 'preview'>('transcript')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewRef = useRef<HTMLVideoElement>(null)
  const { coins, canAfford, deductCoins } = useCoin()

  useEffect(() => {
    if (video) {
      const url = URL.createObjectURL(video)
      setVideoUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [video])

  useEffect(() => {
    loadLanguages()
  }, [])

  const loadLanguages = async () => {
    try {
      const response = await fetch(apiConfig.endpoints.subtitleLanguages)
      const data = await response.json()
      if (data.success) {
        setLanguages(data.languages)
      }
    } catch (error) {
      console.error('Error loading languages:', error)
    }
  }

  const handleGenerateTranscript = async () => {
    if (!video) return

    const cost = COIN_COSTS.GENERATE_CLIPS
    if (!canAfford(cost)) {
      alert(`Insufficient coins! You need ${cost.toLocaleString()} coins but only have ${coins.toLocaleString()}.`)
      return
    }

    setTranscribing(true)
    setProgress({ progress: 0, message: 'Starting transcription...', stage: 'transcribing' })

    try {
      const formData = new FormData()
      formData.append('video', video)
      formData.append('options', JSON.stringify({ language: selectedLanguage }))

      const response = await fetch(apiConfig.endpoints.generateTranscript, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        listenForProgress(data.sessionId, 'transcript')
        await deductCoins(cost, 'Generate transcript')
      } else {
        throw new Error(data.error || 'Failed to start transcription')
      }
    } catch (error) {
      console.error('Error generating transcript:', error)
      setTranscribing(false)
      alert('Failed to generate transcript. Please try again.')
    }
  }

  const handleBurnSubtitles = async () => {
    if (!video || !transcript) return

    const cost = COIN_COSTS.GENERATE_CLIPS
    if (!canAfford(cost)) {
      alert(`Insufficient coins! You need ${cost.toLocaleString()} coins but only have ${coins.toLocaleString()}.`)
      return
    }

    setBurning(true)
    setProgress({ progress: 0, message: 'Starting subtitle burning...', stage: 'burning' })

    try {
      const formData = new FormData()
      formData.append('video', video)
      
      // Prepare subtitle processing options
      let processedTranscript = transcript
      let processingOptions = {}

      // Handle social media mode
      if (styleOptions.subtitleMode === 'social-media') {
        processingOptions = {
          socialMediaStyle: true,
          maxWordsPerSubtitle: styleOptions.maxWordsPerSubtitle || 2,
          emphasizeKeyWords: styleOptions.emphasizeKeyWords !== false,
          position: styleOptions.position || 'bottom'
        }
      }
      
      const assStyleOptions = {
        ...styleOptions,
        bold: styleOptions.bold ? -1 : 0,
        italic: styleOptions.italic ? -1 : 0,
        ...processingOptions
      }
      
      formData.append('data', JSON.stringify({
        transcript: processedTranscript,
        styleOptions: assStyleOptions
      }))

      const response = await fetch(apiConfig.endpoints.burnSubtitles, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()
      if (data.success) {
        listenForProgress(data.sessionId, 'burning')
        await deductCoins(cost, 'Burn subtitles')
      } else {
        throw new Error(data.error || 'Failed to start subtitle burning')
      }
    } catch (error) {
      console.error('Error burning subtitles:', error)
      setBurning(false)
      alert('Failed to burn subtitles. Please try again.')
    }
  }

  const listenForProgress = (sessionId: string, type: 'transcript' | 'burning') => {
    const eventSource = new EventSource(apiConfig.endpoints.progress(sessionId))
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        if (data.type === 'progress') {
          setProgress({
            progress: data.progress || 0,
            message: data.message || '',
            stage: data.stage || ''
          })
        } else if (data.type === 'complete') {
          if (type === 'transcript') {
            setTranscript(data.data.transcript)
            setTranscribing(false)
            setActiveTab('styling')
          } else if (type === 'burning') {
            setPreviewUrl(data.data.downloadUrl)
            setBurning(false)
            setActiveTab('preview')
            if (onComplete) {
              onComplete(data.data)
            }
          }
          eventSource.close()
        } else if (data.type === 'error') {
          console.error('Processing error:', data.error)
          if (type === 'transcript') {
            setTranscribing(false)
          } else {
            setBurning(false)
          }
          alert(`${type === 'transcript' ? 'Transcription' : 'Subtitle burning'} failed: ${data.error}`)
          eventSource.close()
        }
      } catch (error) {
        console.error('Error parsing progress data:', error)
      }
    }

    eventSource.onerror = () => {
      console.error('EventSource connection error')
      eventSource.close()
      if (type === 'transcript') {
        setTranscribing(false)
      } else {
        setBurning(false)
      }
    }
  }

  const applyPreset = (preset: SubtitlePreset) => {
    // Keep the current subtitle mode and karaoke setting when changing presets
    const currentMode = styleOptions.subtitleMode
    const currentKaraoke = styleOptions.karaokeEnabled
    
    setStyleOptions({
      ...preset.settings,
      subtitleMode: currentMode,
      karaokeEnabled: currentKaraoke
    })
  }

  const updateStyle = (updates: Partial<StyleOptions>) => {
    setStyleOptions(prev => ({
      ...prev,
      ...updates,
      preset: 'custom'
    }))
  }

  const generateSubtitleFile = async (format: 'srt' | 'vtt' | 'ass') => {
    if (!transcript) return

    try {
      const response = await fetch(apiConfig.endpoints.generateSubtitleFile, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          format,
          options: styleOptions
        })
      })

      const data = await response.json()
      if (data.success) {
        const link = document.createElement('a')
        link.href = data.downloadUrl
        link.download = data.filename
        link.click()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error(`Error generating ${format.toUpperCase()} file:`, error)
      alert(`Failed to generate ${format.toUpperCase()} file`)
    }
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-gray-900">Subtitle Editor</h2>
          <p className="text-sm md:text-base text-gray-600">Generate and customize subtitles with karaoke-style highlighting</p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-4 mb-6 border-b border-gray-200">
        {['transcript', 'styling', 'preview'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`pb-2 px-1 font-medium text-sm transition-colors ${
              activeTab === tab
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            disabled={tab === 'styling' && !transcript}
          >
            {tab === 'transcript' && <FileText className="w-4 h-4 inline mr-1" />}
            {tab === 'styling' && <Settings className="w-4 h-4 inline mr-1" />}
            {tab === 'preview' && <Eye className="w-4 h-4 inline mr-1" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Transcript Tab */}
      {activeTab === 'transcript' && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Language:</label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              disabled={transcribing}
            >
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {videoUrl && (
            <div className="relative bg-black rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                src={videoUrl}
                className="w-full h-64 object-contain"
                controls
                preload="metadata"
              />
            </div>
          )}

          {!transcript && (
            <div className="text-center py-8 space-y-4">
              <Upload className="w-12 h-12 text-gray-400 mx-auto" />
              <p className="text-gray-600">
                Generate transcript from your video to start creating subtitles
              </p>
              <button
                onClick={handleGenerateTranscript}
                disabled={transcribing || !video}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2 mx-auto"
              >
                <FileText className="w-4 h-4" />
                {transcribing ? 'Generating...' : `Generate Transcript (${COIN_COSTS.GENERATE_CLIPS} coins)`}
              </button>
            </div>
          )}

          {transcript && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Generated Transcript</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => generateSubtitleFile('srt')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Download SRT
                  </button>
                  <button
                    onClick={() => generateSubtitleFile('vtt')}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Download VTT
                  </button>
                  <button
                    onClick={() => generateSubtitleFile('ass')}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Download ASS
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
                {transcript.segments?.map((segment: any, index: number) => (
                  <div key={index} className="mb-3 pb-3 border-b border-gray-200 last:border-b-0">
                    <div className="text-xs text-gray-500 mb-1">
                      {formatTime(segment.start)} → {formatTime(segment.end)}
                    </div>
                    <div className="text-sm text-gray-800">{segment.text}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setActiveTab('styling')}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg transition-colors"
              >
                Continue to Styling →
              </button>
            </div>
          )}

          {transcribing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{progress.message}</span>
                <span className="text-gray-600">{progress.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Styling Tab */}
      {activeTab === 'styling' && transcript && (
        <div className="space-y-6">
          {/* Preset Buttons */}
          <div>
            <h3 className="text-base md:text-lg font-semibold mb-4">Style Presets</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {SUBTITLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    styleOptions.preset === preset.id
                      ? 'border-purple-500 ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div
                    style={preset.displayStyle}
                    className="text-sm font-medium mb-2 rounded"
                  >
                    Sample Text
                  </div>
                  <div className="text-xs text-gray-600">{preset.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle Mode Toggle */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">Subtitle Style Mode</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className={`flex items-center space-x-3 p-3 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 ${
                styleOptions.subtitleMode === 'normal' || !styleOptions.subtitleMode 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-gray-200'
              }`}>
                <input
                  type="radio"
                  name="subtitleMode"
                  value="normal"
                  checked={styleOptions.subtitleMode === 'normal' || !styleOptions.subtitleMode}
                  onChange={(e) => updateStyle({ subtitleMode: e.target.value as 'normal' | 'social-media' })}
                  className="text-purple-600 focus:ring-2 focus:ring-purple-500"
                />
                <div>
                  <span className="font-medium text-gray-800">📝 Normal Subtitles</span>
                  <p className="text-sm text-gray-600">Full sentences with traditional timing</p>
                </div>
              </label>
              <label className={`flex items-center space-x-3 p-3 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 ${
                styleOptions.subtitleMode === 'social-media' 
                  ? 'border-purple-500 bg-purple-50' 
                  : 'border-gray-200'
              }`}>
                <input
                  type="radio"
                  name="subtitleMode"
                  value="social-media"
                  checked={styleOptions.subtitleMode === 'social-media'}
                  onChange={(e) => updateStyle({ subtitleMode: e.target.value as 'normal' | 'social-media' })}
                  className="text-purple-600 focus:ring-2 focus:ring-purple-500"
                />
                <div>
                  <span className="font-medium text-gray-800">📱 Social Media</span>
                  <p className="text-sm text-gray-600">1-3 words per subtitle for impact</p>
                </div>
              </label>
            </div>
          </div>

          {/* Combined Word-Level and Social Media Settings */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-blue-900">📱 Subtitle Behavior</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-800 mb-2">Words per subtitle</label>
                <select
                  value={styleOptions.maxWordsPerSubtitle || 2}
                  onChange={(e) => updateStyle({ maxWordsPerSubtitle: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={1}>1 word (Maximum impact)</option>
                  <option value={2}>2 words (Balanced)</option>
                  <option value={3}>3 words (More readable)</option>
                  <option value={10}>Full sentence</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={styleOptions.karaokeEnabled}
                  onChange={(e) => updateStyle({ karaokeEnabled: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <span className="font-medium text-blue-800">🎤 Word-Level Highlighting</span>
                  <p className="text-sm text-blue-700">Highlight each word as it's spoken for better engagement</p>
                </div>
              </label>

              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={styleOptions.emphasizeKeyWords !== false}
                  onChange={(e) => updateStyle({ emphasizeKeyWords: e.target.checked })}
                  className="rounded text-blue-600 focus:ring-2 focus:ring-blue-500"
                />
                <div>
                  <span className="font-medium text-blue-800">✨ Emphasize Key Words</span>
                  <p className="text-sm text-blue-700">Important words like "AMAZING", "WOW" will be UPPERCASE</p>
                </div>
              </label>
            </div>
          </div>

          {/* Style Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Font Settings */}
            <div className="space-y-4">
              <h4 className="font-medium text-base md:text-lg text-gray-900">Font Settings</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Font Family</label>
                <select
                  value={styleOptions.fontname}
                  onChange={(e) => updateStyle({ fontname: e.target.value })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  {FONT_OPTIONS.map(font => (
                    <option key={font} value={font} style={{ fontFamily: font }}>
                      {font}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Font Size</label>
                <select
                  value={styleOptions.fontsize}
                  onChange={(e) => updateStyle({ fontsize: parseInt(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value={18}>Small (18px)</option>
                  <option value={24}>Medium (24px)</option>
                  <option value={32}>Large (32px)</option>
                  <option value={42}>Extra Large (42px)</option>
                </select>
              </div>

              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={styleOptions.bold}
                    onChange={(e) => updateStyle({ bold: e.target.checked })}
                    className="rounded mr-2"
                  />
                  Bold
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={styleOptions.italic}
                    onChange={(e) => updateStyle({ italic: e.target.checked })}
                    className="rounded mr-2"
                  />
                  Italic
                </label>
              </div>
            </div>

            {/* Colors */}
            <div className="space-y-4">
              <h4 className="font-medium text-base md:text-lg text-gray-900">Colors</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Text Color</label>
                <input
                  type="color"
                  value={styleOptions.primaryColour}
                  onChange={(e) => updateStyle({ primaryColour: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Highlight Color</label>
                <input
                  type="color"
                  value={styleOptions.secondaryColour}
                  onChange={(e) => updateStyle({ secondaryColour: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Background Color</label>
                <input
                  type="color"
                  value={styleOptions.backColour}
                  onChange={(e) => updateStyle({ backColour: e.target.value })}
                  className="w-full h-10 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            {/* Layout & Effects */}
            <div className="space-y-4">
              <h4 className="font-medium text-base md:text-lg text-gray-900">Layout & Effects</h4>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <select
                  value={styleOptions.position || 'bottom'}
                  onChange={(e) => updateStyle({ position: e.target.value as 'top' | 'center' | 'bottom' })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="bottom">Bottom (Traditional)</option>
                  <option value="center">Center (Eye-catching)</option>
                  <option value="top">Top (Alternative)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Border Style</label>
                <select
                  value={styleOptions.borderStyle}
                  onChange={(e) => updateStyle({ borderStyle: parseInt(e.target.value) as 1 | 3 })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value={1}>Outline + Shadow</option>
                  <option value={3}>Opaque Box</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outline Thickness</label>
                <select
                  value={styleOptions.outline}
                  onChange={(e) => updateStyle({ outline: parseInt(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value={1}>Thin (1px)</option>
                  <option value={2}>Medium (2px)</option>
                  <option value={4}>Thick (4px)</option>
                  <option value={6}>Extra Thick (6px)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shadow Size</label>
                <select
                  value={styleOptions.shadow}
                  onChange={(e) => updateStyle({ shadow: parseInt(e.target.value) })}
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value={0}>None</option>
                  <option value={1}>Light (1px)</option>
                  <option value={2}>Medium (2px)</option>
                  <option value={4}>Heavy (4px)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Generate Button */}
          <div className="flex justify-center pt-6">
            <button
              onClick={handleBurnSubtitles}
              disabled={burning || !transcript}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-8 py-3 rounded-lg transition-colors flex items-center gap-2"
            >
              {burning ? 'Generating...' : `Generate Subtitled Video (${COIN_COSTS.GENERATE_CLIPS} coins)`}
            </button>
          </div>

          {burning && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{progress.message}</span>
                <span className="text-gray-600">{progress.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview Tab */}
      {activeTab === 'preview' && (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold">Preview & Download</h3>
          
          {previewUrl ? (
            <div className="space-y-4">
              <div className="bg-black rounded-lg overflow-hidden">
                <video
                  ref={previewRef}
                  src={previewUrl}
                  className="w-full h-64 object-contain"
                  controls
                  preload="metadata"
                />
              </div>
              
              <div className="flex justify-center gap-4">
                <a
                  href={previewUrl}
                  download
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download Video
                </a>
                <button
                  onClick={() => setActiveTab('styling')}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg transition-colors"
                >
                  Edit Styling
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-600">Generate subtitled video to see preview</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
} 