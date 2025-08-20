const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const Store = require('electron-store');
const isDev = require('electron-is-dev');
const AudioCaptureManager = require('./services/AudioCaptureManager');

// Load audio configuration
const audioConfig = require('./config');


// Enable additional features for media capture (must be set before app ready)
app.commandLine.appendSwitch('enable-features', 'MediaFoundationVideoCapture');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'LeepiAI');

// Windows-specific switches for system audio capture
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('enable-features', 'WebCodecs,WebRtcUseMinMaxVEADimensions');
  app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
  app.commandLine.appendSwitch('force-fieldtrials', 'WebRTC-Audio-MinimizeResamplingOnMobile/Enabled/');
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream'); // Skip permission dialogs in testing
}

// Initialize persistent storage
const store = new Store();

// Services
let audioCaptureManager;

// Main window reference
let mainWindow;

/**
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    ELECTRON MAIN PROCESS                     │
 * │                                                             │
 * │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
 * │  │    Audio    │───▶│    HTTP     │───▶│   Backend   │     │
 * │  │   Capture   │    │ API Calls   │    │   Server    │     │
 * │  └─────────────┘    └─────────────┘    └─────────────┘     │
 * │                                              │             │
 * │  ┌─────────────┐    ┌─────────────┐         │             │
 * │  │     UI      │◀───│     IPC     │◀────────┘             │
 * │  │  Renderer   │    │  Handlers   │                       │
 * │  └─────────────┘    └─────────────┘                       │
 * └─────────────────────────────────────────────────────────────┘
 */

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: isDev ? false : true, // Allow screen capture in development
      allowRunningInsecureContent: false,
      experimentalFeatures: true, // Enable experimental web features
    },
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon: process.platform !== 'darwin' ? path.join(__dirname, '../../build-resources/icon.png') : undefined
  });

  // Load the app
  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Always show DevTools for debugging (remove this line after testing)
    mainWindow.webContents.openDevTools();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Add keyboard shortcut for DevTools (F12)
  const { globalShortcut } = require('electron');

  // Register F12 shortcut for DevTools
  globalShortcut.register('F12', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.openDevTools();
    }
  });
}

// App event handlers
app.whenReady().then(async () => {
  createWindow();

  // Initialize services
  try {
    audioCaptureManager = new AudioCaptureManager();

    // Set main window reference for Windows WebRTC audio capture
    if (process.platform === 'win32' && audioCaptureManager.windowsAudioCapture) {
      audioCaptureManager.windowsAudioCapture.setMainWindow(mainWindow);
    }

  } catch (error) {
    console.error('❌ Failed to initialize AudioCaptureManager:', error);
    audioCaptureManager = null;
  }

  // Enhanced permission handling for system audio capture
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('🔐 Permission request:', permission);

    // Allow all media-related permissions
    if (permission.includes('media') || permission.includes('display') || permission.includes('capture')) {
      console.log('✅ Media permission granted:', permission);
      return callback(true);
    }

    // Allow microphone and camera
    if (permission.includes('microphone') || permission.includes('camera')) {
      console.log('✅ Device permission granted:', permission);
      return callback(true);
    }

    console.log('❌ Permission denied:', permission);
    callback(false);
  });
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('🔐 Permission request:', permission);

    // Allow all media-related permissions
    if (permission.includes('media') || permission.includes('display') || permission.includes('capture')) {
      console.log('✅ Media permission granted:', permission);
      return callback(true);
    }

    // Allow microphone and camera
    if (permission.includes('microphone') || permission.includes('camera')) {
      console.log('✅ Device permission granted:', permission);
      return callback(true);
    }

    console.log('❌ Permission denied:', permission);
    callback(false);
  });

  // Request system audio permissions on startup
  if (process.platform === 'win32') {
    console.log('🔐 Requesting Windows system audio permissions...');

    // Show a dialog requesting system audio permissions
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const { dialog } = require('electron');
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'System Audio Permission Required',
          message: 'LeepiAI needs permission to capture system audio for recording.',
          detail: 'Please click OK and then allow screen capture when prompted. This will enable system audio recording.',
          buttons: ['OK', 'Cancel'],
          defaultId: 0
        });

        if (result.response === 0) {
          console.log('✅ User agreed to system audio permissions');
          // Note: System audio permissions are now handled by WindowsAudioCapture.js
          // using getUserMedia instead of getDisplayMedia
          console.log('ℹ️ System audio will be captured using getUserMedia when recording starts');
        } else {
          console.log('❌ User declined system audio permissions');
        }
      } catch (error) {
        console.error('❌ Failed to request system audio permissions:', error);
      }
    });
  }

  // Note: System audio capture is now handled by WindowsAudioCapture.js
  // using getUserMedia instead of getDisplayMedia, so we don't need this handler
  console.log('ℹ️ System audio capture handled by WindowsAudioCapture.js service');


  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('❌ Stack trace:', error.stack);

  // Safety: Stop any active recording if AudioCaptureManager is available
  if (audioCaptureManager) {
    console.log('🛡️ Safety: Stopping recording due to uncaught exception...');
    try {
      if (audioCaptureManager.isRecording) {
        audioCaptureManager.stopDualRecording().catch(stopError => {
          console.warn('⚠️ Could not stop recording during exception recovery:', stopError.message);
        });
      }
    } catch (stopError) {
      console.warn('⚠️ Could not stop recording during exception recovery:', stopError.message);
    }
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);

  // Safety: Stop any active recording if AudioCaptureManager is available
  if (audioCaptureManager) {
    console.log('🛡️ Safety: Stopping recording due to unhandled rejection...');
    try {
      if (audioCaptureManager.isRecording) {
        audioCaptureManager.stopDualRecording().catch(stopError => {
          console.warn('⚠️ Could not stop recording during rejection recovery:', stopError.message);
        });
      }
    } catch (stopError) {
      console.warn('⚠️ Could not stop recording during rejection recovery:', stopError.message);
    }
  }
});

// ===============================
// IPC HANDLERS - Audio Recording
// ===============================

// Audio Recording
ipcMain.handle('audio-start-dual-recording', async () => {
  try {
    // TEMP_DEBUG_IPC_001: Log IPC call
    console.log('📞 TEMP_DEBUG_IPC_001 - IPC: audio-start-dual-recording called');

    if (!audioCaptureManager) {
      console.error('❌ TEMP_DEBUG_IPC_001 - AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }

    console.log('🔧 TEMP_DEBUG_IPC_001 - Calling audioCaptureManager.startDualRecording()');
    const result = await audioCaptureManager.startDualRecording();

    // DEBUG: Log the result structure to identify non-serializable objects
    console.log('🔍 TEMP_DEBUG_IPC_001 - Result type:', typeof result);
    console.log('🔍 TEMP_DEBUG_IPC_001 - Result keys:', Object.keys(result || {}));
    console.log('🔍 TEMP_DEBUG_IPC_001 - Result success:', result?.success);
    console.log('🔍 TEMP_DEBUG_IPC_001 - Result sessionId:', result?.sessionId);
    console.log('🔍 TEMP_DEBUG_IPC_001 - Result segments type:', typeof result?.segments);
    console.log('🔍 TEMP_DEBUG_IPC_001 - Result segments length:', result?.segments?.length);

    // Test serialization before returning
    try {
      const testSerialization = JSON.stringify(result);
      console.log('✅ TEMP_DEBUG_IPC_001 - Result serialization test passed, length:', testSerialization.length);
    } catch (serializeError) {
      console.error('❌ TEMP_DEBUG_IPC_001 - Result serialization failed:', serializeError);
      console.error('❌ TEMP_DEBUG_IPC_001 - Problem object:', result);
      // Return a safe fallback
      return {
        success: false,
        error: `Serialization failed: ${serializeError.message}`,
        originalSuccess: result?.success,
        originalSessionId: result?.sessionId
      };
    }

    console.log('✅ TEMP_DEBUG_IPC_001 - startDualRecording result:', result);
    return result;
  } catch (error) {
    console.error('❌ TEMP_DEBUG_IPC_001 - Failed to start dual recording:', error);
    console.error('❌ TEMP_DEBUG_IPC_001 - Error type:', typeof error);
    console.error('❌ TEMP_DEBUG_IPC_001 - Error message:', error.message);
    console.error('❌ TEMP_DEBUG_IPC_001 - Error stack:', error.stack);

    // Ensure error is serializable
    return { success: false, error: error.message || 'Unknown error occurred' };
  }
});

ipcMain.handle('audio-stop-dual-recording', async () => {
  try {
    // TEMP_DEBUG_IPC_002: Log IPC call
    console.log('📞 TEMP_DEBUG_IPC_002 - IPC: audio-stop-dual-recording called');

    if (!audioCaptureManager) {
      console.error('❌ TEMP_DEBUG_IPC_002 - AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }

    console.log('🔧 TEMP_DEBUG_IPC_002 - Calling audioCaptureManager.stopDualRecording()');
    const result = await audioCaptureManager.stopDualRecording();
    console.log('✅ TEMP_DEBUG_IPC_002 - stopDualRecording result:', {
      success: result.success,
      totalSegments: result.dualAudioData?.totalSegments,
      totalInputSize: result.dualAudioData?.totalInputSize,
      totalOutputSize: result.dualAudioData?.totalOutputSize
    });
    return result;
  } catch (error) {
    console.error('❌ TEMP_DEBUG_IPC_002 - Failed to stop dual recording:', error);
    return { success: false, error: error.message };
  }
});

// Legacy single recording handlers for backward compatibility
ipcMain.handle('audio-start-recording', async () => {
  try {
    if (!audioCaptureManager) {
      console.error('❌ AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }
    const result = await audioCaptureManager.startDualRecording();
    return { success: true, sessionId: result.sessionId };
  } catch (error) {
    console.error('❌ Error starting recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('audio-stop-recording', async () => {
  try {
    if (!audioCaptureManager) {
      console.error('❌ AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }
    const result = await audioCaptureManager.stopDualRecording();

    // Handle the new structure with dualAudioData
    if (result.dualAudioData) {
      // Return input audio data for backward compatibility
      return { success: true, audioData: result.dualAudioData.inputFiles };
    } else {
      // Fallback for old structure
      return { success: true, audioData: result.inputFiles || [] };
    }
  } catch (error) {
    console.error('❌ Error stopping recording:', error);
    return { success: false, error: error.message };
  }
});

// Audio device management
ipcMain.handle('audio-get-devices', async () => {
  try {
    if (!audioCaptureManager) {
      console.error('❌ AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }

    const result = await audioCaptureManager.getAudioDevices();
    return result;
  } catch (error) {
    console.error('❌ Failed to get audio devices:', error);
    return { success: false, error: error.message };
  }
});

// Windows WebRTC audio data saving
ipcMain.handle('save-audio-data', async (event, { filePath, type, audioData }) => {
  try {
    console.log(`🔧 DEBUG: save-audio-data called with:`, { filePath, type, audioDataLength: audioData?.length });
    console.log(`🔧 Saving ${type} audio data to: ${filePath}...`);

    if (!audioCaptureManager || !audioCaptureManager.windowsAudioCapture) {
      console.error('❌ Windows audio capture not available');
      return { success: false, error: 'Windows audio capture not available' };
    }

    // Ensure the directory exists
    const dir = path.dirname(filePath);
    fs.ensureDirSync(dir);

    // Convert audio data to buffer
    const audioBuffer = Buffer.from(audioData);

    // Write the audio file to the exact path specified
    await fs.writeFile(filePath, audioBuffer);

    // Update the segment object with the correct file path and size
    if (audioCaptureManager && audioCaptureManager.windowsAudioCapture) {
      // Find the current segment by matching the file path
      const segment = audioCaptureManager.windowsAudioCapture.segments.find(s =>
        s.inputFile === filePath || s.outputFile === filePath
      );

      if (segment) {
        if (type === 'input') {
          segment.inputFile = filePath;
          segment.inputSize = audioBuffer.length;
          segment.inputFormat = path.extname(filePath).substring(1);
        } else if (type === 'output') {
          segment.outputFile = filePath;
          segment.outputSize = audioBuffer.length;
          segment.outputFormat = path.extname(filePath).substring(1);
        }
        console.log(`🔧 Updated segment ${segment.segmentId} ${type} file: ${filePath} (${audioBuffer.length} bytes)`);
      } else {
        console.warn(`⚠️ Could not find segment for file: ${filePath}`);
      }
    }

    console.log(`✅ Saved ${type} audio data to: ${filePath} (${audioBuffer.length} bytes)`);
    return { success: true, filePath, size: audioBuffer.length };

  } catch (error) {
    console.error('❌ Error saving audio data:', error);
    return { success: false, error: error.message };
  }
});

// Reset recording state (for recovery from failed states)
ipcMain.handle('audio-reset-recording-state', async () => {
  try {
    console.log('🔄 IPC: audio-reset-recording-state called');

    if (!audioCaptureManager) {
      console.error('❌ AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }

    // Use the AudioCaptureManager's reset method (handles all platforms)
    await audioCaptureManager.resetRecordingState();
    console.log('✅ Recording state reset successfully');

    return { success: true, message: 'Recording state reset successfully' };
  } catch (error) {
    console.error('❌ Failed to reset recording state:', error);
    return { success: false, error: error.message };
  }
});

// Local storage management
ipcMain.handle('storage-get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('storage-set', (event, key, value) => {
  store.set(key, value);
  return { success: true };
});

ipcMain.handle('storage-delete', (event, key) => {
  store.delete(key);
  return { success: true };
});

ipcMain.handle('storage-clear', () => {
  store.clear();
  return { success: true };
});

// File operations
ipcMain.handle('file-save-dialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
  } catch (error) {
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('file-open-dialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  } catch (error) {
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('file-save-content', async (event, { filePath, content }) => {
  try {
    const fs = require('fs').promises;
    await fs.writeFile(filePath, content, 'utf8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file-download-blob', async (event, { blob, filename }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled) {
      const fs = require('fs').promises;
      const buffer = Buffer.from(blob);
      await fs.writeFile(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    }

    return { success: false, error: 'Save cancelled' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('file-read-audio', async (event, filePath) => {
  try {
    const fs = require('fs').promises;
    const buffer = await fs.readFile(filePath);
    return { success: true, buffer: Array.from(buffer) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// System operations
ipcMain.handle('system-get-info', () => {
  return {
    platform: process.platform,
    version: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    arch: process.arch
  };
});

ipcMain.handle('system-open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Window operations
ipcMain.handle('window-minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
  return { success: true };
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
  return { success: true };
});

ipcMain.handle('window-close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
  return { success: true };
});

ipcMain.handle('window-reload', () => {
  if (mainWindow) {
    mainWindow.reload();
  }
  return { success: true };
});

// Development helpers
if (isDev) {
  ipcMain.handle('dev-open-devtools', () => {
    if (mainWindow) {
      mainWindow.webContents.openDevTools();
    }
    return { success: true };
  });
}