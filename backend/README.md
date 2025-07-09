# Video Clipper Backend

A powerful Node.js backend API that provides AI-powered video processing capabilities for automatically generating engaging short clips from long-form videos. Built with Express.js and integrating advanced speech recognition, natural language processing, and video manipulation technologies.

## 🚀 Features

### Core Functionality
- **🎥 Video Upload Processing**: Handle large video file uploads (up to 500MB)
- **📱 YouTube Integration**: Download and process videos directly from YouTube URLs
- **🤖 AI-Powered Transcription**: Advanced speech recognition using Whisper AI models
- **🧠 Semantic Analysis**: Intelligent content segmentation using NLP techniques
- **✂️ Smart Clipping**: Generate clips based on semantic meaning and speech patterns
- **⚡ Real-time Progress**: Server-Sent Events (SSE) for live processing updates

### AI & Machine Learning
- **🎤 Multi-language Support**: Optimized for Bahasa Indonesian + English mixed content
- **📝 Speech-to-Text**: Powered by OpenAI Whisper with configurable model sizes
- **🔍 Semantic Segmentation**: Automatic content boundary detection
- **🎯 Quality Scoring**: AI-driven clip ranking and selection
- **📊 Content Analysis**: Sentence structure and confidence scoring

## 🛠️ Tech Stack

- **Runtime**: [Node.js](https://nodejs.org/) 16+
- **Framework**: [Express.js](https://expressjs.com/)
- **AI/ML**: [OpenAI Whisper](https://github.com/openai/whisper) via nodejs-whisper
- **Video Processing**: [FFmpeg](https://ffmpeg.org/) with fluent-ffmpeg
- **YouTube Downloads**: youtube-dl-exec
- **NLP**: Natural, Compromise.js, Sentence Transformers
- **File Handling**: Multer, fs-extra
- **Real-time**: Server-Sent Events (SSE)

## 📋 Prerequisites

### Required Dependencies
- **Node.js** 16+ and npm
- **FFmpeg** installed and available in PATH
- **Python** 3.7+ (for Whisper model support)

### AI Model Setup
```bash
# Install Whisper models (run after npm install)
npx nodejs-whisper download

# Choose model when prompted:
# - tiny: Fast, basic accuracy (~75MB)
# - base: Good balance (~142MB) 
# - medium: Recommended for Indonesian+English (~1.5GB)
# - large: Best accuracy (~2.9GB)
```

## 🔧 Installation

1. **Clone and setup**:
   ```bash
   git clone https://github.com/yourusername/rayp-clipper-backend.git
   cd rayp-clipper-backend
   npm install
   ```

2. **Install system dependencies**:
   ```bash
   # macOS
   brew install ffmpeg

   # Ubuntu/Debian
   sudo apt update && sudo apt install ffmpeg

   # Windows (use chocolatey)
   choco install ffmpeg
   ```

3. **Download AI models**:
   ```bash
   npx nodejs-whisper download
   # Select 'medium' for best Bahasa Indonesian + English support
   ```

4. **Environment setup** (optional):
   ```bash
   cp .env.example .env
   # Edit .env with your configurations
   ```

5. **Start the server**:
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 🚀 API Reference

### Base URL
```
http://localhost:3001
```

### Endpoints

#### **Server Status**
```http
GET /
```
Returns server status and available features.

#### **Video Upload & Processing**
```http
POST /api/upload
Content-Type: multipart/form-data

{
  "video": [File],
  "options": {
    "duration": 45,
    "quality": "medium"
  }
}
```

#### **YouTube Video Info**
```http
POST /api/youtube/info
Content-Type: application/json

{
  "url": "https://youtube.com/watch?v=..."
}
```

#### **YouTube Available Formats**
```http
POST /api/youtube/formats
Content-Type: application/json

{
  "url": "https://youtube.com/watch?v=..."
}
```

#### **YouTube Download & Process**
```http
POST /api/youtube/process
Content-Type: application/json

{
  "url": "https://youtube.com/watch?v=...",
  "options": {
    "resolution": "1920x1080",
    "extension": "mp4",
    "fps": 30,
    "duration": 45
  }
}
```

#### **Real-time Progress Tracking**
```http
GET /api/progress/{sessionId}
Accept: text/event-stream
```

## 📁 Project Structure

```
├── src/
│   ├── server.js                 # Main Express server
│   └── services/
│       ├── speechAnalyzer.js     # AI transcription & analysis
│       ├── clipGenerator.js      # Smart clip generation
│       ├── videoProcessor.js     # FFmpeg video operations
│       └── youtubeDownloader.js  # YouTube integration
├── uploads/                      # Temporary video uploads
├── output/                       # Generated clips
├── temp/                         # Processing workspace
├── package.json                  # Dependencies & scripts
└── README.md                     # This file
```

## ⚙️ Configuration

### Whisper Model Selection
Edit `src/services/speechAnalyzer.js`:

```javascript
// Line ~58: Choose your model
const modelName = 'medium' // tiny/base/small/medium/large

// For Indonesian + English mixed content:
// - 'tiny': Fast testing (~75MB)
// - 'medium': Recommended (~1.5GB) ✅  
// - 'large': Best accuracy (~2.9GB)
```

### File Upload Limits
Edit `src/server.js`:

```javascript
const upload = multer({ 
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit
  }
})
```

### Processing Options
- **Clip Duration**: 30-60 seconds (configurable)
- **Quality Threshold**: Minimum confidence score for clips
- **Semantic Segmentation**: Automatic content boundary detection
- **Multi-language**: Auto-detection for Indonesian/English

## 📊 Processing Pipeline

1. **📥 Input**: Video upload or YouTube URL
2. **🎤 Transcription**: Whisper AI speech-to-text
3. **🧠 Analysis**: Semantic segmentation and NLP
4. **🎯 Selection**: AI-powered clip candidate generation
5. **📊 Ranking**: Quality scoring and filtering
6. **✂️ Generation**: FFmpeg clip creation
7. **📤 Output**: Ready-to-use video clips

## 🔄 Real-time Progress Events

The API provides live progress updates via Server-Sent Events:

```javascript
// Processing stages
{
  "type": "progress",
  "stage": "downloading",    // downloading → analyzing → clipping
  "progress": 45,           // 0-100
  "message": "Downloading video...",
  "clipIndex": 2,          // Current clip being processed
  "totalClips": 5          // Total clips to generate
}

// Completion
{
  "type": "complete",
  "data": {
    "clips": [...],        // Generated clip information
    "summary": {...}       // Processing summary
  }
}
```

## 🚀 Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm test` - Run tests (not implemented yet)

## 🔧 Advanced Configuration

### Custom FFmpeg Options
Edit video processing parameters in `src/services/videoProcessor.js`

### YouTube Quality Settings
Configure download preferences in `src/services/youtubeDownloader.js`

### AI Model Tuning
Adjust Whisper and NLP parameters in `src/services/speechAnalyzer.js`

## 📈 Performance Tips

1. **Model Selection**: Use 'medium' Whisper model for best Indonesian+English balance
2. **Hardware**: GPU support available (set `withCuda: true` in speechAnalyzer.js)
3. **Memory**: Ensure 4GB+ RAM for large video processing
4. **Storage**: SSD recommended for faster video I/O operations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🔗 Related Projects

- **Frontend Repository**: [rayp-clipper-frontend](https://github.com/RichardTandean/rayp-clipper-frontend)

## 📝 License

This project is private and proprietary.

## 🐛 Troubleshooting

### Common Issues

**Whisper Model Not Found**:
```bash
npx nodejs-whisper download
# Select appropriate model size
```

**FFmpeg Not Found**:
```bash
# Install FFmpeg for your system
brew install ffmpeg  # macOS
sudo apt install ffmpeg  # Ubuntu
```

**Large File Upload Fails**:
- Check Node.js memory limits
- Verify disk space in uploads directory
- Adjust multer fileSize limits

**YouTube Download Errors**:
- Verify youtube-dl-exec is updated
- Check internet connectivity
- Ensure valid YouTube URL format

## 📞 Support

For questions, issues, or feature requests:
- Open an issue on GitHub
- Contact the development team

---

**Note**: This backend API is designed to work with the rayp-clipper-frontend. Ensure both services are running for full functionality.
