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
    
    this.config = {
      sampleRate: configSampleRate,
      channels: configChannels,
      compress: false,
      threshold: 0.5,
      silence: '2.0'
    };
    
    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * Set the main window reference for IPC communication
   */
  setMainWindow(mainWindow) {
    if (!mainWindow || !mainWindow.webContents) {
      throw new Error('Invalid main window provided');
    }
    this.mainWindow = mainWindow;
    console.log('✅ Main window reference set for Windows audio capture');
  }

  /**
   * Check if WebRTC APIs are available in the renderer
   */
  async checkWebRTCAvailability() {
    try {
      if (!this.mainWindow || !this.mainWindow.webContents) {
        return { available: false, error: 'Main window not available' };
      }

      const result = await this.mainWindow.webContents.executeJavaScript(`
        (() => {
          const checks = {
            mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            MediaRecorder: !!window.MediaRecorder,
            getUserMedia: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            saveAudioData: !!(window.electronAPI && window.electronAPI.saveAudioData)
          };
          
          return {
            available: checks.mediaDevices && checks.MediaRecorder && checks.getUserMedia && checks.saveAudioData,
            checks: checks
          };
        })()
      `);

      console.log('🔧 WebRTC availability check:', result);
      return result;
    } catch (error) {
      console.error('❌ Error checking WebRTC availability:', error);
      return { available: false, error: error.message };
    }
  }

  /**
   * Start single recording (for compatibility with AudioCaptureManager)
   */
  async startRecording(outputFile) {
    try {
      if (this.isRecording) {
        throw new Error('Recording already in progress');
      }

      if (!this.mainWindow) {
        throw new Error('Main window not set - cannot start WebRTC recording');
      }

      console.log('🎙️ Starting Windows native single recording...');
      console.log('🔧 Main window available:', !!this.mainWindow);
      console.log('🔧 WebContents available:', !!this.mainWindow.webContents);

      // Check WebRTC availability first
      const webRTCCheck = await this.checkWebRTCAvailability();
      if (!webRTCCheck.available) {
        console.error('❌ WebRTC not available:', webRTCCheck);
        throw new Error(`WebRTC not available: ${webRTCCheck.error || 'Unknown error'}`);
      }

      this.sessionId = uuidv4();
      this.segmentIndex = 0;
      this.segments = [];

      // Start the first segment
      await this._startNewSegment();

      this.isRecording = true;

      console.log('✅ Windows native single recording started successfully');
      return {
        success: true,
        sessionId: this.sessionId,
        segments: this.segments
      };

    } catch (error) {
      console.error('❌ Failed to start Windows native recording:', error);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
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

      console.log('🎙️ Starting Windows native dual recording...');
      console.log('🔧 Main window available:', !!this.mainWindow);
      console.log('🔧 WebContents available:', !!this.mainWindow.webContents);

      // Check WebRTC availability first
      const webRTCCheck = await this.checkWebRTCAvailability();
      if (!webRTCCheck.available) {
        console.error('❌ WebRTC not available:', webRTCCheck);
        throw new Error(`WebRTC not available: ${webRTCCheck.error || 'Unknown error'}`);
      }

      this.sessionId = uuidv4();
      this.segmentIndex = 0;
      this.segments = [];

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
      console.error('❌ Error stack:', error.stack);
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
    console.log(`🔧 Input file: ${inputFile}`);
    console.log(`🔧 Output file: ${outputFile}`);

    try {
      // Ensure output directory exists
      fs.ensureDirSync(this.tempDir);

      // Start input recording (microphone)
      console.log('🎤 Starting input recording...');
      const inputRecorder = await this._startInputRecording(inputFile, segmentId);
      
      // Start output recording (system audio)
      console.log('🎙️ Starting output recording...');
      const outputRecorder = await this._startOutputRecording(outputFile, segmentId);

      // Store segment information
      const segment = {
        segmentId: segmentId,
        inputFile: inputFile,
        outputFile: outputFile,
        inputRecorder: inputRecorder,
        outputRecorder: outputRecorder,
        startTime: Date.now(),
        inputSize: 0,
        outputSize: 0,
        duration: 0,
        hasOutputAudio: !!outputRecorder
      };

      this.segments.push(segment);
      this.inputRecorder = inputRecorder;
      this.outputRecorder = outputRecorder;

      // Set timer for next segment
      this.recordingTimer = setTimeout(() => {
        if (this.isRecording) {
          this._startNextSegment();
        }
      }, this.segmentDuration * 1000);

      console.log(`✅ Windows segment ${this.segmentIndex + 1} started successfully`);
      this.segmentIndex++;

    } catch (error) {
      console.error(`❌ Failed to start Windows segment ${this.segmentIndex + 1}:`, error);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Start input recording (microphone) using IPC to renderer process
   */
  async _startInputRecording(outputFile, segmentId) {
    console.log(`🎤 Starting Windows input recording to: ${outputFile}`);
    console.log(`🔧 Segment ID: ${segmentId}`);
    console.log(`🔧 Main window available: ${!!this.mainWindow}`);
    
    try {
      if (!this.mainWindow || !this.mainWindow.webContents) {
        throw new Error('Main window or webContents not available');
      }

      // Send IPC message to renderer to start input recording
      console.log('🔧 Executing JavaScript in renderer process...');
      
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            console.log('🎤 Renderer: Starting input recording...');
            
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error('getUserMedia not available');
            }
            
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

            console.log('🎤 Renderer: Microphone access granted');

            // Check if MediaRecorder is available
            if (!window.MediaRecorder) {
              throw new Error('MediaRecorder not available');
            }

            // Create MediaRecorder
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm;codecs=opus'
            });

            console.log('🎤 Renderer: MediaRecorder created');

            const chunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
                console.log('🎤 Renderer: Audio chunk received, size:', event.data.size);
              }
            };

            mediaRecorder.onerror = (event) => {
              console.error('🎤 Renderer: MediaRecorder error:', event.error);
            };

            mediaRecorder.onstop = async () => {
              try {
                console.log('🎤 Renderer: Recording stopped, processing chunks...');
                const blob = new Blob(chunks, { type: 'audio/webm' });
                
                // Convert WebM to WAV in the renderer process
                console.log('🎤 Renderer: Converting WebM to WAV...');
                const { getWaveBlob } = await import('webm-to-wav-converter');
                const wavBlob = await getWaveBlob([blob], false); // 16-bit encoding
                const wavArrayBuffer = await wavBlob.arrayBuffer();
                
                console.log('🎤 Renderer: Sending WAV audio data to main process...');
                // Send WAV audio data back to main process
                await window.electronAPI.saveAudioData('${segmentId}', 'input', Array.from(new Uint8Array(wavArrayBuffer)));
                console.log('🎤 Renderer: WAV audio data sent successfully');
              } catch (error) {
                console.error('🎤 Renderer: Failed to save input recording:', error);
              }
            };

            // Start recording
            mediaRecorder.start();
            console.log('🎤 Renderer: Recording started');
            
            // Store recorder reference
            window.currentInputRecorder = {
              mediaRecorder: mediaRecorder,
              stream: stream,
              segmentId: '${segmentId}'
            };
            
            return { success: true, message: 'Input recording started' };
          } catch (error) {
            console.error('🎤 Renderer: Failed to start input recording:', error);
            return { success: false, error: error.message };
          }
        })()
      `);

      console.log('🔧 JavaScript execution result:', result);

      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to start input recording');
      }

      console.log('✅ Windows input recording started via IPC');

      return {
        stop: async () => {
          console.log('🛑 Stopping Windows input recording...');
          try {
            await this.mainWindow.webContents.executeJavaScript(`
              if (window.currentInputRecorder && window.currentInputRecorder.segmentId === '${segmentId}') {
                console.log('🛑 Renderer: Stopping input recording...');
                window.currentInputRecorder.mediaRecorder.stop();
                window.currentInputRecorder.stream.getTracks().forEach(track => track.stop());
                window.currentInputRecorder = null;
                console.log('🛑 Renderer: Input recording stopped');
              }
            `);
          } catch (error) {
            console.error('❌ Error stopping input recording:', error);
          }
        },
        segmentId: segmentId
      };

    } catch (error) {
      console.error('❌ Windows input recording failed:', error);
      console.error('❌ Error stack:', error.stack);
      
      // Create a minimal audio file as fallback
      try {
        const minimalWavHeader = this._createMinimalWavHeader();
        await fs.writeFile(outputFile, minimalWavHeader);
        console.log('✅ Created fallback audio file');
      } catch (fileError) {
        console.error('❌ Failed to create fallback audio file:', fileError);
      }
      
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
      // Get desktop capture sources in the main process first
      const { desktopCapturer } = require('electron');
      console.log('🔧 Getting desktop capture sources...');
      
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 }
      });

      console.log('🔧 Desktop capture sources found:', sources.length);
      sources.forEach((source, index) => {
        console.log(`  ${index}: ${source.name} (${source.id})`);
      });

      if (sources.length === 0) {
        console.warn('⚠️ No screen capture sources available, creating fallback output file');
        // Create a minimal WAV file as fallback
        const minimalWavHeader = this._createMinimalWavHeader();
        await fs.writeFile(outputFile, minimalWavHeader);
        
        return {
          stop: () => console.log('🛑 Windows output mock recorder stopped'),
          segmentId: segmentId
        };
      }

      // Use the first available source
      const source = sources[0];
      console.log('📺 Main: Using screen capture source:', source.name);

      // Send IPC message to renderer to start output recording with the source ID
      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          try {
            console.log('🎙️ Renderer: Starting output recording...');
            
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error('getUserMedia not available');
            }

            console.log('🎙️ Renderer: Attempting to get system audio stream...');
            
            // Get system audio stream using the provided source ID
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                sampleRate: ${this.config.sampleRate},
                channelCount: ${this.config.channels},
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: '${source.id}'
                }
              },
              video: false
            });

            console.log('🎙️ Renderer: System audio stream obtained');

            // Create MediaRecorder for system audio
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'audio/webm;codecs=opus'
            });

            const chunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
                console.log('🎙️ Renderer: System audio chunk received, size:', event.data.size);
              }
            };

            mediaRecorder.onerror = (event) => {
              console.error('🎙️ Renderer: MediaRecorder error:', event.error);
            };

            mediaRecorder.onstop = async () => {
              try {
                console.log('🎙️ Renderer: System audio recording stopped, processing chunks...');
                const blob = new Blob(chunks, { type: 'audio/webm' });
                
                // Convert WebM to WAV in the renderer process
                console.log('🎙️ Renderer: Converting WebM to WAV...');
                const { getWaveBlob } = await import('webm-to-wav-converter');
                const wavBlob = await getWaveBlob([blob], false); // 16-bit encoding
                const wavArrayBuffer = await wavBlob.arrayBuffer();
                
                console.log('🎙️ Renderer: Sending WAV system audio data to main process...');
                // Send WAV audio data back to main process
                await window.electronAPI.saveAudioData('${segmentId}', 'output', Array.from(new Uint8Array(wavArrayBuffer)));
                console.log('🎙️ Renderer: WAV system audio data sent successfully');
              } catch (error) {
                console.error('🎙️ Renderer: Failed to save output recording:', error);
              }
            };

            // Start recording
            mediaRecorder.start();
            console.log('🎙️ Renderer: System audio recording started');
            
            // Store recorder reference
            window.currentOutputRecorder = {
              mediaRecorder: mediaRecorder,
              stream: stream,
              segmentId: '${segmentId}'
            };
            
            return { success: true, message: 'Output recording started' };
          } catch (error) {
            console.error('🎙️ Renderer: Failed to start output recording:', error);
            console.error('🎙️ Renderer: Error details:', {
              name: error.name,
              message: error.message,
              stack: error.stack
            });
            return { success: false, error: error.message };
          }
        })()
      `);

      console.log('🔧 Output recording result:', result);
      
      if (!result || !result.success) {
        console.warn('⚠️ Output recording failed, creating fallback file');
        // Create a minimal WAV file as fallback
        const minimalWavHeader = this._createMinimalWavHeader();
        await fs.writeFile(outputFile, minimalWavHeader);
        
        return {
          stop: () => console.log('🛑 Windows output mock recorder stopped'),
          segmentId: segmentId
        };
      }

      console.log('✅ Windows output recording started successfully');
      
      return {
        stop: async () => {
          console.log('🛑 Stopping Windows output recording...');
          try {
            await this.mainWindow.webContents.executeJavaScript(`
              if (window.currentOutputRecorder && window.currentOutputRecorder.segmentId === '${segmentId}') {
                console.log('🛑 Renderer: Stopping output recording...');
                window.currentOutputRecorder.mediaRecorder.stop();
                window.currentOutputRecorder.stream.getTracks().forEach(track => track.stop());
                window.currentOutputRecorder = null;
                console.log('🛑 Renderer: Output recording stopped');
              }
            `);
          } catch (error) {
            console.error('❌ Error stopping output recording:', error);
          }
        },
        segmentId: segmentId
      };

    } catch (error) {
      console.error('❌ Windows output recording failed:', error);
      console.error('❌ Error stack:', error.stack);
      
      // Create a minimal audio file as fallback
      try {
        const minimalWavHeader = this._createMinimalWavHeader();
        await fs.writeFile(outputFile, minimalWavHeader);
        console.log('✅ Created fallback output audio file');
      } catch (fileError) {
        console.error('❌ Failed to create fallback output file:', fileError);
      }
      
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
      
      console.log(`✅ Windows segment ${this.segmentIndex} completed: ${currentSegment.duration}s, input: ${currentSegment.inputSize} bytes, output: ${currentSegment.outputSize} bytes`);
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
          endTime: segment.endTime,
          hasOutputAudio: segment.hasOutputAudio || false
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