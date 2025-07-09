const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const fs = require('fs-extra')
const { v4: uuidv4 } = require('uuid')

class VideoProcessingService {
  constructor() {
    console.log('🎬 Video Processing Service initializing...')
    
    // Configure FFmpeg paths for different platforms
    this.configureFFmpeg()
    
    console.log('✅ Video Processing Service initialized')
  }

  /**
   * Configure FFmpeg paths based on platform and available installations
   */
  configureFFmpeg() {
    try {
      const platform = process.platform
      
      // Try ffmpeg-static first (bundled with npm package)
      try {
        const ffmpegStatic = require('ffmpeg-static')
        if (ffmpegStatic) {
          ffmpeg.setFfmpegPath(ffmpegStatic)
          console.log('✅ Using ffmpeg-static binary')
          return
        }
      } catch (error) {
        console.log('📦 ffmpeg-static not available, trying system installation...')
      }
      
      // Platform-specific paths
      if (platform === 'darwin') { // macOS
        const macPaths = [
          '/opt/homebrew/bin/ffmpeg',
          '/usr/local/bin/ffmpeg',
          '/opt/local/bin/ffmpeg'
        ]
        
        for (const ffmpegPath of macPaths) {
          if (fs.existsSync(ffmpegPath)) {
            ffmpeg.setFfmpegPath(ffmpegPath)
            ffmpeg.setFfprobePath(ffmpegPath.replace('ffmpeg', 'ffprobe'))
            console.log(`✅ Found FFmpeg at: ${ffmpegPath}`)
            return
          }
        }
      } else if (platform === 'linux') {
        const linuxPaths = [
          '/usr/bin/ffmpeg',
          '/usr/local/bin/ffmpeg',
          '/snap/bin/ffmpeg'
        ]
        
        for (const ffmpegPath of linuxPaths) {
          if (fs.existsSync(ffmpegPath)) {
            ffmpeg.setFfmpegPath(ffmpegPath)
            ffmpeg.setFfprobePath(ffmpegPath.replace('ffmpeg', 'ffprobe'))
            console.log(`✅ Found FFmpeg at: ${ffmpegPath}`)
            return
          }
        }
      }
      
      console.warn('⚠️ No FFmpeg installation found - video processing may fail')
      
    } catch (error) {
      console.warn('⚠️ FFmpeg configuration warning:', error.message)
    }
  }

  /**
   * Get comprehensive video information
   */
  async getVideoInfo(videoPath) {
    console.log('📊 Getting video information...')
    
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          console.error('   ❌ Failed to get video info:', err.message)
          reject(err)
          return
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video')
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio')

        const info = {
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitRate: metadata.format.bit_rate,
          format: metadata.format.format_name,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            frameRate: this.parseFrameRate(videoStream.r_frame_rate),
            aspectRatio: videoStream.display_aspect_ratio || `${videoStream.width}:${videoStream.height}`,
            pixelFormat: videoStream.pix_fmt,
            bitRate: videoStream.bit_rate
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
            bitRate: audioStream.bit_rate,
            channelLayout: audioStream.channel_layout
          } : null,
          metadata: metadata.format.tags || {}
        }

        console.log('   ✅ Video info retrieved successfully')
        console.log(`   📏 Resolution: ${info.video?.width}x${info.video?.height}`)
        console.log(`   ⏱️ Duration: ${Math.round(info.duration)}s`)
        
        resolve(info)
      })
    })
  }

  /**
   * Parse frame rate string (e.g., "30/1" -> 30)
   */
  parseFrameRate(frameRateStr) {
    if (!frameRateStr) return 0
    try {
      const [num, den] = frameRateStr.split('/')
      return parseFloat(num) / parseFloat(den)
    } catch {
      return 0
    }
  }

  /**
   * Extract a frame from video at specific timestamp
   */
  async extractFrame(videoPath, timestamp, outputPath) {
    console.log(`🖼️ Extracting frame at ${timestamp}s...`)
    
    await fs.ensureDir(path.dirname(outputPath))
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .output(outputPath)
        .outputOptions(['-q:v', '2']) // High quality
        .on('end', () => {
          console.log('   ✅ Frame extraction complete!')
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('   ❌ Frame extraction failed:', err.message)
          reject(err)
        })
        .run()
    })
  }

  /**
   * Create video clip from start to end time
   */
  async createClip(inputPath, outputPath, startTime, duration, options = {}) {
    console.log(`✂️ Creating clip: ${startTime}s for ${duration}s...`)
    
    await fs.ensureDir(path.dirname(outputPath))
    
    return new Promise((resolve, reject) => {
      const command = ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        
      // Video codec options
      if (options.videoCodec) {
        command.videoCodec(options.videoCodec)
      } else {
        command.videoCodec('libx264')
      }
      
      // Audio codec options
      if (options.audioCodec) {
        command.audioCodec(options.audioCodec)
      } else {
        command.audioCodec('aac')
      }
      
      // Quality options
      if (options.videoBitrate) {
        command.videoBitrate(options.videoBitrate)
      }
      
      if (options.audioBitrate) {
        command.audioBitrate(options.audioBitrate)
      }
      
      // Resolution options
      if (options.width && options.height) {
        command.size(`${options.width}x${options.height}`)
      }
      
      // Additional output options
      if (options.outputOptions) {
        command.outputOptions(options.outputOptions)
      }
      
      command
        .output(outputPath)
        .on('end', () => {
          console.log('   ✅ Clip creation complete!')
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('   ❌ Clip creation failed:', err.message)
          reject(err)
        })
        .on('progress', (progress) => {
          const percent = Math.round(progress.percent || 0)
          console.log(`   📊 Clip progress: ${percent}%`)
          
          // Report progress to callback if provided
          if (options.onProgress && typeof options.onProgress === 'function') {
            options.onProgress(percent)
          }
        })
        .run()
    })
  }

  /**
   * Crop video to specified dimensions and position
   */
  async cropVideo(inputPath, outputPath, cropOptions, processingOptions = {}) {
    console.log('🖼️ Cropping video...')
    
    const { x, y, width, height } = cropOptions
    
    await fs.ensureDir(path.dirname(outputPath))
    
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .videoFilters(`crop=${width}:${height}:${x}:${y}`)
        .videoCodec(processingOptions.videoCodec || 'libx264')
        .audioCodec(processingOptions.audioCodec || 'aac')
        .output(outputPath)
        .on('end', () => {
          console.log('   ✅ Video crop complete!')
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('   ❌ Video crop failed:', err.message)
          reject(err)
        })
        .on('progress', (progress) => {
          const percent = Math.round(progress.percent || 0)
          console.log(`   📊 Crop progress: ${percent}%`)
          
          if (processingOptions.onProgress) {
            processingOptions.onProgress(percent)
          }
        })
        .run()
    })
  }

  /**
   * Analyze audio levels for detecting audio intensity
   */
  async analyzeAudioLevels(videoPath) {
    console.log('🔊 Analyzing audio levels...')
    
    return new Promise((resolve, reject) => {
      const audioData = []
      
      ffmpeg(videoPath)
        .audioFilters('volumedetect')
        .format('null')
        .output('-')
        .on('stderr', (stderrLine) => {
          // Parse volumedetect output
          if (stderrLine.includes('mean_volume:')) {
            const match = stderrLine.match(/mean_volume:\s*([-\d.]+)\s*dB/)
            if (match) {
              audioData.push(parseFloat(match[1]))
            }
          }
          
          if (stderrLine.includes('max_volume:')) {
            const match = stderrLine.match(/max_volume:\s*([-\d.]+)\s*dB/)
            if (match) {
              audioData.push(parseFloat(match[1]))
            }
          }
        })
        .on('end', () => {
          console.log('   ✅ Audio level analysis complete!')
          resolve(audioData.length > 0 ? audioData : [-30, -20]) // Default values
        })
        .on('error', (err) => {
          console.warn('   ⚠️ Audio analysis failed:', err.message)
          resolve([-30, -20]) // Default quiet levels
        })
        .run()
    })
  }

  /**
   * Detect scene changes in video
   */
  async detectScenes(videoPath, threshold = 0.3) {
    console.log('🎬 Detecting scene changes...')
    
    return new Promise((resolve, reject) => {
      const scenes = []
      
      ffmpeg(videoPath)
        .videoFilters(`select=gt(scene,${threshold})`)
        .format('null')
        .output('-')
        .on('stderr', (stderrLine) => {
          // Parse scene detection output
          const sceneMatch = stderrLine.match(/pts_time:([\d.]+)/)
          if (sceneMatch) {
            scenes.push(parseFloat(sceneMatch[1]))
          }
        })
        .on('end', () => {
          console.log(`   ✅ Scene detection complete! Found ${scenes.length} scene changes`)
          resolve(scenes)
        })
        .on('error', (err) => {
          console.warn('   ⚠️ Scene detection failed:', err.message)
          resolve([]) // Return empty array if fails
        })
        .run()
    })
  }

  /**
   * Detect silence periods in audio
   */
  async detectSilence(videoPath, silenceThreshold = -30, minSilenceDuration = 1.0) {
    console.log('🔇 Detecting silence periods...')
    
    return new Promise((resolve, reject) => {
      const silencePeriods = []
      
      ffmpeg(videoPath)
        .audioFilters(`silencedetect=noise=${silenceThreshold}dB:duration=${minSilenceDuration}`)
        .format('null')
        .output('-')
        .on('stderr', (stderrLine) => {
          // Parse silence detection output
          const silenceStartMatch = stderrLine.match(/silence_start:\s*([\d.]+)/)
          const silenceEndMatch = stderrLine.match(/silence_end:\s*([\d.]+)/)
          
          if (silenceStartMatch) {
            const startTime = parseFloat(silenceStartMatch[1])
            silencePeriods.push({ type: 'start', time: startTime })
          }
          
          if (silenceEndMatch) {
            const endTime = parseFloat(silenceEndMatch[1])
            silencePeriods.push({ type: 'end', time: endTime })
          }
        })
        .on('end', () => {
          // Convert to silence ranges
          const silenceRanges = []
          for (let i = 0; i < silencePeriods.length - 1; i += 2) {
            if (silencePeriods[i]?.type === 'start' && silencePeriods[i + 1]?.type === 'end') {
              silenceRanges.push({
                start: silencePeriods[i].time,
                end: silencePeriods[i + 1].time,
                duration: silencePeriods[i + 1].time - silencePeriods[i].time
              })
            }
          }
          
          console.log(`   ✅ Silence detection complete! Found ${silenceRanges.length} silence periods`)
          resolve(silenceRanges)
        })
        .on('error', (err) => {
          console.warn('   ⚠️ Silence detection failed:', err.message)
          resolve([]) // Return empty array if fails
        })
        .run()
    })
  }

  /**
   * Extract audio from video
   */
  async extractAudio(videoPath, outputPath, options = {}) {
    console.log('🎵 Extracting audio from video...')
    
    await fs.ensureDir(path.dirname(outputPath))
    
    return new Promise((resolve, reject) => {
      const command = ffmpeg(videoPath)
      
      // Audio format options
      if (options.format) {
        command.toFormat(options.format)
      } else {
        command.toFormat('wav')
      }
      
      if (options.audioChannels) {
        command.audioChannels(options.audioChannels)
      } else {
        command.audioChannels(1) // Mono for speech processing
      }
      
      if (options.audioFrequency) {
        command.audioFrequency(options.audioFrequency)
      } else {
        command.audioFrequency(16000) // Good for speech recognition
      }
      
      if (options.audioBitrate) {
        command.audioBitrate(options.audioBitrate)
      } else {
        command.audioBitrate('128k')
      }
      
      command
        .output(outputPath)
        .on('end', () => {
          console.log('   ✅ Audio extraction complete!')
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('   ❌ Audio extraction failed:', err.message)
          reject(err)
        })
        .on('progress', (progress) => {
          const percent = Math.round(progress.percent || 0)
          console.log(`   📊 Audio extraction progress: ${percent}%`)
          
          if (options.onProgress) {
            options.onProgress(percent)
          }
        })
        .run()
    })
  }

  /**
   * Generate video thumbnail
   */
  async generateThumbnail(videoPath, outputPath, options = {}) {
    console.log('🖼️ Generating video thumbnail...')
    
    const timestamp = options.timestamp || '00:00:01'
    const size = options.size || '320x240'
    
    await fs.ensureDir(path.dirname(outputPath))
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .size(size)
        .output(outputPath)
        .on('end', () => {
          console.log('   ✅ Thumbnail generation complete!')
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('   ❌ Thumbnail generation failed:', err.message)
          reject(err)
        })
        .run()
    })
  }

  /**
   * Test FFmpeg installation and capabilities
   */
  async testFFmpeg() {
    console.log('🧪 Testing FFmpeg installation...')
    
    try {
      // Test basic ffprobe functionality
      return new Promise((resolve, reject) => {
        const testTimeout = setTimeout(() => {
          reject(new Error('FFmpeg test timeout'))
        }, 10000)
        
        ffmpeg()
          .input('color=black:size=320x240:duration=1')
          .inputFormat('lavfi')
          .frames(1)
          .format('null')
          .output('-')
          .on('end', () => {
            clearTimeout(testTimeout)
            console.log('   ✅ FFmpeg test successful!')
            resolve({
              success: true,
              message: 'FFmpeg is properly installed and working'
            })
          })
          .on('error', (err) => {
            clearTimeout(testTimeout)
            console.error('   ❌ FFmpeg test failed:', err.message)
            resolve({
              success: false,
              error: err.message
            })
          })
          .run()
      })
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get service capabilities and information
   */
  async getServiceInfo() {
    console.log('ℹ️ Getting video service information...')
    
    try {
      const ffmpegTest = await this.testFFmpeg()
      
      return {
        service: 'video-processing',
        ffmpegTest,
        capabilities: [
          'Video information extraction',
          'Video clipping and trimming',
          'Video cropping and resizing',
          'Audio extraction',
          'Frame extraction',
          'Scene change detection',
          'Silence detection',
          'Audio level analysis',
          'Thumbnail generation'
        ],
        supportedFormats: {
          video: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'],
          audio: ['mp3', 'wav', 'aac', 'ogg', 'flac'],
          image: ['jpg', 'png', 'bmp', 'tiff']
        }
      }
      
    } catch (error) {
      return {
        service: 'video-processing',
        error: error.message,
        ffmpegTest: { success: false, error: error.message }
      }
    }
  }
}

module.exports = VideoProcessingService 