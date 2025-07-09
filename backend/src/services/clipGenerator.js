const path = require('path')
const { v4: uuidv4 } = require('uuid')
const videoProcessor = require('./videoProcessor')
const speechAnalyzer = require('./speechAnalyzer')

class ClipGenerator {
  /**
   * Generate clips from video using semantic analysis
   */
  async generateClips(videoPath, videoId, options = {}) {
    const { duration, outputDir, onProgress, clipConfig = {} } = options
    
    console.log('🎬 [ClipGenerator] Starting clip generation:', {
      videoPath: videoPath,
      videoId: videoId,
      duration: duration,
      clipConfig: clipConfig,
      processingMode: 'SEMANTIC CLIPPING'
    })
    
    try {
      // Step 1: Perform speech analysis and semantic segmentation
      if (onProgress) {
        onProgress(0, 0, 10) // Use 0 totalClips to indicate transcription phase
      }
      
      console.log('🎤 [ClipGenerator] Step 1: Starting speech transcription and semantic analysis...')
      const speechOptions = {
        forceNodeWhisper: true // Force using normal Whisper for faster processing
      }
      if (clipConfig.language && clipConfig.language !== 'auto') {
        speechOptions.language = clipConfig.language
        console.log(`🌐 [ClipGenerator] Using specified language: ${clipConfig.language}`)
      }
      const speechAnalysis = await speechAnalyzer.analyzeVideoSpeech(videoPath, outputDir, speechOptions)
      
      if (onProgress) {
        onProgress(0, 0, 40) // Transcription progress
      }
      
      console.log('📝 Speech analysis completed:')
      console.log(`   - Language: ${speechAnalysis.summary.language}`)
      console.log(`   - Total semantic segments: ${speechAnalysis.summary.totalSegments}`)
      console.log(`   - Average segment duration: ${speechAnalysis.summary.averageDuration.toFixed(1)}s`)
      console.log(`   - Using fallback: ${speechAnalysis.summary.hasFallback}`)
      console.log(`   - Analysis method: ${speechAnalysis.summary.analysisMethod || 'traditional'}`)
      
      // Step 2: Generate clip candidates from semantic segmentation
      console.log('📊 [ClipGenerator] Step 2: Generating clips from semantic segmentation')
      const clipCandidates = this.generateSemanticClipCandidates(duration, speechAnalysis, clipConfig)
      
      console.log('Generated clip candidates:', clipCandidates.length)
      
      if (onProgress) {
        onProgress(0, 0, 70) // Segmentation progress
      }
      
      // Step 3: Check if we need fallback for combining segments
      let selectedClips = []
      
      // Define variables outside conditional blocks for proper scope
      const qualityThreshold = 0.2
      const minDuration = 30
      
      if (clipCandidates.length === 0) {
        console.log('⚠️ No clips generated for selected preset. Using fallback: combining adjacent semantic segments...')
        
        // Fallback: Combine adjacent semantic segments to meet duration requirements
        const fallbackClips = this.createFallbackClipsFromSegments(speechAnalysis.semanticSegments, clipConfig)
        console.log(`🔄 Generated ${fallbackClips.length} fallback clips from combined segments`)
        
        selectedClips = fallbackClips
      } else {
        // Step 3: Score and filter clips (original logic)
        const rankedClips = this.rankSemanticClips(clipCandidates, duration, speechAnalysis)
        
        // Step 4: Final filtering and ranking
        console.log('🏆 Final ranking and filtering...')
        
        // Filter by minimum quality score AND minimum duration (30 seconds)
        selectedClips = rankedClips
          .filter(clip => {
            const meetsQuality = clip.score >= qualityThreshold
            const meetsDuration = clip.duration >= minDuration
            
            if (!meetsQuality) {
              console.log(`   ❌ Clip rejected: Low quality score ${(clip.score * 100).toFixed(0)}%`)
            }
            if (!meetsDuration) {
              console.log(`   ❌ Clip rejected: Too short ${clip.duration.toFixed(1)}s (need ${minDuration}s+)`)
            }
            
            return meetsQuality && meetsDuration
          })
          .sort((a, b) => b.score - a.score)
      }
      
      console.log(`📊 Generated ${selectedClips.length} clips (30+ seconds, quality ${(qualityThreshold * 100)}%+)`)
      if (selectedClips.length > 0) {
        console.log(`   🏆 Best clip: ${selectedClips[0].duration.toFixed(1)}s, ${(selectedClips[0].score * 100).toFixed(0)}% quality`)
        console.log(`   📈 Average duration: ${(selectedClips.reduce((sum, clip) => sum + clip.duration, 0) / selectedClips.length).toFixed(1)}s`)
      }
      
      // Step 5: Create actual video clips
      const generatedClips = []
      for (let i = 0; i < selectedClips.length; i++) {
        const clip = selectedClips[i]
        const clipId = uuidv4()
        const filename = `clip_${videoId}_${i + 1}_${clipId}.mp4`
        const outputPath = path.join(outputDir, filename)
        
        try {
          // Report progress before starting each clip
          if (onProgress) {
            onProgress(i + 1, selectedClips.length, 0)
          }
          
          await videoProcessor.createClip(
            videoPath,
            outputPath,
            clip.startTime,
            clip.duration,
            (progress) => {
              // Report individual clip progress
              if (onProgress) {
                onProgress(i + 1, selectedClips.length, progress)
              }
            }
          )
          
          // Build the clip object
          const clipObject = {
            id: clipId,
            filename,
            startTime: clip.startTime,
            endTime: clip.startTime + clip.duration,
            duration: clip.duration,
            score: clip.score,
            type: clip.type,
            path: outputPath,
            semanticInfo: {
              text: clip.text || '',
              confidence: clip.confidence || 0,
              sentences: clip.sentences || 0,
              isComplete: clip.isComplete || false
            }
          }

          generatedClips.push(clipObject)
          
          console.log(`Generated semantic clip ${i + 1}/${selectedClips.length}: ${filename}`)
          console.log(`   🧠 Type: ${clip.type}`)
          console.log(`   📄 Text: "${clip.text?.substring(0, 60)}${clip.text?.length > 60 ? '...' : ''}"`)
          console.log(`   ⏱️ Duration: ${clip.duration.toFixed(1)}s`)
          console.log(`   🎯 Confidence: ${(clip.confidence * 100).toFixed(0)}%`)
          
        } catch (error) {
          console.error(`Error creating clip ${i + 1}:`, error)
        }
      }
      
      console.log(`✅ [ClipGenerator] Generated ${generatedClips.length} clips`)
      
      // Return simple clip result (no AI video summary)
      const result = {
        clips: generatedClips,
        summary: {
          total: generatedClips.length,
          avgDuration: generatedClips.reduce((sum, clip) => sum + clip.duration, 0) / generatedClips.length,
          totalDuration: generatedClips.reduce((sum, clip) => sum + clip.duration, 0)
        }
      }

      return result
      
    } catch (error) {
      console.error('Error in clip generation:', error)
      throw error
    }
  }

  /**
   * Create fallback clips by combining adjacent semantic segments
   */
  createFallbackClipsFromSegments(semanticSegments, clipConfig = {}) {
    const fallbackClips = []
    const maxClipDuration = clipConfig.maxDuration || 60
    const minClipDuration = clipConfig.minDuration || 30
    const targetDuration = clipConfig.avgDuration || 45
    
    console.log(`🔄 Creating fallback clips by combining segments (target: ${minClipDuration}-${maxClipDuration}s)`)
    
    let currentClip = null
    let currentDuration = 0
    let segmentTexts = []
    let totalConfidence = 0
    let segmentCount = 0
    
    for (let i = 0; i < semanticSegments.length; i++) {
      const segment = semanticSegments[i]
      
      if (currentClip === null) {
        // Start new clip
        currentClip = {
          startTime: segment.start,
          endTime: segment.start + segment.duration,
          duration: segment.duration
        }
        currentDuration = segment.duration
        segmentTexts = [segment.text]
        totalConfidence = segment.confidence
        segmentCount = 1
      } else {
        // Check if adding this segment would exceed max duration
        const gap = segment.start - currentClip.endTime
        const newDuration = currentDuration + segment.duration + Math.max(0, gap)
        
        if (newDuration <= maxClipDuration) {
          // Add to current clip
          currentClip.endTime = segment.start + segment.duration
          currentDuration = newDuration
          currentClip.duration = newDuration
          segmentTexts.push(segment.text)
          totalConfidence += segment.confidence
          segmentCount++
        } else {
          // Finalize current clip if it meets minimum duration
          if (currentDuration >= minClipDuration) {
                         fallbackClips.push({
               startTime: currentClip.startTime,
               duration: currentClip.duration,
               type: 'fallback-combined',
               text: segmentTexts.join(' '),
               confidence: totalConfidence / segmentCount,
               sentences: segmentTexts.length,
               score: (totalConfidence / segmentCount) * 0.8, // Slightly lower score for fallback
               isComplete: true,
               source: 'fallback-segments'
             })
            
            console.log(`   ✅ Fallback clip: ${currentClip.startTime.toFixed(1)}s-${(currentClip.startTime + currentClip.duration).toFixed(1)}s (${currentClip.duration.toFixed(1)}s)`)
          }
          
          // Start new clip with current segment
          currentClip = {
            startTime: segment.start,
            endTime: segment.start + segment.duration,
            duration: segment.duration
          }
          currentDuration = segment.duration
          segmentTexts = [segment.text]
          totalConfidence = segment.confidence
          segmentCount = 1
        }
      }
    }
    
    // Don't forget the last clip
    if (currentClip && currentDuration >= minClipDuration) {
             fallbackClips.push({
         startTime: currentClip.startTime,
         duration: currentClip.duration,
         type: 'fallback-combined',
         text: segmentTexts.join(' '),
         confidence: totalConfidence / segmentCount,
         sentences: segmentTexts.length,
         score: (totalConfidence / segmentCount) * 0.8,
         isComplete: true,
         source: 'fallback-segments'
       })
      
      console.log(`   ✅ Fallback clip: ${currentClip.startTime.toFixed(1)}s-${(currentClip.startTime + currentClip.duration).toFixed(1)}s (${currentClip.duration.toFixed(1)}s)`)
    }
    
    console.log(`🔄 Created ${fallbackClips.length} fallback clips from ${semanticSegments.length} segments`)
    
    // Sort by confidence and limit to reasonable number
    return fallbackClips
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8) // Limit to top 8 clips
  }

  /**
   * Generate clip candidates based on semantic segments (traditional method)
   */
  generateSemanticClipCandidates(videoDuration, speechAnalysis, clipConfig = {}) {
    const candidates = []
    
    // Check if we have valid semantic segments
    if (!speechAnalysis || !speechAnalysis.semanticSegments || !Array.isArray(speechAnalysis.semanticSegments)) {
      console.warn('⚠️ No valid semantic segments found, using fallback time-based clips')
      return this.generateIntervalClips(videoDuration, 45, clipConfig.minDuration || 30)
        .map(clip => ({
          ...clip,
          text: 'Time-based segment (no transcript)',
          confidence: 0.3,
          sentences: 0,
          isComplete: false,
          source: 'fallback-interval'
        }));
    }

    const { semanticSegments } = speechAnalysis
    
    // Use clip configuration from preset or fallback to defaults
    const maxClipDuration = clipConfig.maxDuration || 60
    const minClipDuration = clipConfig.minDuration || 30
    const targetDuration = clipConfig.avgDuration || 45
    
    console.log('🎯 [ClipGenerator] Using clip config:', {
      preset: clipConfig.preset || 'default',
      minDuration: minClipDuration,
      maxDuration: maxClipDuration,
      targetDuration: targetDuration,
      language: clipConfig.language || 'auto'
    })
    
    console.log(`🧠 Creating semantic-based clip candidates (${minClipDuration}-${maxClipDuration} seconds)...`)
    
    // Strategy 1: Use semantic segments directly (allow longer clips now)
    semanticSegments.forEach((segment, index) => {
      if (segment.duration >= minClipDuration && segment.duration <= maxClipDuration) {
        candidates.push({
          startTime: segment.start,
          duration: segment.duration,
          type: 'semantic-complete',
          text: segment.text,
          confidence: segment.confidence,
          sentences: segment.sentences?.length || 0,
          baseScore: segment.confidence * 0.9, // High score for complete semantic segments
          isComplete: true,
          source: 'semantic-segment'
        })
        
        console.log(`   ✅ Semantic segment ${index + 1}: ${segment.start.toFixed(1)}s-${(segment.start + segment.duration).toFixed(1)}s (${segment.duration.toFixed(1)}s)`)
      }
    })
    
    // Strategy 2: Combine short adjacent segments
    for (let i = 0; i < semanticSegments.length - 1; i++) {
      const segment1 = semanticSegments[i]
      const segment2 = semanticSegments[i + 1]
      
      const gap = segment2.start - (segment1.start + segment1.duration)
      const combinedDuration = segment1.duration + segment2.duration + gap
      
      if (gap <= 3 && combinedDuration >= minClipDuration && combinedDuration <= maxClipDuration) {
        candidates.push({
          startTime: segment1.start,
          duration: combinedDuration,
          type: 'semantic-combined',
          text: `${segment1.text} ${segment2.text}`,
          confidence: (segment1.confidence + segment2.confidence) / 2,
          sentences: (segment1.sentences?.length || 0) + (segment2.sentences?.length || 0),
          baseScore: ((segment1.confidence + segment2.confidence) / 2) * 0.8,
          isComplete: true,
          source: 'combined-segments'
        })
        
        console.log(`   🔗 Combined segments ${i + 1}-${i + 2}: ${segment1.start.toFixed(1)}s-${(segment1.start + combinedDuration).toFixed(1)}s (${combinedDuration.toFixed(1)}s)`)
      }
    }
    
    // Strategy 3: Split long segments at sentence boundaries
    semanticSegments.forEach((segment, index) => {
      if (segment.duration > maxClipDuration && segment.sentences && segment.sentences.length > 1) {
        const sentencesPerClip = Math.ceil(segment.sentences.length / Math.ceil(segment.duration / 45))
        const timePerSentence = segment.duration / segment.sentences.length
        
        for (let i = 0; i < segment.sentences.length; i += sentencesPerClip) {
          const startTime = segment.start + (i * timePerSentence)
          const clipDuration = Math.min(sentencesPerClip * timePerSentence, maxClipDuration)
          const endSentenceIndex = Math.min(i + sentencesPerClip, segment.sentences.length)
          const clipText = segment.sentences.slice(i, endSentenceIndex).join(' ')
          
          if (clipDuration >= minClipDuration) {
            candidates.push({
              startTime: startTime,
              duration: clipDuration,
              type: 'semantic-split',
              text: clipText,
              confidence: segment.confidence * 0.9, // Slightly lower for split segments
              sentences: endSentenceIndex - i,
              baseScore: segment.confidence * 0.7,
              isComplete: true,
              source: 'split-segment'
            })
            
            console.log(`   ✂️ Split segment ${index + 1}.${Math.floor(i / sentencesPerClip) + 1}: ${startTime.toFixed(1)}s-${(startTime + clipDuration).toFixed(1)}s (${clipDuration.toFixed(1)}s)`)
          }
        }
      }
    })
    
    // Strategy 4: Fallback to time-based if not enough semantic segments
    if (candidates.length < 5) {
      console.log('   📐 Adding time-based fallback clips...')
      const intervalClips = this.generateIntervalClips(videoDuration, 45, minClipDuration)
      candidates.push(...intervalClips.map(clip => ({
        ...clip,
        text: 'Time-based segment (no transcript)',
        confidence: 0.3,                                                                                                    
        sentences: 0,
        isComplete: false,
        source: 'fallback-interval'
      })))
    }
    
    console.log(`📊 Generated ${candidates.length} semantic clip candidates`)
    return candidates
  }

  /**
   * Rank clips based on semantic quality and content with overlap detection
   */
  rankSemanticClips(candidates, videoDuration, speechAnalysis) {
    // First pass: calculate scores
    const scoredClips = candidates
      .map(clip => {
        let score = clip.baseScore
        
        // Huge bonus for complete semantic segments
        if (clip.isComplete) {
          score += 0.5
        }
        
        // Bonus based on confidence
        score += clip.confidence * 0.3
        
        // Bonus for good sentence count
        if (clip.sentences >= 2 && clip.sentences <= 8) {
          score += 0.3
        } else if (clip.sentences >= 1) {
          score += 0.1
        }
        
        // Prefer AI topics over semantic segments, complete over partial
        if (clip.type === 'ai-complete-topic') {
          score += 0.4 // Highest preference for complete AI topics
        } else if (clip.type === 'ai-merged-topics') {
          score += 0.3 // Good for merged AI topics
        } else if (clip.type === 'ai-split-topic') {
          score += 0.25 // Decent for split AI topics
        } else if (clip.type === 'semantic-complete') {
          score += 0.2 // Traditional semantic segments
        } else if (clip.type === 'semantic-combined') {
          score += 0.15
        } else if (clip.type === 'semantic-split') {
          score += 0.1
        }
        
        // Updated duration preferences (30-120 seconds range)
        if (clip.duration >= 45 && clip.duration <= 75) {
          score += 0.3 // Sweet spot for engaging clips
        } else if (clip.duration >= 30 && clip.duration <= 90) {
          score += 0.2
        } else if (clip.duration >= 90 && clip.duration <= 120) {
          score += 0.1 // Longer clips are okay but less preferred
        }
        
        // Slight preference for middle content
        const midPoint = videoDuration / 2
        const clipMidPoint = clip.startTime + (clip.duration / 2)
        const distanceFromMid = Math.abs(clipMidPoint - midPoint) / midPoint
        const middleBonus = Math.max(0, (1 - distanceFromMid) * 0.1)
        score += middleBonus
        
        // Avoid very early content (intro/noise)
        if (clip.startTime < 10) {
          score -= 0.15
        }
        
        // Avoid very late content (outro/fade)
        if (clip.startTime > videoDuration - 30) {
          score -= 0.1
        }
        
        // Penalty for fallback clips
        if (clip.source === 'fallback-interval') {
          score -= 0.3
        }
        
        return { ...clip, score }
      })
      .sort((a, b) => b.score - a.score)
    
    // Second pass: Remove overlapping clips (keep only the best ones)
    const filteredClips = []
    const overlapThreshold = 10 // seconds - if clips overlap by more than this, remove the lower-scored one
    
    console.log('🔍 Filtering overlapping clips...')
    
    for (const clip of scoredClips) {
      const clipEnd = clip.startTime + clip.duration
      let hasSignificantOverlap = false
      
      for (const existingClip of filteredClips) {
        const existingEnd = existingClip.startTime + existingClip.duration
        
        // Calculate overlap
        const overlapStart = Math.max(clip.startTime, existingClip.startTime)
        const overlapEnd = Math.min(clipEnd, existingEnd)
        const overlapDuration = Math.max(0, overlapEnd - overlapStart)
        
        if (overlapDuration > overlapThreshold) {
          hasSignificantOverlap = true
          console.log(`   ❌ Rejecting clip ${clip.startTime.toFixed(1)}s-${clipEnd.toFixed(1)}s (overlaps ${overlapDuration.toFixed(1)}s with ${existingClip.startTime.toFixed(1)}s-${existingEnd.toFixed(1)}s)`)
          break
        }
      }
      
      if (!hasSignificantOverlap) {
        filteredClips.push(clip)
        console.log(`   ✅ Keeping clip ${clip.startTime.toFixed(1)}s-${clipEnd.toFixed(1)}s (score: ${(clip.score * 100).toFixed(0)}%)`)
      }
    }
    
    console.log(`📊 Filtered from ${scoredClips.length} to ${filteredClips.length} non-overlapping clips`)
    
    return filteredClips
  }

  /**
   * Generate clips at regular intervals (fallback method)
   */
  generateIntervalClips(videoDuration, preferredDuration, minDuration = 30) {
    const clips = []
    const interval = preferredDuration * 1.5
    
    for (let start = 0; start < videoDuration - minDuration; start += interval) {
      const remainingDuration = videoDuration - start
      const clipDuration = Math.min(preferredDuration, remainingDuration - 5)
      
      if (clipDuration >= minDuration) {
        clips.push({
          startTime: start,
          duration: clipDuration,
          type: 'interval',
          baseScore: 0.3
        })
      }
    }
    
    return clips
  }
}

module.exports = new ClipGenerator() 