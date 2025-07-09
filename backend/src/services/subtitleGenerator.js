const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const fs = require('fs-extra')
const { v4: uuidv4 } = require('uuid')

class SubtitleGenerator {
  constructor() {
    this.supportedLanguages = {
      'auto': 'Auto-detect',
      'en': 'English', 
      'id': 'Bahasa Indonesia',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'hi': 'Hindi',
      'th': 'Thai',
      'vi': 'Vietnamese'
    }

    this.stylingPresets = {
      // === MODERN DESIGN PRESETS ===
      'bold-impact': {
        position: 'bottom',
        fontSize: 36,
        fontWeight: 'bold',
        textColor: '#FFFFFF',
        backgroundColor: 'rgba(255,215,0,0.9)', // Golden yellow background
        outline: '3px black',
        maxLines: 1,
        padding: 25,
        margin: 80,
        socialMediaStyle: true,
        maxWordsPerSubtitle: 1,
        emphasizeKeyWords: true,
        karaokeEnabled: true,
        activeWordStyle: {
          fontFamily: 'Arial',
          fontSize: 36,
          fontWeight: 'bold',
          color: '#000000', // Black text on yellow
          backgroundColor: '#FFD700',
          borderColor: '#FFFFFF',
          borderWidth: 3
        },
        inactiveWordStyle: {
          fontFamily: 'Arial',
          fontSize: 32,
          fontWeight: 'normal',
          color: '#666666',
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderColor: 'transparent',
          borderWidth: 0
        }
      },
      'clean-minimal': {
        position: 'bottom',
        fontSize: 28,
        fontWeight: 'normal',
        textColor: '#FFFFFF',
        backgroundColor: 'rgba(0,0,0,0.7)',
        outline: '1px gray',
        maxLines: 1,
        padding: 20,
        margin: 60,
        socialMediaStyle: true,
        maxWordsPerSubtitle: 2,
        emphasizeKeyWords: false,
        karaokeEnabled: true,
        activeWordStyle: {
          fontFamily: 'Helvetica',
          fontSize: 28,
          fontWeight: 'bold',
          color: '#FFFFFF',
          backgroundColor: 'rgba(0,122,255,0.8)', // Blue highlight
          borderColor: 'transparent',
          borderWidth: 0
        },
        inactiveWordStyle: {
          fontFamily: 'Helvetica',
          fontSize: 24,
          fontWeight: 'normal',
          color: '#CCCCCC',
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0
        }
      },
      'vibrant-pop': {
        position: 'center',
        fontSize: 32,
        fontWeight: 'bold',
        textColor: '#FFFFFF',
        backgroundColor: 'rgba(255,69,58,0.9)', // Vibrant red
        outline: '2px white',
        maxLines: 1,
        padding: 22,
        margin: 50,
        socialMediaStyle: true,
        maxWordsPerSubtitle: 1,
        emphasizeKeyWords: true,
        karaokeEnabled: true,
        activeWordStyle: {
          fontFamily: 'Impact',
          fontSize: 32,
          fontWeight: 'bold',
          color: '#FFFFFF',
          backgroundColor: '#FF453A',
          borderColor: '#FFD700',
          borderWidth: 2
        },
        inactiveWordStyle: {
          fontFamily: 'Impact',
          fontSize: 28,
          fontWeight: 'normal',
          color: '#FFB3B3',
          backgroundColor: 'rgba(0,0,0,0.2)',
          borderColor: 'transparent',
          borderWidth: 0
        }
      },
      'elegant-serif': {
        position: 'bottom',
        fontSize: 26,
        fontWeight: 'normal',
        textColor: '#F5F5F5',
        backgroundColor: 'rgba(0,0,0,0.6)',
        outline: '1px #888888',
        maxLines: 1,
        padding: 18,
        margin: 70,
        socialMediaStyle: true,
        maxWordsPerSubtitle: 3,
        emphasizeKeyWords: false,
        karaokeEnabled: true,
        activeWordStyle: {
          fontFamily: 'Georgia',
          fontSize: 26,
          fontWeight: 'bold',
          color: '#F5F5F5',
          backgroundColor: 'rgba(139,69,19,0.8)', // Elegant brown
          borderColor: 'transparent',
          borderWidth: 0
        },
        inactiveWordStyle: {
          fontFamily: 'Georgia',
          fontSize: 22,
          fontWeight: 'normal',
          color: '#AAAAAA',
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0
        }
      },
      'neon-glow': {
        position: 'center',
        fontSize: 30,
        fontWeight: 'bold',
        textColor: '#00FFFF',
        backgroundColor: 'rgba(0,0,0,0.8)',
        outline: '2px #00FFFF',
        maxLines: 1,
        padding: 20,
        margin: 40,
        socialMediaStyle: true,
        maxWordsPerSubtitle: 2,
        emphasizeKeyWords: true,
        karaokeEnabled: true,
        activeWordStyle: {
          fontFamily: 'Arial',
          fontSize: 30,
          fontWeight: 'bold',
          color: '#00FFFF', // Cyan
          backgroundColor: 'rgba(0,255,255,0.2)',
          borderColor: '#00FFFF',
          borderWidth: 2
        },
        inactiveWordStyle: {
          fontFamily: 'Arial',
          fontSize: 26,
          fontWeight: 'normal',
          color: '#4DFFFF',
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          borderWidth: 0
        }
      },
      'custom': {
        position: 'bottom',
        fontSize: 24,
        fontWeight: 'normal',
        backgroundColor: 'rgba(0,0,0,0.7)',
        textColor: '#FFFFFF',
        outline: '1px black',
        maxLines: 2,
        padding: 20,
        margin: 60,
        animation: 'none',
        socialMediaStyle: false, // Traditional full sentence style
        maxWordsPerSubtitle: 10,
        emphasizeKeyWords: false
      }
    }
  }

  /**
   * Generate SRT subtitle file from transcript
   */
  async generateSRT(transcript, outputPath, options = {}) {
    console.log('📝 Generating SRT subtitle file...')
    
    const { 
      maxCharsPerLine = 42,
      maxLinesPerSubtitle = 2,
      minDisplayTime = 1.0,
      maxDisplayTime = 6.0,
      language = 'auto'
    } = options

    let srtContent = ''
    let subtitleIndex = 1

    for (const segment of transcript.segments) {
      // Clean and format text
      const cleanText = this.cleanTextForSubtitles(segment.text, language)
      
      // Split long text into multiple subtitles
      const subtitleChunks = this.splitTextIntoChunks(cleanText, maxCharsPerLine, maxLinesPerSubtitle)
      
      const chunkDuration = Math.max(minDisplayTime, Math.min(maxDisplayTime, segment.duration / subtitleChunks.length))
      
      for (let i = 0; i < subtitleChunks.length; i++) {
        const startTime = segment.start + (i * chunkDuration)
        const endTime = Math.min(segment.end, startTime + chunkDuration)
        
        srtContent += `${subtitleIndex}\n`
        srtContent += `${this.formatSRTTime(startTime)} --> ${this.formatSRTTime(endTime)}\n`
        srtContent += `${subtitleChunks[i]}\n\n`
        
        subtitleIndex++
      }
    }

    await fs.writeFile(outputPath, srtContent, 'utf8')
    console.log(`✅ Generated SRT file: ${outputPath}`)
    
    return {
      success: true,
      filePath: outputPath,
      subtitleCount: subtitleIndex - 1,
      language: language,
      format: 'srt'
    }
  }

  /**
   * Generate VTT subtitle file from transcript
   */
  async generateVTT(transcript, outputPath, options = {}) {
    console.log('📝 Generating VTT subtitle file...')
    
    const srtResult = await this.generateSRT(transcript, outputPath.replace('.vtt', '.srt'), options)
    
    // Convert SRT to VTT
    const srtContent = await fs.readFile(outputPath.replace('.vtt', '.srt'), 'utf8')
    let vttContent = 'WEBVTT\n\n'
    
    // Convert SRT timestamps to VTT format
    vttContent += srtContent.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4')
    
    await fs.writeFile(outputPath, vttContent, 'utf8')
    
    // Clean up temporary SRT file
    await fs.remove(outputPath.replace('.vtt', '.srt'))
    
    console.log(`✅ Generated VTT file: ${outputPath}`)
    return { ...srtResult, format: 'vtt', filePath: outputPath }
  }

  /**
   * Burn subtitles directly into video with full styling control
   */
  async burnSubtitlesIntoVideo(videoPath, transcript, outputPath, styleOptions, onProgress) {
    console.log('🔥 Burning subtitles into video with simplified ASS styling...')
    
    console.log('styleOptions received: ', styleOptions)
    
    // Check if social media style is requested
    const isSocialMediaStyle = styleOptions.socialMediaStyle === true
    
    // Convert simplified options to the format expected by ASS generation
    const finalStyle = {
      karaokeEnabled: styleOptions.karaokeEnabled !== false, // Default to true
      fontname: styleOptions.fontname || 'Arial',
      fontsize: styleOptions.fontsize || 24,
      normalColour: styleOptions.primaryColour || '#FFFFFF',
      highlightColour: styleOptions.secondaryColour || '#FFD700',
      outlineColour: styleOptions.outlineColour || '#000000',
      backColour: styleOptions.backColour || 'rgba(0,0,0,0.7)',
      bold: styleOptions.bold ? -1 : 0, // Convert boolean to ASS format
      italic: styleOptions.italic ? -1 : 0, // Convert boolean to ASS format
      borderStyle: styleOptions.borderStyle || 1,
      outline: styleOptions.outline || 2,
      shadow: styleOptions.shadow || 1,
      alignment: styleOptions.alignment || 2,
      marginL: styleOptions.marginL || 20,
      marginR: styleOptions.marginR || 20,
      marginV: styleOptions.marginV || 60,
      // Social media specific options
      socialMediaStyle: isSocialMediaStyle,
      maxWordsPerSubtitle: styleOptions.maxWordsPerSubtitle || 2,
      emphasizeKeyWords: styleOptions.emphasizeKeyWords !== false,
      position: styleOptions.position || 'bottom'
    }
    
    console.log(`🎨 Using style preset: ${styleOptions.preset || 'custom'}`)
    console.log(`📱 Social media style: ${isSocialMediaStyle ? 'ENABLED' : 'DISABLED'}`)
    console.log('🎨 Final styling options:', finalStyle)

    return new Promise(async (resolve, reject) => {
      try {
        // Create temporary subtitle file - ASS for karaoke, SRT for regular
        const path = require('path')
        const fs = require('fs')
        const tempDir = path.dirname(outputPath)
        let useKaraoke = finalStyle.karaokeEnabled === true
        let fileExtension = useKaraoke ? 'ass' : 'srt'
        let tempSubtitlePath = path.join(tempDir, `temp_subtitles_${Date.now()}.${fileExtension}`)
         
        console.log(`🎤 Karaoke mode: ${useKaraoke ? 'ENABLED' : 'DISABLED'}`)
        console.log(`📁 Using ${fileExtension.toUpperCase()} format for subtitles`)
        console.log(`📁 Temp subtitle path: ${tempSubtitlePath}`)
        console.log(`📁 Output video path: ${outputPath}`)
        
        // Process transcript based on style mode
        let processedTranscript = transcript
        
        // Convert to social media style if requested
        if (isSocialMediaStyle) {
          console.log('📱 Converting transcript to social media style...')
          processedTranscript = this.createSocialMediaStyleSubtitles(transcript, {
            maxWordsPerSubtitle: finalStyle.maxWordsPerSubtitle,
            emphasizeKeyWords: finalStyle.emphasizeKeyWords,
            minWordDuration: 0.5,
            maxWordDuration: 2.0
          })
          console.log(`📱 Converted to ${processedTranscript.segments.length} social media subtitle segments`)
        } else {
          console.log('📝 Using standard full-sentence subtitles')
        }
        
        console.log(`📝 Using ${processedTranscript.segments.length} transcript segments for subtitles`)

        // Generate subtitle file based on karaoke setting
        try {
          if (useKaraoke) {
            const assOptions = {
              fontsize: finalStyle.fontsize,
              fontname: finalStyle.fontname,
              primaryColour: finalStyle.highlightColour,
              secondaryColour: finalStyle.normalColour,
              outlineColour: finalStyle.outlineColour,
              backColour: finalStyle.backColour,
              bold: finalStyle.bold,
              italic: finalStyle.italic,
              borderStyle: finalStyle.borderStyle,
              outline: finalStyle.outline,
              shadow: finalStyle.shadow,
              alignment: finalStyle.alignment,
              marginL: finalStyle.marginL,
              marginR: finalStyle.marginR,
              marginV: finalStyle.marginV
            }
            await this.generateASS(processedTranscript, tempSubtitlePath, assOptions)
          } else {
            console.log('📝 Generating SRT subtitles...')
            await this.generateSRT(processedTranscript, tempSubtitlePath, {
              maxCharsPerLine: 40,
              maxLines: 2
            })
          }
        } catch (subtitleError) {
          console.error('❌ Failed to generate subtitle file:', subtitleError)
          
          // Fallback to basic SRT if ASS generation fails
          if (useKaraoke) {
            console.log('🔄 Falling back to SRT subtitle generation...')
            const fallbackPath = tempSubtitlePath.replace('.ass', '.srt')
            await this.generateSRT(processedTranscript, fallbackPath, {
              maxCharsPerLine: 40,
              maxLines: 2
            })
            // Update variables for the fallback
            tempSubtitlePath = fallbackPath
            useKaraoke = false
            fileExtension = 'srt'
            console.log('✅ Fallback SRT subtitles generated')
          } else {
            throw subtitleError
          }
        }
         
        console.log('📝 Created temporary subtitle file:', tempSubtitlePath)
        
        // Small delay to ensure file is fully written to disk
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // For debugging: save a copy of the subtitle file that won't be deleted
        if (process.env.NODE_ENV === 'development') {
          try {
            const debugPath = path.join(tempDir, `debug_subtitles_${Date.now()}.${fileExtension}`)
            await fs.copy(tempSubtitlePath, debugPath)
            console.log(`🐛 Debug subtitle file saved: ${debugPath}`)
          } catch (debugError) {
            console.warn('⚠️ Could not save debug subtitle file:', debugError.message)
          }
        }

        // Verify subtitle file exists before proceeding with simpler check
        console.log(`🔍 Checking if subtitle file exists: ${tempSubtitlePath}`)
        
        try {
          // Use Node.js built-in fs instead of fs-extra for this check
          const fs_native = require('fs')
          const stats = fs_native.statSync(tempSubtitlePath)
          console.log(`✅ Subtitle file verified: ${stats.size} bytes`)
        } catch (error) {
          console.error(`❌ Subtitle file verification failed: ${tempSubtitlePath}`)
          console.error(`❌ Error:`, error.message)
          
          // Try to list directory contents for debugging
          try {
            const dirContents = await fs.readdir(tempDir)
            console.log(`📁 Directory contents:`, dirContents.filter(f => f.includes('subtitle')))
          } catch (listError) {
            console.error(`❌ Could not list directory: ${listError.message}`)
          }
          
          throw new Error(`Subtitle file not accessible: ${error.message}`)
        }

        // Create subtitle filter for FFmpeg
        let subtitleFilter = ''
        const normalizedPath = tempSubtitlePath.replace(/\\/g, '/')
        
        if (useKaraoke) {
          // Use ASS filter for karaoke subtitles  
          console.log('🎬 Using ASS filter for karaoke subtitles')
          subtitleFilter = `ass='${normalizedPath}'`
        } else {
          // Use subtitles filter for regular subtitles with proper color format
          console.log('🎬 Using subtitles filter for regular subtitles')
          const primaryColor = this.convertColorToHex(finalStyle.normalColour).match(/.{2}/g).reverse().join('')
          const outlineColor = this.convertColorToHex(finalStyle.outlineColour).match(/.{2}/g).reverse().join('')
          
          subtitleFilter = `subtitles='${normalizedPath}':force_style='` +
            `Fontname=${finalStyle.fontname},` +
            `Fontsize=${finalStyle.fontsize},` +
            `PrimaryColour=&H${primaryColor},` +
            `OutlineColour=&H${outlineColor},` +
            `BackColour=&H80000000,` +
            `Outline=${finalStyle.outline},` +
            `Bold=${finalStyle.bold},` +
            `Italic=${finalStyle.italic},` +
            `BorderStyle=${finalStyle.borderStyle},` +
            `Shadow=${finalStyle.shadow},` +
            `MarginV=${finalStyle.marginV},` +
            `Alignment=${this.getAssAlignment(finalStyle.position)}'`
        }
        
        console.log(`🎬 FFmpeg filter: ${subtitleFilter}`)
        
        // Verify input video exists  
        try {
          const fs_native = require('fs')
          const videoStats = fs_native.statSync(videoPath)
          console.log(`✅ Input video found: ${videoStats.size} bytes`)
        } catch (error) {
          console.error(`❌ Input video not found: ${videoPath}`)
          throw new Error(`Input video file not found: ${error.message}`)
        }

        const ffmpegCommand = ffmpeg(videoPath)
          .videoFilter(subtitleFilter)
          .videoCodec('libx264')
          .audioCodec('copy') // Keep original audio
          .outputOptions([
            '-preset', 'medium',
            '-crf', '23',
            '-movflags', '+faststart' // Optimize for web/social media
          ])
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log('🚀 FFmpeg subtitle burning started')
            console.log('📋 Full command:', commandLine)
          })
          .on('progress', (progress) => {
            const percent = Math.round(progress.percent || 0)
            console.log(`🔥 Burning subtitles: ${percent}% done`)
            
            if (onProgress && typeof onProgress === 'function') {
              onProgress(percent)
            }
          })
          .on('stderr', (stderrLine) => {
            console.log('FFmpeg stderr:', stderrLine)
          })
          .on('end', async () => {
            console.log('✅ Subtitle burning completed successfully!')
            
            // Verify output file was created
            try {
              const fs_native = require('fs')
              const outputStats = fs_native.statSync(outputPath)
              console.log(`✅ Output video created: ${outputStats.size} bytes`)
            } catch (error) {
              console.error(`❌ Output video not found after processing: ${outputPath}`)
            }
            
            // Clean up temporary file
            try {
              const fs_native = require('fs')
              fs_native.unlinkSync(tempSubtitlePath)
              console.log('🗑️ Cleaned up temporary subtitle file')
            } catch (err) {
              console.warn('⚠️ Could not delete temporary subtitle file:', err.message)
            }
            
            resolve({
              success: true,
              outputPath: outputPath,
              style: finalStyle,
              subtitleCount: transcript.segments.length,
              karaokeEnabled: useKaraoke
            })
          })
          .on('error', async (error) => {
            console.error('❌ Subtitle burning failed:', error)
            console.error('❌ Error details:', {
              message: error.message,
              code: error.code,
              signal: error.signal,
              cmd: error.cmd
            })
            
            // Clean up temporary file on error
            try {
              const fs_native = require('fs')
              fs_native.unlinkSync(tempSubtitlePath)
              console.log('🗑️ Cleaned up temporary subtitle file after error')
            } catch (err) {
              console.warn('⚠️ Could not delete temporary subtitle file:', err.message)
            }
            
            reject(error)
          })

        ffmpegCommand.run()
      } catch (error) {
        console.error('❌ Error setting up subtitle burning:', error)
        reject(error)
      }
    })
  }

  /**
   * Create FFmpeg subtitle filter with advanced styling
   */
  createSubtitleFilter(transcript, style) {
    // Use a simpler approach with a single drawtext filter that changes text over time
    if (!transcript.segments || transcript.segments.length === 0) {
      return 'drawtext=text=""'
    }

    // Create a single drawtext filter with conditional text display
    const enableConditions = transcript.segments.map((segment, index) => {
      const escapedText = this.escapeTextForFFmpeg(segment.text)
      const startTime = segment.start.toFixed(2)
      const endTime = segment.end.toFixed(2)
      
      return `if(between(t,${startTime},${endTime}),'${escapedText}','')`
    }).join('+')
    
    // Calculate positioning
    let xPos, yPos
    switch (style.position) {
      case 'top':
        xPos = '(w-text_w)/2'
        yPos = style.margin || 60
        break
      case 'center':
        xPos = '(w-text_w)/2'
        yPos = '(h-text_h)/2'
        break
      case 'bottom':
      default:
        xPos = '(w-text_w)/2'
        yPos = `h-text_h-${style.margin || 60}`
        break
    }

    // Build a single, robust drawtext filter
    const drawTextParams = [
      `text=''`,  // Start with empty text, will be overridden by textfile
      `fontsize=${style.fontSize || 24}`,
      `fontcolor=${style.textColor || 'white'}`,
      `x=${xPos}`,
      `y=${yPos}`,
      `borderw=${this.extractBorderWidth(style.outline)}`,
      `bordercolor=${this.extractBorderColor(style.outline)}`,
      `box=1`,
      `boxcolor=${style.backgroundColor || 'black@0.5'}`,
      `boxborderw=${style.padding || 10}`
    ]

    // Use a simplified approach - create subtitle file instead
    return this.createSimpleSubtitleFilter(transcript, style)
  }

  /**
   * Create a simpler subtitle filter that works more reliably
   */
  createSimpleSubtitleFilter(transcript, style) {
    // Calculate positioning
    let xPos, yPos
    switch (style.position) {
      case 'top':
        xPos = '(w-text_w)/2'
        yPos = style.margin || 60
        break
      case 'center':
        xPos = '(w-text_w)/2'
        yPos = '(h-text_h)/2'
        break
      case 'bottom':
      default:
        xPos = '(w-text_w)/2'
        yPos = `h-text_h-${style.margin || 60}`
        break
    }

    // Create individual filters for each segment
    const filters = transcript.segments.map((segment, index) => {
      const escapedText = this.escapeTextForFFmpeg(segment.text)
      const startTime = segment.start.toFixed(2)
      const endTime = segment.end.toFixed(2)
      
      return `drawtext=text='${escapedText}':fontsize=${style.fontSize || 24}:fontcolor=${style.textColor || 'white'}:x=${xPos}:y=${yPos}:borderw=${this.extractBorderWidth(style.outline)}:bordercolor=${this.extractBorderColor(style.outline)}:box=1:boxcolor=${style.backgroundColor || 'black@0.5'}:boxborderw=${style.padding || 10}:enable='between(t,${startTime},${endTime})'`
    })

    return filters.join(',')
  }

  /**
   * Create an extremely simple and robust subtitle filter
   */
  createRobustSubtitleFilter(transcript, style) {
    if (!transcript.segments || transcript.segments.length === 0) {
      return 'drawtext=text=""'
    }

    // Calculate positioning - use simple numeric values
    let xPos = '(w-text_w)/2' // Center horizontally
    let yPos = 'h-100'
    
    switch (style.position) {
      case 'top':
        yPos = '100'
        break
      case 'center':
        yPos = '(h-text_h)/2'
        break
      case 'bottom':
      default:
        yPos = 'h-text_h-100'
        break
    }

    // For social media style, limit segments but include timing
    const maxSegments = style.socialMediaStyle ? 50 : 20 // More segments for social media
    const segments = transcript.segments.slice(0, maxSegments)
    
    // Create individual filters for each segment with proper timing
    const filters = segments.map((segment, index) => {
      const escapedText = this.escapeTextForFFmpeg(segment.text)
      const startTime = segment.start.toFixed(2)
      const endTime = segment.end.toFixed(2)
      
      const fontSize = style.fontSize || 24
      const textColor = style.textColor || 'white'
      const borderWidth = this.extractBorderWidth(style.outline || '2px black')
      const borderColor = this.extractBorderColor(style.outline || '2px black')
      const backgroundColor = style.backgroundColor || 'black@0.5'
      
      return `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${textColor}:x=${xPos}:y=${yPos}:borderw=${borderWidth}:bordercolor=${borderColor}:box=1:boxcolor=${backgroundColor}:enable='between(t,${startTime},${endTime})'`
    })

    return filters.join(',')
  }

  /**
   * Clean and format text for subtitles based on language
   */
  cleanTextForSubtitles(text, language) {
    // Remove extra whitespace
    let cleaned = text.trim().replace(/\s+/g, ' ')
    
    // Language-specific formatting
    switch (language) {
      case 'id':
        // Bahasa Indonesia specific formatting
        cleaned = this.formatIndonesianText(cleaned)
        break
      case 'en':
        // English specific formatting
        cleaned = this.formatEnglishText(cleaned)
        break
      case 'auto':
        // Auto-detect and format accordingly
        cleaned = this.formatMixedLanguageText(cleaned)
        break
    }
    
    return cleaned
  }

  /**
   * Convert transcript into social media style short key words/phrases
   */
  createSocialMediaStyleSubtitles(transcript, options = {}) {
    const {
      maxWordsPerSubtitle = 2,
      emphasizeKeyWords = true,
      minWordDuration = 0.5,
      maxWordDuration = 1.5
    } = options

    const socialMediaSegments = []

    // Check if we have word-level timestamps from Whisper
    if (transcript.words && transcript.words.length > 0) {
      console.log('🎯 Using precise word-level timestamps from Whisper')
      
      // Group words with precise timing
      for (let i = 0; i < transcript.words.length; i += maxWordsPerSubtitle) {
        const wordGroup = transcript.words.slice(i, i + maxWordsPerSubtitle)
        
        if (wordGroup.length > 0) {
          const startTime = wordGroup[0].start
          const endTime = wordGroup[wordGroup.length - 1].end
          const displayText = wordGroup.map(w => w.word).join(' ')
          
          // Make key words uppercase for emphasis
          const finalText = emphasizeKeyWords ? this.emphasizeKeyWords(displayText) : displayText

          socialMediaSegments.push({
            text: finalText,
            start: startTime,
            end: endTime,
            duration: endTime - startTime,
            wordCount: wordGroup.length,
            isKeyPhrase: this.isKeyPhrase(finalText),
            words: wordGroup // Include original word data
          })
        }
      }
    } else {
      console.log('⚠️ No word-level timestamps available, using estimated timing')
      
      // Fallback to estimated timing (original method)
      for (const segment of transcript.segments) {
        const words = segment.text.trim().split(/\s+/)
        const totalDuration = segment.end - segment.start
        const wordDuration = Math.max(minWordDuration, Math.min(maxWordDuration, totalDuration / words.length))

        // Group words into small chunks
        for (let i = 0; i < words.length; i += maxWordsPerSubtitle) {
          const wordGroup = words.slice(i, i + maxWordsPerSubtitle)
          const startTime = segment.start + (i * wordDuration)
          const endTime = Math.min(segment.end, startTime + (wordGroup.length * wordDuration))

          // Process words for social media style
          let displayText = wordGroup.join(' ')
          
          // Make key words uppercase for emphasis
          if (emphasizeKeyWords) {
            displayText = this.emphasizeKeyWords(displayText)
          }

          socialMediaSegments.push({
            text: displayText,
            start: startTime,
            end: endTime,
            duration: endTime - startTime,
            wordCount: wordGroup.length,
            isKeyPhrase: this.isKeyPhrase(displayText)
          })
        }
      }
    }

    return {
      ...transcript,
      segments: socialMediaSegments,
      style: 'social-media',
      totalWords: socialMediaSegments.length,
      usingWordTimestamps: transcript.words && transcript.words.length > 0
    }
  }

  /**
   * Emphasize key words by making them uppercase
   */
  emphasizeKeyWords(text) {
    // Key words to emphasize in Indonesian and English
    const keyWords = [
      // Indonesian
      'bilang', 'kata', 'gitu', 'banget', 'gimana', 'kenapa', 'bagus', 'jelek',
      'penting', 'bener', 'salah', 'harus', 'jangan', 'boleh', 'bisa', 'tidak',
      'iya', 'enggak', 'udah', 'belum', 'lagi', 'masih', 'sudah', 'mau',
      'nggak', 'gak', 'dong', 'sih', 'kok', 'deh', 'nih',
      
      // English  
      'amazing', 'awesome', 'crazy', 'insane', 'perfect', 'terrible', 'horrible',
      'important', 'necessary', 'must', 'should', 'need', 'want', 'love', 'hate',
      'yes', 'no', 'maybe', 'definitely', 'absolutely', 'never', 'always',
      'really', 'very', 'super', 'ultra', 'mega', 'best', 'worst',
      'wow', 'omg', 'damn', 'shit', 'fuck', 'hell', 'god'
    ]

    let emphasized = text
    
    keyWords.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi')
      emphasized = emphasized.replace(regex, word.toUpperCase())
    })

    return emphasized
  }

  /**
   * Check if a phrase contains key words that should be emphasized
   */
  isKeyPhrase(text) {
    const keyPhraseIndicators = [
      'bilang', 'kata', 'penting', 'harus', 'jangan', 'amazing', 'crazy',
      'must', 'need', 'important', 'wow', 'omg', 'really', 'very'
    ]
    
    const lowerText = text.toLowerCase()
    return keyPhraseIndicators.some(indicator => lowerText.includes(indicator))
  }

  /**
   * Format Indonesian text for better readability
   */
  formatIndonesianText(text) {
    // Add proper punctuation
    text = text.replace(/([.!?])([A-Z])/g, '$1 $2')
    
    // Common Indonesian abbreviations
    const indonesianReplacements = {
      'yg': 'yang',
      'dgn': 'dengan', 
      'utk': 'untuk',
      'krn': 'karena',
      'jd': 'jadi',
      'ga': 'tidak',
      'gak': 'tidak'
    }
    
    Object.entries(indonesianReplacements).forEach(([abbr, full]) => {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi')
      text = text.replace(regex, full)
    })
    
    return text
  }

  /**
   * Format English text for better readability
   */
  formatEnglishText(text) {
    // Capitalize first letter of sentences
    text = text.replace(/(^|[.!?]\s+)([a-z])/g, (match, p1, p2) => p1 + p2.toUpperCase())
    
    // Common contractions
    const contractions = {
      'dont': "don't",
      'wont': "won't", 
      'cant': "can't",
      'isnt': "isn't",
      'arent': "aren't"
    }
    
    Object.entries(contractions).forEach(([wrong, correct]) => {
      const regex = new RegExp(`\\b${wrong}\\b`, 'gi')
      text = text.replace(regex, correct)
    })
    
    return text
  }

  /**
   * Format mixed language text (Indonesian + English)
   */
  formatMixedLanguageText(text) {
    // Apply both Indonesian and English formatting
    text = this.formatIndonesianText(text)
    text = this.formatEnglishText(text)
    return text
  }

  /**
   * Split text into subtitle chunks
   */
  splitTextIntoChunks(text, maxCharsPerLine, maxLines) {
    const words = text.split(' ')
    const chunks = []
    let currentChunk = []
    let currentLineLength = 0
    let currentLines = 1

    for (const word of words) {
      const wordLength = word.length + 1 // +1 for space
      
      if (currentLineLength + wordLength > maxCharsPerLine) {
        if (currentLines < maxLines) {
          currentChunk.push('\n')
          currentLineLength = 0
          currentLines++
        } else {
          // Start new chunk
          chunks.push(currentChunk.join(' ').replace(/ \n /g, '\n').trim())
          currentChunk = []
          currentLineLength = 0
          currentLines = 1
        }
      }
      
      currentChunk.push(word)
      currentLineLength += wordLength
    }
    
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' ').replace(/ \n /g, '\n').trim())
    }
    
    return chunks
  }

  /**
   * Format time for SRT format (HH:MM:SS,mmm)
   */
  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const milliseconds = Math.floor((seconds % 1) * 1000)
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`
  }

  /**
   * Escape text for FFmpeg filters
   */
  escapeTextForFFmpeg(text) {
    if (!text) return ''
    
    return text
      .replace(/\\/g, '\\\\')    // Escape backslashes first
      .replace(/'/g, "\\'")      // Escape single quotes  
      .replace(/"/g, '\\"')      // Escape double quotes
      .replace(/:/g, '\\:')      // Escape colons
      .replace(/\n/g, ' ')       // Replace newlines with spaces for safety
      .replace(/\r/g, ' ')       // Replace carriage returns
      .replace(/\[/g, '\\[')     // Escape square brackets
      .replace(/\]/g, '\\]')     // Escape square brackets
      .replace(/\(/g, '\\(')     // Escape parentheses
      .replace(/\)/g, '\\)')     // Escape parentheses
      .replace(/%/g, '\\%')      // Escape percent signs
      .replace(/=/g, '\\=')      // Escape equals signs
      .replace(/;/g, '\\;')      // Escape semicolons
      .replace(/,/g, '\\,')      // Escape commas
      .replace(/\t/g, ' ')       // Replace tabs with spaces
      .replace(/\s+/g, ' ')      // Normalize multiple spaces
      .trim()                    // Remove leading/trailing whitespace
  }

  /**
   * Extract border width from outline style
   */
  extractBorderWidth(outline) {
    const match = outline.match(/(\d+)px/)
    return match ? match[1] : '2'
  }

  /**
   * Extract border color from outline style
   */
  extractBorderColor(outline) {
    if (outline.includes('black')) return 'black'
    if (outline.includes('white')) return 'white'
    return 'black' // default
  }

  /**
   * Convert color to hex format for ASS subtitles
   */
  convertColorToHex(color) {
    if (!color) return 'FFFFFF'
    
    // Handle hex colors
    if (color.startsWith('#')) {
      return color.slice(1).toUpperCase()
    }
    
    // Handle named colors
    const colorMap = {
      'white': 'FFFFFF',
      'black': '000000',
      'red': 'FF0000',
      'green': '00FF00',
      'blue': '0000FF',
      'yellow': 'FFFF00',
      'cyan': '00FFFF',
      'magenta': 'FF00FF'
    }
    
    return colorMap[color.toLowerCase()] || 'FFFFFF'
  }

  /**
   * Get ASS alignment number based on position
   */
  getAssAlignment(position) {
    switch (position) {
      case 'top': return '2' // Top center
      case 'center': return '5' // Middle center
      case 'bottom': 
      default: return '2' // Bottom center (ASS uses 2 for bottom)
    }
  }

  /**
   * Get available social media presets
   */
  getSocialMediaPresets() {
    return Object.keys(this.socialMediaPresets).map(key => ({
      id: key,
      name: this.formatPresetName(key),
      settings: this.socialMediaPresets[key]
    }))
  }

  /**
   * Format preset name for display
   */
  formatPresetName(presetId) {
    const names = {
      // Revid.ai inspired presets
      'hormozi': 'HORMOZI',
      'ali': 'Ali',
      'wrap1': 'Wrap 1',
      'wrap2': 'WRAP 2',
      'elegant': 'Elegant',
      'difference': 'Difference',
      'playful': 'Playful',
      // Original presets
      'instagram-story': 'Instagram Story',
      'tiktok': 'TikTok',
      'youtube-shorts': 'YouTube Shorts', 
      'reels': 'Instagram Reels',
      'custom': 'Custom'
    }
    return names[presetId] || presetId.charAt(0).toUpperCase() + presetId.slice(1)
  }

  /**
   * Get supported languages list
   */
  getSupportedLanguages() {
    return Object.entries(this.supportedLanguages).map(([code, name]) => ({
      code,
      name
    }))
  }

  /**
   * Process transcript for better subtitle timing
   */
  optimizeSubtitleTiming(transcript, options = {}) {
    const {
      minDuration = 1.0,     // Minimum subtitle duration
      maxDuration = 6.0,     // Maximum subtitle duration
      readingSpeed = 200     // Words per minute reading speed
    } = options

    const optimizedSegments = transcript.segments.map(segment => {
      const wordCount = segment.text.split(' ').length
      const optimalDuration = (wordCount / readingSpeed) * 60
      
      const adjustedDuration = Math.max(
        minDuration,
        Math.min(maxDuration, optimalDuration)
      )
      
      return {
        ...segment,
        duration: adjustedDuration,
        end: segment.start + adjustedDuration,
        optimized: true
      }
    })

    return {
      ...transcript,
      segments: optimizedSegments
    }
  }

  /**
   * Generate ASS subtitle file with karaoke-style word highlighting
   */
  async generateASS(transcript, outputPath, options) {
    console.log('🎤 Generating ASS subtitle file with karaoke highlighting...')
    
    console.log('ASS options received: ', options)
    
    if (!options) {
      console.error('❌ No options provided to generateASS')
      throw new Error('Options are required for ASS generation')
    }

    // Use the simplified options directly
    const finalOptions = {
      fontsize: options.fontsize || 24,
      fontname: options.fontname || 'Arial',
      primaryColour: options.primaryColour || '#FFFFFF',
      secondaryColour: options.secondaryColour || '#FFD700',
      outlineColour: options.outlineColour || '#000000',
      backColour: options.backColour || 'rgba(0,0,0,0.7)',
      bold: options.bold !== undefined ? options.bold : 0,
      italic: options.italic !== undefined ? options.italic : 0,
      borderStyle: options.borderStyle || 1,
      outline: options.outline || 2,
      shadow: options.shadow || 1,
      alignment: options.alignment || 2,
      marginL: options.marginL || 20,
      marginR: options.marginR || 20,
      marginV: options.marginV || 60
    }

    console.log('🎨 Final ASS Options:', finalOptions)

    // For debugging, let's start with a simpler approach that definitely works
    console.log('📝 Using simplified ASS generation for debugging...')

    // Simple ASS file header - basic but reliable
    let assContent = `[Script Info]
Title: Karaoke Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${finalOptions.fontname},${finalOptions.fontsize},&H00${this.convertColorToASS(finalOptions.primaryColour)},&H00${this.convertColorToASS(finalOptions.secondaryColour)},&H00${this.convertColorToASS(finalOptions.outlineColour)},&H80000000,${finalOptions.bold},${finalOptions.italic},0,0,100,100,0,0,${finalOptions.borderStyle},${finalOptions.outline},${finalOptions.shadow},${finalOptions.alignment},${finalOptions.marginL},${finalOptions.marginR},${finalOptions.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

    // Process each segment - start with basic karaoke without style switching
    let dialogueCount = 0
    for (const segment of transcript.segments) {
      const startTime = this.formatASSTime(segment.start)
      const endTime = this.formatASSTime(segment.end)
      
      if (!segment.words || segment.words.length === 0) {
        // Fallback for segments without word timing
        const cleanText = this.escapeTextForASS(segment.text)
        assContent += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${cleanText}\n`
        dialogueCount++
        continue
      }

      // Create basic karaoke text with word timing
      let karaokeText = ''
      
      for (let i = 0; i < segment.words.length; i++) {
        const word = segment.words[i]
        const cleanWord = this.escapeTextForASS(word.word || word.text || '')
        
        // Use the actual word duration from whisper-timestamped
        const actualWordDuration = word.end - word.start
        
        // Calculate timing for this word highlight (in centiseconds for ASS format)
        const highlightCs = Math.max(10, Math.round(actualWordDuration * 100))
        
        // Simple karaoke effect: {\k<duration>} makes the word highlight for that duration
        karaokeText += `{\\k${highlightCs}}${cleanWord}`
        
        // Add space between words (except for the last word)
        if (i < segment.words.length - 1) {
          karaokeText += ' '
        }
      }
      
      // Add the dialogue line
      assContent += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${karaokeText}\n`
      dialogueCount++
    }

    console.log(`📝 Generated ${dialogueCount} dialogue lines for ASS file`)

    // Write the ASS file using native fs for consistency
    try {
      const fs_native = require('fs')
      fs_native.writeFileSync(outputPath, assContent, 'utf8')
      console.log(`✅ Successfully wrote ASS file: ${outputPath}`)
      
      // Verify the file was created and has content
      const stats = fs_native.statSync(outputPath)
      console.log(`📁 ASS file size: ${stats.size} bytes`)
      
      // Read back a sample to verify content
      const sampleContent = assContent.substring(0, 500)
      console.log(`📋 ASS file sample:\n${sampleContent}...`)
      
    } catch (error) {
      console.error('❌ Failed to write ASS file:', error)
      throw error
    }
    
    return {
      success: true,
      filePath: outputPath,
      subtitleCount: transcript.segments.length,
      format: 'ass',
      karaokeEnabled: true
    }
  }

  /**
   * Escape text for ASS format
   */
  escapeTextForASS(text) {
    if (!text) return ''
    return text
      .replace(/\\/g, '\\\\')  // Escape backslashes
      .replace(/\n/g, '\\N')   // Convert newlines to ASS format
      .replace(/\{/g, '\\{')   // Escape opening braces
      .replace(/\}/g, '\\}')   // Escape closing braces
  }

  /**
   * Convert hex color to ASS format (BGR)
   */
  convertColorToASS(hexColor) {
    // Remove # if present
    const hex = hexColor.replace('#', '')
    
    // Convert RGB to BGR for ASS format
    if (hex.length === 6) {
      console.log('hex: ', hex)
      const r = hex.substr(0, 2)
      const g = hex.substr(2, 2)
      const b = hex.substr(4, 2)
      console.log(`${b}${g}${r}`.toUpperCase())
      return `${b}${g}${r}`.toUpperCase()
    }
    
    return 'FFFFFF' // Default to white
  }

  /**
   * Format time for ASS format (H:MM:SS.cc)
   */
  formatASSTime(seconds) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const centiseconds = Math.floor((seconds % 1) * 100)
    
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
  }
}

module.exports = SubtitleGenerator 