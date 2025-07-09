const { PythonShell } = require('python-shell')
const path = require('path')
const fs = require('fs-extra')

class WhisperTimestampService {
  constructor() {
    this.pythonScriptPath = path.join(__dirname, 'whisperTimestamped.py')
    this.pythonExecutable = process.env.PYTHON_EXECUTABLE || 'python3'
    
    console.log(`🐍 Whisper Timestamp Service initialized`)
    console.log(`   Python script: ${this.pythonScriptPath}`)
    console.log(`   Python executable: ${this.pythonExecutable}`)
  }

  /**
   * Test if the Python environment and whisper-timestamped are properly installed
   */
  async testInstallation() {
    console.log('🧪 Testing whisper-timestamped installation...')
    
    try {
      const options = {
        mode: 'json',
        pythonPath: this.pythonExecutable,
        scriptPath: path.dirname(this.pythonScriptPath),
        args: ['--test']
      }

      const results = await PythonShell.run('whisperTimestamped.py', options)
      const result = results[0] // Get the JSON result
      
      console.log('   ✅ Installation test complete!')
      return result
      
    } catch (error) {
      console.error('   ❌ Installation test failed:', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Transcribe audio with precise word-level timestamps using whisper-timestamped
   */
  async transcribeWithTimestamps(audioPath, options = {}) {
    console.log('🎯 Starting precise timestamp transcription...')
    
    try {
      // Validate input
      if (!audioPath) {
        throw new Error('Audio path is required')
      }
      
      if (!await fs.pathExists(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`)
      }

      // Prepare arguments
      const args = [audioPath]
      
      if (options.model) {
        args.push('--model', options.model)
      }
      
      if (options.language && options.language !== 'auto') {
        args.push('--language', options.language)
      }
      
      if (options.disableVAD || options.no_vad) {
        args.push('--no-vad')
      }

      console.log(`   🐍 Running Python script with args: ${args.join(' ')}`)
      
      const pythonOptions = {
        mode: 'json',
        pythonPath: this.pythonExecutable,
        scriptPath: path.dirname(this.pythonScriptPath),
        args: args,
        stderrParser: (line) => {
          // Log Python stderr as info (progress messages)
          console.log(`   [Python] ${line}`)
        }
      }

      const results = await PythonShell.run('whisperTimestamped.py', pythonOptions)
      const result = results[0] // Get the JSON result

      if (!result.success) {
        throw new Error(result.error || 'Python transcription failed')
      }

      console.log('   ✅ Timestamp transcription complete!')
      console.log(`   📊 Words with timestamps: ${result.result.words?.length || 0}`)
      console.log(`   🌐 Language: ${result.result.language}`)

      return result.result

    } catch (error) {
      console.error('   ❌ Timestamp transcription failed:', error.message)
      throw error
    }
  }

  /**
   * Process video by extracting audio and then transcribing with timestamps
   */
  async processVideoWithTimestamps(videoPath, outputDir, options = {}) {
    console.log('🎬 Processing video with precise timestamps...')
    
    try {
      // Extract audio from video first
      const audioPath = await this.extractAudioFromVideo(videoPath, outputDir)
      
      // Transcribe with timestamps
      const transcriptData = await this.transcribeWithTimestamps(audioPath, options)
      
      // Clean up audio file if requested
      if (options.cleanupAudio !== false) {
        try {
          await fs.remove(audioPath)
          console.log('   🧹 Cleaned up temporary audio file')
        } catch (error) {
          console.warn('   ⚠️ Failed to cleanup audio file:', error.message)
        }
      }

      console.log('✅ Video processing with timestamps complete!')
      return transcriptData

    } catch (error) {
      console.error('❌ Video processing with timestamps failed:', error.message)
      throw error
    }
  }

  /**
   * Extract audio from video using FFmpeg
   * Note: This is a simplified version - in production you might want to use
   * the video worker service for this step
   */
  async extractAudioFromVideo(videoPath, outputDir) {
    console.log('   🎵 Extracting audio from video...')
    
    const ffmpeg = require('fluent-ffmpeg')
    
    // Configure FFmpeg paths for different platforms
    this.configureFFmpeg(ffmpeg)
    
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
   * Configure FFmpeg paths based on platform
   */
  configureFFmpeg(ffmpeg) {
    try {
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
      
    } catch (error) {
      console.warn('⚠️ FFmpeg configuration warning:', error.message)
    }
  }

  /**
   * Compare transcription results between regular and timestamped versions
   */
  async compareWithRegularTranscription(audioPath, regularTranscriptData, options = {}) {
    console.log('🔍 Comparing with regular transcription...')
    
    try {
      const timestampedData = await this.transcribeWithTimestamps(audioPath, options)
      
      const comparison = {
        regular: {
          text: regularTranscriptData.text,
          segments: regularTranscriptData.segments?.length || 0,
          words: regularTranscriptData.words?.length || 0,
          confidence: regularTranscriptData.confidence || 0
        },
        timestamped: {
          text: timestampedData.text,
          segments: timestampedData.segments?.length || 0,
          words: timestampedData.words?.length || 0,
          language: timestampedData.language
        },
        accuracy: {
          textSimilarity: this.calculateTextSimilarity(
            regularTranscriptData.text, 
            timestampedData.text
          ),
          wordCountDifference: Math.abs(
            (regularTranscriptData.words?.length || 0) - 
            (timestampedData.words?.length || 0)
          )
        }
      }

      console.log('   ✅ Comparison complete!')
      return {
        timestampedData,
        comparison
      }

    } catch (error) {
      console.error('   ❌ Comparison failed:', error.message)
      throw error
    }
  }

  /**
   * Calculate basic text similarity between two transcriptions
   */
  calculateTextSimilarity(text1, text2) {
    const similarity = require('similarity')
    return similarity(text1.toLowerCase(), text2.toLowerCase())
  }

  /**
   * Get available models for whisper-timestamped
   */
  getAvailableModels() {
    return ['tiny', 'base', 'small', 'medium', 'large', 'large-v1', 'large-v2', 'large-v3']
  }

  /**
   * Get service status and information
   */
  async getServiceInfo() {
    console.log('ℹ️ Getting service information...')
    
    try {
      const installationTest = await this.testInstallation()
      
      return {
        service: 'whisper-timestamp',
        pythonScript: this.pythonScriptPath,
        pythonExecutable: this.pythonExecutable,
        availableModels: this.getAvailableModels(),
        installation: installationTest,
        features: [
          'Precise word-level timestamps',
          'Voice Activity Detection (VAD)',
          'Disfluency detection',
          'Multiple language support',
          'High accuracy transcription'
        ]
      }

    } catch (error) {
      return {
        service: 'whisper-timestamp',
        error: error.message,
        installation: { success: false, error: error.message }
      }
    }
  }
}

module.exports = WhisperTimestampService 