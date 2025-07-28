const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Audio operations - restored native recording
  audio: {
    startRecording: () => ipcRenderer.invoke('audio-start-recording'),
    stopRecording: () => ipcRenderer.invoke('audio-stop-recording'),
    startDualRecording: () => ipcRenderer.invoke('audio-start-dual-recording'),
    stopDualRecording: () => ipcRenderer.invoke('audio-stop-dual-recording'),
    getDevices: () => ipcRenderer.invoke('audio-get-devices')
  },

  // Windows WebRTC audio data saving
  saveAudioData: (segmentId, type, audioData) => ipcRenderer.invoke('save-audio-data', { segmentId, type, audioData }),

  // Local storage operations
  storage: {
    get: (key) => ipcRenderer.invoke('storage-get', key),
    set: (key, value) => ipcRenderer.invoke('storage-set', key, value),
    delete: (key) => ipcRenderer.invoke('storage-delete', key),
    clear: () => ipcRenderer.invoke('storage-clear')
  },

  // File operations
  file: {
    saveDialog: (options) => ipcRenderer.invoke('file-save-dialog', options),
    openDialog: (options) => ipcRenderer.invoke('file-open-dialog', options),
    saveContent: (data) => ipcRenderer.invoke('file-save-content', data),
    downloadBlob: (data) => ipcRenderer.invoke('file-download-blob', data),
    readAudioFile: (filePath) => ipcRenderer.invoke('file-read-audio', filePath)
  },

  // System info and operations
  system: {
    getInfo: () => ipcRenderer.invoke('system-get-info'),
    openExternal: (url) => ipcRenderer.invoke('system-open-external', url)
  },

  // Window operations
  window: {
    minimize: () => ipcRenderer.invoke('window-minimize'),
    maximize: () => ipcRenderer.invoke('window-maximize'),
    close: () => ipcRenderer.invoke('window-close'),
    reload: () => ipcRenderer.invoke('window-reload')
  },

  // Development helpers
  dev: {
    openDevTools: () => ipcRenderer.invoke('dev-open-devtools')
  }
}); 