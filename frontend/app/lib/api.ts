// API Configuration - Updated for Microservices Architecture with API Gateway
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiConfig = {
  baseURL: API_BASE_URL,
  endpoints: {
    // Authentication endpoints (handled by API Gateway)
    auth: {
      login: `${API_BASE_URL}/api/auth/login`,
      logout: `${API_BASE_URL}/api/auth/logout`,
      refresh: `${API_BASE_URL}/api/auth/refresh`,
      profile: `${API_BASE_URL}/api/auth/profile`,
      changePassword: `${API_BASE_URL}/api/auth/change-password`,
      sessions: `${API_BASE_URL}/api/auth/sessions`,
    },
    
    // Gateway health and status
    health: `${API_BASE_URL}/health`,
    status: `${API_BASE_URL}/api/status`,
    
    // Queue service endpoints (through API Gateway)
    queue: {
      // Job management
      submitJob: (queueName: string) => `${API_BASE_URL}/api/queue/queues/${queueName}/jobs`,
      getJob: (jobId: string) => `${API_BASE_URL}/api/queue/jobs/${jobId}`,
      getQueueStatus: `${API_BASE_URL}/api/queue/queues/status`,
      
      // Progress tracking
      progress: (sessionId: string) => `${API_BASE_URL}/api/queue/progress/${sessionId}`,
      
      // Video processing jobs
      processVideo: `${API_BASE_URL}/api/queue/queues/video-processing/jobs`,
      transcribeVideo: `${API_BASE_URL}/api/queue/queues/transcription/jobs`,
      analyzeVideo: `${API_BASE_URL}/api/queue/queues/ai-analysis/jobs`,
      timestampVideo: `${API_BASE_URL}/api/queue/queues/whisper-timestamp/jobs`,
    },
    
    // Storage service endpoints (through API Gateway)
    storage: {
      upload: `${API_BASE_URL}/api/storage/upload`,
      download: (fileId: string) => `${API_BASE_URL}/api/storage/download/${fileId}`,
      metadata: (fileId: string) => `${API_BASE_URL}/api/storage/metadata/${fileId}`,
      deleteFile: (fileId: string) => `${API_BASE_URL}/api/storage/files/${fileId}`,
      stats: `${API_BASE_URL}/api/storage/stats`,
      cleanup: `${API_BASE_URL}/api/storage/cleanup`,
    },
    
    // Legacy endpoints (to be migrated)
    legacy: {
      processVideo: `${API_BASE_URL}/api/process-video`,
      uploadVideo: `${API_BASE_URL}/api/upload`,
      youtubeFormats: `${API_BASE_URL}/api/youtube/formats`,
      youtubeProcess: `${API_BASE_URL}/api/youtube/process`,
      youtubeDownload: `${API_BASE_URL}/api/youtube/download`,
      processDownloadedVideo: `${API_BASE_URL}/api/process-downloaded-video`,
      crop: `${API_BASE_URL}/api/crop`,
      cleanup: `${API_BASE_URL}/api/cleanup`,
      progress: (sessionId: string) => `${API_BASE_URL}/api/progress/${sessionId}`,
      status: (sessionId: string) => `${API_BASE_URL}/api/status/${sessionId}`,
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
  }
};

// Token management
class TokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';

  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  static setAccessToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, token);
  }

  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  static setRefreshToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.REFRESH_TOKEN_KEY, token);
  }

  static clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
  }

  static setTokens(accessToken: string, refreshToken: string): void {
    this.setAccessToken(accessToken);
    this.setRefreshToken(refreshToken);
  }
}

// Enhanced API call helper with authentication and error handling
export const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const accessToken = TokenManager.getAccessToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // Add authentication header if token exists
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(endpoint, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized - try to refresh token
    if (response.status === 401) {
      const refreshToken = TokenManager.getRefreshToken();
      if (refreshToken) {
        try {
          const refreshResponse = await fetch(apiConfig.endpoints.auth.refresh, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${refreshToken}`,
            },
          });

          if (refreshResponse.ok) {
            const { accessToken: newAccessToken, refreshToken: newRefreshToken } = await refreshResponse.json();
            TokenManager.setTokens(newAccessToken, newRefreshToken);
            
            // Retry original request with new token
            headers['Authorization'] = `Bearer ${newAccessToken}`;
            const retryResponse = await fetch(endpoint, {
              ...options,
              headers,
            });

            if (!retryResponse.ok) {
              throw new Error(`API call failed: ${retryResponse.status} ${retryResponse.statusText}`);
            }

            return retryResponse.json();
          } else {
            // Refresh failed, clear tokens and redirect to login
            TokenManager.clearTokens();
            throw new Error('Authentication failed - please login again');
          }
        } catch (refreshError) {
          TokenManager.clearTokens();
          throw new Error('Authentication failed - please login again');
        }
      } else {
        throw new Error('Authentication required - please login');
      }
    }

    if (!response.ok) {
      // Try to parse error response
      try {
        const errorData = await response.json();
        throw new Error(errorData.message || `API call failed: ${response.status} ${response.statusText}`);
      } catch {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }
    }

    return response.json();
  } catch (error) {
    console.error('API call error:', error);
    throw error;
  }
};

// Job submission helper for microservices
export const submitJob = async (queueName: string, jobType: string, data: any, priority: 'low' | 'normal' | 'high' | 'critical' = 'normal') => {
  return apiCall(apiConfig.endpoints.queue.submitJob(queueName), {
    method: 'POST',
    body: JSON.stringify({
      type: jobType,
      data,
      priority,
    }),
  });
};

// File upload helper with authentication
export const uploadFile = async (file: File, additionalData?: Record<string, any>) => {
  const formData = new FormData();
  formData.append('file', file);
  
  if (additionalData) {
    Object.entries(additionalData).forEach(([key, value]) => {
      formData.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  }

  const accessToken = TokenManager.getAccessToken();
  const headers: Record<string, string> = {};
  
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(apiConfig.endpoints.storage.upload, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return response.json();
};

export { TokenManager }; 