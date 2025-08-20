const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const WindowsAudioCapture = require('./WindowsAudioCapture');

// File logging for packaged app debugging
const logToFile = (message, level = 'INFO') => {
  try {
    // Only try to access electron if it's available (in main process)
    if (typeof require !== 'undefined') {
      const { app } = require('electron');
      if (app && app.getPath) {
        const logDir = path.join(app.getPath('userData'), 'logs');
        const logFile = path.join(logDir, 'audio-capture.log');

        // Ensure log directory exists
        fs.ensureDirSync(logDir);

        // Create timestamp
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}\n`;

        // Append to log file
        fs.appendFileSync(logFile, logEntry);
        return; // Success, exit early
      }
    }
  } catch (error) {
    // Silently fail and fallback to console
  }

  // Fallback to console if file logging fails
  console.log(`[${level}] ${message}`);
};

// Platform-specific imports
let record = null;
let alternativeRecordingAvailable = false;

// Note: node-record-lpcm16 has been removed as a dependency
// Windows audio capture uses native WebRTC APIs instead
console.log('ℹ️ node-record-lpcm16 not available - using native WebRTC audio capture');

// Alternative recording method using Web Audio API (if available)
let webAudioRecording = null;
try {
  // This will be set up in the main process when needed
  webAudioRecording = {
    available: true,
    method: 'web-audio'
  };
  console.log('✅ Web Audio API recording available as fallback');
} catch (error) {
  console.warn('⚠️ Web Audio API not available:', error.message);
  webAudioRecording = null;
}

/**
 * Audio Capture Manager
 * Handles dual audio recording (microphone + system audio) using native audio capture
 * Cross-platform support for macOS, Windows, and Linux
 */
class AudioCaptureManager {
  constructor() {
    this.isRecording = false;
    this.inputRecorder = null;
    this.outputRecorder = null;
    this.sessionId = null;
    this.platform = os.platform();

    // Use app.getPath('temp') for packaged apps, fallback to local temp for development
    try {
      const { app } = require('electron');
      this.tempDir = path.join(app.getPath('temp'), 'leepi-recorder');
    } catch (error) {
      // Fallback for when electron app is not available
      this.tempDir = path.join(__dirname, '../../../temp');
    }

    this.segmentDuration = 60; // 1 minute segments
    this.segmentIndex = 0;
    this.segments = [];
    this.recordingTimer = null;

    // For Windows, use native WebRTC audio capture
    if (this.platform === 'win32') {
      this.windowsAudioCapture = new WindowsAudioCapture();
      this.recordingAvailable = true;
      return;
    }

    // For other platforms, use WebRTC-based recording as fallback
    // Note: node-record-lpcm16 has been removed, using WebRTC instead
    console.log('ℹ️ Using WebRTC audio capture for non-Windows platforms');

    // Platform-specific configuration
    this.config = this._getPlatformConfig();

    // TEMP_DEBUG_001: Log platform config for debugging
    console.log('🔧 TEMP_DEBUG_001 - Platform config:', {
      platform: this.platform,
      sampleRate: this.config.sampleRate,
      channels: this.config.channels
    });

    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);

    // Check if any recording method is available
    this.recordingAvailable = webAudioRecording?.available || true; // WebRTC should be available

    if (!this.recordingAvailable) {
      console.warn('⚠️ WebRTC audio capture not available, but continuing with fallback methods');
    }
  }



  /**
   * Get platform-specific configuration
   */
  _getPlatformConfig() {
    // Try to load from config file, otherwise use defaults
    let configSampleRate = 6000;
    let configChannels = 1;

    try {
      const audioConfig = require('../config');
      configSampleRate = audioConfig.sampleRate;
      configChannels = audioConfig.channels;
    } catch (error) {
      console.warn('⚠️ Could not load audio config, using defaults:', error.message);
    }

    const baseConfig = {
      sampleRate: configSampleRate,
      channels: configChannels,
      compress: false,
      threshold: 0.5,
      silence: 2.0,
      inputDevice: null,
      outputDevice: null,
      recordProgram: 'sox',
      hasVirtualAudio: false
    };



    switch (this.platform) {
      case 'darwin': // macOS
        return {
          ...baseConfig,
          hasVirtualAudio: true,
          recordProgram: getBundledSoxPath()
        };

      case 'win32': // Windows
        return {
          ...baseConfig,
          hasVirtualAudio: false,
          recordProgram: 'sox'
        };

      case 'linux': // Linux
        return {
          ...baseConfig,
          hasVirtualAudio: true,
          recordProgram: 'sox'
        };

      default:
        return baseConfig;
    }
  }

  /**
   * Pre-setup SoX for Windows - no longer needed (uses native WebRTC)
   */
  _preSetupWindowsSox() {
    // Windows now uses native WebRTC audio capture, no SoX needed
  }

  /**
   * Start recording using bundled SoX
   */
  async _startBundledSoxRecording(outputFile, type) {
    try {
      console.log(`🔧 Starting bundled SoX recording (${type}) to: ${outputFile}`);

      // Check if we're in a packaged app with bundled SoX
      const isPackaged = process.resourcesPath && !process.resourcesPath.includes('node_modules');

      if (isPackaged && this.platform === 'darwin') {
        const soxPath = path.join(process.resourcesPath, 'sox-macos');

        if (fs.existsSync(soxPath)) {
          console.log('✅ Found bundled SoX binary:', soxPath);

          // Make it executable
          fs.chmodSync(soxPath, '755');

          // Try to actually record using sox
          console.log('🔧 Attempting to record with bundled SoX...');
          try {
            const soxRecorder = await this._startSoxRecording(outputFile, type);
            if (soxRecorder) {
              console.log('✅ Bundled SoX recording started successfully');
              return soxRecorder;
            }
          } catch (error) {
            console.warn('⚠️ Bundled SoX recording failed:', error.message);
          }

          // If we get here, no recording method worked
          console.warn('⚠️ Bundled SoX recording failed, no fallback available');
          return null;
        }
      }

      console.log('⚠️ Bundled SoX not available, falling back to alternatives');
      return null;
    } catch (error) {
      console.error(`❌ Bundled SoX recording failed:`, error);
      return null;
    }
  }



  /**
   * Set up bundled SoX environment for node-record-lpcm16
   */
  _setupBundledSoxEnvironment() {
    // Check if we're in a packaged app
    const isPackaged = process.resourcesPath && !process.resourcesPath.includes('node_modules');

    if (isPackaged) {
      try {
        const resourcePath = process.resourcesPath;
        let soxPath;

        // Only macOS has bundled SoX
        if (this.platform === 'darwin') {
          soxPath = path.join(resourcePath, 'sox-macos');
        } else {
          console.log('🔧 Non-macOS platform: No bundled SoX setup needed');
          return;
        }

        console.log('🔧 Setting up bundled SoX environment...');
        console.log('🔧 SoX path:', soxPath);

        if (fs.existsSync(soxPath)) {
          // For macOS, ensure the binary is executable
          fs.chmodSync(soxPath, '755');
          console.log('✅ Made SoX executable');

          // Set SOX_PATH environment variable as fallback
          process.env.SOX_PATH = soxPath;
          console.log('✅ Set SOX_PATH environment variable');

          console.log('✅ Bundled SoX environment setup complete');
        } else {
          console.warn('⚠️ Bundled SoX not found at:', soxPath);
        }
      } catch (error) {
        console.warn('⚠️ Could not set up bundled SoX environment:', error.message);
      }
    } else {
      console.log('🔧 Development mode - using system SoX');
    }
  }

  /**
   * Get platform-specific configuration
   */
  _getPlatformConfig() {
    const config = {
      sampleRate: 16000,   // Use 16kHz for recording (hardware supported)
      channels: 1,
      compress: false,
      threshold: 0.5,
      silence: '2.0'
    };

    // Get bundled SoX path
    const getBundledSoxPath = () => {
      // Check if we're in a packaged app (more reliable than NODE_ENV)
      const isPackaged = process.resourcesPath && !process.resourcesPath.includes('node_modules');

      if (!isPackaged) {
        console.log('🔧 Development mode - using system SoX');
        // In development mode, use the full path to SoX to avoid PATH issues
        try {
          const { execSync } = require('child_process');
          const soxPath = execSync('which sox', { encoding: 'utf8' }).trim();
          console.log('🔧 Found system SoX at:', soxPath);
          return soxPath;
        } catch (error) {
          console.warn('⚠️ Could not find system SoX, falling back to "sox" command');
          return 'sox'; // Fallback to "sox" command
        }
      }

      // For Windows, use native WebRTC audio capture (no SoX needed)
      if (this.platform === 'win32') {
        console.log('🔧 Windows: Using native WebRTC audio capture (no SoX needed)');
        return null;
      }

      // First, try using the SOX_PATH environment variable (set in _setupBundledSoxEnvironment)
      if (process.env.SOX_PATH && fs.existsSync(process.env.SOX_PATH)) {
        console.log('✅ Using SoX from SOX_PATH environment variable:', process.env.SOX_PATH);
        return process.env.SOX_PATH;
      }

      try {
        const resourcePath = process.resourcesPath;
        let soxPath;

        // Only macOS has bundled SoX
        if (this.platform === 'darwin') {
          soxPath = path.join(resourcePath, 'sox-macos');
        } else {
          console.log('🔧 Non-macOS platform: Using system SoX');
          return 'sox';
        }

        console.log('🔍 Checking for bundled SoX at:', soxPath);

        if (fs.existsSync(soxPath)) {
          // Ensure it's executable (only for macOS)
          fs.chmodSync(soxPath, '755');
          console.log('✅ Using bundled SoX:', soxPath);
          return soxPath;
        } else {
          console.warn('⚠️ Bundled SoX not found at:', soxPath);
        }
      } catch (error) {
        console.warn('⚠️ Could not access bundled SoX:', error.message);
      }

      console.log('⚠️ Falling back to system SoX');
      return 'sox'; // Fallback to system SoX
    };

    switch (this.platform) {
      case 'darwin': // macOS
        return {
          ...config,
          inputDevice: null, // Use default input device
          outputDevice: 'BlackHole 2ch', // macOS virtual audio device
          recordProgram: getBundledSoxPath(),
          hasVirtualAudio: true
        };

      case 'win32': // Windows
        return {
          ...config,
          inputDevice: null, // Use default input device
          outputDevice: null, // Will be detected or use alternative method
          recordProgram: null, // Use native WebRTC (no SoX needed)
          hasVirtualAudio: false, // Windows needs different approach
          useWASAPI: true // Use Windows Audio Session API
        };

      case 'linux': // Linux
        return {
          ...config,
          inputDevice: null, // Use default input device
          outputDevice: 'pulse', // PulseAudio for system audio
          recordProgram: getBundledSoxPath(),
          hasVirtualAudio: true
        };

      default:
        return {
          ...config,
          inputDevice: null,
          outputDevice: null,
          recordProgram: getBundledSoxPath(),
          hasVirtualAudio: false
        };
    }
  }

  /**
   * Start dual recording (microphone + system audio) with 1-minute segments
   */
  async startDualRecording() {
    try {
      // TEMP_DEBUG_FLOW_001: Log startDualRecording entry
      console.log('🎯 TEMP_DEBUG_FLOW_001 - startDualRecording() CALLED');
      console.log('🎯 TEMP_DEBUG_FLOW_001 - Platform:', this.platform);
      console.log('🎯 TEMP_DEBUG_FLOW_001 - isRecording:', this.isRecording);

      // Safety: Stop any existing recording before starting a new one
      if (this.isRecording) {
        console.log('🛡️ Safety: Stopping existing recording before starting new one...');
        try {
          await this.stopDualRecording();
          console.log('✅ Existing recording stopped successfully');
        } catch (stopError) {
          console.warn('⚠️ Could not stop existing recording:', stopError.message);
          // Force reset the state
          this.isRecording = false;
          this.inputRecorder = null;
          this.outputRecorder = null;
          if (this.recordingTimer) {
            clearTimeout(this.recordingTimer);
            this.recordingTimer = null;
          }
        }
      }

      // TEMP_DEBUG_002: Log recording start
      console.log('🎙️ TEMP_DEBUG_002 - Starting dual recording');

      // For Windows, delegate to native WebRTC audio capture
      if (this.platform === 'win32' && this.windowsAudioCapture) {
        console.log('🎯 TEMP_DEBUG_FLOW_001 - Using Windows WebRTC path');
        return await this.windowsAudioCapture.startDualRecording();
      }

      // For non-Windows platforms, use the old approach
      this.sessionId = uuidv4();
      this.segmentIndex = 0;
      this.segments = [];

      // Start the first segment
      console.log('🎯 TEMP_DEBUG_FLOW_001 - Calling _startNewSegment()');
      await this._startNewSegment();

      this.isRecording = true;
      console.log('🎯 TEMP_DEBUG_FLOW_001 - startDualRecording() SUCCESS');
      return {
        success: true,
        sessionId: this.sessionId,
        segments: this.segments
      };

    } catch (error) {
      console.error('❌ Failed to start dual recording:', error);
      throw error;
    }
  }

  /**
   * Stop dual recording and return all recorded segments
   */
  async stopDualRecording() {
    try {
      if (!this.isRecording) {
        throw new Error('No recording in progress');
      }



      // Stop the current segment
      if (this.recordingTimer) {
        clearTimeout(this.recordingTimer);
        this.recordingTimer = null;
      }

      // Stop current segment recording
      await this._stopCurrentSegment();

      this.isRecording = false;

      // Calculate actual file sizes
      let totalInputSize = 0;
      let totalOutputSize = 0;

      for (const segment of this.segments) {
        try {
          if (fs.existsSync(segment.inputFile)) {
            const stats = fs.statSync(segment.inputFile);
            totalInputSize += stats.size;
          }
          if (segment.hasOutputAudio && fs.existsSync(segment.outputFile)) {
            const stats = fs.statSync(segment.outputFile);
            totalOutputSize += stats.size;
          }
        } catch (error) {
          console.warn(`⚠️ Could not get file size for segment ${segment.segmentId}:`, error.message);
        }
      }

      // Prepare the result with all recorded segments
      const dualAudioData = {
        success: true,
        sessionId: this.sessionId,
        totalSegments: this.segments.length,
        segments: this.segments.map(segment => ({
          segmentId: segment.segmentId,
          inputFile: segment.inputFile,
          outputFile: segment.outputFile,
          hasOutputAudio: segment.hasOutputAudio,
          startTime: segment.startTime,
          duration: this.segmentDuration
        })),
        inputFiles: this.segments.map(s => s.inputFile),
        outputFiles: this.segments.filter(s => s.hasOutputAudio).map(s => s.outputFile),
        totalDuration: this.segments.length * this.segmentDuration,
        totalInputSize,
        totalOutputSize
      };

      console.log('✅ Dual recording stopped successfully:', {
        sessionId: this.sessionId,
        totalSegments: this.segments.length,
        hasSegments: this.segments.length > 0,
        totalInputSize,
        totalOutputSize
      });

      // Return in the format expected by the frontend
      return {
        success: true,
        dualAudioData
      };

    } catch (error) {
      console.error('❌ Failed to stop dual recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  /**
   * Start a new 1-minute recording segment
   */
  async _startNewSegment() {
    const segmentId = `${this.sessionId}_segment_${this.segmentIndex.toString().padStart(3, '0')}`;
    const inputFile = path.join(this.tempDir, `input_${segmentId}.wav`);
    const outputFile = path.join(this.tempDir, `output_${segmentId}.wav`);

    // TEMP_DEBUG_003: Log segment start
    console.log(`🎙️ TEMP_DEBUG_003 - Starting segment ${this.segmentIndex + 1}: ${segmentId}`);

    try {
      // For Windows, delegate to native WebRTC audio capture
      if (this.platform === 'win32' && this.windowsAudioCapture) {
        console.log('🎯 TEMP_DEBUG_FLOW_002 - Using Windows WebRTC path for segment');
        // Windows handles segments internally, so we just return success
        return { success: true, segmentId };
      }

      // Start input recording (microphone) - only for non-Windows platforms
      console.log('🎯 TEMP_DEBUG_FLOW_002 - Calling _startInputRecording()');
      this.inputRecorder = await this._startInputRecording(inputFile);

      // Start output recording (system audio) - platform dependent
      if (this.config.hasVirtualAudio) {
        this.outputRecorder = await this._startOutputRecording(outputFile);
      } else {
        this.outputRecorder = null;
      }

      // Store segment info
      const segmentInfo = {
        segmentId,
        inputFile,
        outputFile,
        startTime: Date.now(),
        platform: this.platform,
        hasOutputAudio: !!this.outputRecorder
      };

      this.segments.push(segmentInfo);

      // TEMP_DEBUG_010: Check file sizes after recording
      setTimeout(async () => {
        try {
          if (await fs.pathExists(inputFile)) {
            const stats = await fs.stat(inputFile);
            console.log(`📊 TEMP_DEBUG_010 - Input file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          }
          if (await fs.pathExists(outputFile)) {
            const stats = await fs.stat(outputFile);
            console.log(`📊 TEMP_DEBUG_010 - Output file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          }
        } catch (error) {
          console.warn('⚠️ TEMP_DEBUG_010 - Could not check file sizes:', error.message);
        }
      }, 1000);

      // Set timer to stop this segment and start next one
      this.recordingTimer = setTimeout(async () => {
        if (this.isRecording) {
          await this._stopCurrentSegment();
          await this._startNewSegment();
        }
      }, this.segmentDuration * 1000);

      this.segmentIndex++;

    } catch (error) {
      console.error('❌ Failed to start segment:', error);
      throw error;
    }
  }

  /**
   * Stop the current recording segment
   */
  async _stopCurrentSegment() {
    try {
      // Stop input recording
      if (this.inputRecorder) {
        if (typeof this.inputRecorder.stop === 'function') {
          await this.inputRecorder.stop();
        } else if (this.inputRecorder.destroy) {
          this.inputRecorder.destroy();
        }
        this.inputRecorder = null;
      }

      // Stop output recording
      if (this.outputRecorder) {
        if (typeof this.outputRecorder.stop === 'function') {
          await this.outputRecorder.stop();
        } else if (this.outputRecorder.destroy) {
          this.outputRecorder.destroy();
        }
        this.outputRecorder = null;
      }

      // TEMP_DEBUG_011: Check final file sizes
      try {
        const currentSegment = this.segments[this.segments.length - 1];
        if (currentSegment) {
          if (await fs.pathExists(currentSegment.inputFile)) {
            const stats = await fs.stat(currentSegment.inputFile);
            console.log(`📊 TEMP_DEBUG_011 - Final input size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          }
          if (await fs.pathExists(currentSegment.outputFile)) {
            const stats = await fs.stat(currentSegment.outputFile);
            console.log(`📊 TEMP_DEBUG_011 - Final output size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          }
        }
      } catch (error) {
        console.warn('⚠️ TEMP_DEBUG_011 - Could not check final file sizes:', error.message);
      }
    } catch (error) {
      console.error(`❌ Failed to stop current segment:`, error);
      // Don't throw error, just log it
    }
  }

  /**
   * Start input recording (microphone)
   */
  async _startInputRecording(outputFile) {
    // TEMP_DEBUG_FLOW_003: Log _startInputRecording entry
    console.log('🎯 TEMP_DEBUG_FLOW_003 - _startInputRecording() CALLED');

    // TEMP_DEBUG_004: Log input recording start
    console.log(`🎤 TEMP_DEBUG_004 - Starting input recording to: ${outputFile}`);
    console.log('🔧 TEMP_DEBUG_004 - Sample rate:', this.config.sampleRate, 'Hz, Channels:', this.config.channels);

    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.ensureDirSync(outputDir);
    }

    // Windows uses native WebRTC audio capture (handled by startDualRecording delegation)
    if (this.platform === 'win32') {
      console.log('🔧 Windows: This method should not be called on Windows - delegating to startDualRecording');
      throw new Error('Windows recording should use startDualRecording() instead of _startInputRecording()');
    }

    // For macOS, try to use system audio capture
    if (this.platform === 'darwin') {
      // TEMP_DEBUG_PATH_001: Log macOS path
      console.log('🔧 TEMP_DEBUG_PATH_001 - macOS detected - attempting to record with SoX');
      console.log('🔧 TEMP_DEBUG_PATH_001 - recordProgram from config:', this.config.recordProgram);
      console.log('🔧 TEMP_DEBUG_PATH_001 - record module available:', !!record);
      console.log('🍎 TEMP_DEBUG_PATH_001 - macOS detected - attempting system audio capture');

      try {
        // Try to use the bundled sox-macos binary if available
        console.log('🎯 TEMP_DEBUG_FLOW_003 - Calling _startBundledSoxRecording()');
        console.log('🔧 TEMP_DEBUG_PATH_001 - Attempting bundled SoX recording...');
        const bundledRecorder = await this._startBundledSoxRecording(outputFile, 'input');
        if (bundledRecorder) {
          console.log('✅ TEMP_DEBUG_PATH_001 - Using bundled SoX for macOS input recording');
          console.log('🎯 TEMP_DEBUG_FLOW_003 - _startInputRecording() SUCCESS (bundled SoX)');
          return bundledRecorder;
        } else {
          console.log('⚠️ TEMP_DEBUG_PATH_001 - Bundled SoX recording returned null');
        }
      } catch (error) {
        console.warn('⚠️ TEMP_DEBUG_PATH_001 - Bundled SoX recording failed on macOS:', error.message);
      }

      // For macOS, try to use system audio capture as a fallback
      console.log('⚠️ TEMP_DEBUG_004 - Attempting system audio capture fallback...');

      try {
        // Try to use the bundled sox-macos binary directly
        const soxPath = path.join(process.resourcesPath || __dirname, '../../../binaries/sox-macos');
        console.log('🔧 TEMP_DEBUG_004 - Checking sox-macos path:', soxPath);
        console.log('🔧 TEMP_DEBUG_004 - Path exists:', fs.existsSync(soxPath));

        if (fs.existsSync(soxPath)) {
          console.log('✅ TEMP_DEBUG_004 - Found sox-macos binary, attempting direct recording...');

          // Make it executable
          fs.chmodSync(soxPath, '755');

          // Try to actually record using sox
          console.log('🎯 TEMP_DEBUG_FLOW_003 - Calling _startSoxRecording()');
          console.log('🔧 TEMP_DEBUG_004 - Calling _startSoxRecording...');
          const soxRecorder = await this._startSoxRecording(outputFile, 'input');
          if (soxRecorder) {
            console.log('✅ TEMP_DEBUG_004 - Sox recording started successfully');
            console.log('🎯 TEMP_DEBUG_FLOW_003 - _startInputRecording() SUCCESS (SoX fallback)');
            return soxRecorder;
          } else {
            console.log('⚠️ TEMP_DEBUG_004 - _startSoxRecording returned null');
          }
        } else {
          console.log('⚠️ TEMP_DEBUG_004 - sox-macos binary not found at:', soxPath);
        }
      } catch (error) {
        console.warn('⚠️ TEMP_DEBUG_004 - Sox fallback failed:', error.message);
      }

      // If no recording method worked, throw an error
      throw new Error(`No audio recording method available on ${this.platform}. Please install required audio tools.`);
    }

    // For other non-Windows platforms, try bundled SoX first
    console.log('🎯 TEMP_DEBUG_FLOW_003 - Trying other platforms bundled SoX');
    try {
      console.log('🎯 TEMP_DEBUG_FLOW_003 - Calling _startBundledSoxRecording() (other platforms)');
      const bundledRecorder = await this._startBundledSoxRecording(outputFile, 'input');
      if (bundledRecorder) {
        console.log('✅ Using bundled SoX for input recording');
        console.log('🎯 TEMP_DEBUG_FLOW_003 - _startInputRecording() SUCCESS (other platforms bundled SoX)');
        return bundledRecorder;
      }
    } catch (error) {
      console.warn('⚠️ Bundled SoX recording failed, trying node-record-lpcm16:', error.message);
    }

    // TEMP_DEBUG_FALLBACK_002: Check record module availability
    console.log('🔧 TEMP_DEBUG_FALLBACK_002 - Record module available:', !!record);
    console.log('🔧 TEMP_DEBUG_FALLBACK_002 - Record module type:', typeof record);

    // Fallback to node-record-lpcm16
    if (!record) {
      // TEMP_DEBUG_FALLBACK_001: Log fallback path
      console.log('⚠️ TEMP_DEBUG_FALLBACK_001 - Native recording not available, attempting alternative methods');

      // For macOS, try to use system audio capture as a fallback
      if (this.platform === 'darwin') {
        try {
          console.log('🍎 TEMP_DEBUG_FALLBACK_001 - macOS: Attempting system audio capture fallback...');

          // Try to use the bundled sox-macos binary directly
          const soxPath = path.join(process.resourcesPath || __dirname, '../../../binaries/sox-macos');

          if (fs.existsSync(soxPath)) {
            console.log('✅ TEMP_DEBUG_FALLBACK_001 - Found sox-macos binary, attempting direct recording...');

            // Make it executable
            fs.chmodSync(soxPath, '755');

            // Try to actually record using sox
            const soxRecorder = await this._startSoxRecording(outputFile, 'input');
            if (soxRecorder) {
              console.log('✅ TEMP_DEBUG_FALLBACK_001 - Sox recording started successfully');
              return soxRecorder;
            }
          }
        } catch (error) {
          console.warn('⚠️ TEMP_DEBUG_FALLBACK_001 - Sox fallback failed:', error.message);
        }
      }

      // If we get here, no recording method worked
      throw new Error(`No audio recording method available on ${this.platform}. Please install required audio tools.`);
    }

    // TEMP_DEBUG_007: Log node-record-lpcm16 usage
    console.log('🎯 TEMP_DEBUG_FLOW_003 - Using node-record-lpcm16 (final fallback)');
    console.log(`🔧 TEMP_DEBUG_007 - Using node-record-lpcm16 (fallback)`);
    console.log('🔧 TEMP_DEBUG_007 - Config sample rate:', this.config.sampleRate);
    console.log('🔧 TEMP_DEBUG_007 - Config channels:', this.config.channels);

    try {
      const recorder = record.record({
        sampleRate: this.config.sampleRate,
        channels: this.config.channels,
        compress: this.config.compress,
        threshold: this.config.threshold,
        silence: this.config.silence,
        device: this.config.inputDevice,
        recordProgram: this.config.recordProgram,
      });

      // TEMP_DEBUG_008: Log recorder creation
      console.log('✅ TEMP_DEBUG_008 - node-record-lpcm16 recorder created');
      console.log('🎯 TEMP_DEBUG_FLOW_003 - _startInputRecording() SUCCESS (node-record-lpcm16)');

      // Add error handling to the stream
      const writeStream = fs.createWriteStream(outputFile);
      writeStream.on('error', (error) => {
        console.error('❌ Write stream error:', error);
      });
      writeStream.on('finish', () => {
        try {
          const stats = fs.statSync(outputFile);
          // TEMP_DEBUG_009: Log file size for debugging
          console.log(`📊 TEMP_DEBUG_009 - node-record-lpcm16 file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        } catch (error) {
          console.warn('⚠️ TEMP_DEBUG_009 - Could not check file size:', error.message);
        }
      });

      recorder.stream().pipe(writeStream);

      // Add error handling to the recorder
      recorder.on('error', (error) => {
        console.error('❌ Recorder error:', error);
      });

      return recorder;
    } catch (error) {
      console.error('❌ Failed to create node-record-lpcm16 recorder:', error);
      throw error;
    }
  }

  /**
   * Start output recording (system audio)
   */
  async _startOutputRecording(outputFile) {
    console.log(`🎙️ Starting output recording to: ${outputFile}`);
    console.log('🔧 Platform:', this.platform);
    console.log('🔧 Config:', this.config);
    console.log('🔧 Record module available:', !!record);

    // Try bundled SoX first, then fallback to node-record-lpcm16
    try {
      const bundledRecorder = await this._startBundledSoxRecording(outputFile, 'output');
      if (bundledRecorder) {
        console.log('✅ Using bundled SoX for output recording');
        return bundledRecorder;
      }
    } catch (error) {
      console.warn('⚠️ Bundled SoX output recording failed, trying node-record-lpcm16:', error.message);
    }

    // Fallback to node-record-lpcm16
    if (!record) {
      console.warn('⚠️ Native recording not available, attempting alternative methods');

      // For macOS, try to use system audio capture as a fallback
      if (this.platform === 'darwin') {
        try {
          console.log('🍎 macOS: Attempting system audio capture fallback...');

          // Try to use the bundled sox-macos binary directly
          const soxPath = path.join(process.resourcesPath || __dirname, '../../../binaries/sox-macos');

          if (fs.existsSync(soxPath)) {
            console.log('✅ Found sox-macos binary, attempting direct recording...');

            // Make it executable
            fs.chmodSync(soxPath, '755');

            // Try to actually record using sox
            const soxRecorder = await this._startSoxRecording(outputFile, 'output');
            if (soxRecorder) {
              console.log('✅ Sox output recording started successfully');
              return soxRecorder;
            }
          }
        } catch (error) {
          console.warn('⚠️ Sox fallback failed:', error.message);
        }
      }

      // If we get here, no recording method worked
      console.warn('⚠️ No system audio recording method available');
      return null;
    }

    // Platform-specific output recording
    switch (this.platform) {
      case 'darwin': // macOS - BlackHole
        try {
          console.log('🎙️ Attempting to record system audio using BlackHole...');
          const recorder = record.record({
            sampleRate: this.config.sampleRate,
            channels: 2, // Stereo for system audio
            compress: this.config.compress,
            threshold: this.config.threshold,
            silence: this.config.silence,
            device: this.config.outputDevice,
            recordProgram: this.config.recordProgram,
          });

          recorder.stream().pipe(fs.createWriteStream(outputFile));
          console.log('✅ System audio recording started successfully');
          return recorder;
        } catch (error) {
          console.warn('⚠️ Failed to start system audio recording:', error.message);
          console.warn('⚠️ Recording microphone only. Install BlackHole for system audio capture.');
          return null;
        }

      case 'win32': // Windows - handled by WindowsAudioCapture.startDualRecording()
        console.log('🔧 Windows: Output recording handled by WindowsAudioCapture service');
        return null;

      case 'linux': // Linux - PulseAudio
        try {
          console.log('🐧 Attempting to record system audio using PulseAudio...');
          const recorder = record.record({
            sampleRate: this.config.sampleRate,
            channels: 2,
            compress: this.config.compress,
            threshold: this.config.threshold,
            silence: this.config.silence,
            device: this.config.outputDevice,
            recordProgram: this.config.recordProgram,
          });

          recorder.stream().pipe(fs.createWriteStream(outputFile));
          console.log('✅ System audio recording started successfully');
          return recorder;
        } catch (error) {
          console.warn('⚠️ Failed to start system audio recording:', error.message);
          console.warn('⚠️ Recording microphone only. Install PulseAudio for system audio capture.');
          return null;
        }

      default:
        console.warn('⚠️ Platform not supported for system audio recording');
        return null;
    }
  }

  // Note: Windows recording is now handled by WindowsAudioCapture.startDualRecording()
  // This method is no longer used on Windows

  /**
   * Start recording using bundled SoX directly
   */
  async _startBundledSoxRecording(outputFile, type = 'input') {
    // TEMP_DEBUG_SOX_006: Log bundled SoX recording start
    console.log('🎙️ TEMP_DEBUG_SOX_006 - Starting bundled SoX recording...');
    console.log('🎙️ TEMP_DEBUG_SOX_006 - Output file:', outputFile);
    console.log('🎙️ TEMP_DEBUG_SOX_006 - Type:', type);
    console.log('🎙️ TEMP_DEBUG_SOX_006 - Platform:', this.platform);
    console.log('🎙️ TEMP_DEBUG_SOX_006 - Config sample rate:', this.config.sampleRate, 'Hz');

    try {
      // Windows uses native WebRTC audio capture (no SoX needed)
      if (this.platform === 'win32') {
        console.log('🔧 TEMP_DEBUG_SOX_006 - Windows: Using native WebRTC audio capture (no SoX needed)');
        return null;
      }

      // Get bundled SoX path
      const soxPath = this.config.recordProgram;

      console.log('🔍 TEMP_DEBUG_SOX_006 - recordProgram from config:', soxPath);
      console.log('🔍 TEMP_DEBUG_SOX_006 - recordProgram type:', typeof soxPath);
      console.log('🔍 TEMP_DEBUG_SOX_006 - platform:', this.platform);
      console.log('🔍 TEMP_DEBUG_SOX_006 - isPackaged:', process.resourcesPath && !process.resourcesPath.includes('node_modules'));
      console.log('🔍 TEMP_DEBUG_SOX_006 - resourcesPath:', process.resourcesPath);

      // Also log to file for packaged app debugging
      logToFile(`Debug - recordProgram from config: ${soxPath}`, 'DEBUG');
      logToFile(`Debug - recordProgram type: ${typeof soxPath}`, 'DEBUG');
      logToFile(`Debug - platform: ${this.platform}`, 'DEBUG');
      logToFile(`Debug - isPackaged: ${process.resourcesPath && !process.resourcesPath.includes('node_modules')}`, 'DEBUG');
      logToFile(`Debug - resourcesPath: ${process.resourcesPath}`, 'DEBUG');

      // For non-Windows platforms, check if we have bundled SoX
      if (!soxPath || soxPath === 'sox') {
        console.log('⚠️ No bundled SoX path available, skipping bundled recording');
        return null;
      }

      // Only proceed with bundled SoX for macOS
      if (this.platform !== 'darwin') {
        console.log('⚠️ Bundled SoX only available for macOS, skipping bundled recording');
        return null;
      }

      // Check if bundled SoX exists
      if (!fs.existsSync(soxPath)) {
        return null;
      }

      // Ensure output directory exists
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.ensureDirSync(outputDir);
      }

      // Start SoX process
      const { spawn } = require('child_process');

      // TEMP_DEBUG_SOX_007: Log SoX process creation
      const soxArgs = this._getSoxArgs(outputFile, type);
      console.log('🔧 TEMP_DEBUG_SOX_007 - Bundled SoX path:', soxPath);
      console.log('🔧 TEMP_DEBUG_SOX_007 - SoX arguments:', soxArgs);
      console.log(`🔧 TEMP_DEBUG_SOX_007 - Full command: ${soxPath} ${soxArgs.join(' ')}`);

      const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        detached: false
      };

      const soxProcess = spawn(soxPath, soxArgs, spawnOptions);

      // Handle process events
      soxProcess.on('error', (error) => {
        console.error('❌ SoX error:', error.message);
      });

      soxProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error('❌ SoX failed with code:', code);
        }
      });

      // Add stderr handler for debugging
      soxProcess.stderr.on('data', (data) => {
        console.warn('⚠️ SoX stderr:', data.toString().trim());
      });

      return {
        stop: () => {
          console.log(`🛑 Stopping ${type} sox recording...`);
          soxProcess.kill('SIGTERM');
        },
        stream: () => ({
          pipe: () => { }
        })
      };
    } catch (error) {
      console.error(`❌ Failed to start ${type} sox recording:`, error);
      return null;
    }
  }

  /**
   * Start SoX recording (wrapper method)
   */
  async _startSoxRecording(outputFile, type = 'input') {
    // TEMP_DEBUG_SOX_002: Log SoX recording start
    console.log('🎙️ TEMP_DEBUG_SOX_002 - Starting SoX recording...');
    console.log('🎙️ TEMP_DEBUG_SOX_002 - Output file:', outputFile);
    console.log('🎙️ TEMP_DEBUG_SOX_002 - Type:', type);
    console.log('🎙️ TEMP_DEBUG_SOX_002 - Platform:', this.platform);
    console.log('🎙️ TEMP_DEBUG_SOX_002 - Config sample rate:', this.config.sampleRate, 'Hz');

    // In development mode, try to use system SoX directly
    if (!process.resourcesPath || process.resourcesPath.includes('node_modules')) {
      console.log('🔧 TEMP_DEBUG_SOX_002 - Development mode - attempting to use system SoX directly');
      try {
        const { spawn } = require('child_process');
        const soxPath = this.config.recordProgram;

        console.log('🔧 TEMP_DEBUG_SOX_002 - Using SoX path:', soxPath);

        // Get SoX arguments
        const args = this._getSoxArgs(outputFile, type);

        // TEMP_DEBUG_SOX_003: Log SoX command execution
        console.log('🔧 TEMP_DEBUG_SOX_003 - SoX arguments:', args);
        console.log(`🔧 TEMP_DEBUG_SOX_003 - Full SoX command: ${soxPath} ${args.join(' ')}`);

        const soxProcess = spawn(soxPath, args);

        // Handle process events
        soxProcess.on('error', (error) => {
          console.error('❌ TEMP_DEBUG_SOX_002 - SoX error:', error.message);
        });

        soxProcess.on('exit', (code) => {
          if (code !== 0) {
            console.error('❌ TEMP_DEBUG_SOX_002 - SoX failed with code:', code);
          } else {
            console.log('✅ TEMP_DEBUG_SOX_002 - SoX recording completed successfully');
          }
        });

        // Add stderr handler for debugging
        soxProcess.stderr.on('data', (data) => {
          console.warn('⚠️ TEMP_DEBUG_SOX_002 - SoX stderr:', data.toString().trim());
        });

        // Return recorder object
        return {
          stop: async () => {
            console.log('🛑 TEMP_DEBUG_SOX_002 - Stopping SoX recording...');
            soxProcess.kill('SIGTERM');
            // Wait a bit for the process to finish
            await new Promise(resolve => setTimeout(resolve, 500));
          },
          stream: () => ({
            pipe: () => { }
          })
        };
      } catch (error) {
        console.error('❌ TEMP_DEBUG_SOX_002 - Failed to start system SoX recording:', error);
        return null;
      }
    }

    // In packaged mode, use bundled SoX
    console.log('🔧 TEMP_DEBUG_SOX_002 - Packaged mode - using bundled SoX');
    return await this._startBundledSoxRecording(outputFile, type);
  }

  /**
   * Get SoX command line arguments
   */
  _getSoxArgs(outputFile, type) {
    // TEMP_DEBUG_SOX_004: Log SoX args generation
    console.log('🔧 TEMP_DEBUG_SOX_004 - Generating SoX arguments...');
    console.log('🔧 TEMP_DEBUG_SOX_004 - Type:', type);
    console.log('�� TEMP_DEBUG_SOX_004 - Platform:', this.platform);
    console.log('🔧 TEMP_DEBUG_SOX_004 - Config sample rate:', this.config.sampleRate, 'Hz');
    console.log('🔧 TEMP_DEBUG_SOX_004 - Config channels:', this.config.channels);

    const args = [];

    // Windows uses native WebRTC audio capture (no SoX needed)
    if (this.platform === 'win32') {
      console.log('🔧 TEMP_DEBUG_SOX_004 - Windows: Using native WebRTC audio capture (no SoX args needed)');
      return [];
    }

    // Add sample rate and channel configuration
    args.push('-r', String(this.config.sampleRate));  // Sample rate (6kHz)
    args.push('-c', String(this.config.channels));    // Channels (1 = mono)

    // macOS arguments for recording
    if (type === 'input') {
      // For microphone input: sox -r <sampleRate> -c <channels> -d <outputFile> trim 0 <duration>
      // -d means "default input device"
      args.push('-d', outputFile, 'trim', '0', String(this.segmentDuration || 60));
    } else {
      // For system audio output: sox -r <sampleRate> -c <channels> -t coreaudio <device> <outputFile> trim 0 <duration>
      // -t coreaudio means "CoreAudio input type"
      const outputDevice = this.config.outputDevice || 'default';
      args.push('-t', 'coreaudio', outputDevice, outputFile, 'trim', '0', String(this.segmentDuration || 60));
    }

    // TEMP_DEBUG_SOX_005: Log final SoX args
    console.log(`🔧 TEMP_DEBUG_SOX_005 - Final SoX args for ${type}:`, args);
    console.log(`🔧 TEMP_DEBUG_SOX_005 - Full command preview: sox ${args.join(' ')}`);
    console.log(`🔧 TEMP_DEBUG_SOX_005 - Sample rate: ${this.config.sampleRate}Hz, Channels: ${this.config.channels}`);
    return args;
  }

  // Note: Windows recording is now handled by WindowsAudioCapture.startDualRecording()
  // This method is no longer used on Windows

  // Note: _stopCurrentSegment is defined above (line 607)
  // This duplicate method has been removed

  /**
   * Stop dual recording and return all segments
   */
  async stopDualRecording() {
    // For Windows, delegate to native WebRTC audio capture
    if (this.platform === 'win32' && this.windowsAudioCapture) {
      console.log('🎙️ Delegating stop to Windows native audio capture...');
      return await this.windowsAudioCapture.stopDualRecording();
    }

    try {
      if (!this.isRecording) {
        throw new Error('No recording in progress');
      }

      console.log('🛑 Stopping segmented dual recording...');
      console.log('📊 Current segments:', this.segments.length);

      // Clear the timer
      if (this.recordingTimer) {
        clearTimeout(this.recordingTimer);
        this.recordingTimer = null;
      }

      // Stop current recorders and save final segment
      if (this.inputRecorder || this.outputRecorder) {
        await this._stopCurrentSegment();
      }

      this.isRecording = false;

      // Calculate actual file sizes
      let totalInputSize = 0;
      let totalOutputSize = 0;

      for (const segment of this.segments) {
        try {
          if (fs.existsSync(segment.inputFile)) {
            const stats = fs.statSync(segment.inputFile);
            totalInputSize += stats.size;
          }
          if (segment.hasOutputAudio && fs.existsSync(segment.outputFile)) {
            const stats = fs.statSync(segment.outputFile);
            totalOutputSize += stats.size;
          }
        } catch (error) {
          console.warn(`⚠️ Could not get file size for segment ${segment.segmentId}:`, error.message);
        }
      }

      // Prepare the result with all recorded segments
      const dualAudioData = {
        success: true,
        sessionId: this.sessionId,
        totalSegments: this.segments.length,
        segments: this.segments.map(segment => ({
          segmentId: segment.segmentId,
          inputFile: segment.inputFile,
          outputFile: segment.outputFile,
          hasOutputAudio: segment.hasOutputAudio,
          startTime: segment.startTime,
          duration: this.segmentDuration
        })),
        inputFiles: this.segments.map(s => s.inputFile),
        outputFiles: this.segments.filter(s => s.hasOutputAudio).map(s => s.outputFile),
        totalDuration: this.segments.length * this.segmentDuration,
        totalInputSize,
        totalOutputSize
      };

      console.log('✅ Dual recording stopped successfully:', {
        sessionId: this.sessionId,
        totalSegments: this.segments.length,
        hasSegments: this.segments.length > 0,
        totalInputSize,
        totalOutputSize
      });

      // Return in the format expected by the frontend
      return {
        success: true,
        dualAudioData
      };

    } catch (error) {
      console.error('❌ Failed to stop dual recording:', error);
      this.isRecording = false;
      throw error;
    }
  }

  /**
   * Reset recording state (for recovery from failed states)
   */
  async resetRecordingState() {
    console.log('🔄 Resetting AudioCaptureManager recording state...');

    try {
      // For Windows, delegate to native WebRTC audio capture
      if (this.platform === 'win32' && this.windowsAudioCapture) {
        console.log('🎙️ Delegating resetRecordingState to Windows native audio capture...');
        return await this.windowsAudioCapture.resetRecordingState();
      }

      // For other platforms, reset the state
      this.isRecording = false;
      this.sessionId = null;
      this.segmentIndex = 0;
      this.segments = [];
      this.inputRecorder = null;
      this.outputRecorder = null;

      if (this.recordingTimer) {
        clearTimeout(this.recordingTimer);
        this.recordingTimer = null;
      }

      console.log('✅ AudioCaptureManager recording state reset successfully');
      return { success: true, message: 'Recording state reset successfully' };
    } catch (error) {
      console.error('❌ Failed to reset recording state:', error);
      throw error;
    }
  }

  /**
   * Get available audio devices
   */
  async getAudioDevices() {
    // For Windows, delegate to native WebRTC audio capture
    if (this.platform === 'win32' && this.windowsAudioCapture) {
      console.log('🎙️ Delegating getAudioDevices to Windows native audio capture...');
      return await this.windowsAudioCapture.getAudioDevices();
    }

    try {
      // Platform-specific device lists
      let devices = [];

      switch (this.platform) {
        case 'darwin': // macOS
          devices = [
            { id: 'default', name: 'Default Input', kind: 'audioinput', type: 'built-in' },
            { id: 'blackhole', name: 'BlackHole 2ch', kind: 'audioinput', type: 'virtual' },
            { id: 'built-in-mic', name: 'Built-in Microphone', kind: 'audioinput', type: 'built-in' },
            { id: 'default-out', name: 'Default Output', kind: 'audiooutput', type: 'built-in' },
            { id: 'blackhole-out', name: 'BlackHole 2ch', kind: 'audiooutput', type: 'virtual' },
            { id: 'built-in-out', name: 'Built-in Output', kind: 'audiooutput', type: 'built-in' },
          ];
          break;

        case 'win32': // Windows
          devices = [
            { id: 'default', name: 'Default Input', kind: 'audioinput', type: 'built-in' },
            { id: 'loopback', name: 'System Audio (WASAPI)', kind: 'audioinput', type: 'virtual' },
            { id: 'built-in-mic', name: 'Built-in Microphone', kind: 'audioinput', type: 'built-in' },
            { id: 'default-out', name: 'Default Output', kind: 'audiooutput', type: 'built-in' },
            { id: 'stereo-mix', name: 'Stereo Mix', kind: 'audioinput', type: 'virtual' },
            { id: 'built-in-out', name: 'Built-in Output', kind: 'audiooutput', type: 'built-in' },
          ];
          break;

        case 'linux': // Linux
          devices = [
            { id: 'default', name: 'Default Input', kind: 'audioinput', type: 'built-in' },
            { id: 'pulse', name: 'PulseAudio', kind: 'audioinput', type: 'virtual' },
            { id: 'built-in-mic', name: 'Built-in Microphone', kind: 'audioinput', type: 'built-in' },
            { id: 'default-out', name: 'Default Output', kind: 'audiooutput', type: 'built-in' },
            { id: 'pulse-out', name: 'PulseAudio Output', kind: 'audiooutput', type: 'virtual' },
            { id: 'built-in-out', name: 'Built-in Output', kind: 'audiooutput', type: 'built-in' },
          ];
          break;

        default:
          devices = [
            { id: 'default', name: 'Default Input', kind: 'audioinput', type: 'built-in' },
            { id: 'built-in-mic', name: 'Built-in Microphone', kind: 'audioinput', type: 'built-in' },
            { id: 'default-out', name: 'Default Output', kind: 'audiooutput', type: 'built-in' },
            { id: 'built-in-out', name: 'Built-in Output', kind: 'audiooutput', type: 'built-in' },
          ];
      }

      return {
        input: devices.filter(d => d.kind === 'audioinput'),
        output: devices.filter(d => d.kind === 'audiooutput'),
        platform: this.platform,
        hasVirtualAudio: this.config.hasVirtualAudio
      };
    } catch (error) {
      console.error('❌ Failed to get audio devices:', error);
      return {
        input: [],
        output: [],
        platform: this.platform,
        hasVirtualAudio: this.config.hasVirtualAudio
      };
    }
  }

  /**
   * Calculate audio duration from file size
   */
  calculateDuration(fileSizeBytes, sampleRate, channels) {
    // 16-bit audio = 2 bytes per sample
    const bytesPerSecond = sampleRate * channels * 2;
    return fileSizeBytes / bytesPerSecond;
  }

  /**
   * Check if SoX is available on the system
   */
  async checkSoXAvailability() {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Use bundled SoX path if available
      const soxPath = this.config.recordProgram;

      try {
        await execAsync(`"${soxPath}" --version`);
        console.log('✅ SoX is available:', soxPath);
        return { available: true, path: soxPath };
      } catch (error) {
        console.warn('⚠️ SoX not found at:', soxPath);
        return {
          available: false,
          error: 'SoX not found',
          instructions: this._getSoXInstallInstructions()
        };
      }
    } catch (error) {
      console.error('❌ SoX availability check failed:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Get SoX installation instructions for the current platform
   */
  _getSoXInstallInstructions() {
    switch (this.platform) {
      case 'darwin': // macOS
        return [
          '1. Install Homebrew if not already installed: /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
          '2. Install SoX: brew install sox',
          '3. Restart the application'
        ];

      case 'win32': // Windows
        return [
          '1. Download SoX from: https://sourceforge.net/projects/sox/files/sox/',
          '2. Install SoX and add it to your PATH',
          '3. Restart the application'
        ];

      case 'linux': // Linux
        return [
          '1. Install SoX: sudo apt-get install sox (Ubuntu/Debian)',
          '2. Or: sudo yum install sox (CentOS/RHEL)',
          '3. Restart the application'
        ];

      default:
        return [
          '1. Install SoX audio processing tool',
          '2. Add SoX to your system PATH',
          '3. Restart the application'
        ];
    }
  }

  /**
   * Check if Windows audio setup is required
   */
  async checkWindowsAudioSetup() {
    if (this.platform !== 'win32') return { required: false };

    try {
      console.log('🔧 Checking Windows audio setup...');
      console.log('✅ Windows: Using native WebRTC audio capture (no SoX needed)');

      // Windows now uses native WebRTC APIs, no external dependencies required
      return {
        required: false,
        message: 'Windows uses native WebRTC audio capture - no external setup required'
      };
    } catch (error) {
      console.error('❌ Windows audio setup check failed:', error);
      return { required: true, error: error.message };
    }
  }

  /**
   * Get platform-specific setup instructions
   */
  getSetupInstructions() {
    switch (this.platform) {
      case 'darwin': // macOS
        return {
          title: 'macOS Audio Setup',
          instructions: [
            '1. Install BlackHole: brew install blackhole-2ch',
            '2. Open Audio MIDI Setup',
            '3. Create Multi-Output Device with BlackHole 2ch',
            '4. Set as default output device',
            '5. Restart the application'
          ],
          hasVirtualAudio: true
        };

      case 'win32': // Windows
        return {
          title: 'Windows Audio Setup',
          instructions: [
            '1. No external setup required - uses native WebRTC audio capture',
            '2. Grant microphone permissions when prompted',
            '3. Grant screen capture permissions for system audio recording',
            '4. The application will handle audio capture automatically'
          ],
          hasVirtualAudio: false
        };

      case 'linux': // Linux
        return {
          title: 'Linux Audio Setup',
          instructions: [
            '1. Install PulseAudio: sudo apt-get install pulseaudio',
            '2. Install SoX: sudo apt-get install sox',
            '3. Configure PulseAudio for system audio capture',
            '4. Restart the application'
          ],
          hasVirtualAudio: true
        };

      default:
        return {
          title: 'Audio Setup',
          instructions: ['Audio recording may be limited on this platform'],
          hasVirtualAudio: false
        };
    }
  }

  /**
   * Get available audio devices
   */
  async getAudioDevices() {
    try {
      console.log('🎤 Getting audio devices...');

      // Return devices in the format expected by the frontend
      // Each device should have a 'kind' property for filtering
      const devices = [
        { id: 'default', name: 'Default Microphone', kind: 'audioinput' },
        { id: 'default', name: 'Default Speaker', kind: 'audiooutput' }
      ];

      console.log('✅ Audio devices retrieved:', devices);
      return {
        success: true,
        devices
      };
    } catch (error) {
      console.error('❌ Failed to get audio devices:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cleanup temporary files
   */
  async cleanup() {
    // For Windows, delegate to native WebRTC audio capture
    if (this.platform === 'win32' && this.windowsAudioCapture) {
      console.log('🎙️ Delegating cleanup to Windows native audio capture...');
      return await this.windowsAudioCapture.cleanup();
    }

    try {
      const tempFiles = await fs.readdir(this.tempDir);
      for (const file of tempFiles) {
        if (file.endsWith('.wav')) {
          await fs.remove(path.join(this.tempDir, file));
        }
      }
      console.log('🧹 Cleaned up temporary audio files');
    } catch (error) {
      console.warn('⚠️ Failed to cleanup temp files:', error);
    }
  }
}

module.exports = AudioCaptureManager; 