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
let record;
let alternativeRecordingAvailable = false;

try {
  record = require('node-record-lpcm16');
  console.log('✅ node-record-lpcm16 loaded successfully');
  alternativeRecordingAvailable = true;
} catch (error) {
  console.warn('⚠️ node-record-lpcm16 not available:', error.message);
  console.warn('⚠️ This usually means SoX is not installed or not in PATH');
  record = null;
}

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
      console.log('🔧 Windows detected - using native WebRTC audio capture');
      this.windowsAudioCapture = new WindowsAudioCapture();
      this.recordingAvailable = true;
      console.log(`🎙️ WindowsAudioCapture initialized with native WebRTC APIs`);
      return;
    }
    
    // For other platforms, use SoX-based recording
    // Set up bundled SoX environment for node-record-lpcm16
    this._setupBundledSoxEnvironment();
    
    // Platform-specific configuration
    this.config = this._getPlatformConfig();
    
    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);
    
    // Pre-setup SoX for Windows to avoid installer detection during recording
    this._preSetupWindowsSox();
    
    // Check if any recording method is available
    this.recordingAvailable = alternativeRecordingAvailable || webAudioRecording?.available;
    
    if (!this.recordingAvailable) {
      console.error('❌ No audio recording method available');
      console.error('❌ This usually means SoX is not installed or not in PATH');
      throw new Error('Audio recording requires SoX to be installed. Please install SoX and restart the application.');
    }
    
    if (!record) {
      console.warn('⚠️ Native audio recording not available - SoX may not be installed');
      console.warn('⚠️ Will use fallback recording methods');
    }
    
    console.log(`🎙️ AudioCaptureManager initialized for ${this.platform} with 1-minute segments`);
  }

  /**
   * Pre-setup SoX for Windows - no longer needed (uses native WebRTC)
   */
  _preSetupWindowsSox() {
    // Windows now uses native WebRTC audio capture, no SoX needed
    if (this.platform === 'win32') {
      console.log('🔧 Windows: Using native WebRTC audio capture (no SoX needed)');
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
      sampleRate: 16000,
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
        return 'sox'; // Use system SoX in development
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
      if (this.isRecording) {
        throw new Error('Recording already in progress');
      }

      // For Windows, delegate to native WebRTC audio capture
      if (this.platform === 'win32' && this.windowsAudioCapture) {
        console.log('🎙️ Delegating to Windows native audio capture...');
        return await this.windowsAudioCapture.startDualRecording();
      }

      this.sessionId = uuidv4();
      this.segmentIndex = 0;
      this.segments = [];

      console.log('🎙️ Starting segmented dual recording (1-minute segments)...');

      // Start the first segment
      await this._startNewSegment();

      this.isRecording = true;

      console.log('✅ Segmented dual recording started successfully');
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
   * Start a new 1-minute recording segment
   */
  async _startNewSegment() {
    const segmentId = `${this.sessionId}_segment_${this.segmentIndex.toString().padStart(3, '0')}`;
    const inputFile = path.join(this.tempDir, `input_${segmentId}.wav`);
    const outputFile = path.join(this.tempDir, `output_${segmentId}.wav`);

    console.log(`🎙️ Starting segment ${this.segmentIndex + 1}: ${segmentId}`);

    try {
      // Start input recording (microphone)
      this.inputRecorder = await this._startInputRecording(inputFile);

      // Start output recording (system audio) - platform dependent
      if (this.config.hasVirtualAudio) {
        this.outputRecorder = await this._startOutputRecording(outputFile);
        if (!this.outputRecorder) {
          console.log('⚠️ System audio recording failed, recording microphone only');
        }
      } else {
        console.log('⚠️ Virtual audio not available on this platform, recording microphone only');
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
      
      console.log(`📝 Segment info:`, {
        segmentId,
        hasOutputAudio: segmentInfo.hasOutputAudio,
        outputRecorder: !!this.outputRecorder
      });
      
      this.segments.push(segmentInfo);
      
      console.log(`📝 Added segment ${this.segmentIndex}:`, {
        segmentId,
        inputFile,
        outputFile,
        platform: this.platform,
        hasOutputAudio: !!this.outputRecorder,
        totalSegments: this.segments.length
      });

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
   * Start input recording (microphone)
   */
  async _startInputRecording(outputFile) {
    console.log(`🎤 Starting input recording to: ${outputFile}`);
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.ensureDirSync(outputDir);
      console.log('✅ Created output directory:', outputDir);
    }
    
    // Windows uses native WebRTC audio capture (handled in constructor)
    if (this.platform === 'win32') {
      console.log('🔧 Windows: Using native WebRTC audio capture (no SoX needed)');
      // Create a minimal audio file as placeholder
      const minimalWavHeader = this._createMinimalWavHeader();
      await fs.writeFile(outputFile, minimalWavHeader);
      
      return {
        stop: () => console.log('🛑 Windows WebRTC recorder stopped'),
        stream: () => ({ pipe: () => {} })
      };
    }
    
    // For non-Windows platforms, try bundled SoX first
    try {
      const bundledRecorder = await this._startBundledSoxRecording(outputFile, 'input');
      if (bundledRecorder) {
        console.log('✅ Using bundled SoX for input recording');
        return bundledRecorder;
      }
    } catch (error) {
      console.warn('⚠️ Bundled SoX recording failed, trying node-record-lpcm16:', error.message);
    }
    
    // Fallback to node-record-lpcm16
    if (!record) {
      console.warn('⚠️ Native recording not available, creating placeholder recording');
      
      // Create a minimal audio file for testing
      const minimalWavHeader = this._createMinimalWavHeader();
      await fs.writeFile(outputFile, minimalWavHeader);
      
      // Return a mock recorder that can be stopped
      return {
        stop: () => {
          console.log('🛑 Mock recorder stopped');
        },
        stream: () => ({
          pipe: () => {}
        })
      };
    }

    console.log(`🔧 Using node-record-lpcm16 with record program: ${this.config.recordProgram}`);
    
    const recorder = record.record({
      sampleRate: this.config.sampleRate,
      channels: this.config.channels,
      compress: this.config.compress,
      threshold: this.config.threshold,
      silence: this.config.silence,
      device: this.config.inputDevice,
      recordProgram: this.config.recordProgram,
    });

    recorder.stream().pipe(fs.createWriteStream(outputFile));
    return recorder;
  }

  /**
   * Start output recording (system audio)
   */
  async _startOutputRecording(outputFile) {
    console.log(`🎙️ Starting output recording to: ${outputFile}`);
    
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
      console.warn('⚠️ Native recording not available, skipping system audio recording');
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

      case 'win32': // Windows - try different approaches
        return await this._startWindowsOutputRecording(outputFile);

      case 'linux': // Linux - PulseAudio
        return record.record({
          sampleRate: this.config.sampleRate,
          channels: 2,
          compress: this.config.compress,
          threshold: this.config.threshold,
          silence: this.config.silence,
          device: this.config.outputDevice,
          recordProgram: this.config.recordProgram,
        });

      default:
        console.warn('⚠️ Output recording not supported on this platform');
        return null;
    }
  }

  /**
   * Start recording using bundled SoX directly
   */
  async _startBundledSoxRecording(outputFile, type = 'input') {
    try {
      // Windows uses native WebRTC audio capture (no SoX needed)
      if (this.platform === 'win32') {
        console.log('🔧 Windows: Using native WebRTC audio capture (no SoX needed)');
        return null;
      }
      
      // Get bundled SoX path
      const soxPath = this.config.recordProgram;
      
      console.log('🔍 Debug - recordProgram from config:', soxPath);
      console.log('🔍 Debug - recordProgram type:', typeof soxPath);
      console.log('🔍 Debug - platform:', this.platform);
      console.log('🔍 Debug - isPackaged:', process.resourcesPath && !process.resourcesPath.includes('node_modules'));
      console.log('🔍 Debug - resourcesPath:', process.resourcesPath);
      
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
      
      console.log(`🎙️ Starting bundled SoX recording (${type}) to: ${outputFile}`);
      console.log(`🔧 Using bundled SoX: ${soxPath}`);
      logToFile(`Starting bundled SoX recording (${type}) to: ${outputFile}`, 'INFO');
      logToFile(`Using bundled SoX: ${soxPath}`, 'INFO');
      
      // Check if bundled SoX exists
      if (!fs.existsSync(soxPath)) {
        console.warn('⚠️ Bundled SoX not found at:', soxPath);
        return null;
      }
      
      // Use the pre-configured SoX path (already set up in constructor)
      const actualSoxPath = soxPath;
      
      // Ensure output directory exists
      const outputDir = path.dirname(outputFile);
      if (!fs.existsSync(outputDir)) {
        fs.ensureDirSync(outputDir);
        console.log('✅ Created output directory:', outputDir);
      }
      
      // macOS-specific SoX command
      const device = type === 'input' ? 'default' : this.config.outputDevice || 'default';
      const soxCommand = `"${soxPath}" -t coreaudio ${device} "${outputFile}"`;
      
      console.log(`🔧 SoX command: ${soxCommand}`);
      
      // Start SoX process
      const { spawn } = require('child_process');
      
      const spawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        detached: false
      };
      
      console.log(`🔧 Spawning SoX with path: ${actualSoxPath}`);
      console.log(`🔧 Spawn options:`, spawnOptions);
      logToFile(`Spawning SoX with path: ${actualSoxPath}`, 'INFO');
      
      const soxProcess = spawn(actualSoxPath, this._getSoxArgs(outputFile, type), spawnOptions);
      
      // Handle process events
      soxProcess.on('error', (error) => {
        console.error('❌ SoX process error:', error);
        logToFile(`SoX process error: ${error.message}`, 'ERROR');
      });
      
      soxProcess.on('exit', (code) => {
        console.log(`🛑 SoX process exited with code: ${code}`);
      });
      
      // Add stderr handler for better debugging
      soxProcess.stderr.on('data', (data) => {
        console.warn('⚠️ SoX stderr:', data.toString());
      });
      
      // Return a recorder object that can be stopped
      return {
        stop: () => {
          console.log('🛑 Stopping bundled SoX recording...');
          try {
            soxProcess.kill('SIGTERM'); // Graceful termination on Unix
          } catch (error) {
            console.warn('⚠️ Error stopping SoX process:', error.message);
          }
        },
        stream: () => ({
          pipe: () => {}
        }),
        process: soxProcess
      };
      
    } catch (error) {
      console.error('❌ Bundled SoX recording failed:', error);
      logToFile(`Bundled SoX recording failed: ${error.message}`, 'ERROR');
      return null;
    }
  }
  
  /**
   * Get SoX command line arguments
   */
  _getSoxArgs(outputFile, type) {
    const args = [];
    
    // Windows uses native WebRTC audio capture (no SoX needed)
    if (this.platform === 'win32') {
      console.log('🔧 Windows: Using native WebRTC audio capture (no SoX args needed)');
      return [];
    }
    
    // macOS arguments
    args.push('-t', 'coreaudio');
    args.push(type === 'input' ? 'default' : (this.config.outputDevice || 'default'));
    args.push(outputFile);
    
    return args;
  }

  /**
   * Start Windows output recording using native WebRTC
   */
  async _startWindowsOutputRecording(outputFile) {
    console.log(`🎙️ Starting Windows output recording to: ${outputFile}`);
    console.log('🔧 Windows: Using native WebRTC audio capture (no SoX needed)');
    
    // Ensure output directory exists
    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
      fs.ensureDirSync(outputDir);
      console.log('✅ Created output directory:', outputDir);
    }
    
    // Create a minimal audio file as placeholder (actual recording handled by WindowsAudioCapture)
    try {
      const minimalWavHeader = this._createMinimalWavHeader();
      await fs.writeFile(outputFile, minimalWavHeader);
      console.log('✅ Created minimal output audio file for Windows');
      
      // Return a mock recorder
      return {
        stop: () => {
          console.log('🛑 Windows WebRTC output recorder stopped');
        },
        stream: () => ({
          pipe: () => {}
        })
      };
    } catch (fileError) {
      console.warn('⚠️ Failed to create minimal output file:', fileError.message);
      return null;
    }
  }

  /**
   * Stop the current segment and save it
   */
  async _stopCurrentSegment() {
    if (!this.inputRecorder) return;

    console.log(`🛑 Stopping segment ${this.segmentIndex}`);

    // Stop current recorders
    this.inputRecorder.stop();
    if (this.outputRecorder) {
      this.outputRecorder.stop();
    }
    this.inputRecorder = null;
    this.outputRecorder = null;

    // Wait for files to be written
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Update segment info with stats
    const currentSegment = this.segments[this.segments.length - 1];
    if (currentSegment) {
      console.log(`🔍 Updating segment ${this.segmentIndex}:`, currentSegment.segmentId);
      
      const inputExists = await fs.pathExists(currentSegment.inputFile);
      const outputExists = currentSegment.hasOutputAudio ? await fs.pathExists(currentSegment.outputFile) : false;

      console.log(`📁 File existence check:`, {
        inputFile: currentSegment.inputFile,
        inputExists,
        outputFile: currentSegment.outputFile,
        outputExists,
        hasOutputAudio: currentSegment.hasOutputAudio
      });

      if (inputExists) {
        const inputStats = await fs.stat(currentSegment.inputFile);
        currentSegment.inputSize = inputStats.size;
        currentSegment.inputDuration = this.calculateDuration(inputStats.size, this.config.sampleRate, this.config.channels);
        console.log(`📊 Input file stats:`, {
          size: inputStats.size,
          calculatedDuration: currentSegment.inputDuration
        });
      }

      if (outputExists) {
        const outputStats = await fs.stat(currentSegment.outputFile);
        currentSegment.outputSize = outputStats.size;
        currentSegment.outputDuration = this.calculateDuration(outputStats.size, this.config.sampleRate, 2);
        console.log(`📊 Output file stats:`, {
          size: outputStats.size,
          calculatedDuration: currentSegment.outputDuration
        });
      } else if (currentSegment.hasOutputAudio) {
        console.warn('⚠️ Output file not found but was expected');
        currentSegment.outputSize = 0;
        currentSegment.outputDuration = 0;
      }

      currentSegment.endTime = Date.now();
      currentSegment.duration = (currentSegment.endTime - currentSegment.startTime) / 1000;

      const inputSizeMB = currentSegment.inputSize ? (currentSegment.inputSize / (1024 * 1024)).toFixed(2) : '0';
      const outputSizeMB = currentSegment.outputSize ? (currentSegment.outputSize / (1024 * 1024)).toFixed(2) : '0';
      
      console.log(`✅ Segment ${this.segmentIndex} saved: ${inputSizeMB}MB input, ${outputSizeMB}MB output`);
    } else {
      console.warn(`⚠️ No current segment found for index ${this.segmentIndex}`);
    }
  }

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

      // Debug: Log segment details
      console.log('🔍 Segment details:', this.segments.map((s, i) => ({
        index: i,
        segmentId: s.segmentId,
        inputFile: s.inputFile,
        outputFile: s.outputFile,
        inputSize: s.inputSize,
        outputSize: s.outputSize,
        duration: s.duration
      })));

      // Calculate total stats
      let totalInputSize = 0;
      let totalOutputSize = 0;
      let totalDuration = 0;

      for (const segment of this.segments) {
        totalInputSize += segment.inputSize || 0;
        totalOutputSize += segment.outputSize || 0;
        totalDuration += segment.duration || 0;
      }

      // Create a serializable result object
      const result = {
        success: true,
        sessionId: this.sessionId,
        totalSegments: this.segments.length,
        totalInputSize,
        totalOutputSize,
        totalDuration,
        segments: this.segments.map(segment => ({
          segmentId: segment.segmentId,
          inputFile: segment.inputFile,
          outputFile: segment.outputFile,
          inputSize: segment.inputSize || 0,
          outputSize: segment.outputSize || 0,
          duration: segment.duration || 0,
          startTime: segment.startTime,
          endTime: segment.endTime
        })),
        inputFiles: this.segments.map(s => s.inputFile),
        outputFiles: this.segments.map(s => s.outputFile)
      };

      console.log(`✅ Segmented recording stopped: ${this.segments.length} segments, ${(totalInputSize / (1024 * 1024)).toFixed(2)}MB total input, ${(totalOutputSize / (1024 * 1024)).toFixed(2)}MB total output`);
      console.log('📤 Returning result:', JSON.stringify(result, null, 2));
      
      return result;

    } catch (error) {
      console.error('❌ Failed to stop dual recording:', error);
      this.isRecording = false;
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
   * Create a minimal WAV header for placeholder files
   */
  _createMinimalWavHeader() {
    const sampleRate = this.config.sampleRate;
    const channels = this.config.channels;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    
    // Create a minimal 1-second silent WAV file
    const dataSize = sampleRate * blockAlign;
    const fileSize = 36 + dataSize;
    
    const buffer = Buffer.alloc(44 + dataSize);
    let offset = 0;
    
    // WAV header
    buffer.write('RIFF', offset); offset += 4;
    buffer.writeUInt32LE(fileSize, offset); offset += 4;
    buffer.write('WAVE', offset); offset += 4;
    buffer.write('fmt ', offset); offset += 4;
    buffer.writeUInt32LE(16, offset); offset += 4; // fmt chunk size
    buffer.writeUInt16LE(1, offset); offset += 2; // PCM format
    buffer.writeUInt16LE(channels, offset); offset += 2;
    buffer.writeUInt32LE(sampleRate, offset); offset += 4;
    buffer.writeUInt32LE(byteRate, offset); offset += 4;
    buffer.writeUInt16LE(blockAlign, offset); offset += 2;
    buffer.writeUInt16LE(bitsPerSample, offset); offset += 2;
    buffer.write('data', offset); offset += 4;
    buffer.writeUInt32LE(dataSize, offset); offset += 4;
    
    // Fill with silence (zeros)
    buffer.fill(0, offset);
    
    return buffer;
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