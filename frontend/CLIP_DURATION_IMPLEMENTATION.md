# Clip Duration Configuration Implementation

## Overview
This implementation ensures that your clip configuration settings (minimum and maximum duration) are properly sent to the backend during video processing, so generated clips respect your configured duration range.

## What Was Fixed

### Problem
Previously, only the target `clipDuration` was being sent to the backend, but the `minDuration` and `maxDuration` range settings were ignored. This meant clips could be generated outside your configured range.

### Solution
Updated the frontend to track and send complete clip configuration including:
- `targetDuration` - Your preferred clip length
- `minDuration` - Minimum acceptable clip length  
- `maxDuration` - Maximum acceptable clip length

## Files Modified

### 1. Dashboard (`app/dashboard/page.tsx`)
- Added state variables for `minDuration` and `maxDuration`
- Updated all API calls to send complete `clipConfig` object:
  - YouTube processing
  - YouTube download
  - Downloaded video processing
  - File upload (via video object properties)

### 2. ClipSettings (`app/components/ClipSettings.tsx`)
- Added `onDurationRangeChange` callback to notify parent of range changes
- Updated interface to accept min/max duration tracking

### 3. VideoProcessor (`app/components/VideoProcessor.tsx`)
- Updated to send min/max duration along with target duration for uploaded videos
- Enhanced video details display to show duration range

## API Data Structure

### Before (old format)
```json
{
  "url": "https://youtube.com/watch?v=...",
  "options": {},
  "clipDuration": 60
}
```

### After (new format)
```json
{
  "url": "https://youtube.com/watch?v=...",
  "options": {},
  "clipConfig": {
    "targetDuration": 60,
    "minDuration": 30,
    "maxDuration": 90
  }
}
```

## How It Works

1. **Configuration**: You set your duration range using the sliders (e.g., 1-1.5 minutes)
2. **State Management**: Dashboard tracks `clipDuration`, `minDuration`, `maxDuration`
3. **API Calls**: All processing requests now include the complete `clipConfig`
4. **Backend Processing**: Backend receives and uses the duration range to generate appropriate clips

## Usage Example

When you configure:
- Min Duration: 1 minute (60 seconds)
- Max Duration: 1.5 minutes (90 seconds)  
- Target Duration: 1 minute 15 seconds (75 seconds)

The backend will receive:
```json
{
  "clipConfig": {
    "targetDuration": 75,
    "minDuration": 60,
    "maxDuration": 90
  }
}
```

And generate clips within the 60-90 second range, preferring 75 seconds when possible.

## Backend Requirements

Your backend needs to be updated to:
1. Accept the new `clipConfig` object structure
2. Use `minDuration` and `maxDuration` to validate clip segments
3. Prefer `targetDuration` when generating clips within the valid range
4. Fallback to old `clipDuration` parameter for backward compatibility

## Testing

To verify the implementation:
1. Set a specific duration range (e.g., 1-1.5 minutes)
2. Process a video or YouTube URL
3. Check browser Network tab to confirm `clipConfig` is being sent
4. Verify generated clips respect your duration constraints 