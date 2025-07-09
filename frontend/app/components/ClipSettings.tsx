'use client'

import { useState } from 'react'
import { Settings, Zap, Play, Target, Globe } from 'lucide-react'

interface ClipSettingsProps {
  selectedPreset: string
  onPresetChange: (preset: any) => void
  selectedLanguage?: string
  onLanguageChange?: (language: string) => void
}

export default function ClipSettings({ 
  selectedPreset,
  onPresetChange,
  selectedLanguage = 'auto',
  onLanguageChange
}: ClipSettingsProps) {
  const getFixedPresets = () => {
    return [
      { 
        id: '30s-1m',
        minDuration: 30, 
        maxDuration: 60, 
        label: '30s-1m', 
        desc: 'Social Media',
        avgDuration: 45,
        icon: Zap,
        color: 'text-pink-600 bg-pink-50 border-pink-200'
      },
      { 
        id: '1-2m',
        minDuration: 60, 
        maxDuration: 120, 
        label: '1-2m', 
        desc: 'Short Content',
        avgDuration: 90,
        icon: Target,
        color: 'text-blue-600 bg-blue-50 border-blue-200'
      },
      { 
        id: '2-3m',
        minDuration: 120, 
        maxDuration: 180, 
        label: '2-3m', 
        desc: 'Highlights',
        avgDuration: 150,
        icon: Target,
        color: 'text-blue-600 bg-blue-50 border-blue-200'
      },
      { 
        id: '3-4m',
        minDuration: 180, 
        maxDuration: 240, 
        label: '3-4m', 
        desc: 'Extended',
        avgDuration: 210,
        icon: Play,
        color: 'text-green-600 bg-green-50 border-green-200'
      },
      { 
        id: '4-5m',
        minDuration: 240, 
        maxDuration: 300, 
        label: '4-5m', 
        desc: 'Tutorials',
        avgDuration: 270,
        icon: Play,
        color: 'text-green-600 bg-green-50 border-green-200'
      }
    ]
  }

  const getLanguageOptions = () => {
    return [
      { code: 'auto', name: 'Auto-detect', flag: '🌐' },
      { code: 'en', name: 'English', flag: '🇺🇸' },
      { code: 'es', name: 'Spanish', flag: '🇪🇸' },
      { code: 'fr', name: 'French', flag: '🇫🇷' },
      { code: 'de', name: 'German', flag: '🇩🇪' },
      { code: 'it', name: 'Italian', flag: '🇮🇹' },
      { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
      { code: 'ru', name: 'Russian', flag: '🇷🇺' },
      { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
      { code: 'ko', name: 'Korean', flag: '🇰🇷' },
      { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
      { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
      { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
      { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
      { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
      { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
      { code: 'da', name: 'Danish', flag: '🇩🇰' },
      { code: 'no', name: 'Norwegian', flag: '🇳🇴' },
      { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
      { code: 'pl', name: 'Polish', flag: '🇵🇱' },
      { code: 'cs', name: 'Czech', flag: '🇨🇿' },
      { code: 'hu', name: 'Hungarian', flag: '🇭🇺' },
      { code: 'el', name: 'Greek', flag: '🇬🇷' },
      { code: 'he', name: 'Hebrew', flag: '🇮🇱' },
      { code: 'th', name: 'Thai', flag: '🇹🇭' },
      { code: 'vi', name: 'Vietnamese', flag: '🇻🇳' },
      { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
      { code: 'ms', name: 'Malay', flag: '🇲🇾' },
      { code: 'tl', name: 'Filipino', flag: '🇵🇭' },
      { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
      { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
      { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
      { code: 'sr', name: 'Serbian', flag: '🇷🇸' },
      { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
      { code: 'sl', name: 'Slovenian', flag: '🇸🇮' },
      { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
    ]
  }

  const handlePresetClick = (preset: any) => {
    onPresetChange(preset)
  }

  const handleLanguageChange = (language: string) => {
    if (onLanguageChange) {
      onLanguageChange(language)
    }
  }

  const presets = getFixedPresets()
  const languages = getLanguageOptions()
  const currentPreset = presets.find(p => p.id === selectedPreset) || presets[0]
  const RecommendationIcon = currentPreset.icon

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Settings className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Clip Configuration</h3>
          <p className="text-sm text-gray-600">Choose your clip type and language</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Selected Preset Display */}
        <div className="text-center">
          <div className={`inline-flex items-center space-x-3 px-6 py-4 rounded-xl border-2 ${currentPreset.color}`}>
            <RecommendationIcon className="w-6 h-6" />
            <div>
              <div className="text-lg font-bold">
                {currentPreset.label}
              </div>
              <div className="text-sm">
                Best for {currentPreset.desc}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Preset Buttons */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Clip Duration</h4>
          <div className="grid grid-cols-2 gap-3">
            {presets.map((preset) => {
              const PresetIcon = preset.icon
              return (
                <button
                  key={preset.id}
                  onClick={() => handlePresetClick(preset)}
                  className={`p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                    selectedPreset === preset.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-2">
                    <PresetIcon className="w-4 h-4" />
                    <div className="text-sm font-semibold">{preset.label}</div>
                  </div>
                  <div className="text-xs text-gray-500">{preset.desc}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Language Selection */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700 flex items-center space-x-2">
            <Globe className="w-4 h-4" />
            <span>Video Language (Optional)</span>
          </h4>
          <select
            value={selectedLanguage}
            onChange={(e) => handleLanguageChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500">
            Select the primary language of your video for better speech analysis. 
            Auto-detect works well for most cases.
          </p>
        </div>

        {/* Tips */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900 mb-2">💡 Clip Duration Tips</h4>
          <ul className="text-xs text-blue-800 space-y-1">
            <li>• <strong>30s-1m:</strong> Perfect for TikTok, Instagram Reels, YouTube Shorts</li>
            <li>• <strong>1-2m:</strong> Great for Twitter videos and quick highlights</li>
            <li>• <strong>2-3m:</strong> Ideal for detailed highlights and demos</li>
            <li>• <strong>3-5m:</strong> Perfect for tutorials and educational content</li>
          </ul>
          <div className="mt-2 text-xs text-blue-700">
            Current selection: <strong>{currentPreset.label}</strong> ({currentPreset.desc})
          </div>
        </div>
      </div>
    </div>
  )
} 