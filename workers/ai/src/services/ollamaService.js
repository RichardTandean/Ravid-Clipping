const { Ollama } = require('ollama')
const compromise = require('compromise')
const natural = require('natural')
const similarity = require('similarity')

class OllamaService {
  constructor() {
    this.ollama = new Ollama({
      host: process.env.OLLAMA_HOST || 'http://localhost:11434'
    })
    this.model = process.env.OLLAMA_MODEL || 'llama3.2:3b'
    
    console.log(`🤖 Ollama AI Service initialized with model: ${this.model}`)
  }

  /**
   * Test connection to Ollama server
   */
  async testConnection() {
    try {
      const models = await this.ollama.list()
      console.log('✅ Ollama connection successful')
      console.log(`📊 Available models: ${models.models.map(m => m.name).join(', ')}`)
      return { success: true, models: models.models }
    } catch (error) {
      console.error('❌ Ollama connection failed:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * Analyze speech content for semantic segments and key insights
   */
  async analyzeSpeechContent(transcriptData, options = {}) {
    console.log('🧠 Starting AI content analysis...')
    
    try {
      const { segments, words, language } = transcriptData
      
      if (!segments || segments.length === 0) {
        throw new Error('No transcript segments provided for analysis')
      }

      // Prepare transcript text
      const fullText = segments.map(s => s.text).join(' ').trim()
      
      if (!fullText) {
        throw new Error('Empty transcript text')
      }

      // Create analysis prompt
      const analysisPrompt = this.createAnalysisPrompt(fullText, language, options)
      
      console.log('   🔍 Analyzing with Ollama...')
      
      // Get AI analysis
      const response = await this.ollama.chat({
        model: this.model,
        messages: [
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        stream: false,
        options: {
          temperature: 0.3,
          top_p: 0.9,
          max_tokens: 2048
        }
      })

      const analysis = this.parseAnalysisResponse(response.message.content)
      
      // Perform additional NLP analysis
      const nlpAnalysis = this.performNLPAnalysis(fullText, segments)
      
      // Combine AI and NLP analysis
      const combinedAnalysis = {
        ...analysis,
        nlp: nlpAnalysis,
        metadata: {
          model: this.model,
          language: language,
          totalSegments: segments.length,
          totalWords: words?.length || 0,
          analyzedAt: new Date().toISOString()
        }
      }

      console.log('   ✅ AI analysis complete!')
      return combinedAnalysis

    } catch (error) {
      console.error('   ❌ AI analysis failed:', error.message)
      throw error
    }
  }

  /**
   * Create analysis prompt for Ollama
   */
  createAnalysisPrompt(text, language, options) {
    const basePrompt = `Analyze the following transcript and provide insights in JSON format.

Text: "${text}"

Please analyze and return a JSON object with the following structure:
{
  "summary": "Brief summary of the content",
  "keyTopics": ["topic1", "topic2", "topic3"],
  "sentiment": "positive|negative|neutral",
  "confidenceScore": 0.85,
  "suggestedClips": [
    {
      "title": "Clip title",
      "description": "Why this would make a good clip",
      "importance": 0.9,
      "reason": "Explanation of why this is significant"
    }
  ],
  "speakingStyle": {
    "pace": "fast|medium|slow",
    "energy": "high|medium|low",
    "clarity": "excellent|good|fair|poor"
  },
  "contentType": "educational|entertainment|presentation|conversation|other"
}`

    if (language === 'id') {
      return basePrompt + `

Note: This content is primarily in Bahasa Indonesia. Please consider Indonesian context and culture in your analysis.`
    }

    return basePrompt
  }

  /**
   * Parse and validate AI response
   */
  parseAnalysisResponse(responseText) {
    try {
      // Extract JSON from response (in case there's additional text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response')
      }

      const analysis = JSON.parse(jsonMatch[0])
      
      // Validate required fields
      const requiredFields = ['summary', 'keyTopics', 'sentiment', 'confidenceScore']
      for (const field of requiredFields) {
        if (!analysis[field]) {
          console.warn(`⚠️ Missing field in AI response: ${field}`)
        }
      }

      return analysis

    } catch (error) {
      console.warn('⚠️ Failed to parse AI response, using fallback analysis')
      return this.createFallbackAnalysis()
    }
  }

  /**
   * Perform additional NLP analysis using compromise and natural
   */
  performNLPAnalysis(text, segments) {
    console.log('   🔤 Performing NLP analysis...')
    
    try {
      const doc = compromise(text)
      
      // Extract entities
      const people = doc.people().out('array')
      const places = doc.places().out('array')
      const organizations = doc.organizations().out('array')
      const topics = doc.topics().out('array')
      
      // Sentiment analysis
      const sentiment = natural.SentimentAnalyzer.analyze(
        natural.WordTokenizer().tokenize(text)
      )
      
      // Extract keywords using TF-IDF
      const tokenizer = new natural.WordTokenizer()
      const tokens = tokenizer.tokenize(text.toLowerCase())
      const uniqueTokens = [...new Set(tokens)]
      const keywords = uniqueTokens
        .filter(token => token.length > 3)
        .slice(0, 10)
      
      // Calculate speaking metrics
      const wordCount = tokens.length
      const totalDuration = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0)
      const wordsPerMinute = totalDuration > 0 ? (wordCount / totalDuration) * 60 : 0
      
      return {
        entities: {
          people: people.slice(0, 5),
          places: places.slice(0, 5),
          organizations: organizations.slice(0, 5),
          topics: topics.slice(0, 10)
        },
        keywords: keywords,
        metrics: {
          wordCount,
          totalDuration: Math.round(totalDuration),
          wordsPerMinute: Math.round(wordsPerMinute),
          averageSegmentLength: segments.length > 0 ? wordCount / segments.length : 0
        },
        sentiment: {
          score: sentiment,
          classification: sentiment > 0.1 ? 'positive' : sentiment < -0.1 ? 'negative' : 'neutral'
        }
      }

    } catch (error) {
      console.warn('⚠️ NLP analysis failed:', error.message)
      return {
        entities: { people: [], places: [], organizations: [], topics: [] },
        keywords: [],
        metrics: { wordCount: 0, totalDuration: 0, wordsPerMinute: 0 },
        sentiment: { score: 0, classification: 'neutral' }
      }
    }
  }

  /**
   * Create fallback analysis when AI fails
   */
  createFallbackAnalysis() {
    return {
      summary: "Content analysis unavailable - please check AI service connection",
      keyTopics: ["general content"],
      sentiment: "neutral",
      confidenceScore: 0.1,
      suggestedClips: [],
      speakingStyle: {
        pace: "medium",
        energy: "medium",
        clarity: "good"
      },
      contentType: "other",
      fallback: true
    }
  }

  /**
   * Generate clip suggestions based on transcript analysis
   */
  async generateClipSuggestions(transcriptData, options = {}) {
    console.log('🎬 Generating clip suggestions...')
    
    try {
      const { segments } = transcriptData
      const clipDuration = options.clipDuration || 60 // Default 60 seconds
      const maxClips = options.maxClips || 5
      
      // Use AI to identify interesting segments
      const analysis = await this.analyzeSpeechContent(transcriptData, {
        focusOnClips: true,
        clipDuration
      })
      
      // Extract suggested clips from AI analysis
      let suggestions = analysis.suggestedClips || []
      
      // If no AI suggestions, use fallback method
      if (suggestions.length === 0) {
        suggestions = this.generateFallbackClipSuggestions(segments, clipDuration, maxClips)
      }
      
      // Limit to max clips
      suggestions = suggestions.slice(0, maxClips)
      
      console.log(`   ✅ Generated ${suggestions.length} clip suggestions`)
      return suggestions

    } catch (error) {
      console.error('   ❌ Clip suggestion generation failed:', error.message)
      return this.generateFallbackClipSuggestions(transcriptData.segments, options.clipDuration || 60, options.maxClips || 5)
    }
  }

  /**
   * Generate fallback clip suggestions using simple heuristics
   */
  generateFallbackClipSuggestions(segments, clipDuration, maxClips) {
    const suggestions = []
    
    // Find segments with high word density or emotional markers
    const scoredSegments = segments.map(segment => {
      const text = segment.text.toLowerCase()
      let score = 0
      
      // Score based on length (not too short, not too long)
      const duration = segment.end - segment.start
      if (duration >= 10 && duration <= clipDuration) {
        score += 0.3
      }
      
      // Score based on emotional words
      const emotionalWords = ['amazing', 'incredible', 'important', 'crucial', 'key', 'main']
      emotionalWords.forEach(word => {
        if (text.includes(word)) score += 0.2
      })
      
      // Score based on question words (engaging content)
      const questionWords = ['what', 'how', 'why', 'when', 'where']
      questionWords.forEach(word => {
        if (text.includes(word)) score += 0.1
      })
      
      return { ...segment, score }
    })
    
    // Sort by score and select top segments
    const topSegments = scoredSegments
      .sort((a, b) => b.score - a.score)
      .slice(0, maxClips)
    
    topSegments.forEach((segment, index) => {
      suggestions.push({
        title: `Highlight ${index + 1}`,
        description: `Interesting segment: ${segment.text.substring(0, 100)}...`,
        startTime: segment.start,
        endTime: Math.min(segment.end, segment.start + clipDuration),
        importance: segment.score,
        reason: "High engagement content detected"
      })
    })
    
    return suggestions
  }
}

module.exports = OllamaService 