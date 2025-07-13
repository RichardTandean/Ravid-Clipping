// API Configuration - Monolithic Backend
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const apiConfig = {
  baseURL: API_BASE_URL,
  endpoints: {
    // Video processing endpoints
    processVideo: `${API_BASE_URL}/api/process-video`,
    uploadVideo: `${API_BASE_URL}/api/upload`,
    youtubeFormats: `${API_BASE_URL}/api/youtube/formats`,
    youtubeProcess: `${API_BASE_URL}/api/youtube/process`,
    youtubeDownload: `${API_BASE_URL}/api/youtube/download`,
    processDownloadedVideo: `${API_BASE_URL}/api/process-downloaded-video`,
    crop: `${API_BASE_URL}/api/crop`,
    cleanup: `${API_BASE_URL}/api/cleanup`,
    
    // Progress and status endpoints
    progress: (sessionId: string) => `${API_BASE_URL}/api/progress/${sessionId}`,
    status: (sessionId: string) => `${API_BASE_URL}/api/status/${sessionId}`,
    
    // Download endpoints
    download: (filename: string) => `${API_BASE_URL}/api/download/${filename}`,
    uploads: (filename: string) => `${API_BASE_URL}/api/uploads/${filename}`,
    
    // Subtitle generation endpoints
    subtitlePresets: `${API_BASE_URL}/api/subtitle-presets`,
    subtitleLanguages: `${API_BASE_URL}/api/subtitle-languages`,
    generateTranscript: `${API_BASE_URL}/api/generate-transcript`,
    generateSubtitleFile: `${API_BASE_URL}/api/generate-subtitle-file`,
    burnSubtitles: `${API_BASE_URL}/api/burn-subtitles`,
    addSubtitlesToClips: `${API_BASE_URL}/api/add-subtitles-to-clips`,
  }
};

// Simple API call function for monolithic backend
export const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  try {
    console.log('API Call:', endpoint, options);
    
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('API Error:', response.status, errorText);
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    // Handle different content types
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    console.error('API call failed:', error);
    throw error;
  }
};

// Upload file function for monolithic backend
export const uploadFile = async (file: File, additionalData?: Record<string, any>) => {
  try {
    const formData = new FormData();
    formData.append('video', file);
    
    // Add any additional data to the form
    if (additionalData) {
      Object.entries(additionalData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
    }

    console.log('Uploading file:', file.name);
    
    const response = await fetch(apiConfig.endpoints.uploadVideo, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload Error:', response.status, errorText);
      throw new Error(`Upload failed: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('File upload failed:', error);
    throw error;
  }
}; 