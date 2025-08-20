import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  Typography,
  LinearProgress,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Alert,
  Collapse,
} from '@mui/material';
import {
  Mic,
  MicOff,
  Stop,
  PlayArrow,
  Pause,
  VolumeUp,
  Settings as SettingsIcon,
  AudiotrackOutlined,
  SpeakerOutlined,
  ExpandMore,
  Help,
} from '@mui/icons-material';

function RecordingPanel({ onRecordingComplete, onError, onSuccess }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioDevices, setAudioDevices] = useState({ input: [], output: [] });
  const [processingStatus, setProcessingStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);
  const [selectedInputDevice, setSelectedInputDevice] = useState('default');
  const [selectedOutputDevice, setSelectedOutputDevice] = useState('default');
  const [useDeviceSelection, setUseDeviceSelection] = useState(false);
  const [showSetupHelp, setShowSetupHelp] = useState(false);

  const timerRef = useRef(null);
  const recordingSessionRef = useRef(null);

  useEffect(() => {
    // Load available audio devices
    loadAudioDevices();
  }, []);

  useEffect(() => {
    // Update timer during recording
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  const loadAudioDevices = async () => {
    try {
      const result = await window.electronAPI.audio.getDevices();
      if (result.success) {
        const devices = result.devices;
        setAudioDevices({
          input: devices.filter(d => d.kind === 'audioinput'),
          output: devices.filter(d => d.kind === 'audiooutput')
        });
      }
    } catch (error) {
      console.warn('Failed to load audio devices:', error);
      onError('Failed to access audio devices. Please check permissions.');
    }
  };

  const handleDeviceSettingsOpen = () => {
    setShowDeviceSettings(true);
    loadAudioDevices(); // Refresh devices when opening
  };

  const handleDeviceSettingsClose = () => {
    setShowDeviceSettings(false);
  };

  const handleDeviceSettingsSave = () => {
    setUseDeviceSelection(true);
    setShowDeviceSettings(false);

    const inputDeviceName = audioDevices.input.find(d => d.id === selectedInputDevice)?.name || selectedInputDevice;
    const outputDeviceName = audioDevices.output.find(d => d.id === selectedOutputDevice)?.name || selectedOutputDevice;

    onSuccess(`Device selection enabled:\n• Input: ${inputDeviceName}\n• Output: ${outputDeviceName}`);
  };

  const handleUseAutoDetection = () => {
    setUseDeviceSelection(false);
    setShowDeviceSettings(false);
    onSuccess('Switched to auto device detection mode');
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setRecordingTime(0);

      // TEMP_DEBUG_FRONTEND_001: Log recording start
      console.log('🎙️ TEMP_DEBUG_FRONTEND_001 - Starting recording...');
      console.log('🔧 TEMP_DEBUG_FRONTEND_001 - IPC available:', !!window.electronAPI);
      console.log('🔧 TEMP_DEBUG_FRONTEND_001 - Audio API available:', !!window.electronAPI?.audio);
      console.log('🔧 TEMP_DEBUG_FRONTEND_001 - startDualRecording available:', !!window.electronAPI?.audio?.startDualRecording);

      const result = await window.electronAPI.audio.startDualRecording();

      // TEMP_DEBUG_FRONTEND_002: Log recording result
      console.log('✅ TEMP_DEBUG_FRONTEND_002 - Recording started:', result);
      console.log('🔧 TEMP_DEBUG_FRONTEND_002 - Result type:', typeof result);
      console.log('🔧 TEMP_DEBUG_FRONTEND_002 - Result keys:', Object.keys(result || {}));

      if (result.success) {
        recordingSessionRef.current = result.sessionId;
        onSuccess('✅ Dual recording started: Microphone + System Audio (Native)');
      } else {
        setIsRecording(false);
        onError(result.error || 'Failed to start recording');
      }

    } catch (error) {
      setIsRecording(false);
      console.error('❌ TEMP_DEBUG_FRONTEND_001 - Failed to start recording:', error);
      onError(`Failed to start recording: ${error.message}`);
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      setIsProcessing(true);
      setProcessingStatus('Stopping recording...');


      const result = await window.electronAPI.audio.stopDualRecording();


      if (result.success) {
        // Check if dualAudioData exists
        if (!result.dualAudioData) {
          console.error('❌ Recording stopped but no dualAudioData returned');
          onError('Recording completed but no audio data was generated. Please check your audio devices and try again.');
          return;
        }

        setProcessingStatus(`Processing ${result.dualAudioData?.totalSegments || 0} audio segments...`);

        // TEMP_DEBUG_FRONTEND_003: Log recording results
        console.log('✅ TEMP_DEBUG_FRONTEND_003 - Segmented recording stopped:', {
          segments: result.dualAudioData?.totalSegments,
          totalInputSize: result.dualAudioData?.totalInputSize,
          totalOutputSize: result.dualAudioData?.totalOutputSize,
          inputSizeMB: result.dualAudioData?.totalInputSize ? (result.dualAudioData.totalInputSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A',
          outputSizeMB: result.dualAudioData?.totalOutputSize ? (result.dualAudioData.totalOutputSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'
        });

        // Convert all segment file paths to File objects for backend upload
        const inputFiles = [];
        const outputFiles = [];

        const segments = result.dualAudioData?.segments || [];
        const inputFilePaths = result.dualAudioData?.inputFiles || [];
        const outputFilePaths = result.dualAudioData?.outputFiles || [];


        // Use segments array if available, otherwise fall back to file paths
        if (segments.length > 0) {
          for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];

            const inputFile = await createFileFromPath(segment.inputFile, `microphone-segment-${i + 1}`);

            // Only try to create output file if it exists and has output audio
            let outputFile = null;
            if (segment.hasOutputAudio && segment.outputFile) {
              outputFile = await createFileFromPath(segment.outputFile, `system-segment-${i + 1}`);
            }

            if (inputFile) inputFiles.push(inputFile);
            if (outputFile) outputFiles.push(outputFile);
          }
        } else if (inputFilePaths.length > 0) {
          // Fallback: use file paths directly
          for (let i = 0; i < inputFilePaths.length; i++) {
            const inputFile = await createFileFromPath(inputFilePaths[i], `microphone-segment-${i + 1}`);

            // Only try to create output file if it exists
            let outputFile = null;
            if (outputFilePaths[i]) {
              outputFile = await createFileFromPath(outputFilePaths[i], `system-segment-${i + 1}`);
            }

            if (inputFile) inputFiles.push(inputFile);
            if (outputFile) outputFiles.push(outputFile);
          }
        } else {
          console.warn('⚠️ No segments or file paths found in result');
        }

        setProcessingStatus('Uploading segments to backend...');

        // Create segmented dual audio object for backend
        const dualAudioData = {
          inputFiles: inputFiles,  // Array of File objects
          outputFiles: outputFiles, // Array of File objects
          hasDualAudio: inputFiles.length > 0 && outputFiles.length > 0,
          isSegmented: true,
          totalSegments: result.dualAudioData?.totalSegments || inputFiles.length,
          totalDuration: result.dualAudioData?.totalDuration || 0,
          segments: result.dualAudioData?.segments || [] // Add segments data for accurate timestamps
        };

        // COMPREHENSIVE DEBUG: Log the complete data flow
        console.log('🔍 COMPREHENSIVE_DEBUG - Complete data flow analysis:');
        console.log('='.repeat(80));
        
        // 1. Original result from Windows audio capture
        console.log('1️⃣ ORIGINAL RESULT FROM WINDOWS AUDIO CAPTURE:');
        console.log('   Success:', result.success);
        console.log('   Session ID:', result.sessionId);
        console.log('   Total Segments:', result.totalSegments);
        console.log('   Dual Audio Data exists:', !!result.dualAudioData);
        
        if (result.dualAudioData) {
          console.log('   Dual Audio Data details:');
          console.log('     - Total Segments:', result.dualAudioData.totalSegments);
          console.log('     - Total Duration:', result.dualAudioData.totalDuration);
          console.log('     - Total Input Size:', result.dualAudioData.totalInputSize);
          console.log('     - Total Output Size:', result.dualAudioData.totalOutputSize);
          console.log('     - Segments array length:', result.dualAudioData.segments?.length);
          console.log('     - Input files array length:', result.dualAudioData.inputFiles?.length);
          console.log('     - Output files array length:', result.dualAudioData.outputFiles?.length);
          
          // Log segment details
          if (result.dualAudioData.segments && result.dualAudioData.segments.length > 0) {
            console.log('     - Segment details:');
            result.dualAudioData.segments.forEach((segment, index) => {
              console.log(`       Segment ${index + 1}:`, {
                segmentId: segment.segmentId,
                startTime: segment.startTime,
                startTimeISO: segment.startTimeISO,
                endTime: segment.endTime,
                endTimeISO: segment.endTimeISO,
                duration: segment.duration,
                inputFile: segment.inputFile,
                outputFile: segment.outputFile,
                inputSize: segment.inputSize,
                outputSize: segment.outputSize,
                hasOutputAudio: segment.hasOutputAudio,
                segmentIndex: segment.segmentIndex
              });
            });
          }
        }
        
        // 2. Processed file objects
        console.log('2️⃣ PROCESSED FILE OBJECTS:');
        console.log('   Input Files Count:', inputFiles.length);
        console.log('   Output Files Count:', outputFiles.length);
        
        inputFiles.forEach((file, index) => {
          console.log(`     Input File ${index + 1}:`, {
            name: file.name,
            size: file.size,
            sizeMB: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.type,
            lastModified: new Date(file.lastModified).toISOString()
          });
        });
        
        outputFiles.forEach((file, index) => {
          console.log(`     Output File ${index + 1}:`, {
            name: file.name,
            size: file.size,
            sizeMB: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.type,
            lastModified: new Date(file.lastModified).toISOString()
          });
        });
        
        // 3. Final dual audio data being sent to next component
        console.log('3️⃣ FINAL DUAL AUDIO DATA (being sent to next component):');
        console.log('   Input Files Count:', dualAudioData.inputFiles.length);
        console.log('   Output Files Count:', dualAudioData.outputFiles.length);
        console.log('   Has Dual Audio:', dualAudioData.hasDualAudio);
        console.log('   Is Segmented:', dualAudioData.isSegmented);
        console.log('   Total Segments:', dualAudioData.totalSegments);
        console.log('   Total Duration:', dualAudioData.totalDuration);
        console.log('   Segments Data Length:', dualAudioData.segments.length);
        
        // 4. Data integrity check
        console.log('4️⃣ DATA INTEGRITY CHECK:');
        const inputFilesValid = inputFiles.every(file => file instanceof File && file.size > 0);
        const outputFilesValid = outputFiles.every(file => file instanceof File && file.size > 0);
        const segmentsValid = dualAudioData.segments.every(segment => 
          segment.segmentId && segment.inputFile && segment.duration > 0
        );
        
        console.log('   Input Files Valid:', inputFilesValid);
        console.log('   Output Files Valid:', outputFilesValid);
        console.log('   Segments Valid:', segmentsValid);
        console.log('   Overall Data Valid:', inputFilesValid && outputFilesValid && segmentsValid);
        
        console.log('='.repeat(80));

        console.log('📤 Final dual audio data:', {
          inputFilesCount: inputFiles.length,
          outputFilesCount: outputFiles.length,
          hasDualAudio: dualAudioData.hasDualAudio,
          isSegmented: dualAudioData.isSegmented,
          totalSegments: dualAudioData.totalSegments
        });

        // TEMP_DEBUG_FRONTEND_004: Show file details
        console.log('📁 TEMP_DEBUG_FRONTEND_004 - Input files details:');
        inputFiles.forEach((file, index) => {
          console.log(`  Input ${index}:`, {
            name: file.name,
            size: file.size,
            sizeMB: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.type
          });
        });

        console.log('📁 TEMP_DEBUG_FRONTEND_004 - Output files details:');
        outputFiles.forEach((file, index) => {
          console.log(`  Output ${index}:`, {
            name: file.name,
            size: file.size,
            sizeMB: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.type
          });
        });

        // Check if we have any audio files to upload
        if (inputFiles.length === 0 && outputFiles.length === 0) {
          onError('No audio files were generated during recording. Please check your audio devices and try again.');
          return;
        }

        // Pass to parent for backend processing
        await onRecordingComplete(dualAudioData);

        // Reset state
        setRecordingTime(0);
        recordingSessionRef.current = null;
        setProcessingStatus('');

      } else {
        onError(result.error || 'Failed to stop recording');
      }
    } catch (error) {
      console.error('Failed to stop recording:', error);
      onError(`Failed to process recording: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Helper function to create File objects from file paths
  const createFileFromPath = async (filePath, prefix) => {
    try {
      if (!filePath) {
        console.log('⚠️ No file path provided, skipping file creation');
        return null;
      }

      console.log(`🔍 Attempting to read file: ${filePath}`);
      console.log(`🔍 File prefix: ${prefix}`);

      // Read the file through Electron IPC
      const result = await window.electronAPI.file.readAudioFile(filePath);
      console.log(`📁 IPC result for ${filePath}:`, result);

      if (result.success) {
        const filename = `${prefix}-${Date.now()}.wav`;
        console.log(`✅ Successfully read file, creating File object: ${filename}`);

        // Create a File object from the buffer
        const blob = new Blob([new Uint8Array(result.buffer)], { type: 'audio/wav' });
        const file = new File([blob], filename, { type: 'audio/wav' });
        console.log(`✅ File object created:`, {
          name: file.name,
          size: file.size,
          type: file.type
        });
        return file;
      } else {
        console.warn(`⚠️ Failed to read audio file ${filePath}:`, result.error);
        return null;
      }
    } catch (error) {
      console.warn(`⚠️ Error creating file from path ${filePath}:`, error.message);
      return null;
    }
  };

  const toggleMicMute = async () => {
    if (!isRecording) return;

    try {
      // For now, just toggle the state locally
      // In the original implementation, this would control the recording device
      const newMuteState = !isMicMuted;
      setIsMicMuted(newMuteState);
      onSuccess(newMuteState ? 'Microphone muted' : 'Microphone unmuted');
    } catch (error) {
      onError('Failed to toggle microphone mute: ' + error.message);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getRecordingStatusColor = () => {
    if (isProcessing) return 'warning';
    if (isRecording) return 'error';
    return 'default';
  };

  const getRecordingStatusText = () => {
    if (isProcessing) return 'Processing...';
    if (isRecording && isMicMuted) return 'Recording (Mic Muted)';
    if (isRecording) return 'Recording';
    return 'Ready';
  };

  const getRecordingStatusIcon = () => {
    if (isRecording && isMicMuted) return <MicOff />;
    if (isRecording) return <Mic />;
    return <MicOff />;
  };

  return (
    <>
      <Card sx={{
        background: 'linear-gradient(145deg, #1e1e1e 0%, #2a2a2a 100%)',
        border: '1px solid #333',
      }}>
        <CardContent>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Audio Recording
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                label={getRecordingStatusText()}
                color={getRecordingStatusColor()}
                size="small"
                icon={getRecordingStatusIcon()}
              />

              <Tooltip title="Audio Device Settings">
                <IconButton
                  size="small"
                  onClick={handleDeviceSettingsOpen}
                  color={useDeviceSelection ? 'primary' : 'default'}
                >
                  <SettingsIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {/* Recording Timer and Progress */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 600,
                fontFamily: 'monospace',
                color: isRecording ? 'error.main' : 'text.primary',
                mb: 1,
              }}
            >
              {formatTime(recordingTime)}
            </Typography>

            {isRecording && (
              <LinearProgress
                sx={{
                  mb: 2,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  '& .MuiLinearProgress-bar': {
                    backgroundColor: 'error.main',
                  },
                }}
              />
            )}
          </Box>

          {/* Recording Controls */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            {!isRecording ? (
              <Button
                variant="contained"
                color="primary"
                size="large"
                onClick={startRecording}
                disabled={isProcessing}
                startIcon={<Mic />}
                sx={{
                  px: 4,
                  py: 1.5,
                  borderRadius: 2,
                  fontWeight: 600,
                  background: 'linear-gradient(45deg, #00bcd4 30%, #4dd0e1 90%)',
                  '&:hover': {
                    background: 'linear-gradient(45deg, #00838f 30%, #00bcd4 90%)',
                  },
                }}
              >
                Start Recording
              </Button>
            ) : (
              <>
                <Button
                  variant="contained"
                  color="error"
                  size="large"
                  onClick={stopRecording}
                  disabled={isProcessing}
                  startIcon={<Stop />}
                  sx={{
                    px: 4,
                    py: 1.5,
                    borderRadius: 2,
                    fontWeight: 600,
                  }}
                >
                  Stop Recording
                </Button>

                <Button
                  variant={isMicMuted ? "contained" : "outlined"}
                  color={isMicMuted ? "warning" : "primary"}
                  size="large"
                  onClick={toggleMicMute}
                  disabled={isProcessing}
                  startIcon={isMicMuted ? <MicOff /> : <Mic />}
                  sx={{
                    px: 3,
                    py: 1.5,
                    borderRadius: 2,
                    fontWeight: 600,
                    backgroundColor: isMicMuted ? 'warning.main' : 'transparent',
                    '&:hover': {
                      backgroundColor: isMicMuted ? 'warning.dark' : 'primary.main',
                      color: 'white',
                    },
                  }}
                >
                  {isMicMuted ? 'Unmute' : 'Mute'}
                </Button>
              </>
            )}
          </Box>

          {/* Processing Status */}
          {(isProcessing || processingStatus) && (
            <Box sx={{
              p: 2,
              backgroundColor: 'rgba(255, 152, 0, 0.1)',
              borderRadius: 1,
              border: '1px solid rgba(255, 152, 0, 0.3)',
              mb: 2,
            }}>
              <Typography variant="body2" sx={{ textAlign: 'center', color: 'warning.main' }}>
                {processingStatus || 'Processing...'}
              </Typography>
              {isProcessing && (
                <LinearProgress
                  sx={{
                    mt: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: 'rgba(255, 152, 0, 0.2)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'warning.main',
                    },
                  }}
                />
              )}
            </Box>
          )}

          {/* Audio Device Info with Collapsible Setup Help */}
          <Box sx={{
            p: 1.5,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 1,
            mb: 2,
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <VolumeUp sx={{ fontSize: 16, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  {audioDevices.input.length + audioDevices.output.length} devices detected
                </Typography>
              </Box>

              <Tooltip title="Setup Help">
                <IconButton
                  size="small"
                  onClick={() => setShowSetupHelp(!showSetupHelp)}
                  sx={{
                    color: 'text.secondary',
                    transform: showSetupHelp ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.3s ease',
                  }}
                >
                  <ExpandMore />
                </IconButton>
              </Tooltip>
            </Box>

            <Collapse in={showSetupHelp}>
              <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <Typography variant="caption" color="primary.light" sx={{ display: 'block', mb: 1 }}>
                  💡 Native Dual Audio Recording
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', mb: 2 }}>
                  • <strong>Microphone:</strong> Your voice and ambient audio (native capture)
                  <br />
                  • <strong>System Audio:</strong> Captured via BlackHole virtual audio device
                  <br />
                  • <strong>Transcription:</strong> Both sources are identified as MIC/SYS in transcript
                </Typography>

                <Typography variant="caption" color="warning.light" sx={{ display: 'block', mb: 1 }}>
                  ⚙️ BlackHole Setup Required
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                  For system audio capture to work:
                  <br />
                  1. Install BlackHole: <code style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '2px' }}>brew install blackhole-2ch</code>
                  <br />
                  2. Reboot your Mac after installation
                  <br />
                  3. Set up Multi-Output Device in Audio MIDI Setup
                  <br />
                  4. Route system audio through BlackHole
                  <br />
                  <br />
                  <strong>Status:</strong> Native recording with WAV files - much more reliable than web-based capture!
                  <br />
                  📖 See BLACKHOLE_SETUP.md for detailed instructions
                </Typography>
              </Box>
            </Collapse>
          </Box>
        </CardContent>
      </Card>

      {/* Device Settings Dialog */}
      <Dialog
        open={showDeviceSettings}
        onClose={handleDeviceSettingsClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            backgroundColor: '#1e1e1e',
            border: '1px solid #333',
          },
        }}
      >
        <DialogTitle sx={{
          backgroundColor: '#1a1a1a',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          <SettingsIcon />
          Audio Device Configuration
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            Configure your audio devices: select your preferred microphone for input and speaker for output reference.
            System audio is captured via screen sharing during recording.
          </Alert>

          {/* Current Mode Display */}
          <Box sx={{ mb: 3, p: 2, backgroundColor: 'rgba(0, 188, 212, 0.1)', borderRadius: 1 }}>
            <Typography variant="subtitle2" sx={{ color: 'primary.main', mb: 1 }}>
              Current Mode: {useDeviceSelection ? 'Device Selection' : 'Auto Detection'}
            </Typography>
            {useDeviceSelection && (
              <Typography variant="body2" color="text.secondary">
                • Input: {audioDevices.input.find(d => d.id === selectedInputDevice)?.name || selectedInputDevice}
                <br />
                • Output: {audioDevices.output.find(d => d.id === selectedOutputDevice)?.name || selectedOutputDevice}
              </Typography>
            )}
          </Box>

          {/* Input Device Selection */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <AudiotrackOutlined color="primary" />
              <Typography variant="h6">Microphone (Input) Device</Typography>
            </Box>

            <FormControl fullWidth variant="outlined">
              <InputLabel>Select Input Device</InputLabel>
              <Select
                value={selectedInputDevice}
                onChange={(e) => setSelectedInputDevice(e.target.value)}
                label="Select Input Device"
                sx={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
              >
                <MenuItem value="default">
                  <Typography variant="body1">Default Microphone</Typography>
                </MenuItem>
                {audioDevices.input.map((device) => (
                  <MenuItem key={device.id} value={device.id}>
                    <Typography variant="body1">{device.name}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Output Device Selection */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <SpeakerOutlined color="secondary" />
              <Typography variant="h6">Speaker (Output) Device</Typography>
            </Box>

            <FormControl fullWidth variant="outlined">
              <InputLabel>Select Output Device</InputLabel>
              <Select
                value={selectedOutputDevice}
                onChange={(e) => setSelectedOutputDevice(e.target.value)}
                label="Select Output Device"
                sx={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
              >
                <MenuItem value="default">
                  <Typography variant="body1">Default Speaker</Typography>
                </MenuItem>
                {audioDevices.output.map((device) => (
                  <MenuItem key={device.id} value={device.id}>
                    <Typography variant="body1">{device.name}</Typography>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>Note:</strong> Output device selection is for reference only.
                System audio is captured via screen sharing, not directly from the output device.
                Make sure to enable "Share Audio" when prompted during recording.
              </Typography>
            </Alert>
          </Box>

          {/* Device Counts */}
          <Box sx={{
            mt: 3,
            p: 2,
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: 1
          }}>
            <Typography variant="body2" color="text.secondary">
              Detected Devices: {audioDevices.input.length} input, {audioDevices.output.length} output
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions sx={{
          backgroundColor: '#1a1a1a',
          borderTop: '1px solid #333',
          gap: 1,
          p: 2
        }}>
          <Button
            onClick={handleUseAutoDetection}
            color="warning"
            variant="outlined"
          >
            Use Auto Detection
          </Button>

          <Button onClick={handleDeviceSettingsClose}>
            Cancel
          </Button>

          <Button
            onClick={handleDeviceSettingsSave}
            variant="contained"
            color="primary"
          >
            Use Selected Devices
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default RecordingPanel; 