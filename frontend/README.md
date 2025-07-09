# Video Clipper Frontend

A modern, AI-powered video processing web application that automatically generates engaging short clips from long-form videos. Built with Next.js and TypeScript, this frontend provides an intuitive interface for uploading videos or processing YouTube URLs to create viral-ready content.

## 🚀 Features

- **Video Upload**: Drag-and-drop interface for local video files
- **YouTube Integration**: Process videos directly from YouTube URLs
- **AI-Powered Clipping**: Automatically generate engaging short clips using intelligent analysis
- **Real-time Progress**: Live progress tracking with detailed status updates
- **Clip Gallery**: Browse and manage generated clips with preview functionality
- **Modern UI**: Clean, responsive design with Tailwind CSS
- **File Management**: Support for large file uploads (up to 500MB)

## 🛠️ Tech Stack

- **Framework**: [Next.js 14](https://nextjs.org/) with App Router
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Video Processing**: FFmpeg integration
- **Real-time Updates**: Server-Sent Events (SSE)

## 📋 Prerequisites

- Node.js 18+ and npm
- A running backend server (typically on port 3001)

## 🔧 Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/rayp-clipper-frontend.git
   cd rayp-clipper-frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🚀 Usage

### Processing Local Videos

1. **Upload Video**: Use the drag-and-drop interface or click to select a video file
2. **Configure Settings**: Adjust clip generation parameters (duration, quantity, etc.)
3. **Process**: Click "Generate Clips" to start processing
4. **Monitor Progress**: Watch real-time progress updates through the processing stages
5. **Review Clips**: Browse generated clips in the gallery view

### Processing YouTube Videos

1. **Enter URL**: Paste a YouTube video URL in the input field
2. **Set Options**: Configure clipping preferences
3. **Process**: Click "Process YouTube Video"
4. **Track Progress**: Monitor downloading, analysis, and clipping stages
5. **Access Clips**: View and manage generated clips

### Processing Stages

- **🔵 Download**: Fetching video content
- **🟡 Analyze**: AI analysis for optimal clip identification
- **🟢 Generate**: Creating individual clip files

## 📁 Project Structure

```
├── app/
│   ├── components/
│   │   ├── VideoUpload.tsx      # File upload and YouTube URL interface
│   │   ├── VideoProcessor.tsx   # Video processing logic
│   │   └── ClipGallery.tsx     # Generated clips display
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout component
│   └── page.tsx                # Main application page
├── public/                     # Static assets
├── next.config.js             # Next.js configuration
├── tailwind.config.js         # Tailwind CSS configuration
├── tsconfig.json              # TypeScript configuration
└── package.json               # Dependencies and scripts
```

## 🔧 Configuration

### Next.js Configuration

The app is configured to handle large file uploads and external FFmpeg packages:

```javascript
// next.config.js
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg']
  },
  api: {
    bodyParser: {
      sizeLimit: '500mb'
    },
    responseLimit: false
  }
}
```

### Environment Setup

Ensure your backend server is running on port 3001 or update the API endpoints in the frontend code accordingly.

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is private and proprietary.

## 🔗 Related Projects

- **Backend Repository**: [rayp-clipping-backend](https://github.com/RichardTandean/rayp-clipper-backend)

## 📞 Support

For questions, issues, or feature requests, please:
- Open an issue on GitHub
- Contact the development team

---

**Note**: This frontend application requires a compatible backend server for full functionality. Ensure the backend is running before using the application.
