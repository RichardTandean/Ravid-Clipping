const ffmpeg = require('fluent-ffmpeg')
const path = require('path')

// Configure FFmpeg paths for macOS with Homebrew
ffmpeg.setFfmpegPath('/opt/homebrew/bin/ffmpeg')
ffmpeg.setFfprobePath('/opt/homebrew/bin/ffprobe')

class VideoProcessor {
  /**
   * Get video information like duration, resolution, etc.
   */
  async getVideoInfo(videoPath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err)
          return
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video')
        const audioStream = metadata.streams.find(s => s.codec_type === 'audio')

        resolve({
          duration: metadata.format.duration,
          size: metadata.format.size,
          bitRate: metadata.format.bit_rate,
          format: metadata.format.format_name,
          video: videoStream ? {
            codec: videoStream.codec_name,
            width: videoStream.width,
            height: videoStream.height,
            frameRate: eval(videoStream.r_frame_rate),
            aspectRatio: `${videoStream.width}:${videoStream.height}`
          } : null,
          audio: audioStream ? {
            codec: audioStream.codec_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels
          } : null
        })
      })
    })
  }

  /**
   * Extract a frame from video at specific timestamp
   */
  async extractFrame(videoPath, timestamp, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .seekInput(timestamp)
        .frames(1)
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .run()
    })
  }

  /**
   * Extract audio levels for analyzing audio intensity
   */
  async analyzeAudioLevels(videoPath) {
    return new Promise((resolve, reject) => {
      const audioData = []
      
      ffmpeg(videoPath)
        .audioFilters('volumedetect')
        .format('null')
        .output('-')
        .on('stderr', (stderrLine) => {
          // Parse volumedetect output for audio level analysis
          if (stderrLine.includes('mean_volume:')) {
            const match = stderrLine.match(/mean_volume:\s*([-\d.]+)\s*dB/)
            if (match) {
              audioData.push(parseFloat(match[1]))
            }
          }
        })
        .on('end', () => {
          resolve(audioData.length > 0 ? audioData : [-30]) // Default quiet level
        })
        .on('error', reject)
        .run()
    })
  }

  /**
   * Detect scene changes in video
   */
  async detectScenes(videoPath) {
    return new Promise((resolve, reject) => {
      const scenes = []
      
      ffmpeg(videoPath)
        .videoFilters('select=gt(scene,0.3)')
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
          resolve(scenes)
        })
        .on('error', (err) => {
          // If scene detection fails, return empty array
          console.warn('Scene detection failed:', err.message)
          resolve([])
        })
        .run()
    })
  }

  /**
   * Create video clip from start to end time
   */
  async createClip(inputPath, outputPath, startTime, duration, onProgress) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .seekInput(startTime)
        .duration(duration)
        .videoCodec('libx264')
        .audioCodec('aac')
        // Preserve original aspect ratio and resolution
        .output(outputPath)
        .on('end', () => resolve(outputPath))
        .on('error', reject)
        .on('progress', (progress) => {
          const percent = Math.round(progress.percent || 0)
          console.log(`Processing clip: ${percent}% done`)
          
          // Report progress to callback if provided
          if (onProgress && typeof onProgress === 'function') {
            onProgress(percent)
          }
        })
        .run()
    })
  }

  /**
   * Detect silence periods in audio (where speech likely ends)
   */
  async detectSilence(videoPath, silenceThreshold = -30, minSilenceDuration = 1.0) {
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
          
          console.log(`Detected ${silenceRanges.length} silence periods`)
          resolve(silenceRanges)
        })
        .on('error', (err) => {
          console.warn('Silence detection failed:', err.message)
          resolve([]) // Return empty array if fails
        })
        .run()
    })
  }

  /**
   * Crop video to specified dimensions and position
   */
  async cropVideo(inputPath, outputPath, cropOptions, onProgress) {
    return new Promise((resolve, reject) => {
      const { x, y, width, height } = cropOptions
      
      console.log(`Cropping video: ${width}x${height} at position (${x}, ${y})`)
      
      ffmpeg(inputPath)
        .videoFilters(`crop=${width}:${height}:${x}:${y}`)
        .videoCodec('libx264')
        .audioCodec('aac')
        // Preserve quality while ensuring compatibility
        .outputOptions([
          '-preset', 'medium',
          '-crf', '23',
          '-movflags', '+faststart'
        ])
        .output(outputPath)
        .on('end', () => {
          console.log('Video cropping completed successfully')
          resolve(outputPath)
        })
        .on('error', (err) => {
          console.error('Video cropping failed:', err)
          reject(err)
        })
        .on('progress', (progress) => {
          const percent = Math.round(progress.percent || 0)
          console.log(`Cropping progress: ${percent}%`)
          
          // Report progress to callback if provided
          if (onProgress && typeof onProgress === 'function') {
            onProgress(percent)
          }
        })
        .run()
    })
  }
}

module.exports = new VideoProcessor() 