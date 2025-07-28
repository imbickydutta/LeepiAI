const { desktopCapturer, ipcMain } = require('electron');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/**
 * Windows Audio Capture using Electron's native WebRTC APIs
 * This provides audio capture without requiring SoX or external dependencies
 */
class WindowsAudioCapture {
  constructor() {
    this.isRecording = false;
    this.sessionId = null;
    this.segmentIndex = 0;
    this.segments = [];
    this.recordingTimer = null;
    this.mainWindow = null;
    
    // Use app.getPath('temp') for packaged apps, fallback to local temp for development
    try {
      const { app } = require('electron');
      this.tempDir = path.join(app.getPath('temp'), 'leepi-recorder');
    } catch (error) {
      // Fallback for when electron app is not available
      this.tempDir = path.join(__dirname, '../../../temp');
    }
    
    this.segmentDuration = 60; // 1 minute segments
    this.config = {
      sampleRate: 16000,
      channels: 1,
      compress: false,
      threshold: 0.5,
      silence: '2.0'
    };
    
    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);
    
    console.log('🎙️ WindowsAudioCapture initialized with native WebRTC APIs');
  }

  /**
   * Set the main window reference for IPC communication
   */
  setMainWindow(mainWindow) {
    this.mainWindow = mainWindow;
  }

  /**
   * Start dual recording using WebRTC APIs
   */
  async startDualRecording() {
    try {
      if (this.isRecording) {
        throw new Error('Recording already in progress');
      }

      if (!this.mainWindow) {
        throw new Error('Main window not set - cannot start WebRTC recording');
      }

      this.sessionId = uuidv4();
      this.segmentIndex = 0;
      this.segments = [];

      console.log('🎙️ Starting Windows native dual recording...');

      // Start the first segment
      await this._startNewSegment();

      this.isRecording = true;

      console.log('✅ Windows native dual recording started successfully');
      return {
        success: true,
        sessionId: this.sessionId,
        segments: this.segments
      };

    } catch (error) {
      console.error('❌ Failed to start Windows native recording:', error);
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

    console.log(`🎙️ Starting Windows segment ${this.segmentIndex + 1}: ${segmentId}`);

    try {
      // Ensure output directory exists
      fs.ensureDirSync(this.tempDir);

      // Start input recording (microphone) via IPC
      this.inputRecorder = await this._startInputRecording(inputFile, segmentId);

      // Start output recording (system audio) via IPC
      this.outputRecorder = await this._startOutputRecording(outputFile, segmentId);

      // Store segment info
      const segmentInfo = {
        segmentId,
        inputFile,
        outputFile,
        startTime: Date.now(),
        platform: 'win32',
        hasOutputAudio: !!this.outputRecorder
      };
      
      console.log(`📝 Windows segment info:`, {
        segmentId,
        hasOutputAudio: segmentInfo.hasOutputAudio,
        outputRecorder: !!this.outputRecorder
      });
      
      this.segments.push(segmentInfo);
      
      console.log(`📝 Added Windows segment ${this.segmentIndex}:`, {
        segmentId,
        inputFile,
        outputFile
      });

      // Set up timer for next segment
      this.recordingTimer = setTimeout(() => {
        this._startNextSegment();
      }, this.segmentDuration * 1000);

      this.segmentIndex++;

    } catch (error) {
      console.error('❌ Failed to start Windows segment:', error);
      throw error;
    }
  }

  /**
   * Start input recording (microphone) using IPC to renderer process
   */
  async _startInputRecording(outputFile, segmentId) {
    console.log(`🎤 Starting Windows input recording to: ${outputFile}`);
    
    try {
      // Send IPC message to renderer to start input recording
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                sampleRate: ${this.config.sampleRate},
                channelCount: ${this.config.channels},
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              },
              video: false
            });

            // Create MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm;codecs=opus'
            });

            const chunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };

            mediaRecorder.onstop = async () => {
              try {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                
                // Send audio data back to main process
                window.electronAPI.saveAudioData('${segmentId}', 'input', Array.from(new Uint8Array(arrayBuffer)));
              } catch (error) {
                console.error('Failed to save input recording:', error);
              }
            };

            // Start recording
            mediaRecorder.start();
            
            // Store recorder reference
            window.currentInputRecorder = {
              mediaRecorder: mediaRecorder,
              stream: stream,
              segmentId: '${segmentId}'
            };
            
            return { success: true, message: 'Input recording started' };
          } catch (error) {
            console.error('Failed to start input recording:', error);
            return { success: false, error: error.message };
          }
        })()
      `);

      if (!result.success) {
        throw new Error(result.error || 'Failed to start input recording');
      }

      console.log('✅ Windows input recording started via IPC');

      return {
        stop: async () => {
          console.log('🛑 Stopping Windows input recording...');
          await this.mainWindow.webContents.executeJavaScript(`
            if (window.currentInputRecorder && window.currentInputRecorder.segmentId === '${segmentId}') {
              window.currentInputRecorder.mediaRecorder.stop();
              window.currentInputRecorder.stream.getTracks().forEach(track => track.stop());
              window.currentInputRecorder = null;
            }
          `);
        },
        segmentId: segmentId
      };

    } catch (error) {
      console.error('❌ Windows input recording failed:', error);
      
      // Create a minimal audio file as fallback
      const minimalWavHeader = this._createMinimalWavHeader();
      await fs.writeFile(outputFile, minimalWavHeader);
      
      return {
        stop: () => console.log('🛑 Windows input mock recorder stopped'),
        segmentId: segmentId
      };
    }
  }

  /**
   * Start output recording (system audio) using desktop capture via IPC
   */
  async _startOutputRecording(outputFile, segmentId) {
    console.log(`🎙️ Starting Windows output recording to: ${outputFile}`);
    
    try {
      // Get desktop capture sources
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      });

      if (sources.length === 0) {
        console.warn('⚠️ No screen capture sources available');
        return null;
      }

      // Use the first available source
      const source = sources[0];
      console.log('📺 Using screen capture source:', source.name);

      // Send IPC message to renderer to start output recording
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            // Get system audio stream using desktop capture
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: '${source.id}'
                }
              },
              video: false
            });

            // Create MediaRecorder for system audio
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm;codecs=opus'
            });

            const chunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };

            mediaRecorder.onstop = async () => {
              try {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const arrayBuffer = await blob.arrayBuffer();
                
                // Send audio data back to main process
                window.electronAPI.saveAudioData('${segmentId}', 'output', Array.from(new Uint8Array(arrayBuffer)));
              } catch (error) {
                console.error('Failed to save output recording:', error);
              }
            };

            // Start recording
            mediaRecorder.start();
            
            // Store recorder reference
            window.currentOutputRecorder = {
              mediaRecorder: mediaRecorder,
              stream: stream,
              segmentId: '${segmentId}'
            };
            
            return { success: true, message: 'Output recording started' };
          } catch (error) {
            console.error('Failed to start output recording:', error);
            return { success: false, error: error.message };
          }
        })()
      `);

      if (!result.success) {
        console.warn('⚠️ Output recording failed, will record microphone only:', result.error);
        return null;
      }

      console.log('✅ Windows output recording started via IPC');

      return {
        stop: async () => {
          console.log('🛑 Stopping Windows output recording...');
          await this.mainWindow.webContents.executeJavaScript(`
            if (window.currentOutputRecorder && window.currentOutputRecorder.segmentId === '${segmentId}') {
              window.currentOutputRecorder.mediaRecorder.stop();
              window.currentOutputRecorder.stream.getTracks().forEach(track => track.stop());
              window.currentOutputRecorder = null;
            }
          `);
        },
        segmentId: segmentId
      };

    } catch (error) {
      console.error('❌ Windows output recording failed:', error);
      
      // Create a minimal audio file as fallback
      const minimalWavHeader = this._createMinimalWavHeader();
      await fs.writeFile(outputFile, minimalWavHeader);
      
      return {
        stop: () => console.log('🛑 Windows output mock recorder stopped'),
        segmentId: segmentId
      };
    }
  }

  /**
   * Start the next segment
   */
  async _startNextSegment() {
    if (!this.isRecording) return;

    console.log(`🔄 Starting next Windows segment: ${this.segmentIndex + 1}`);

    // Stop current segment
    await this._stopCurrentSegment();

    // Start new segment
    await this._startNewSegment();
  }

  /**
   * Stop the current segment
   */
  async _stopCurrentSegment() {
    if (!this.inputRecorder) return;

    console.log(`🛑 Stopping Windows segment ${this.segmentIndex}`);

    // Stop current recorders
    await this.inputRecorder.stop();
    if (this.outputRecorder) {
      await this.outputRecorder.stop();
    }

    // Clear timer
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }

    this.inputRecorder = null;
    this.outputRecorder = null;

    // Wait for files to be written
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Update segment info
    const currentSegment = this.segments[this.segments.length - 1];
    if (currentSegment) {
      currentSegment.endTime = Date.now();
      currentSegment.duration = (currentSegment.endTime - currentSegment.startTime) / 1000;
      
      // Check file sizes
      try {
        if (await fs.pathExists(currentSegment.inputFile)) {
          const inputStats = await fs.stat(currentSegment.inputFile);
          currentSegment.inputSize = inputStats.size;
        }
        if (currentSegment.hasOutputAudio && await fs.pathExists(currentSegment.outputFile)) {
          const outputStats = await fs.stat(currentSegment.outputFile);
          currentSegment.outputSize = outputStats.size;
        }
      } catch (error) {
        console.warn('⚠️ Could not get file stats:', error.message);
      }
      
      console.log(`✅ Windows segment ${this.segmentIndex} completed: ${currentSegment.duration}s`);
    }
  }

  /**
   * Stop dual recording
   */
  async stopDualRecording() {
    if (!this.isRecording) {
      console.log('⚠️ No Windows recording in progress');
      return { success: false, error: 'No recording in progress' };
    }

    console.log('🛑 Stopping Windows dual recording...');

    try {
      // Stop current segment
      await this._stopCurrentSegment();

      this.isRecording = false;

      console.log('✅ Windows dual recording stopped successfully');

      // Calculate total stats
      let totalInputSize = 0;
      let totalOutputSize = 0;
      let totalDuration = 0;

      for (const segment of this.segments) {
        totalInputSize += segment.inputSize || 0;
        totalOutputSize += segment.outputSize || 0;
        totalDuration += segment.duration || 0;
      }

      // Create a serializable result object matching the original AudioCaptureManager format
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

      console.log(`✅ Windows recording stopped: ${this.segments.length} segments, ${(totalInputSize / (1024 * 1024)).toFixed(2)}MB total input, ${(totalOutputSize / (1024 * 1024)).toFixed(2)}MB total output`);
      console.log('📤 Returning result:', JSON.stringify(result, null, 2));
      
      return result;

    } catch (error) {
      console.error('❌ Failed to stop Windows recording:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get available audio devices
   */
  async getAudioDevices() {
    try {
      if (!this.mainWindow) {
        return { success: false, error: 'Main window not set' };
      }

      const devices = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioDevices = devices.filter(device => device.kind === 'audioinput');
            return {
              success: true,
              devices: audioDevices.map(device => ({
                deviceId: device.deviceId,
                label: device.label || \`Microphone \${device.deviceId.slice(0, 8)}\`,
                groupId: device.groupId
              }))
            };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })()
      `);
      
      console.log('🎤 Available Windows audio devices:', devices.devices?.length || 0);
      
      return devices;
    } catch (error) {
      console.error('❌ Failed to get Windows audio devices:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create a minimal WAV header
   */
  _createMinimalWavHeader() {
    const sampleRate = this.config.sampleRate;
    const channels = this.config.channels;
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * bitsPerSample / 8;
    const blockAlign = channels * bitsPerSample / 8;
    
    const buffer = Buffer.alloc(44);
    
    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36, 4); // File size - 8
    buffer.write('WAVE', 8);
    
    // fmt chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // fmt chunk size
    buffer.writeUInt16LE(1, 20); // Audio format (PCM)
    buffer.writeUInt16LE(channels, 22); // Channels
    buffer.writeUInt32LE(sampleRate, 24); // Sample rate
    buffer.writeUInt32LE(byteRate, 28); // Byte rate
    buffer.writeUInt16LE(blockAlign, 32); // Block align
    buffer.writeUInt16LE(bitsPerSample, 34); // Bits per sample
    
    // data chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(0, 40); // Data size (will be updated)
    
    return buffer;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    console.log('🧹 Cleaning up Windows audio capture...');
    
    if (this.isRecording) {
      await this.stopDualRecording();
    }
    
    // Clear any remaining timers
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }
    
    // Clean up any remaining recorders in renderer
    if (this.mainWindow) {
      try {
        await this.mainWindow.webContents.executeJavaScript(`
          if (window.currentInputRecorder) {
            window.currentInputRecorder.mediaRecorder.stop();
            window.currentInputRecorder.stream.getTracks().forEach(track => track.stop());
            window.currentInputRecorder = null;
          }
          if (window.currentOutputRecorder) {
            window.currentOutputRecorder.mediaRecorder.stop();
            window.currentOutputRecorder.stream.getTracks().forEach(track => track.stop());
            window.currentOutputRecorder = null;
          }
        `);
      } catch (error) {
        console.warn('⚠️ Could not cleanup renderer recorders:', error.message);
      }
    }
    
    console.log('✅ Windows audio capture cleanup complete');
  }
}

module.exports = WindowsAudioCapture; 