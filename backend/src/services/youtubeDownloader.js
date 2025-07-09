const youtubeDl = require('youtube-dl-exec')
const path = require('path')
const fs = require('fs-extra')
const { v4: uuidv4 } = require('uuid')

class YouTubeDownloader {
  /**
   * Get available formats for a YouTube video
   */
  async getAvailableFormats(url) {
    try {
      if (!this.isValidYouTubeUrl(url)) {
        throw new Error('Invalid YouTube URL')
      }
      
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noDownload: true
      })
      
      console.log('Total formats found:', info.formats.length)
      
      // Get all video formats (including video-only streams)
      const videoFormats = info.formats
        .filter(format => {
          // Include formats with video codec (both combined and video-only)
          return format.vcodec && format.vcodec !== 'none' && format.height
        })
        .map(format => ({
          format_id: format.format_id,
          ext: format.ext,
          width: format.width,
          height: format.height,
          resolution: `${format.width}x${format.height}`,
          fps: format.fps,
          filesize: format.filesize,
          quality: format.format_note || format.quality,
          vcodec: format.vcodec,
          acodec: format.acodec || 'separate', // Mark if audio is separate
          hasAudio: format.acodec && format.acodec !== 'none',
          qualityLabel: this.getQualityLabel(format.height)
        }))
        .filter(format => format.height >= 240) // Filter out very low quality
      
      console.log('Filtered video formats:', videoFormats.length)
      
      // Get unique resolutions (sorted by quality, highest first)
      const resolutionMap = new Map()
      videoFormats.forEach(format => {
        const key = format.resolution
        if (!resolutionMap.has(key) || format.hasAudio) {
          // Prefer formats with audio, but include video-only if no audio version exists
          resolutionMap.set(key, format)
        }
      })
      
      const resolutions = Array.from(resolutionMap.values())
        .sort((a, b) => b.height - a.height) // Highest first
        .map(format => ({
          value: format.resolution,
          label: `${format.resolution} (${format.qualityLabel})`,
          height: format.height
        }))

      // Get unique file extensions
      const extensions = [...new Set(videoFormats.map(f => f.ext))]
        .filter(ext => ['mp4', 'webm', 'mkv'].includes(ext)) // Prioritize common formats
        .sort((a, b) => {
          const priority = { mp4: 3, webm: 2, mkv: 1 }
          return (priority[b] || 0) - (priority[a] || 0)
        })

      // Get unique frame rates (sorted highest first)
      const frameRates = [...new Set(videoFormats.map(f => f.fps).filter(fps => fps && fps > 0))]
        .sort((a, b) => b - a)
      
      // Add common frame rates if not present
      const commonFps = [60, 30, 25, 24]
      commonFps.forEach(fps => {
        if (!frameRates.includes(fps)) {
          frameRates.push(fps)
        }
      })
      frameRates.sort((a, b) => b - a)

      console.log('Available resolutions:', resolutions.map(r => r.label))
      console.log('Available extensions:', extensions)
      console.log('Available frame rates:', frameRates)

      return {
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        allFormats: videoFormats, // Keep all formats for debugging
        resolutions: resolutions,
        extensions: extensions,
        frameRates: frameRates
      }
      
    } catch (error) {
      console.error('Error getting formats:', error)
      throw new Error(`Failed to get video formats: ${error.message}`)
    }
  }

  /**
   * Get quality label for height
   */
  getQualityLabel(height) {
    if (height >= 2160) return '4K'
    if (height >= 1440) return '1440p'
    if (height >= 1080) return 'Full HD'
    if (height >= 720) return 'HD'
    if (height >= 480) return '480p'
    if (height >= 360) return '360p'
    if (height >= 240) return '240p'
    return 'Low'
  }

  /**
   * Download video from YouTube URL with specific format options
   */
  async downloadVideo(url, outputDir, options = {}, progressCallback = null) {
    try {
      console.log('Starting YouTube download for:', url)
      console.log('Download options:', options)
      
      // Validate YouTube URL
      if (!this.isValidYouTubeUrl(url)) {
        throw new Error('Invalid YouTube URL')
      }
      
      // Generate unique filename
      const videoId = uuidv4()
      const filename = `youtube_${videoId}.%(ext)s`
      const outputPath = path.join(outputDir, filename)
      
      // Build format string based on user preferences
      let formatString = 'best[height<=1080]'
      
      if (options.resolution || options.extension || options.fps) {
        const filters = []
        
        if (options.resolution) {
          const height = options.resolution.split('x')[1]
          filters.push(`height<=${height}`)
        }
        
        if (options.extension) {
          filters.push(`ext=${options.extension}`)
        }
        
        if (options.fps) {
          filters.push(`fps<=${options.fps}`)
        }
        
        // For high quality downloads, use format selection that merges video and audio
        // YouTube often separates high-quality video and audio streams
        if (filters.length > 0) {
          formatString = `bestvideo[${filters.join('][')}]+bestaudio/best[${filters.join('][')}]/best`
        } else {
          formatString = 'bestvideo+bestaudio/best'
        }
      } else {
        // Default to best quality with merged audio
        formatString = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best'
      }
      
      console.log('Using format string:', formatString);
      
      // Get video info first to estimate file size
      let estimatedSize = null;
      try {
        const info = await this.getVideoInfo(url);
        // Rough estimation: 1MB per minute for 720p, 2MB per minute for 1080p
        const qualityMultiplier = options.resolution?.includes('1080') ? 2 : 1;
        estimatedSize = info.duration * qualityMultiplier * 1024 * 1024; // bytes
      } catch (e) {
        console.warn('Could not get video info for size estimation');
      }
      
      try {
        // Download video
        if (progressCallback) {
          progressCallback({
            progress: 0,
            downloadedBytes: 0,
            totalSize: estimatedSize,
            downloadedFormatted: '0 MB',
            totalFormatted: `${Math.round(estimatedSize / (1024 * 1024))} MB`,
            speed: '0 MB/s'
          });
        }

        await youtubeDl(url, {
          output: outputPath,
          format: formatString,
          mergeOutputFormat: options.extension || 'mp4'
        });

        // Find the actual downloaded file
        const files = await fs.readdir(outputDir);
        const downloadedFile = files.find(file => 
          file.startsWith(`youtube_${videoId}`) && 
          (file.endsWith('.mp4') || file.endsWith('.webm') || file.endsWith('.mkv') || file.endsWith('.avi'))
        );
        
        if (!downloadedFile) {
          throw new Error('Downloaded file not found');
        }
        
        const finalPath = path.join(outputDir, downloadedFile);
        const stats = await fs.stat(finalPath);
        
        console.log('YouTube download completed:', downloadedFile);

        // Send final progress
        if (progressCallback) {
          progressCallback({
            progress: 100,
            downloadedBytes: stats.size,
            totalSize: stats.size,
            downloadedFormatted: `${Math.round(stats.size / (1024 * 1024))} MB`,
            totalFormatted: `${Math.round(stats.size / (1024 * 1024))} MB`,
            speed: '0 MB/s'
          });
        }
        
        return {
          success: true,
          filename: downloadedFile,
          path: finalPath,
          size: stats.size,
          originalUrl: url,
          selectedOptions: options
        };

      } catch (error) {
        console.error('YouTube download error:', error);
        throw new Error(`Failed to download YouTube video: ${error.message}`);
      }
    } catch (error) {
      console.error('Error in downloadVideo:', error);
      throw error;
    }
  }
  
  /**
   * Convert file size to bytes
   */
  convertToBytes(size, unit) {
    const units = {
      'B': 1,
      'KB': 1024,
      'KiB': 1024,
      'MB': 1024 * 1024,
      'MiB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'GiB': 1024 * 1024 * 1024
    }
    return size * (units[unit] || 1)
  }
  
  /**
   * Get video information without downloading
   */
  async getVideoInfo(url) {
    try {
      if (!this.isValidYouTubeUrl(url)) {
        throw new Error('Invalid YouTube URL')
      }
      
      const info = await youtubeDl(url, {
        dumpSingleJson: true,
        noDownload: true,
        noWarnings: true
      })
      
      return {
        title: info.title,
        description: info.description,
        duration: info.duration,
        uploader: info.uploader,
        uploadDate: info.upload_date,
        viewCount: info.view_count,
        thumbnail: info.thumbnail,
        formats: info.formats ? info.formats.length : 0,
        url: info.webpage_url
      }
      
    } catch (error) {
      console.error('YouTube info error:', error)
      throw new Error(`Failed to get YouTube video info: ${error.message}`)
    }
  }
  
  /**
   * Validate YouTube URL
   */
  isValidYouTubeUrl(url) {
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/
    return youtubeRegex.test(url)
  }
  
  /**
   * Extract video ID from YouTube URL
   */
  extractVideoId(url) {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|m\.youtube\.com\/watch\?v=)([a-zA-Z0-9_-]+)/)
    return match ? match[1] : null
  }
}

module.exports = new YouTubeDownloader() 