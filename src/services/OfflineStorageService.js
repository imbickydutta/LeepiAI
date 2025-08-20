/**
 * OfflineStorageService - Handles offline storage of recordings for later upload
 * Uses IndexedDB for persistent storage with localStorage fallback for Windows compatibility
 */

class OfflineStorageService {
  constructor() {
    this.dbName = 'LeepiAI_Recordings';
    this.dbVersion = 1;
    this.storeName = 'recordings';
    this.db = null;
    this.isInitialized = false;
    this.useFallbackStorage = false;
    this.fallbackStorageKey = 'leepi_offline_recordings';
    
    // Detect Windows and set fallback if needed
    this.isWindows = this.detectWindows();
  }

  /**
   * Detect if running on Windows
   */
  detectWindows() {
    return navigator.platform.toLowerCase().includes('win') || 
           navigator.userAgent.toLowerCase().includes('windows');
  }

  /**
   * Initialize the IndexedDB database with fallback support
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // Try IndexedDB first
      if (typeof indexedDB !== 'undefined') {
        await this.initializeIndexedDB();
      } else {
        throw new Error('IndexedDB not available');
      }
    } catch (error) {
      console.warn('⚠️ IndexedDB initialization failed, using localStorage fallback:', error);
      this.useFallbackStorage = true;
      await this.initializeFallbackStorage();
    }
  }

  /**
   * Initialize IndexedDB
   */
  async initializeIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('❌ Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object store for recordings
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('type', 'type', { unique: false });
        }
      };
    });
  }

  /**
   * Initialize localStorage fallback
   */
  async initializeFallbackStorage() {
    try {
      // Check if we have existing data to migrate
      const existingData = localStorage.getItem(this.fallbackStorageKey);

      
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize fallback storage:', error);
      throw error;
    }
  }

  /**
   * Store a recording offline with Windows compatibility
   */
  async storeRecording(recordingData) {
    await this.initialize();

    const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    // Convert File objects to ArrayBuffers for storage
    const processedData = {
      ...recordingData,
      id,
      timestamp,
      status: 'pending',
      attempts: 0,
      lastAttempt: null,
      error: null
    };

    // Process audio files with Windows compatibility
    if (processedData.inputFiles) {
      processedData.inputFiles = await this.processFilesForStorage(processedData.inputFiles);
    }
    if (processedData.outputFiles) {
      processedData.outputFiles = await this.processFilesForStorage(processedData.outputFiles);
    }

    try {
      if (this.useFallbackStorage) {
        return await this.storeInFallbackStorage(processedData);
      } else {
        return await this.storeInIndexedDB(processedData);
      }
    } catch (error) {
      console.error('❌ Failed to store recording offline:', error);
      
      // Try fallback if IndexedDB failed
      if (!this.useFallbackStorage) {
        this.useFallbackStorage = true;
        await this.initializeFallbackStorage();
        return await this.storeInFallbackStorage(processedData);
      }
      
      throw error;
    }
  }

  /**
   * Store in IndexedDB
   */
  async storeInIndexedDB(processedData) {
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    await new Promise((resolve, reject) => {
      const request = store.add(processedData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    return processedData.id;
  }

  /**
   * Store in localStorage fallback
   */
  async storeInFallbackStorage(processedData) {
    try {
      // Get existing recordings
      const existingData = localStorage.getItem(this.fallbackStorageKey);
      const recordings = existingData ? JSON.parse(existingData) : [];
      
      // Add new recording
      recordings.push(processedData);
      
      // Store back to localStorage
      localStorage.setItem(this.fallbackStorageKey, JSON.stringify(recordings));
      
      return processedData.id;
    } catch (error) {
      console.error('❌ Failed to store in fallback storage:', error);
      throw error;
    }
  }

  /**
   * Convert File objects to ArrayBuffers for storage with Windows compatibility
   */
  async processFilesForStorage(files) {
    const processedFiles = [];
    
    for (const file of files) {
      try {
        // Windows compatibility: handle file name normalization
        const normalizedName = this.normalizeFileName(file.name);
        
        const arrayBuffer = await file.arrayBuffer();
        processedFiles.push({
          name: normalizedName,
          type: file.type,
          size: file.size,
          data: arrayBuffer,
          lastModified: file.lastModified
        });
      } catch (error) {
        console.error('❌ Failed to process file for storage:', file.name, error);
        throw error;
      }
    }
    
    return processedFiles;
  }

  /**
   * Normalize file names for Windows compatibility
   */
  normalizeFileName(fileName) {
    // Replace invalid Windows characters
    return fileName.replace(/[<>:"/\\|?*]/g, '_');
  }

  /**
   * Convert stored file data back to File objects
   */
  convertStoredFilesToFiles(storedFiles) {
    return storedFiles.map(storedFile => {
      try {
        const blob = new Blob([storedFile.data], { type: storedFile.type });
        return new File([blob], storedFile.name, { 
          type: storedFile.type,
          lastModified: storedFile.lastModified
        });
      } catch (error) {
        console.error('❌ Failed to convert stored file:', storedFile.name, error);
        // Return a placeholder file to prevent crashes
        return new File([''], storedFile.name || 'unknown', { type: 'audio/wav' });
      }
    });
  }

  /**
   * Get all pending recordings
   */
  async getPendingRecordings() {
    await this.initialize();

    try {
      if (this.useFallbackStorage) {
        return await this.getFromFallbackStorage('pending');
      } else {
        return await this.getPendingFromIndexedDB();
      }
    } catch (error) {
      console.error('❌ Failed to get pending recordings:', error);
      throw error;
    }
  }

  /**
   * Get pending recordings from IndexedDB
   */
  async getPendingFromIndexedDB() {
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('status');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll('pending');
      request.onsuccess = () => {
        const recordings = request.result.map(recording => ({
          ...recording,
          inputFiles: this.convertStoredFilesToFiles(recording.inputFiles || []),
          outputFiles: this.convertStoredFilesToFiles(recording.outputFiles || [])
        }));
        resolve(recordings);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get from fallback storage
   */
  async getFromFallbackStorage(status = null) {
    try {
      const existingData = localStorage.getItem(this.fallbackStorageKey);
      if (!existingData) return [];
      
      let recordings = JSON.parse(existingData);
      
      // Filter by status if specified
      if (status) {
        recordings = recordings.filter(r => r.status === status);
      }
      
      // Convert stored files back to File objects
      return recordings.map(recording => ({
        ...recording,
        inputFiles: this.convertStoredFilesToFiles(recording.inputFiles || []),
        outputFiles: this.convertStoredFilesToFiles(recording.outputFiles || [])
      }));
    } catch (error) {
      console.error('❌ Failed to get from fallback storage:', error);
      return [];
    }
  }

  /**
   * Get all recordings (for debugging/admin purposes)
   */
  async getAllRecordings() {
    await this.initialize();

    try {
      if (this.useFallbackStorage) {
        return await this.getFromFallbackStorage();
      } else {
        return await this.getAllFromIndexedDB();
      }
    } catch (error) {
      console.error('❌ Failed to get all recordings:', error);
      throw error;
    }
  }

  /**
   * Get all recordings from IndexedDB
   */
  async getAllFromIndexedDB() {
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const recordings = request.result.map(recording => ({
          ...recording,
          inputFiles: this.convertStoredFilesToFiles(recording.inputFiles || []),
          outputFiles: this.convertStoredFilesToFiles(recording.outputFiles || [])
        }));
        resolve(recordings);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update recording status
   */
  async updateRecordingStatus(id, status, additionalData = {}) {
    await this.initialize();

    try {
      if (this.useFallbackStorage) {
        await this.updateStatusInFallbackStorage(id, status, additionalData);
      } else {
        await this.updateStatusInIndexedDB(id, status, additionalData);
      }

    } catch (error) {
      console.error('❌ Failed to update recording status:', error);
      throw error;
    }
  }

  /**
   * Update status in IndexedDB
   */
  async updateStatusInIndexedDB(id, status, additionalData = {}) {
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    // Get current recording
    const currentRecording = await new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (!currentRecording) {
      throw new Error(`Recording with ID ${id} not found`);
    }

    // Update recording
    const updatedRecording = {
      ...currentRecording,
      status,
      ...additionalData
    };

    await new Promise((resolve, reject) => {
      const request = store.put(updatedRecording);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update status in fallback storage
   */
  async updateStatusInFallbackStorage(id, status, additionalData = {}) {
    try {
      const existingData = localStorage.getItem(this.fallbackStorageKey);
      if (!existingData) throw new Error('No recordings found');
      
      let recordings = JSON.parse(existingData);
      const recordingIndex = recordings.findIndex(r => r.id === id);
      
      if (recordingIndex === -1) {
        throw new Error(`Recording with ID ${id} not found`);
      }

      // Update recording
      recordings[recordingIndex] = {
        ...recordings[recordingIndex],
        status,
        ...additionalData
      };

      // Store back to localStorage
      localStorage.setItem(this.fallbackStorageKey, JSON.stringify(recordings));
    } catch (error) {
      console.error('❌ Failed to update status in fallback storage:', error);
      throw error;
    }
  }

  /**
   * Mark recording as successfully uploaded
   */
  async markAsUploaded(id, result) {
    await this.updateRecordingStatus(id, 'completed', {
      uploadedAt: new Date().toISOString(),
      result
    });
  }

  /**
   * Mark recording as failed and increment attempt count
   */
  async markAsFailed(id, error) {
    const currentRecording = await this.getRecordingById(id);
    const attempts = (currentRecording?.attempts || 0) + 1;
    
    await this.updateRecordingStatus(id, 'failed', {
      attempts,
      lastAttempt: new Date().toISOString(),
      error
    });
  }

  /**
   * Get recording by ID
   */
  async getRecordingById(id) {
    await this.initialize();

    try {
      if (this.useFallbackStorage) {
        const recordings = await this.getFromFallbackStorage();
        return recordings.find(r => r.id === id);
      } else {
        return await this.getRecordingByIdFromIndexedDB(id);
      }
    } catch (error) {
      console.error('❌ Failed to get recording by ID:', error);
      throw error;
    }
  }

  /**
   * Get recording by ID from IndexedDB
   */
  async getRecordingByIdFromIndexedDB(id) {
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => {
        const recording = request.result;
        if (recording) {
          recording.inputFiles = this.convertStoredFilesToFiles(recording.inputFiles || []);
          recording.outputFiles = this.convertStoredFilesToFiles(recording.outputFiles || []);
        }
        resolve(recording);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete recording from offline storage
   */
  async deleteRecording(id) {
    await this.initialize();

    try {
      if (this.useFallbackStorage) {
        await this.deleteFromFallbackStorage(id);
      } else {
        await this.deleteFromIndexedDB(id);
      }

    } catch (error) {
      console.error('❌ Failed to delete recording:', error);
      throw error;
    }
  }

  /**
   * Delete from IndexedDB
   */
  async deleteFromIndexedDB(id) {
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    await new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete from fallback storage
   */
  async deleteFromFallbackStorage(id) {
    try {
      const existingData = localStorage.getItem(this.fallbackStorageKey);
      if (!existingData) return;
      
      let recordings = JSON.parse(existingData);
      recordings = recordings.filter(r => r.id !== id);
      
      localStorage.setItem(this.fallbackStorageKey, JSON.stringify(recordings));
    } catch (error) {
      console.error('❌ Failed to delete from fallback storage:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    await this.initialize();

    try {
      const allRecordings = await this.getAllRecordings();
      const totalSize = allRecordings.reduce((size, recording) => {
        const inputSize = (recording.inputFiles || []).reduce((s, f) => s + f.size, 0);
        const outputSize = (recording.outputFiles || []).reduce((s, f) => s + f.size, 0);
        return size + inputSize + outputSize;
      }, 0);

      return {
        totalRecordings: allRecordings.length,
        pendingRecordings: allRecordings.filter(r => r.status === 'pending').length,
        failedRecordings: allRecordings.filter(r => r.status === 'failed').length,
        completedRecordings: allRecordings.filter(r => r.status === 'completed').length,
        totalSize: this.formatBytes(totalSize),
        totalSizeBytes: totalSize,
        storageType: this.useFallbackStorage ? 'localStorage (fallback)' : 'IndexedDB',
        isWindows: this.isWindows
      };
    } catch (error) {
      console.error('❌ Failed to get storage stats:', error);
      throw error;
    }
  }

  /**
   * Format bytes to human readable format
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Clear all offline recordings
   */
  async clearAllRecordings() {
    await this.initialize();

    try {
      if (this.useFallbackStorage) {
        localStorage.removeItem(this.fallbackStorageKey);
      } else {
        await this.clearAllFromIndexedDB();
      }

    } catch (error) {
      console.error('❌ Failed to clear all recordings:', error);
      throw error;
    }
  }

  /**
   * Clear all from IndexedDB
   */
  async clearAllFromIndexedDB() {
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    await new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Test storage compatibility
   */
  async testStorageCompatibility() {
    try {
      await this.initialize();
      
      const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        data: new ArrayBuffer(1024) // 1KB test data
      };

      if (this.useFallbackStorage) {
        // Test localStorage
        const testKey = 'leepi_test_storage';
        localStorage.setItem(testKey, JSON.stringify(testData));
        const retrieved = localStorage.getItem(testKey);
        localStorage.removeItem(testKey);
        
        return {
          compatible: true,
          storageType: 'localStorage',
          testData: retrieved ? 'passed' : 'failed'
        };
      } else {
        // Test IndexedDB
        const testId = 'test_' + Date.now();
        await this.storeInIndexedDB({ ...testData, id: testId });
        await this.deleteFromIndexedDB(testId);
        
        return {
          compatible: true,
          storageType: 'IndexedDB',
          testData: 'passed'
        };
      }
    } catch (error) {
      return {
        compatible: false,
        error: error.message,
        storageType: this.useFallbackStorage ? 'localStorage' : 'IndexedDB'
      };
    }
  }
}

// Export singleton instance
export default new OfflineStorageService(); 