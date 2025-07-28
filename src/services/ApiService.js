import axios from 'axios';

/**
 * API Service for communicating with LeepiAI Backend
 * Replaces the embedded backend services with HTTP calls
 */
class ApiService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    this.token = null;
    this.refreshToken = null;
    
    // Create axios instance
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // Default timeout, will be overridden for uploads
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.api.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            if (this.refreshToken) {
              const response = await this.refreshAccessToken();
              if (response.success) {
                originalRequest.headers.Authorization = `Bearer ${this.token}`;
                return this.api(originalRequest);
              }
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            this.clearTokens();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    console.log('🔗 ApiService initialized with backend URL:', this.baseURL);
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Calculate dynamic timeout based on file size
   * @param {File|File[]} files - File or array of files
   * @returns {number} Timeout in milliseconds
   */
  calculateUploadTimeout(files) {
    const fileArray = Array.isArray(files) ? files : [files];
    const totalSize = fileArray.reduce((sum, file) => sum + file.size, 0);
    
    // Base timeout: 30 seconds
    let timeout = 30000;
    
    // Add time based on file size
    // For every 10MB, add 30 seconds
    const sizeInMB = totalSize / (1024 * 1024);
    const additionalTime = Math.ceil(sizeInMB / 10) * 30000;
    
    // Add transcription time estimate
    // Assume 1 minute of audio takes ~30 seconds to transcribe
    // For every 10 minutes of audio, add 5 minutes
    const estimatedDurationInMinutes = sizeInMB * 2; // Rough estimate: 1MB ≈ 2 minutes of audio
    const transcriptionTime = Math.ceil(estimatedDurationInMinutes / 10) * 300000; // 5 minutes per 10 minutes of audio
    
    timeout += additionalTime + transcriptionTime;
    
    // Cap at 30 minutes maximum for large files
    const maxTimeout = 30 * 60 * 1000; // 30 minutes
    timeout = Math.min(timeout, maxTimeout);
    
    console.log(`📊 Upload timeout calculated: ${timeout/1000}s for ${(totalSize/(1024*1024)).toFixed(1)}MB file(s)`);
    
    return timeout;
  }







  // =====================================================
  // TOKEN MANAGEMENT
  // =====================================================

  setTokens(token, refreshToken) {
    this.token = token;
    this.refreshToken = refreshToken;
    
    // Store in localStorage for persistence
    if (token) {
      localStorage.setItem('leepi_token', token);
    }
    if (refreshToken) {
      localStorage.setItem('leepi_refresh_token', refreshToken);
    }
  }

  clearTokens() {
    this.token = null;
    this.refreshToken = null;
    localStorage.removeItem('leepi_token');
    localStorage.removeItem('leepi_refresh_token');
  }

  loadTokensFromStorage() {
    this.token = localStorage.getItem('leepi_token');
    this.refreshToken = localStorage.getItem('leepi_refresh_token');
  }

  async refreshAccessToken() {
    try {
      const response = await axios.post(`${this.baseURL}/api/auth/refresh`, {
        refreshToken: this.refreshToken
      });

      if (response.data.success) {
        this.setTokens(response.data.token, response.data.refreshToken);
        return { success: true, user: response.data.user };
      }

      return { success: false, error: 'Token refresh failed' };
    } catch (error) {
      console.error('Token refresh error:', error);
      return { success: false, error: error.response?.data?.error || 'Token refresh failed' };
    }
  }

  // =====================================================
  // AUTHENTICATION
  // =====================================================

  async login(credentials) {
    try {
      const response = await this.api.post('/api/auth/login', credentials);
      
      if (response.data.success) {
        this.setTokens(response.data.token, response.data.refreshToken);
        return {
          success: true,
          user: response.data.user,
          token: response.data.token
        };
      }

      return { success: false, error: response.data.error };
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Login failed'
      };
    }
  }

  async register(userData) {
    try {
      const response = await this.api.post('/api/auth/register', userData);
      
      if (response.data.success) {
        this.setTokens(response.data.token, response.data.refreshToken);
        return {
          success: true,
          user: response.data.user,
          token: response.data.token
        };
      }

      return { success: false, error: response.data.error };
    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed'
      };
    }
  }

  async logout() {
    try {
      if (this.token) {
        await this.api.post('/api/auth/logout');
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearTokens();
      return { success: true };
    }
  }

  async getCurrentUser() {
    try {
      this.loadTokensFromStorage();
      
      if (!this.token) {
        return null;
      }

      const response = await this.api.get('/api/auth/me');
      
      if (response.data.success) {
        return response.data.user;
      }

      return null;
    } catch (error) {
      console.error('Get current user error:', error);
      this.clearTokens();
      return null;
    }
  }

  // =====================================================
  // ERROR HANDLING
  // =====================================================

  handleError(error) {
    console.error('API Error:', error);
    
    if (error.response) {
      // Server responded with error status
      return {
        success: false,
        error: error.response.data?.error || error.response.data?.message || 'Server error',
        status: error.response.status
      };
    } else if (error.request) {
      // Request was made but no response received
      return {
        success: false,
        error: 'Network error - unable to reach server'
      };
    } else {
      // Something else happened
      return {
        success: false,
        error: error.message || 'Unknown error occurred'
      };
    }
  }

  // =====================================================
  // AUDIO UPLOAD & TRANSCRIPTION
  // =====================================================

  // Upload audio file for transcription
  async uploadAudio(audioFile, onProgress = null) {
    try {
      // Use original file - no compression needed since we record at optimal 16kHz
      const fileToUpload = audioFile;

      const formData = new FormData();
      formData.append('audio', fileToUpload);

      // Calculate dynamic timeout based on compressed file size
      const timeout = this.calculateUploadTimeout(fileToUpload);

      const response = await this.api.post('/api/audio/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: timeout,
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
      });

      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Upload dual audio files (microphone + system) for transcription
  async uploadDualAudio(microphoneFile, systemFile, onProgress = null) {
    try {
      // Check if this is a segmented recording
      const isSegmented = Array.isArray(microphoneFile);
      
      if (isSegmented) {
        // Handle segmented upload
        return await this.uploadSegmentedDualAudio(microphoneFile, systemFile, onProgress);
      }

      // Use original files - no compression needed since we record at optimal 16kHz
      const micFileToUpload = microphoneFile;
      const sysFileToUpload = systemFile;

      const formData = new FormData();
      formData.append('microphone', micFileToUpload);
      formData.append('system', sysFileToUpload);
      formData.append('isDualAudio', 'true');

      // Calculate dynamic timeout based on file sizes
      const timeout = this.calculateUploadTimeout([micFileToUpload, sysFileToUpload]);

      const response = await this.api.post('/api/audio/upload-dual', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: timeout,
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
      });

      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // Upload segmented dual audio files (multiple 1-minute segments)
  async uploadSegmentedDualAudio(microphoneFiles, systemFiles, onProgress = null) {
    try {
      const formData = new FormData();
      
      // Add all microphone files
      microphoneFiles.forEach((file, index) => {
        formData.append('microphone', file);
      });
      
      // Add all system files (if any)
      if (systemFiles && systemFiles.length > 0) {
        systemFiles.forEach((file, index) => {
          formData.append('system', file);
        });
      }

      // Calculate dynamic timeout based on total file sizes
      const allFiles = [...microphoneFiles, ...(systemFiles || [])];
      const timeout = this.calculateUploadTimeout(allFiles);

      console.log(`📤 Uploading ${microphoneFiles.length} segmented audio files...`);

      const response = await this.api.post('/api/audio/upload-segmented-dual', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: timeout,
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percentCompleted);
          }
        },
      });

      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getSupportedFormats() {
    try {
      const response = await this.api.get('/api/audio/formats');
      return response.data;
    } catch (error) {
      console.error('Get formats error:', error);
      return {
        success: false,
        error: 'Failed to get supported formats'
      };
    }
  }

  // =====================================================
  // TRANSCRIPT MANAGEMENT
  // =====================================================

  async getTranscripts(options = {}) {
    try {
      const params = new URLSearchParams();
      
      if (options.limit) params.append('limit', options.limit);
      if (options.offset) params.append('offset', options.offset);
      if (options.sortBy) params.append('sortBy', options.sortBy);
      if (options.sortOrder) params.append('sortOrder', options.sortOrder);
      if (options.includeSegments !== undefined) params.append('includeSegments', options.includeSegments);

      const response = await this.api.get(`/api/transcripts?${params}`);
      
      if (response.data.success) {
        return {
          success: true,
          transcripts: response.data.transcripts
        };
      }

      return { success: false, error: response.data.error };
    } catch (error) {
      console.error('Get transcripts error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get transcripts'
      };
    }
  }

  async getTranscript(transcriptId) {
    try {
      const response = await this.api.get(`/api/transcripts/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Get transcript error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get transcript'
      };
    }
  }

  async updateTranscript(transcriptId, updates) {
    try {
      const response = await this.api.put(`/api/transcripts/${transcriptId}`, updates);
      return response.data;
    } catch (error) {
      console.error('Update transcript error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to update transcript'
      };
    }
  }

  async deleteTranscript(transcriptId) {
    try {
      const response = await this.api.delete(`/api/transcripts/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Delete transcript error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to delete transcript'
      };
    }
  }

  async searchTranscripts(query, options = {}) {
    try {
      const params = new URLSearchParams();
      params.append('q', query);
      
      if (options.limit) params.append('limit', options.limit);
      if (options.offset) params.append('offset', options.offset);

      const response = await this.api.get(`/api/transcripts/search?${params}`);
      return response.data;
    } catch (error) {
      console.error('Search transcripts error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Search failed'
      };
    }
  }

  async exportTranscript(transcriptId, format, includeAnalysis = true) {
    try {
      const response = await this.api.post(`/api/transcripts/${transcriptId}/export`, {
        format,
        includeAnalysis
      }, {
        responseType: 'blob'
      });

      return {
        success: true,
        blob: response.data,
        filename: response.headers['content-disposition']?.split('filename=')[1]?.replace(/"/g, '')
      };
    } catch (error) {
      console.error('Export transcript error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Export failed'
      };
    }
  }

  // =====================================================
  // AI SERVICES
  // =====================================================

  async generateSummary(transcriptId) {
    try {
      const response = await this.api.post(`/api/ai/summary/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Generate summary error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to generate summary'
      };
    }
  }

  async generateDebrief(transcriptId) {
    try {
      const response = await this.api.post(`/api/ai/debrief/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Generate debrief error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to generate debrief'
      };
    }
  }

  // =====================================================
  // ADMIN AI OPERATIONS
  // =====================================================

  async generateSummaryForAdmin(transcriptId) {
    try {
      const response = await this.api.post(`/api/ai/admin/summary/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Admin generate summary error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to generate summary'
      };
    }
  }

  async generateDebriefForAdmin(transcriptId) {
    try {
      const response = await this.api.post(`/api/ai/admin/debrief/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Admin generate debrief error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to generate debrief'
      };
    }
  }

  async chatWithTranscript(transcriptId, message, saveToHistory = true) {
    try {
      const response = await this.api.post(`/api/ai/chat/${transcriptId}`, {
        message,
        saveToHistory
      });
      return response.data;
    } catch (error) {
      console.error('AI chat error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Chat failed'
      };
    }
  }

  async getChatHistory(transcriptId) {
    try {
      const response = await this.api.get(`/api/ai/chat/${transcriptId}/history`);
      return response.data;
    } catch (error) {
      console.error('Get chat history error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get chat history'
      };
    }
  }

  async clearChatHistory(transcriptId) {
    try {
      const response = await this.api.delete(`/api/ai/chat/${transcriptId}/history`);
      return response.data;
    } catch (error) {
      console.error('Clear chat history error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to clear chat history'
      };
    }
  }

  async extractQA(transcriptId) {
    try {
      const response = await this.api.post(`/api/ai/extract-qa/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Extract Q&A error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to extract Q&A'
      };
    }
  }

  async generateFollowUpQuestions(transcriptId) {
    try {
      const response = await this.api.post(`/api/ai/follow-up-questions/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Generate follow-up questions error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to generate follow-up questions'
      };
    }
  }

  async analyzeTranscript(transcriptId) {
    try {
      const response = await this.api.post(`/api/ai/analyze/${transcriptId}`);
      return response.data;
    } catch (error) {
      console.error('Analyze transcript error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Analysis failed'
      };
    }
  }

  // =====================================================
  // USER MANAGEMENT
  // =====================================================

  async getUserProfile() {
    try {
      const response = await this.api.get('/api/users/profile');
      return response.data;
    } catch (error) {
      console.error('Get user profile error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get profile'
      };
    }
  }

  async updateUserProfile(updates) {
    try {
      const response = await this.api.put('/api/users/profile', updates);
      return response.data;
    } catch (error) {
      console.error('Update user profile error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to update profile'
      };
    }
  }

  async getUserStats() {
    try {
      const response = await this.api.get('/api/users/stats');
      return response.data;
    } catch (error) {
      console.error('Get user stats error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get stats'
      };
    }
  }

  // =====================================================
  // ADMIN OPERATIONS
  // =====================================================

  async getUsers(options = {}) {
    try {
      const params = new URLSearchParams();
      Object.entries(options).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          params.append(key, value);
        }
      });
      
      const response = await this.api.get(`/api/analytics/users?${params.toString()}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async deleteUser(userId) {
    try {
      const response = await this.api.delete(`/api/users/${userId}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateUserRole(userId, role) {
    try {
      const response = await this.api.put(`/api/users/${userId}/role`, { role });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAnalytics() {
    try {
      const response = await this.api.get('/api/analytics');
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getAllTranscripts(options = {}) {
    try {
      const params = new URLSearchParams();
      Object.entries(options).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          params.append(key, value);
        }
      });
      
      const response = await this.api.get(`/api/analytics/transcripts?${params.toString()}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getTranscriptForAdmin(transcriptId) {
    try {
      const response = await this.api.get(`/api/analytics/transcripts/${transcriptId}`);
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getSystemSettings() {
    try {
      const response = await this.api.get('/api/settings');
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async updateSystemSetting(key, value) {
    try {
      const response = await this.api.put('/api/settings', { key, value });
      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  // =====================================================
  // SYSTEM
  // =====================================================

  async checkBackendStatus() {
    try {
      const response = await axios.get(`${this.baseURL}/health`, { timeout: 5000 });
      return {
        available: true,
        status: response.data
      };
    } catch (error) {
      console.error('Backend status check failed:', error);
      return {
        available: false,
        error: error.message
      };
    }
  }

  async getAIServiceStatus() {
    try {
      const response = await this.api.get('/api/ai/status');
      return response.data;
    } catch (error) {
      console.error('AI service status error:', error);
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to get AI status'
      };
    }
  }
}

// Create singleton instance
const apiService = new ApiService();

export default apiService; 