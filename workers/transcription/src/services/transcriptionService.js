const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const fs = require('fs-extra')
const { nodewhisper } = require('nodejs-whisper')

class TranscriptionService {
  constructor() {
    this.availableModels = ['tiny', 'base', 'small', 'medium', 'large-v3-turbo', 'large']
    this.currentModel = process.env.WHISPER_MODEL || 'medium' // Default model for multilingual
    
    console.log(`🎤 Transcription Service initialized with model: ${this.currentModel}`)
    
    // Configure FFmpeg paths for different platforms
    this.configureFFmpeg()
    
    // Initialize nodewhisper
    this.initializeNodeWhisper()
  }

  /**
   * Configure FFmpeg paths based on platform
   */
  configureFFmpeg() {
    try {
      // Try to configure FFmpeg paths (common locations)
      const platform = process.platform
      
      if (platform === 'darwin') { // macOS
        if (fs.existsSync('/opt/homebrew/bin/ffmpeg')) {
          ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg')
          ffmpeg.setFfprobePath('/opt/homebrew/bin/ffprobe')
        } else if (fs.existsSync('/usr/local/bin/ffmpeg')) {
          ffmpeg.setFfmpegPath('/usr/local/bin/ffmpeg')
          ffmpeg.setFfprobePath('/usr/local/bin/ffprobe')
        }
      } else if (platform === 'linux') {
        if (fs.existsSync('/usr/bin/ffmpeg')) {
          ffmpeg.setFfmpegPath('/usr/bin/ffmpeg')
          ffmpeg.setFfprobePath('/usr/bin/ffprobe')
        }
      }
      
      console.log('✅ FFmpeg configured successfully')
    } catch (error) {
      console.warn('⚠️ FFmpeg configuration warning:', error.message)
    }
  }

  /**
   * Initialize nodewhisper and ensure models are available
   */
  async initializeNodeWhisper() {
    try {
      // Check if Whisper is ready
      const installCheck = await this.checkWhisperInstallation(this.currentModel)
      if (!installCheck.success) {
        console.warn('⚠️ Whisper not ready:', installCheck.error)
        console.log('📥 Attempting to download model...')
        await nodewhisper.download(this.currentModel)
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize nodewhisper:', error.message)
    }
  }

  /**
   * Check if Whisper model is installed and ready
   */
  async checkWhisperInstallation(modelName = 'medium') {
    try {
      console.log(`🔍 Checking Whisper model: ${modelName}`)
      
      // Try to get model information
      const result = await nodewhisper.download(modelName, { 
        verbose: false,
        skipExisting: true
      })
      
      return {
        success: true,
        model: modelName,
        message: 'Model ready'
      }
      
    } catch (error) {
      return {
        success: false,
        model: modelName,
        error: error.message
      }
    }
  }

  /**
   * Extract audio from video file
   */
  async extractAudio(videoPath, outputDir) {
    console.log('🎵 Extracting audio from video...')
    
    const audioFileName = `audio_${Date.now()}.wav`
    const audioPath = path.join(outputDir, audioFileName)
    
    // Ensure output directory exists
    await fs.ensureDir(outputDir)
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(16000)
        .audioBitrate('128k')
        .output(audioPath)
        .on('end', () => {
          console.log('   ✅ Audio extraction complete!')
          resolve(audioPath)
        })
        .on('error', (err) => {
          console.error('   ❌ Audio extraction failed:', err.message)
          reject(err)
        })
        .on('progress', (progress) => {
          console.log(`   📊 Audio extraction progress: ${Math.round(progress.percent || 0)}%`)
        })
        .run()
    })
  }

  /**
   * Transcribe audio using nodejs-whisper
   */
  async transcribeAudio(audioPath, options = {}) {
    console.log('🎤 Starting transcription with nodejs-whisper...')
    
    const modelName = options.model || this.currentModel
    const language = options.language || 'id'
    
    console.log(`   📊 Model: ${modelName}`)
    console.log(`   🌐 Language: ${language}`)
    
    try {
      // Check if Whisper is ready
      const installCheck = await this.checkWhisperInstallation(modelName)
      if (!installCheck.success) {
        throw new Error(`Whisper model '${modelName}' not ready: ${installCheck.error}`)
      }
      
      console.log('   🎯 Transcribing with nodejs-whisper...')
      
      // Configure whisper options
      const whisperConfig = {
        modelName: modelName,
        autoDownloadModelName: modelName,
        verbose: true,
        removeWavFileAfterTranscription: false,
        withCuda: false,
        whisperOptions: {
          word_timestamps: true,
          language: language === 'auto' ? undefined : language,
          task: 'transcribe',
          best_of: 2,
          temperature: 0.2,
          compression_ratio_threshold: 2.4,
          logprob_threshold: -1.0,
          no_speech_threshold: 0.6,
          condition_on_previous_text: true,
          initial_prompt: language === 'auto' ? 
            "Please transcribe this audio accurately." : 
            `This audio is primarily in ${language}. Please transcribe accurately.`
        }
      }
      
      // Transcribe using nodejs-whisper
      const result = await nodewhisper(audioPath, whisperConfig)
      
      if (!result || (!result[0] && !result.text)) {
        throw new Error('No transcription result returned from Whisper')
      }
      
      console.log('   ✅ Nodejs-whisper transcription complete!')
      return this.processNodeWhisperResult(result, modelName)
      
    } catch (error) {
      console.error('   ❌ Transcription failed:', error.message)
      throw error
    }
  }

  /**
   * Process nodejs-whisper result into standardized format
   */
  processNodeWhisperResult(result, modelName) {
    console.log('📊 Processing transcription result...')
    
    try {
      let transcriptData = {
        text: '',
        segments: [],
        words: [],
        language: 'unknown',
        model: modelName,
        confidence: 0.0
      }

      // Handle different result formats
      if (Array.isArray(result) && result.length > 0) {
        // Array format from nodejs-whisper
        const whisperData = result[0]
        
        if (whisperData.text) {
          transcriptData.text = whisperData.text
        }
        
        if (whisperData.language) {
          transcriptData.language = whisperData.language
        }
        
        // Process segments if available
        if (whisperData.segments && Array.isArray(whisperData.segments)) {
          transcriptData.segments = this.extractSegmentsFromWhisperOutput(whisperData.segments)
          transcriptData.words = this.extractWordsFromSegments(whisperData.segments)
        } else {
          // Create fallback segment
          transcriptData.segments = [{
            id: 0,
            start: 0,
            end: 0,
            text: transcriptData.text,
            words: []
          }]
        }
        
      } else if (result.text) {
        // Direct object format
        transcriptData.text = result.text
        transcriptData.language = result.language || 'unknown'
        
        if (result.segments) {
          transcriptData.segments = this.extractSegmentsFromWhisperOutput(result.segments)
          transcriptData.words = this.extractWordsFromSegments(result.segments)
        }
      }

      // Calculate average confidence
      if (transcriptData.words.length > 0) {
        transcriptData.confidence = this.calculateAverageConfidence(transcriptData.words)
      }

      console.log('   ✅ Result processing complete!')
      console.log(`   📊 Extracted ${transcriptData.segments.length} segments, ${transcriptData.words.length} words`)
      console.log(`   🌐 Language: ${transcriptData.language}`)
      console.log(`   🎯 Confidence: ${(transcriptData.confidence * 100).toFixed(1)}%`)

      return transcriptData

    } catch (error) {
      console.error('   ❌ Result processing failed:', error.message)
      throw error
    }
  }

  /**
   * Extract segments from Whisper output
   */
  extractSegmentsFromWhisperOutput(segments) {
    return segments.map(segment => ({
      id: segment.id || 0,
      start: segment.start || 0,
      end: segment.end || 0,
      text: segment.text || '',
      words: segment.words ? this.extractWordsFromSegment(segment.words) : []
    }))
  }

  /**
   * Extract words from segments
   */
  extractWordsFromSegments(segments) {
    const allWords = []
    
    segments.forEach(segment => {
      if (segment.words && Array.isArray(segment.words)) {
        segment.words.forEach(word => {
          allWords.push({
            word: word.word || word.text || '',
            start: word.start || 0,
            end: word.end || 0,
            confidence: word.confidence || word.probability || 0.9
          })
        })
      }
    })
    
    return allWords
  }

  /**
   * Extract words from a single segment
   */
  extractWordsFromSegment(words) {
    return words.map(word => ({
      word: word.word || word.text || '',
      start: word.start || 0,
      end: word.end || 0,
      confidence: word.confidence || word.probability || 0.9
    }))
  }

  /**
   * Calculate average confidence from words
   */
  calculateAverageConfidence(words) {
    if (!words || words.length === 0) return 0.0
    
    const totalConfidence = words.reduce((sum, word) => sum + (word.confidence || 0.9), 0)
    return totalConfidence / words.length
  }

  /**
   * Process video for transcription (extract audio + transcribe)
   */
  async processVideo(videoPath, outputDir, options = {}) {
    console.log('🎬 Starting video transcription process...')
    
    try {
      // Create output directory
      await fs.ensureDir(outputDir)
      
      // Extract audio from video
      const audioPath = await this.extractAudio(videoPath, outputDir)
      
      // Transcribe audio
      const transcriptData = await this.transcribeAudio(audioPath, options)
      
      // Clean up audio file if requested
      if (options.cleanupAudio !== false) {
        try {
          await fs.remove(audioPath)
          console.log('🧹 Cleaned up temporary audio file')
        } catch (error) {
          console.warn('⚠️ Failed to cleanup audio file:', error.message)
        }
      }
      
      console.log('✅ Video transcription complete!')
      return transcriptData
      
    } catch (error) {
      console.error('❌ Video transcription failed:', error.message)
      throw error
    }
  }

  /**
   * Generate fallback transcript when transcription fails
   */
  async generateFallbackTranscript() {
    console.log('🔄 Generating fallback transcript...')
    
    return {
      text: "Transcription unavailable - please check audio quality and try again",
      segments: [{
        id: 0,
        start: 0,
        end: 0,
        text: "Transcription failed",
        words: []
      }],
      words: [],
      language: 'unknown',
      model: 'fallback',
      confidence: 0.0,
      fallback: true
    }
  }

  /**
   * Test transcription with a sample
   */
  async testTranscription(options = {}) {
    console.log('🧪 Testing transcription service...')
    
    try {
      const modelName = options.model || this.currentModel
      
      // Check if model is available
      const installCheck = await this.checkWhisperInstallation(modelName)
      
      return {
        success: installCheck.success,
        model: modelName,
        available_models: this.availableModels,
        message: installCheck.success ? 'Service ready' : installCheck.error
      }
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }
}

module.exports = TranscriptionService 