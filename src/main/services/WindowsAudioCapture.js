const { ipcMain } = require('electron');
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

    // Audio recording properties for the new approach
    this.inputRecorder = null;
    this.outputRecorder = null;
    this.inputStream = null;
    this.outputStream = null;
    this.inputChunks = [];
    this.outputChunks = [];
    this.currentSegment = null;

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
        console.warn('⚠️ Recording already in progress, current state:', {
          sessionId: this.sessionId,
          segmentIndex: this.segmentIndex,
          segmentsCount: this.segments.length,
          hasInputRecorder: !!this.inputRecorder,
          hasOutputRecorder: !!this.outputRecorder,
          hasTimer: !!this.recordingTimer
        });
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

      // Create a serializable version of segments (without recorder objects)
      const serializableSegments = this.segments.map(segment => ({
        segmentId: segment.segmentId,
        inputFile: segment.inputFile,
        outputFile: segment.outputFile,
        startTime: segment.startTime,
        inputSize: segment.inputSize,
        outputSize: segment.outputSize,
        duration: segment.duration,
        hasOutputAudio: segment.hasOutputAudio
        // Note: We don't include inputRecorder or outputRecorder as they contain functions
      }));

      // DEBUG: Log the return object structure
      const returnObject = {
        success: true,
        sessionId: this.sessionId,
        segments: serializableSegments
      };

      console.log('🔍 DEBUG_STEP_003 - Return object type:', typeof returnObject);
      console.log('🔍 DEBUG_STEP_003 - Return object keys:', Object.keys(returnObject));
      console.log('🔍 DEBUG_STEP_003 - Segments type:', typeof returnObject.segments);
      console.log('🔍 DEBUG_STEP_003 - Segments length:', returnObject.segments?.length);

      // Test serialization before returning
      try {
        const testSerialization = JSON.stringify(returnObject);
        console.log('✅ DEBUG_STEP_003 - Return object serialization test passed, length:', testSerialization.length);
      } catch (serializeError) {
        console.error('❌ DEBUG_STEP_003 - Return object serialization failed:', serializeError);
        console.error('❌ DEBUG_STEP_003 - Problem object:', returnObject);
        throw new Error(`Return object not serializable: ${serializeError.message}`);
      }

      return returnObject;

    } catch (error) {
      console.error('❌ Failed to start Windows native recording:', error);
      console.error('❌ Error stack:', error.stack);

      // Safety: Stop any existing recording before resetting state
      console.log('🛡️ Safety: Stopping any existing recording due to error...');
      try {
        if (this.isRecording) {
          await this.stopDualRecording();
        }
      } catch (stopError) {
        console.warn('⚠️ Could not stop existing recording during error recovery:', stopError.message);
      }

      // Reset recording state on failure
      await this._resetRecordingState();

      // Ensure error is serializable for IPC
      const serializableError = {
        name: error.name || 'Error',
        message: error.message || 'Unknown error occurred',
        stack: error.stack || ''
      };

      throw new Error(`Windows recording failed: ${serializableError.message}`);
    }
  }

  /**
   * Start a new 1-minute recording segment
   */
  async _startNewSegment() {
    const segmentId = `${this.sessionId}_segment_${this.segmentIndex.toString().padStart(3, '0')}`;
    // Use correct extensions based on actual saved format
    const inputFile = path.join(this.tempDir, `input_${segmentId}.webm`);  // Input is usually WebM
    const outputFile = path.join(this.tempDir, `output_${segmentId}.wav`); // Output is always WAV

    console.log(`🎙️ Starting Windows segment ${this.segmentIndex + 1}: ${segmentId}`);
    console.log(`🔧 Input file: ${inputFile}`);
    console.log(`🔧 Output file: ${outputFile}`);
    console.log(`🔧 Temp directory: ${this.tempDir}`);
    console.log(`🔧 Session ID: ${this.sessionId}`);
    console.log(`🔧 Segment index: ${this.segmentIndex}`);

    try {
      // Ensure output directory exists
      fs.ensureDirSync(this.tempDir);

      // Start input recording (microphone)
      console.log('🎤 Starting input recording...');
      const inputRecorder = await this._startInputRecording(inputFile);

      // Start output recording (system audio) - handle failures gracefully
      console.log('🎙️ Starting output recording...');
      let hasOutputAudio = false;

      try {
        const outputSuccess = await this._startOutputRecording(outputFile);
        hasOutputAudio = outputSuccess;
        console.log('✅ Output recording started successfully');
      } catch (outputError) {
        console.warn('⚠️ Output recording failed, continuing with input only:', outputError.message);
        console.log('ℹ️ This is normal - system audio capture may not be available or permitted');
        // Continue without output recording - this is not a fatal error
        hasOutputAudio = false;

        // Create a minimal output file to maintain consistency
        try {
          const minimalWavHeader = this._createMinimalWavHeader();
          await fs.writeFile(outputFile, minimalWavHeader);
          console.log('✅ Created minimal output file for consistency');
        } catch (fileError) {
          console.warn('⚠️ Could not create minimal output file:', fileError.message);
        }
      }

      // Store segment information
      // Note: inputRecorder contains functions and cannot be serialized through IPC
      // It is only used internally for stopping recordings, not returned to the renderer
      const segment = {
        segmentId: segmentId,
        inputFile: inputFile,
        outputFile: outputFile,
        inputRecorder: inputRecorder,  // Contains stop() function - not serializable
        startTime: Date.now(),
        inputSize: 0,
        outputSize: 0,
        duration: 0,
        hasOutputAudio: hasOutputAudio,
        // Track actual file formats for proper extension handling
        inputFormat: 'webm',  // Input is saved as WebM
        outputFormat: 'wav'   // Output is saved as WAV
      };

      // Set current segment reference for audio saving
      this.currentSegment = segment;

      // File paths will be updated dynamically by saveAudioData handler
      // based on the actual saved format (WebM vs WAV)

      console.log('🔍 DEBUG_STEP_004 - Segment object created:', {
        segmentId: segment.segmentId,
        inputFile: segment.inputFile,
        outputFile: segment.outputFile,
        hasInputRecorder: !!segment.inputRecorder,
        startTime: segment.startTime,
        hasOutputAudio: segment.hasOutputAudio
      });

      this.segments.push(segment);
      this.inputRecorder = inputRecorder;

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

      // Safety: Stop any existing recording due to segment failure
      console.log('🛡️ Safety: Stopping recording due to segment failure...');
      try {
        if (this.isRecording) {
          this.isRecording = false;
          // Stop current recorders
          if (this.inputRecorder) {
            try {
              await this.inputRecorder.stop();
            } catch (stopError) {
              console.warn('⚠️ Could not stop input recorder:', stopError.message);
            }
            this.inputRecorder = null;
          }
          if (this.outputRecorder) {
            try {
              await this.outputRecorder.stop();
            } catch (stopError) {
              console.warn('⚠️ Could not stop output recorder:', stopError.message);
            }
            this.outputRecorder = null;
          }
          // Clear timer
          if (this.recordingTimer) {
            clearTimeout(this.recordingTimer);
            this.recordingTimer = null;
          }
        }
      } catch (stopError) {
        console.warn('⚠️ Could not stop recording during segment error recovery:', stopError.message);
      }

      // Ensure error is serializable for IPC
      const serializableError = {
        name: error.name || 'Error',
        message: error.message || 'Unknown error occurred',
        stack: error.stack || ''
      };

      throw new Error(`Failed to start segment: ${serializableError.message}`);
    }
  }

  /**
   * Start input recording (microphone) using IPC to renderer process
   */
  async _startInputRecording(inputFile) {
    try {
      console.log('🎤 Starting input recording...');

      // Check if main window is available for IPC
      if (!this.mainWindow || !this.mainWindow.webContents) {
        throw new Error('Main window not available for IPC communication');
      }

      // Use IPC to execute getUserMedia in the renderer process
      console.log('🔧 Executing getUserMedia in renderer process...');

      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          const inputFilePath = '` + inputFile.replace(/\\/g, '\\\\') + `';
          try {
            console.log('🎤 Renderer: Starting input recording...');
            
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error('getUserMedia not available');
            }
            
            // Request microphone access using the same approach as test-browser-audio.html
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });

            console.log('✅ Microphone access granted');
            console.log(\`📊 Stream tracks: \${stream.getTracks().map(t => t.kind).join(", ")}\`);
            
            // Check if we have audio tracks
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
              throw new Error('No audio tracks found in the stream');
            }

            // Create MediaRecorder with simple approach (same as test-browser-audio.html)
            const mediaRecorder = new MediaRecorder(stream);
            console.log(\`✅ MediaRecorder created with MIME type: \${mediaRecorder.mimeType}\`);
            console.log(\`✅ MediaRecorder state: \${mediaRecorder.state}\`);

            const chunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
                console.log(\`📦 Input audio chunk received: \${event.data.size} bytes\`);
              }
            };

            mediaRecorder.onstop = async () => {
              console.log('🛑 Input recording stopped');
              console.log(\`📊 Total input chunks: \${chunks.length}\`);
              
              if (chunks.length > 0) {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                console.log(\`✅ Created input audio blob: \${audioBlob.size} bytes\`);
                
                // Convert to array buffer for saving
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioData = new Uint8Array(arrayBuffer);
                
                // Save the audio data
                try {
                  if (window.electronAPI && window.electronAPI.saveAudioData) {
                    await window.electronAPI.saveAudioData(
                      inputFilePath,
                      Array.from(audioData),
                      'input'
                    );
                    console.log('✅ Input audio data saved successfully');
                  } else {
                    console.warn('⚠️ saveAudioData API not available');
                  }
                } catch (saveError) {
                  console.error('❌ Failed to save input audio data:', saveError);
                }
              }
              
              // Stop all tracks
              stream.getTracks().forEach(track => {
                track.stop();
                console.log(\`🛑 Stopped input track: \${track.kind}\`);
              });
            };

            mediaRecorder.onerror = (event) => {
              console.error('❌ Input MediaRecorder error:', event.error);
            };

            // Start recording with 1-second timeslice (same as test-browser-audio.html)
            mediaRecorder.start(1000);
            console.log('🎤 Input recording started with 1-second timeslice');
            
            // Store recorder reference for stopping
            window.currentInputRecorder = {
              mediaRecorder: mediaRecorder,
              stream: stream
            };
            
            return { success: true, message: 'Input recording started' };
            
          } catch (error) {
            console.error('❌ Failed to start input recording:', error);
            return { success: false, error: error.message };
          }
        })()
      `, inputFile);

      console.log('🔧 Input recording result:', result);

      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to start input recording');
      }

      console.log('✅ Input recording started successfully via IPC');

      return {
        stop: async () => {
          console.log('🛑 Stopping input recording...');
          try {
            await this.mainWindow.webContents.executeJavaScript(`
              if (window.currentInputRecorder) {
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
        }
      };

    } catch (error) {
      console.error('❌ Failed to start input recording:', error);
      throw error;
    }
  }

  /**
   * Start output recording (system audio) using desktop capture via IPC
   */
  async _startOutputRecording(outputFile) {
    try {
      console.log('🎙️ Starting output recording...');

      // Check if main window is available for IPC
      if (!this.mainWindow || !this.mainWindow.webContents) {
        throw new Error('Main window not available for IPC communication');
      }

      // Use IPC to execute getUserMedia in the renderer process
      console.log('🔧 Executing getUserMedia in renderer process for system audio...');

      const result = await this.mainWindow.webContents.executeJavaScript(`
        (async () => {
          const outputFilePath = '` + outputFile.replace(/\\/g, '\\\\') + `';
          
          try {
            console.log('🎙️ Renderer: Starting output recording...');
            
            // Check if getUserMedia is available
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              throw new Error('getUserMedia not available');
            }

            // Use the same simple approach as test-browser-audio.html
            // For system audio on Windows, we'll use getUserMedia as a fallback
            console.log('🎙️ Requesting audio access for system audio...');
            
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
              }
            });

            console.log('✅ Audio access granted for system audio');
            console.log(\`📊 Stream tracks: \${stream.getTracks().map(t => t.kind).join(", ")}\`);
            
            // Check if we have audio tracks
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) {
              throw new Error('No audio tracks found in the stream');
            }

            // Create MediaRecorder with simple approach (same as test-browser-audio.html)
            const mediaRecorder = new MediaRecorder(stream);
            console.log(\`✅ MediaRecorder created with MIME type: \${mediaRecorder.mimeType}\`);
            console.log(\`✅ MediaRecorder state: \${mediaRecorder.state}\`);

            const chunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
                console.log(\`📦 Output audio chunk received: \${event.data.size} bytes\`);
              }
            };

            mediaRecorder.onstop = async () => {
              console.log('🛑 Output recording stopped');
              console.log(\`📊 Total output chunks: \${chunks.length}\`);
              
              if (chunks.length > 0) {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                console.log(\`✅ Created output audio blob: \${audioBlob.size} bytes\`);
                
                // Convert to array buffer for saving
                const arrayBuffer = await audioBlob.arrayBuffer();
                const audioData = new Uint8Array(arrayBuffer);
                
                // Save the audio data
                try {
                  if (window.electronAPI && window.electronAPI.saveAudioData) {
                    await window.electronAPI.saveAudioData(
                      outputFilePath,
                      Array.from(audioData),
                      'output'
                    );
                    console.log('✅ Output audio data saved successfully');
                  } else {
                    console.warn('⚠️ saveAudioData API not available');
                  }
                } catch (saveError) {
                  console.error('❌ Failed to save output audio data:', saveError);
                }
              }
              
              // Stop all tracks
              stream.getTracks().forEach(track => {
                track.stop();
                console.log(\`🛑 Stopped output track: \${track.kind}\`);
              });
            };

            mediaRecorder.onerror = (event) => {
              console.error('❌ Output MediaRecorder error:', event.error);
            };

            // Start recording with 1-second timeslice (same as test-browser-audio.html)
            mediaRecorder.start(1000);
            console.log('🎙️ Output recording started with 1-second timeslice');
            
            // Store recorder reference for stopping
            window.currentOutputRecorder = {
              mediaRecorder: mediaRecorder,
              stream: stream
            };
            
            return { success: true, message: 'Output recording started' };
            
          } catch (error) {
            console.error('❌ Failed to start output recording:', error);
            return { success: false, error: error.message };
          }
        })()
      `);

      console.log('🔧 Output recording result:', result);

      if (!result || !result.success) {
        throw new Error(result?.error || 'Failed to start output recording');
      }

      console.log('✅ Output recording started successfully via IPC');

      return true;

    } catch (error) {
      console.error('❌ Failed to start output recording:', error);
      throw error;
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
    console.log(`🛑 Stopping Windows segment ${this.segmentIndex}`);

    // Stop current recorders via IPC
    if (this.mainWindow && this.mainWindow.webContents) {
      try {
        await this.mainWindow.webContents.executeJavaScript(`
          // Stop input recording
          if (window.currentInputRecorder) {
            console.log('🛑 Renderer: Stopping input recording...');
            window.currentInputRecorder.mediaRecorder.stop();
            window.currentInputRecorder.stream.getTracks().forEach(track => track.stop());
            window.currentInputRecorder = null;
            console.log('🛑 Renderer: Input recording stopped');
          }
          
          // Stop output recording
          if (window.currentOutputRecorder) {
            console.log('🛑 Renderer: Stopping output recording...');
            window.currentOutputRecorder.mediaRecorder.stop();
            window.currentOutputRecorder.stream.getTracks().forEach(track => track.stop());
            window.currentOutputRecorder = null;
            console.log('🛑 Renderer: Output recording stopped');
          }
        `);
      } catch (error) {
        console.warn('⚠️ Could not stop recorders via IPC:', error.message);
      }
    }

    // Clear timer
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }

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
        dualAudioData: {
          success: true,
          sessionId: this.sessionId,
          totalSegments: this.segments.length,
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
          outputFiles: this.segments.map(s => s.outputFile),
          totalDuration: totalDuration,
          totalInputSize: totalInputSize,
          totalOutputSize: totalOutputSize
        },
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
   * Reset recording state (public method for external use)
   */
  async resetRecordingState() {
    console.log('🔄 Resetting Windows recording state...');
    await this._resetRecordingState();
  }

  /**
   * Reset recording state (internal method)
   */
  async _resetRecordingState() {
    console.log('🔄 Resetting Windows recording state...');

    // Stop any active recording
    if (this.isRecording) {
      try {
        await this.stopDualRecording();
      } catch (error) {
        console.warn('⚠️ Error stopping recording during reset:', error.message);
      }
    }

    // Reset all state variables
    this.isRecording = false;
    this.sessionId = null;
    this.segmentIndex = 0;
    this.segments = [];
    this.inputRecorder = null;
    this.outputRecorder = null;
    this.inputStream = null;
    this.outputStream = null;
    this.inputChunks = [];
    this.outputChunks = [];
    this.currentSegment = null;

    // Clear any remaining timers
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }

    // Clean up any remaining recorders in renderer
    if (this.mainWindow) {
      try {
        await this.mainWindow.webContents.executeJavaScript(`
          // Clean up input recorder
          if (window.currentInputRecorder) {
            console.log('🛑 Renderer: Cleaning up input recorder...');
            window.currentInputRecorder.mediaRecorder.stop();
            window.currentInputRecorder.stream.getTracks().forEach(track => track.stop());
            window.currentInputRecorder = null;
          }
          
          // Clean up output recorder
          if (window.currentOutputRecorder) {
            console.log('🛑 Renderer: Cleaning up output recorder...');
            window.currentOutputRecorder.mediaRecorder.stop();
            window.currentOutputRecorder.stream.getTracks().forEach(track => track.stop());
            window.currentOutputRecorder = null;
          }
        `);
      } catch (error) {
        console.warn('⚠️ Could not cleanup renderer recorders during reset:', error.message);
      }
    }

    console.log('✅ Windows recording state reset successfully');
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
          // Clean up input recorder
          if (window.currentInputRecorder) {
            console.log('🛑 Renderer: Cleaning up input recorder...');
            window.currentInputRecorder.mediaRecorder.stop();
            window.currentInputRecorder.stream.getTracks().forEach(track => track.stop());
            window.currentInputRecorder = null;
          }
          
          // Clean up output recorder
          if (window.currentOutputRecorder) {
            console.log('🛑 Renderer: Cleaning up output recorder...');
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