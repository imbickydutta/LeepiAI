import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Tooltip,
  Collapse,
  Button,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Logout,
  Settings,
  AccountCircle,
  ExpandLess,
  ExpandMore,
  DragHandle,
  AdminPanelSettings,
  AudioFile,
  Description,
  Storage,
} from '@mui/icons-material';
import RecordingPanel from './RecordingPanel';
import TranscriptList from './TranscriptList';
import TranscriptViewer from './TranscriptViewer';
import AIChat from './AIChat';
import RecordingsManager from './RecordingsManager';
import OfflineRecordingsManager from './OfflineRecordingsManager';
import apiService from '../services/ApiService';
import AdminPanel from './AdminPanel';
import OfflineStorageService from '../services/OfflineStorageService';


function MainInterface({ user, onLogout, onError, onSuccess }) {
  const [transcripts, setTranscripts] = useState([]);
  const [selectedTranscript, setSelectedTranscript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);
  const [aiChatHeight, setAiChatHeight] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isAIChatExpanded, setIsAIChatExpanded] = useState(true);
  const minChatHeight = 100;
  const maxChatHeight = window.innerHeight * 0.8; // 80% of window height
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // New state for better error handling and recordings management
  const [activeTab, setActiveTab] = useState(0); // 0: Transcripts, 1: Recordings, 2: Offline Storage
  const [uploadHistory, setUploadHistory] = useState([]);
  const [failedUploads, setFailedUploads] = useState([]);

  // Load user's transcripts on component mount
  useEffect(() => {
    loadTranscripts();
  }, []);

  const loadTranscripts = async () => {
    try {
      setLoading(true);
      const result = await apiService.getTranscripts();

      if (result.success) {
        setTranscripts(result.transcripts);
      } else {
        onError('Failed to load transcripts');
      }
    } catch (error) {
      onError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  const handleRecordingComplete = async (dualAudioData) => {
    try {
      // TEMP_DEBUG_FRONTEND_005: Log recording completion
      console.log('📤 TEMP_DEBUG_FRONTEND_005 - handleRecordingComplete received:', {
        success: dualAudioData.success,
        sessionId: dualAudioData.sessionId,
        totalSegments: dualAudioData.totalSegments,
        inputFiles: dualAudioData.inputFiles,
        outputFiles: dualAudioData.outputFiles,
        hasOutputAudio: dualAudioData.outputFiles && dualAudioData.outputFiles.length > 0
      });

      // Generate session ID if not provided
      const sessionId = dualAudioData.sessionId || `session_${Date.now()}_${user.id}`;

      // Add to upload history
      const uploadId = Date.now().toString();
      const uploadRecord = {
        id: uploadId,
        status: 'uploading',
        startTime: new Date(),
        dualAudioData: { ...dualAudioData, sessionId },
        progress: 0
      };

      setUploadHistory(prev => [...prev, uploadRecord]);
      onSuccess('Uploading and processing recording...');

      // Check if we have dual audio or single audio
      if (dualAudioData.outputFiles && dualAudioData.outputFiles.length > 0 &&
        dualAudioData.inputFiles && dualAudioData.inputFiles.length > 0) {
        onSuccess('Processing dual audio: Microphone + System Audio...');

        // Upload audio files directly without conversion
        onSuccess('Uploading audio files...');

        // Upload dual audio files directly
        let result;
        try {
          result = await apiService.uploadRawAudioArrays(
            dualAudioData.inputFiles,
            dualAudioData.outputFiles,
            (progress) => {
              // Update progress
              setUploadHistory(prev =>
                prev.map(upload =>
                  upload.id === uploadId
                    ? { ...upload, progress }
                    : upload
                )
              );
              onSuccess(`Uploading... ${progress}%`);
            },
            {
              segments: dualAudioData.segments || [],
              totalDuration: dualAudioData.totalDuration || 0,
              totalSegments: dualAudioData.totalSegments || 0
            }
          );
        } catch (uploadError) {
          console.error('❌ Network error during upload:', uploadError);

          // Store recording offline for later retry
          try {
            const offlineId = await OfflineStorageService.storeRecording({
              ...dualAudioData,
              sessionId,
              uploadId,
              error: uploadError.message
            });

            onError(`Network error: Recording saved offline (ID: ${offlineId}). You can retry upload later.`);
          } catch (offlineError) {
            console.error('❌ Failed to store recording offline:', offlineError);
            onError(`Network error and offline storage failed: ${uploadError.message}`);
          }

          // Update upload record as failed
          setUploadHistory(prev =>
            prev.map(upload =>
              upload.id === uploadId
                ? {
                  ...upload,
                  status: 'failed',
                  endTime: new Date(),
                  error: `Network error: ${uploadError.message}`
                }
                : upload
            )
          );

          return;
        }

        console.log('🔍 Dual audio upload result:', result);

        if (result.success) {
          // Update upload record as successful
          setUploadHistory(prev =>
            prev.map(upload =>
              upload.id === uploadId
                ? { ...upload, status: 'completed', endTime: new Date(), result }
                : upload
            )
          );

          onSuccess('Dual audio transcript generated successfully!');

          // Refresh transcript list
          await loadTranscripts();

          // Auto-select the new transcript
          if (result.transcript) {
            setSelectedTranscript(result.transcript);
          }
        } else {
          // Update upload record as failed
          setUploadHistory(prev =>
            prev.map(upload =>
              upload.id === uploadId
                ? {
                  ...upload,
                  status: 'failed',
                  endTime: new Date(),
                  error: result.error,
                  result
                }
                : upload
            )
          );

          // Store recording offline for later retry
          try {
            const offlineId = await OfflineStorageService.storeRecording({
              ...dualAudioData,
              sessionId,
              uploadId,
              error: result.error
            });

            onError(`Upload failed: Recording saved offline (ID: ${offlineId}). You can retry upload later.`);
          } catch (offlineError) {
            console.error('❌ Failed to store recording offline:', offlineError);
            onError(`Upload failed and offline storage failed: ${result.error}`);
          }

          // Add to failed uploads for retry
          setFailedUploads(prev => [...prev, {
            id: uploadId,
            dualAudioData: { ...dualAudioData, sessionId },
            error: result.error,
            timestamp: new Date()
          }]);
        }
      } else {
        onSuccess('Processing microphone audio only...');

        // Upload microphone audio files directly without conversion
        onSuccess('Uploading microphone audio files...');

        // Check if this is segmented recording
        if (dualAudioData.totalSegments > 1 && Array.isArray(dualAudioData.inputFiles) && dualAudioData.inputFiles.length > 0) {
          // Handle segmented microphone-only recording
          const result = await apiService.uploadSegmentedDualAudio(
            dualAudioData.inputFiles,
            [], // Empty array for system files
            (progress) => {
              // Update progress
              setUploadHistory(prev =>
                prev.map(upload =>
                  upload.id === uploadId
                    ? { ...upload, progress }
                    : upload
                )
              );
              onSuccess(`Uploading... ${progress}%`);
            }
          );

          console.log('🔍 Segmented microphone upload result:', result);

          if (result.success) {
            // Update upload record as successful
            setUploadHistory(prev =>
              prev.map(upload =>
                upload.id === uploadId
                  ? { ...upload, status: 'completed', endTime: new Date(), result }
                  : upload
              )
            );

            onSuccess('Transcript generated successfully!');

            // Refresh transcript list
            await loadTranscripts();

            // Auto-select the new transcript
            if (result.transcript) {
              setSelectedTranscript(result.transcript);
            }
          } else {
            // Update upload record as failed
            setUploadHistory(prev =>
              prev.map(upload =>
                upload.id === uploadId
                  ? {
                    ...upload,
                    status: 'failed',
                    endTime: new Date(),
                    error: result.error,
                    result
                  }
                  : upload
              )
            );

            // Add to failed uploads for retry
            setFailedUploads(prev => [...prev, {
              id: uploadId,
              dualAudioData: { ...dualAudioData, sessionId },
              error: result.error,
              timestamp: new Date()
            }]);

            const errorMessage = result.error || 'Failed to process recording';
            console.error('❌ Audio processing failed:', result.error);
            onError(`Transcription failed: ${errorMessage}`);
          }
        } else {
          // Check if we have input files
          if (!dualAudioData.inputFiles || dualAudioData.inputFiles.length === 0) {
            console.error('❌ No input files available for upload');
            onError('No audio files were generated during recording. Please try again.');
            return;
          }

          // Upload single audio file (microphone only)
          const result = await apiService.uploadAudio(dualAudioData.inputFiles[0], (progress) => {
            // Update progress
            setUploadHistory(prev =>
              prev.map(upload =>
                upload.id === uploadId
                  ? { ...upload, progress }
                  : upload
              )
            );
            onSuccess(`Uploading... ${progress}%`);
          });

          console.log('🔍 Audio upload result:', result);

          if (result.success) {
            // Update upload record as successful
            setUploadHistory(prev =>
              prev.map(upload =>
                upload.id === uploadId
                  ? { ...upload, status: 'completed', endTime: new Date(), result }
                  : upload
              )
            );

            onSuccess('Transcript generated successfully!');

            // Refresh transcript list
            await loadTranscripts();

            // Auto-select the new transcript
            if (result.transcript) {
              setSelectedTranscript(result.transcript);
            }
          } else {
            // Update upload record as failed
            setUploadHistory(prev =>
              prev.map(upload =>
                upload.id === uploadId
                  ? {
                    ...upload,
                    status: 'failed',
                    endTime: new Date(),
                    error: result.error,
                    result
                  }
                  : upload
              )
            );

            // Add to failed uploads for retry
            setFailedUploads(prev => [...prev, {
              id: uploadId,
              dualAudioData: { ...dualAudioData, sessionId },
              error: result.error,
              timestamp: new Date()
            }]);

            const errorMessage = result.error || 'Failed to process recording';
            console.error('❌ Audio processing failed:', result.error);
            onError(`Transcription failed: ${errorMessage}`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Unexpected error in handleRecordingComplete:', error);

      // Update upload record as failed
      setUploadHistory(prev =>
        prev.map(upload =>
          upload.id === uploadId
            ? {
              ...upload,
              status: 'failed',
              endTime: new Date(),
              error: error.message
            }
            : upload
        )
      );

      // Add to failed uploads for retry
      setFailedUploads(prev => [...prev, {
        id: uploadId,
        dualAudioData: { ...dualAudioData, sessionId: dualAudioData.sessionId || `session_${Date.now()}_${user.id}` },
        error: error.message,
        timestamp: new Date()
      }]);

      onError(`Processing failed: ${error.message}`);
    }
  };

  // Retry a failed upload
  const handleRetryUpload = async (failedUpload) => {
    try {
      // Remove from failed uploads
      setFailedUploads(prev => prev.filter(upload => upload.id !== failedUpload.id));

      // Retry the upload
      await handleRecordingComplete(failedUpload.dualAudioData);
    } catch (error) {
      onError(`Retry failed: ${error.message}`);
    }
  };

  const handleTranscriptSelect = (transcript) => {
    setSelectedTranscript(transcript);
  };

  const handleTranscriptDelete = async (transcriptId) => {
    try {
      const result = await apiService.deleteTranscript(transcriptId);

      if (result.success) {
        onSuccess('Transcript deleted');

        // Refresh list
        await loadTranscripts();

        // Clear selection if deleted transcript was selected
        if (selectedTranscript && selectedTranscript.id === transcriptId) {
          setSelectedTranscript(null);
        }
      } else {
        onError('Failed to delete transcript');
      }
    } catch (error) {
      onError('Failed to delete transcript');
    }
  };

  const handleProfileMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleProfileMenuClose = () => {
    setAnchorEl(null);
  };

  const handleShowAdminPanel = () => {
    setShowAdminPanel(true);
    handleProfileMenuClose();
  };

  const handleTranscriptUpdate = async (updatedTranscript) => {
    try {
      // Update the selected transcript in state
      setSelectedTranscript(updatedTranscript);

      // Update the transcript in the list
      setTranscripts(prevTranscripts =>
        prevTranscripts.map(t =>
          t.id === updatedTranscript.id ? updatedTranscript : t
        )
      );

      // Refresh the transcript list from backend to ensure we have the latest data
      await loadTranscripts();
    } catch (error) {
      onError('Failed to update transcript');
    }
  };

  const handleLogout = () => {
    handleProfileMenuClose();
    onLogout();
  };

  const handleMouseDown = (e) => {
    setIsResizing(true);
    e.preventDefault(); // Prevent text selection while dragging
  };

  const handleMouseMove = (e) => {
    if (!isResizing) return;

    // Get the container's bottom position
    const container = document.querySelector('.right-panel-container');
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newHeight = containerRect.bottom - e.clientY;

    // Constrain height between min and max values
    const constrainedHeight = Math.max(minChatHeight, Math.min(newHeight, maxChatHeight));
    setAiChatHeight(constrainedHeight);
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // Add event listeners for mouse move and up when resizing
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const toggleAIChat = () => {
    setIsAIChatExpanded(!isAIChatExpanded);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      minHeight: '100vh',
      maxHeight: '100vh',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <AppBar
        position="static"
        sx={{
          background: 'linear-gradient(45deg, #1e1e1e 30%, #2d2d2d 90%)',
          borderBottom: '1px solid #333',
          boxShadow: 'none',
        }}
      >
        <Toolbar>
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              background: 'linear-gradient(45deg, #00bcd4, #4dd0e1)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            LeepiAI Interview Recorder
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Welcome, {user.firstName}
            </Typography>

            <Tooltip title="Account settings">
              <IconButton
                size="large"
                edge="end"
                aria-label="account of current user"
                aria-controls="primary-search-account-menu"
                aria-haspopup="true"
                onClick={handleProfileMenuOpen}
                color="inherit"
              >
                <Avatar
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'primary.main',
                    fontSize: '0.875rem',
                  }}
                >
                  {user.firstName.charAt(0).toUpperCase()}
                </Avatar>
              </IconButton>
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        keepMounted
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        open={Boolean(anchorEl)}
        onClose={handleProfileMenuClose}
        PaperProps={{
          sx: {
            backgroundColor: '#1e1e1e',
            border: '1px solid #333',
            minWidth: 200,
          },
        }}
      >
        <MenuItem onClick={handleProfileMenuClose}>
          <AccountCircle sx={{ mr: 2 }} />
          Profile
        </MenuItem>
        <MenuItem onClick={handleProfileMenuClose}>
          <Settings sx={{ mr: 2 }} />
          Settings
        </MenuItem>
        {user.role === 'admin' && (
          <MenuItem onClick={handleShowAdminPanel}>
            <AdminPanelSettings sx={{ mr: 2 }} />
            Admin Panel
          </MenuItem>
        )}
        <MenuItem onClick={handleLogout}>
          <Logout sx={{ mr: 2 }} />
          Logout
        </MenuItem>
      </Menu>

      {/* Admin Panel Dialog */}
      {user.role === 'admin' && (
        <AdminPanel
          open={showAdminPanel}
          onClose={() => setShowAdminPanel(false)}
          onError={onError}
          onSuccess={onSuccess}
        />
      )}

      {/* Main Content */}
      <Box sx={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, // Critical for flexbox scrolling
      }}>
        <Grid container sx={{
          height: '100%',
          minHeight: 0, // Critical for flexbox scrolling
        }}>
          {/* Left Panel - Recording and Content Management */}
          <Grid item xs={12} md={4} sx={{
            borderRight: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0, // Critical for flexbox scrolling
          }}>
            {/* Recording Panel */}
            <Box sx={{
              p: 2,
              borderBottom: '1px solid #333',
              backgroundColor: '#1a1a1a',
            }}>
              <RecordingPanel
                onRecordingComplete={handleRecordingComplete}
                onError={onError}
                onSuccess={onSuccess}
              />
            </Box>

            {/* Content Management Tabs */}
            <Box sx={{
              flex: 1,
              overflow: 'hidden',
              minHeight: 0, // Critical for flexbox scrolling
              display: 'flex',
              flexDirection: 'column',
            }}>
              <Box sx={{
                borderBottom: 1,
                borderColor: '#333',
                flexShrink: 0, // Prevent tabs from shrinking
              }}>
                <Tabs
                  value={activeTab}
                  onChange={handleTabChange}
                  sx={{
                    '& .MuiTab-root': {
                      color: 'text.secondary',
                      '&.Mui-selected': {
                        color: 'primary.main',
                      },
                    },
                    '& .MuiTabs-indicator': {
                      backgroundColor: 'primary.main',
                    },
                  }}
                >
                  <Tab
                    icon={<Description />}
                    label="Transcripts"
                    iconPosition="start"
                  />
                  <Tab
                    icon={<AudioFile />}
                    label="Recordings"
                    iconPosition="start"
                  />
                  <Tab
                    icon={<Storage />}
                    label="Offline Storage"
                    iconPosition="start"
                  />
                </Tabs>
              </Box>

              {/* Tab Content */}
              <Box sx={{
                flex: 1,
                overflow: 'hidden',
                minHeight: 0, // Important: allows flex child to shrink below content size
                display: 'flex',
                flexDirection: 'column',
              }}>
                {activeTab === 0 ? (
                  <TranscriptList
                    transcripts={transcripts}
                    selectedTranscript={selectedTranscript}
                    onTranscriptSelect={handleTranscriptSelect}
                    onTranscriptDelete={handleTranscriptDelete}
                    loading={loading}
                    onRefresh={loadTranscripts}
                  />
                ) : activeTab === 1 ? (
                  // RecordingsManager temporarily hidden
                  // <RecordingsManager
                  //   onError={onError}
                  //   onSuccess={onSuccess}
                  //   onRefresh={loadTranscripts}
                  // />
                  <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                    <Typography variant="h6">Recordings Panel Hidden</Typography>
                    <Typography variant="body2">This panel has been temporarily disabled.</Typography>
                  </Box>
                ) : (
                  <OfflineRecordingsManager
                    onError={onError}
                    onSuccess={onSuccess}
                    onRefreshTranscripts={loadTranscripts}
                  />
                )}
              </Box>
            </Box>
          </Grid>

          {/* Right Panel - Transcript Viewer and AI Chat */}
          <Grid
            item
            xs={12}
            md={8}
            className="right-panel-container"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            {selectedTranscript ? (
              <>
                {/* Transcript Viewer */}
                <Box sx={{
                  flex: 1,
                  overflow: 'hidden',
                  borderBottom: '1px solid #333',
                }}>
                  <TranscriptViewer
                    transcript={selectedTranscript}
                    onError={onError}
                    onSuccess={onSuccess}
                    onTranscriptUpdate={handleTranscriptUpdate}
                  />
                </Box>

                {/* Resizable AI Chat Panel */}
                <Box
                  sx={{
                    position: 'relative',
                    backgroundColor: '#1a1a1a',
                    transition: isResizing ? 'none' : 'height 0.3s ease',
                    height: isAIChatExpanded ? aiChatHeight : 0,
                  }}
                >
                  {/* Drag Handle */}
                  <Box
                    onMouseDown={handleMouseDown}
                    sx={{
                      position: 'absolute',
                      top: -12,
                      left: 0,
                      right: 0,
                      height: '24px',
                      cursor: isAIChatExpanded ? 'row-resize' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                      zIndex: 1,
                      opacity: isAIChatExpanded ? 1 : 0,
                      transition: 'opacity 0.3s ease',
                      '&:hover': {
                        '& .dragHandle': {
                          opacity: 1,
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                        }
                      }
                    }}
                  >
                    <Box
                      className="dragHandle"
                      sx={{
                        width: '50px',
                        height: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                        borderRadius: '2px',
                        opacity: 0,
                        transition: 'all 0.2s ease',
                      }}
                    />
                  </Box>

                  {/* Expand/Collapse Button */}
                  <Button
                    onClick={toggleAIChat}
                    size="small"
                    sx={{
                      position: 'absolute',
                      top: -20,
                      right: 16,
                      minWidth: 'unset',
                      p: 0.5,
                      borderRadius: '4px',
                      backgroundColor: 'rgba(0, 0, 0, 0.2)',
                      color: 'text.secondary',
                      '&:hover': {
                        backgroundColor: 'rgba(0, 0, 0, 0.4)',
                      },
                      zIndex: 2,
                    }}
                  >
                    {isAIChatExpanded ? <ExpandMore /> : <ExpandLess />}
                  </Button>

                  {/* AI Chat Content */}
                  <Box
                    sx={{
                      height: '100%',
                      opacity: isAIChatExpanded ? 1 : 0,
                      visibility: isAIChatExpanded ? 'visible' : 'hidden',
                      transition: isResizing ? 'none' : 'all 0.3s ease',
                      borderTop: '1px solid #333',
                    }}
                  >
                    <AIChat
                      transcript={selectedTranscript}
                      onError={onError}
                      onSuccess={onSuccess}
                    />
                  </Box>
                </Box>
              </>
            ) : (
              /* Welcome Screen */
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                textAlign: 'center',
                p: 4,
              }}>
                <Typography variant="h4" sx={{ mb: 2, color: 'primary.main' }}>
                  Welcome to LeepiAI
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                  Start by recording a new interview or select an existing transcript from the left panel.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Features available:
                </Typography>
                <Box component="ul" sx={{ mt: 1, textAlign: 'left', color: 'text.secondary' }}>
                  <li>Record system audio with automatic speaker diarization</li>
                  <li>AI-powered transcription using Whisper</li>
                  <li>Generate summaries and interview debriefs</li>
                  <li>Chat with AI about your transcripts</li>
                  <li>Export transcripts in multiple formats</li>
                  <li>Manage recordings independently from transcripts</li>
                  <li>Retry failed uploads and manage audio files</li>
                </Box>
              </Box>
            )}
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}

export default MainInterface; 