# Advanced Karaoke Subtitle Implementation

## Overview

This implementation provides a complete word-level karaoke subtitle system with separate styling for active (currently speaking) and inactive (not yet spoken) words. The system uses precise word-level timestamps from whisper-timestamped for perfect synchronization.

## Complete Workflow

### 1. Video Upload & Transcript Generation ✅
- User uploads video file
- Backend processes video through whisper-timestamped
- Generates word-level transcription with precise timestamps
- Each word has `start`, `end`, `word`, and `confidence` data

### 2. Styling Section ✅
- **Karaoke Mode Toggle**: Enable/disable word-level highlighting
- **Active Word Styling**: Font family, size, weight, color, background, border
- **Inactive Word Styling**: Font family, size, weight, color, background, border  
- **Live Preview**: Real-time preview showing active vs inactive word appearance

### 3. Subtitle Burning ✅
- Generates ASS subtitle file with advanced karaoke effects
- Uses separate styles for active/inactive words
- Burns subtitles into video with FFmpeg
- Maintains precise word-level timing

## Technical Implementation

### Frontend Changes (`app/components/SubtitleEditor.tsx`)

#### Enhanced StyleOptions Interface
```typescript
interface StyleOptions {
  // ... existing options
  activeWordStyle: {
    fontFamily: string
    fontSize: number
    fontWeight: string
    color: string
    backgroundColor: string
    borderColor: string
    borderWidth: number
  }
  inactiveWordStyle: {
    fontFamily: string
    fontSize: number
    fontWeight: string
    color: string
    backgroundColor: string
    borderColor: string
    borderWidth: number
  }
}
```

#### New UI Components
- **Word-Level Styling Controls**: Separate sections for active/inactive word styling
- **Live Preview Component**: Shows real-time preview of subtitle appearance
- **Enhanced Karaoke Toggle**: Clear explanation of karaoke functionality

### Backend Changes (`backend/src/services/subtitleGenerator.js`)

#### Enhanced ASS Generation
```javascript
// Multiple styles in ASS file
Style: Active,Arial,16,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,2,0,2,20,20,60,1
Style: Inactive,Arial,16,&H00CCCCCC,&H00CCCCCC,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,2,20,20,60,1

// Advanced karaoke timing with style switching
{\r\Inactive}{\k100\r\Active}WORD{\r\Inactive} {\k80\r\Active}NEXT{\r\Inactive}
```

#### Word-Level Processing
- Processes word timestamps from whisper-timestamped
- Generates precise karaoke timing in centiseconds
- Applies style switching for each word transition

## File Structure

```
frontend/
├── app/
│   ├── components/
│   │   └── SubtitleEditor.tsx         # Enhanced with word-level styling
│   ├── subtitles/
│   │   └── page.tsx                   # Updated subtitle page
│   └── lib/
│       └── api.ts                     # API endpoints

backend/
├── src/
│   ├── services/
│   │   ├── subtitleGenerator.js       # Enhanced ASS generation
│   │   ├── whisperTimestamped.py      # Word-level transcription
│   │   └── speechAnalyzer.js          # Integration layer
│   └── server.js                      # API endpoints
```

## Key Features

### 🎤 Word-Level Karaoke Timing
- Uses whisper-timestamped for precise word boundaries
- Each word highlighted for exact spoken duration
- Smooth transitions between active/inactive states

### 🎨 Dual Styling System
- **Active Words**: Highlighted, bold, colored for current speech
- **Inactive Words**: Subtle, dimmed for upcoming text
- Full control over fonts, colors, backgrounds, borders

### 👁️ Live Preview
- Real-time preview of subtitle appearance
- Shows active vs inactive word styling
- Updates immediately when styling changes

### 🚀 Advanced ASS Subtitles
- Multiple style definitions in ASS format
- Karaoke timing tags for word-level highlighting
- Style switching commands for smooth transitions

## API Endpoints

### `POST /api/generate-transcript`
- Input: Video file, language options
- Output: Word-level transcript with precise timestamps
- Uses whisper-timestamped for accuracy

### `POST /api/burn-subtitles`
- Input: Video file, transcript, styling options (including activeWordStyle/inactiveWordStyle)
- Output: Video with burned-in karaoke subtitles
- Generates ASS file with advanced styling

## Usage Example

```typescript
// Styling configuration
const styleOptions = {
  karaokeEnabled: true,
  activeWordStyle: {
    fontFamily: 'Arial',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
    backgroundColor: '#FFD700',
    borderColor: '#000000',
    borderWidth: 2
  },
  inactiveWordStyle: {
    fontFamily: 'Arial', 
    fontSize: 16,
    fontWeight: 'normal',
    color: '#CCCCCC',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderWidth: 0
  }
}
```

## Generated ASS Output Example

```ass
[V4+ Styles]
Style: Active,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80FFD700,1,0,0,0,100,100,0,0,1,2,0,2,20,20,60,1
Style: Inactive,Arial,16,&H00CCCCCC,&H00CCCCCC,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,0,2,20,20,60,1

[Events]
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\r\Inactive}{\k100\r\Active}Hello{\r\Inactive} {\k80\r\Active}everyone{\r\Inactive} {\k120\r\Active}welcome{\r\Inactive}
```

## Benefits

1. **Perfect Synchronization**: Word-level timestamps ensure perfect audio-visual sync
2. **Professional Appearance**: Dual styling creates polished, engaging subtitles
3. **Customization**: Full control over every aspect of word appearance
4. **Real-time Feedback**: Live preview prevents styling mistakes
5. **Social Media Ready**: Optimized for TikTok, Instagram, YouTube Shorts

## Future Enhancements

- Multiple highlight colors for different speakers
- Animation effects for word transitions
- Batch processing for multiple videos
- Custom timing adjustments per word
- Export to other karaoke formats (LRC, etc.)

This implementation provides a complete, professional-grade karaoke subtitle system that rivals commercial video editing software while being integrated into your existing platform. 