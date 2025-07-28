const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const Store = require('electron-store');
const AudioCaptureManager = require('./services/AudioCaptureManager');

console.log('🚀 LeepiAI Interview Recorder starting...');

// Enable additional features for media capture (must be set before app ready)
app.commandLine.appendSwitch('enable-features', 'MediaFoundationVideoCapture');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'LeepiAI');

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
    console.log('🔧 Initializing AudioCaptureManager...');
    audioCaptureManager = new AudioCaptureManager();
    
    // Set main window reference for Windows WebRTC audio capture
    if (process.platform === 'win32' && audioCaptureManager.windowsAudioCapture) {
      audioCaptureManager.windowsAudioCapture.setMainWindow(mainWindow);
      console.log('✅ Windows WebRTC audio capture configured with main window');
    }
    
    console.log('✅ AudioCaptureManager initialized successfully');
    
    // Show startup message for Windows users
    if (process.platform === 'win32') {
      console.log('🔧 Windows: Native WebRTC audio capture has been set up for recording');
      console.log('🔧 If you see any prompts, please allow the application to run');
    }
  } catch (error) {
    console.error('❌ Failed to initialize AudioCaptureManager:', error);
    audioCaptureManager = null;
  }
  
  // Handle permissions for media access
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    console.log('🔐 Permission requested:', permission);
    
    // Allow media permissions (microphone, camera, screen capture)
    const allowedPermissions = ['media', 'microphone', 'camera', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      console.log('✅ Granting permission:', permission);
      return callback(true);
    }
    
    console.log('❌ Denying permission:', permission);
    callback(false);
  });

  // Handle screen capture requests - this is critical for system audio
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    console.log('📺 Screen capture requested for system audio');
    
    // Get available desktop capture sources
    const { desktopCapturer } = require('electron');
    desktopCapturer.getSources({ 
      types: ['screen', 'window'],
      fetchWindowIcons: false
    }).then((sources) => {
      console.log('🖥️ Available capture sources:', sources.length);
      
      if (sources.length > 0) {
        // Use the first screen source (primary display)
        const primaryScreen = sources.find(source => source.name.includes('Entire Screen')) || sources[0];
        console.log('✅ Granting screen capture access to:', primaryScreen.name);
        
        callback({
          video: primaryScreen,
          audio: 'loopback' // This enables system audio capture
        });
      } else {
        console.log('❌ No capture sources available');
        callback({});
      }
    }).catch((error) => {
      console.error('❌ Error getting capture sources:', error);
      callback({});
    });
  });
  
  console.log('✅ Electron main process initialized with enhanced media permissions');

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

// ===============================
// IPC HANDLERS - Audio Recording
// ===============================

// Audio Recording
ipcMain.handle('audio-start-dual-recording', async () => {
  try {
    if (!audioCaptureManager) {
      console.error('❌ AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }
    const result = await audioCaptureManager.startDualRecording();
    return { success: true, sessionId: result.sessionId };
  } catch (error) {
    console.error('❌ Error starting dual recording:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('audio-stop-dual-recording', async () => {
  try {
    console.log('🛑 IPC: Stopping dual recording...');
    if (!audioCaptureManager) {
      console.error('❌ AudioCaptureManager not initialized');
      return { success: false, error: 'Audio service not ready. Please restart the application.' };
    }
    
    // Ensure recording is stopped even if error occurs
    let dualAudioData;
    try {
      dualAudioData = await audioCaptureManager.stopDualRecording();
    } catch (recordingError) {
      console.error('❌ Error in stopDualRecording:', recordingError);
      // Force cleanup
      audioCaptureManager.isRecording = false;
      if (audioCaptureManager.recordingTimer) {
        clearTimeout(audioCaptureManager.recordingTimer);
        audioCaptureManager.recordingTimer = null;
      }
      throw recordingError;
    }
    
    console.log('📤 IPC: Received data from AudioCaptureManager:', {
      success: dualAudioData.success,
      sessionId: dualAudioData.sessionId,
      totalSegments: dualAudioData.totalSegments,
      totalInputSize: dualAudioData.totalInputSize,
      totalOutputSize: dualAudioData.totalOutputSize,
      segmentsLength: dualAudioData.segments?.length
    });
    
    // Ensure we're returning a clean, serializable object
    const result = {
      success: true,
      dualAudioData: {
        success: dualAudioData.success,
        sessionId: dualAudioData.sessionId,
        totalSegments: dualAudioData.totalSegments || 0,
        totalInputSize: dualAudioData.totalInputSize || 0,
        totalOutputSize: dualAudioData.totalOutputSize || 0,
        totalDuration: dualAudioData.totalDuration || 0,
        segments: dualAudioData.segments || [],
        inputFiles: dualAudioData.inputFiles || [],
        outputFiles: dualAudioData.outputFiles || []
      }
    };
    
    console.log('📤 IPC: Returning result to renderer:', {
      success: result.success,
      dualAudioData: {
        totalSegments: result.dualAudioData.totalSegments,
        totalInputSize: result.dualAudioData.totalInputSize,
        totalOutputSize: result.dualAudioData.totalOutputSize,
        segmentsLength: result.dualAudioData.segments.length
      }
    });
    
    return result;
  } catch (error) {
    console.error('❌ IPC: Error stopping dual recording:', error);
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
    const dualAudioData = await audioCaptureManager.stopDualRecording();
    // Return input audio data for backward compatibility
    return { success: true, audioData: dualAudioData.input };
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
    const devices = await audioCaptureManager.getAudioDevices();
    return { success: true, devices: [...devices.input, ...devices.output] };
  } catch (error) {
    console.error('Get audio devices error:', error);
    return { success: false, error: error.message };
  }
});

// Windows WebRTC audio data saving
ipcMain.handle('save-audio-data', async (event, { segmentId, type, audioData }) => {
  try {
    if (!audioCaptureManager || !audioCaptureManager.windowsAudioCapture) {
      return { success: false, error: 'Windows audio capture not available' };
    }

    const { app } = require('electron');
    const tempDir = path.join(app.getPath('temp'), 'leepi-recorder');
    const fs = require('fs-extra');
    const path = require('path');

    // Ensure temp directory exists
    fs.ensureDirSync(tempDir);

    // Create file path
    const fileName = `${type}_${segmentId}.wav`;
    const filePath = path.join(tempDir, fileName);

    // Convert audio data to buffer and create WAV file
    const audioBuffer = Buffer.from(audioData);
    const wavHeader = audioCaptureManager.windowsAudioCapture._createMinimalWavHeader();
    const wavFile = Buffer.concat([wavHeader, audioBuffer]);

    // Write the file
    await fs.writeFile(filePath, wavFile);

    console.log(`✅ Saved ${type} audio data for segment ${segmentId}: ${filePath}`);
    return { success: true, filePath };
  } catch (error) {
    console.error('❌ Error saving audio data:', error);
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

// Application menu (optional - can be implemented later)
// This would handle creating native menus for the application

console.log('🎯 IPC handlers registered successfully'); 