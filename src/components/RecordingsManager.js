import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Tooltip,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Divider,
  Grid,
  Paper,
  Collapse,
  Badge,
} from '@mui/material';
import {
  PlayArrow,
  Stop,
  Delete,
  Download,
  CloudUpload,
  CheckCircle,
  Error,
  Warning,
  Info,
  Description,
  CloudOff,
  Folder,
  Refresh,
  Schedule,
  ExpandMore,
  ExpandLess,
  AudioFile,
  Storage,
} from '@mui/icons-material';
import apiService from '../services/ApiService';

function RecordingsManager({ onError, onSuccess, onRefresh }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState({});
  const [deleting, setDeleting] = useState({});
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [recordingToDelete, setRecordingToDelete] = useState(null);
  const [expandedItems, setExpandedItems] = useState(new Set());

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      const result = await apiService.getRecordings();

      if (result.success) {
        setRecordings(result.recordings);
      } else {
        onError('Failed to load recordings');
      }
    } catch (error) {
      onError('Failed to connect to backend');
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (recordingId) => {
    try {
      setRetrying(prev => ({ ...prev, [recordingId]: true }));

      const result = await apiService.retryRecording(recordingId);

      if (result.success) {
        onSuccess('Recording retry initiated successfully');
        await loadRecordings(); // Refresh the list
        if (onRefresh) onRefresh(); // Notify parent to refresh transcripts
      } else {
        onError(result.error || 'Failed to retry recording');
      }
    } catch (error) {
      onError('Failed to retry recording');
    } finally {
      setRetrying(prev => ({ ...prev, [recordingId]: false }));
    }
  };

  const handleRetryRecording = async (recordingId) => {
    try {
      setRetrying(prev => ({ ...prev, [recordingId]: true }));

      // For pending recordings without audio files, we need to trigger a new recording
      // This will be handled by the parent component (MainInterface)
      onSuccess('Starting new recording session...');

      // Notify parent to start a new recording
      if (onRefresh) onRefresh(); // This will trigger the parent to refresh and potentially start recording

      // Remove the pending recording since we're starting fresh
      await apiService.deleteRecording(recordingId);

      // Refresh the recordings list
      await loadRecordings();

    } catch (error) {
      onError('Failed to retry recording');
    } finally {
      setRetrying(prev => ({ ...prev, [recordingId]: false }));
    }
  };

  const handleDeleteAudio = async (recordingId) => {
    try {
      setDeleting(prev => ({ ...prev, [recordingId]: true }));

      const result = await apiService.deleteRecordingAudio(recordingId);

      if (result.success) {
        onSuccess('Audio files deleted successfully');
        await loadRecordings(); // Refresh the list
      } else {
        onError(result.error || 'Failed to delete audio files');
      }
    } catch (error) {
      onError('Failed to delete audio files');
    } finally {
      setDeleting(prev => ({ ...prev, [recordingId]: false }));
    }
  };

  const handleDeleteConfirm = async () => {
    if (!recordingToDelete) return;

    try {
      setDeleting(prev => ({ ...prev, [recordingToDelete.id]: true }));

      const result = await apiService.deleteRecording(recordingToDelete.id);

      if (result.success) {
        onSuccess('Recording deleted successfully');
        await loadRecordings(); // Refresh the list
        if (onRefresh) onRefresh(); // Notify parent to refresh transcripts
      } else {
        onError(result.error || 'Failed to delete recording');
      }
    } catch (error) {
      onError('Failed to delete recording');
    } finally {
      setDeleting(prev => ({ ...prev, [recordingToDelete.id]: false }));
      setShowDeleteDialog(false);
      setRecordingToDelete(null);
    }
  };

  const handleRefreshRecording = async (recordingId) => {
    try {
      // First, try to find if there's a transcript for this recording
      const transcriptResult = await apiService.findTranscriptByRecordingId(recordingId);

      if (transcriptResult.success && transcriptResult.transcript) {
        // Found a transcript! Update the recording with transcript info
        const updatedRecording = {
          ...recordings.find(r => r.id === recordingId),
          transcriptId: transcriptResult.transcript.id,
          transcriptStatus: 'available'
        };

        // Update the recording in the list
        setRecordings(prev => prev.map(rec =>
          rec.id === recordingId ? updatedRecording : rec
        ));

        // Notify parent to refresh transcripts
        if (onRefresh) {
          onRefresh();
        }

        onSuccess('Transcript found and status updated!');
        return;
      }

      // If no transcript found, fetch the latest recording data
      const result = await apiService.getRecording(recordingId);

      if (result.success) {
        // Update the specific recording in the list
        setRecordings(prev => prev.map(rec =>
          rec.id === recordingId ? result.recording : rec
        ));

        // If transcript is now available, notify parent to refresh
        if (result.recording.transcriptId && onRefresh) {
          onRefresh();
        }

        onSuccess('Recording status refreshed');
      } else {
        onError('Failed to refresh recording status');
      }
    } catch (error) {
      onError('Failed to refresh recording status');
    }
  };

  const toggleExpanded = (recordingId) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(recordingId)) {
      newExpanded.delete(recordingId);
    } else {
      newExpanded.add(recordingId);
    }
    setExpandedItems(newExpanded);
  };

  const getStatusIcon = (recording) => {
    if (recording.status === 'completed' || recording.status === 'completed_with_errors') {
      return <CheckCircle color="success" />;
    } else if (recording.status === 'failed') {
      return <Error color="error" />;
    } else if (recording.status === 'processing') {
      return <Schedule color="warning" />;
    } else if (recording.status === 'pending') {
      return <CloudUpload color="info" />;
    }
    return <Warning color="warning" />;
  };

  const getStatusColor = (recording) => {
    switch (recording.status) {
      case 'completed':
      case 'completed_with_errors':
        return 'success';
      case 'failed':
        return 'error';
      case 'processing':
        return 'warning';
      case 'pending':
        return 'info';
      default:
        return 'default';
    }
  };

  const getStatusText = (recording) => {
    switch (recording.status) {
      case 'completed':
        return 'Completed';
      case 'completed_with_errors':
        return 'Completed with Errors';
      case 'failed':
        return 'Failed';
      case 'processing':
        return 'Processing';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <Box sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: 200,
        flexDirection: 'column',
        gap: 2,
      }}>
        <LinearProgress sx={{ width: '100%' }} />
        <Typography variant="body2" color="text.secondary">
          Loading recordings...
        </Typography>
      </Box>
    );
  }

  const completedRecordings = recordings.filter(r => r.status === 'completed' || r.status === 'completed_with_errors');
  const failedRecordings = recordings.filter(r => r.status === 'failed');
  const pendingRecordings = recordings.filter(r => r.status === 'pending' || r.status === 'processing');

  return (
    <Box
      className="recordings-manager-container"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, // Important: allows flex child to shrink below content size
      }}>
      {/* Header */}
      <Box sx={{
        p: 2,
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        flexShrink: 0, // Prevent header from shrinking
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Recordings Manager
          </Typography>

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip
              label={`${completedRecordings.length} Completed`}
              color="success"
              size="small"
              icon={<CheckCircle />}
            />
            <Chip
              label={`${failedRecordings.length} Failed`}
              color="error"
              size="small"
              icon={<Error />}
            />
            <Chip
              label={`${pendingRecordings.length} Pending`}
              color="warning"
              size="small"
              icon={<Schedule />}
            />
          </Box>
        </Box>

        <Tooltip title="Refresh recordings">
          <IconButton onClick={loadRecordings} size="small">
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Recordings List */}
      <Box
        className="recordings-list-container"
        sx={{
          flex: 1,
          overflow: 'auto',
          p: 2,
          minHeight: 0, // Important: allows flex child to shrink below content size
          '&::-webkit-scrollbar': {
            width: '8px',
          },
          '&::-webkit-scrollbar-track': {
            backgroundColor: '#2a2a2a',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: '#555',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#777',
            },
          },
        }}
      >
        {recordings.length === 0 ? (
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            textAlign: 'center',
            p: 3,
          }}>
            <AudioFile sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              No recordings found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Start recording to see your audio files here
            </Typography>
          </Box>
        ) : (
          <List sx={{
            p: 0,
            height: '100%',
            overflow: 'auto',
          }}>
            {recordings.map((recording) => (
              <Card
                key={recording.id}
                sx={{
                  mb: 2,
                  border: '1px solid #333',
                  backgroundColor: '#1e1e1e',
                }}
              >
                <CardContent sx={{ p: 0 }}>
                  {/* Main Recording Info */}
                  <ListItem
                    disablePadding
                    sx={{
                      backgroundColor: 'transparent',
                      '&:hover': {
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      },
                    }}
                  >
                    <ListItemButton
                      onClick={() => toggleExpanded(recording.id)}
                      sx={{ py: 2, px: 2 }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1 }}>
                        {getStatusIcon(recording)}

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                            <Typography
                              variant="subtitle1"
                              sx={{ fontWeight: 600 }}
                            >
                              {recording.title || 'Untitled Recording'}
                            </Typography>

                            {recording.isParentSession && (
                              <Chip
                                icon={<Folder />}
                                label="Session"
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{
                                  fontSize: '0.6rem',
                                  height: 20,
                                }}
                              />
                            )}
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Chip
                              label={getStatusText(recording)}
                              color={getStatusColor(recording)}
                              size="small"
                              variant="outlined"
                            />

                            {recording.metadata?.totalDuration && (
                              <Chip
                                icon={<Schedule />}
                                label={formatDuration(recording.metadata.totalDuration)}
                                size="small"
                                variant="outlined"
                              />
                            )}

                            {recording.metadata?.totalFileSize && (
                              <Chip
                                icon={<Storage />}
                                label={formatFileSize(recording.metadata.totalFileSize)}
                                size="small"
                                variant="outlined"
                              />
                            )}

                            {recording.metadata?.totalSegments && recording.metadata.totalSegments > 1 && (
                              <Chip
                                icon={<AudioFile />}
                                label={`${recording.metadata.totalSegments} segments`}
                                size="small"
                                variant="outlined"
                              />
                            )}
                          </Box>

                          <Typography variant="caption" color="text.secondary">
                            {formatDate(recording.createdAt)}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {expandedItems.has(recording.id) ? <ExpandLess /> : <ExpandMore />}
                      </Box>
                    </ListItemButton>
                  </ListItem>

                  {/* Expanded Details */}
                  <Collapse in={expandedItems.has(recording.id)}>
                    <Divider sx={{ borderColor: '#333' }} />

                    <Box sx={{ p: 2, backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                      <Grid container spacing={2}>
                        {/* Session Information */}
                        {recording.isParentSession && (
                          <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main' }}>
                              Session Information
                            </Typography>

                            <Box sx={{
                              p: 1.5,
                              backgroundColor: 'rgba(0, 188, 212, 0.1)',
                              borderRadius: 1,
                              border: '1px solid rgba(0, 188, 212, 0.3)',
                            }}>
                              <Typography variant="body2" sx={{ mb: 1 }}>
                                <strong>Session ID:</strong> {recording.sessionId}
                              </Typography>

                              {recording.metadata?.totalSegments && (
                                <Typography variant="body2" sx={{ mb: 1 }}>
                                  <strong>Total Segments:</strong> {recording.metadata.totalSegments}
                                </Typography>
                              )}

                              {recording.metadata?.successfulChunks !== undefined && (
                                <Typography variant="body2" sx={{ mb: 1 }}>
                                  <strong>Successful Chunks:</strong> {recording.metadata.successfulChunks}
                                </Typography>
                              )}

                              {recording.metadata?.failedChunks !== undefined && recording.metadata.failedChunks > 0 && (
                                <Typography variant="body2" sx={{ mb: 1, color: 'warning.main' }}>
                                  <strong>Failed Chunks:</strong> {recording.metadata.failedChunks}
                                </Typography>
                              )}

                              {recording.metadata?.totalDuration && (
                                <Typography variant="body2">
                                  <strong>Total Duration:</strong> {formatDuration(recording.metadata.totalDuration)}
                                </Typography>
                              )}
                            </Box>
                          </Grid>
                        )}

                        {/* Audio Files Info */}
                        <Grid item xs={12} md={6}>
                          <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main' }}>
                            Audio Files
                          </Typography>

                          {recording.audioFiles?.length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {recording.audioFiles
                                .filter((file, index, self) => {
                                  // Remove duplicates based on filename and path
                                  const firstIndex = self.findIndex(f =>
                                    f.filename === file.filename && f.path === file.path
                                  );
                                  return firstIndex === index;
                                })
                                .map((file, index) => (
                                  <Box key={`${file.filename}-${index}`} sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                    p: 1,
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: 1,
                                  }}>
                                    <AudioFile fontSize="small" color="primary" />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                      <Typography variant="body2" sx={{
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {file.originalName || file.filename || `Audio File ${index + 1}`}
                                      </Typography>
                                      {file.segmentIndex !== undefined && !isNaN(file.segmentIndex) && (
                                        <Typography variant="caption" color="text.secondary">
                                          Segment {file.segmentIndex + 1}
                                        </Typography>
                                      )}
                                      {file.type && (
                                        <Typography variant="caption" color="text.secondary">
                                          {file.type} audio
                                        </Typography>
                                      )}
                                    </Box>
                                    <Typography variant="caption" color="text.secondary">
                                      {formatFileSize(file.size || 0)}
                                    </Typography>
                                  </Box>
                                ))}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No audio files available
                            </Typography>
                          )}
                        </Grid>

                        {/* Transcript Info */}
                        <Grid item xs={12} md={6}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Typography variant="subtitle2" sx={{ color: 'secondary.main' }}>
                              Transcript Status
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => handleRefreshRecording(recording.id)}
                              sx={{ color: 'text.secondary' }}
                            >
                              <Refresh fontSize="small" />
                            </IconButton>
                          </Box>

                          {recording.transcriptId ? (
                            <Box sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              p: 1,
                              backgroundColor: 'rgba(76, 175, 80, 0.1)',
                              borderRadius: 1,
                              border: '1px solid rgba(76, 175, 80, 0.3)',
                            }}>
                              <Description color="success" />
                              <Typography variant="body2">
                                Transcript available
                              </Typography>
                            </Box>
                          ) : recording.status === 'completed' && recording.audioFiles?.length > 0 ? (
                            <Box sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 1,
                              p: 1,
                              backgroundColor: 'rgba(255, 152, 0, 0.1)',
                              borderRadius: 1,
                              border: '1px solid rgba(255, 152, 0, 0.3)',
                            }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CloudOff color="warning" />
                                <Typography variant="body2">
                                  Transcript processing in progress...
                                </Typography>
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                Check back later or refresh to see updated status
                              </Typography>
                              <Button
                                size="small"
                                variant="outlined"
                                color="primary"
                                onClick={() => handleRefreshRecording(recording.id)}
                                sx={{ alignSelf: 'flex-start', mt: 0.5 }}
                              >
                                Check for Transcript
                              </Button>
                            </Box>
                          ) : (
                            <Box sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              p: 1,
                              backgroundColor: 'rgba(158, 158, 158, 0.1)',
                              borderRadius: 1,
                              border: '1px solid rgba(158, 158, 158, 0.3)',
                            }}>
                              <Info color="info" />
                              <Typography variant="body2">
                                No transcript generated
                              </Typography>
                            </Box>
                          )}
                        </Grid>

                        {/* Chunk Statuses for Segmented Recordings */}
                        {recording.isParentSession && recording.metadata?.chunkStatuses && (
                          <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1, color: 'info.main' }}>
                              Segment Statuses
                            </Typography>

                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {recording.metadata.chunkStatuses.map((chunk, index) => {
                                // Safely handle segment index to prevent NaN
                                const segmentNumber = (chunk.segmentIndex !== undefined && !isNaN(chunk.segmentIndex))
                                  ? chunk.segmentIndex + 1
                                  : index + 1;

                                return (
                                  <Chip
                                    key={chunk.id || index}
                                    label={`Segment ${segmentNumber}`}
                                    color={chunk.status === 'completed' ? 'success' : 'error'}
                                    variant="outlined"
                                    size="small"
                                    icon={chunk.status === 'completed' ? <CheckCircle /> : <Error />}
                                    sx={{
                                      fontSize: '0.7rem',
                                      height: 24,
                                      '& .MuiChip-icon': { fontSize: 14 },
                                    }}
                                  />
                                );
                              })}
                            </Box>
                          </Grid>
                        )}

                        {/* Error Details */}
                        {recording.error && (
                          <Grid item xs={12}>
                            <Alert severity="error" sx={{ mt: 1 }}>
                              <Typography variant="body2">
                                <strong>Error:</strong> {recording.error}
                              </Typography>
                            </Alert>
                          </Grid>
                        )}
                      </Grid>

                      {/* Action Buttons */}
                      <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                        {/* Retry Recording for pending recordings without audio files */}
                        {recording.status === 'pending' && (!recording.audioFiles || recording.audioFiles.length === 0) && (
                          <Button
                            variant="contained"
                            color="warning"
                            size="small"
                            startIcon={<Refresh />}
                            onClick={() => handleRetryRecording(recording.id)}
                            disabled={retrying[recording.id]}
                          >
                            {retrying[recording.id] ? 'Retrying...' : 'Retry Recording'}
                          </Button>
                        )}

                        {/* Retry Upload for failed recordings */}
                        {recording.status === 'failed' && (
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            startIcon={<Refresh />}
                            onClick={() => handleRetry(recording.id)}
                            disabled={retrying[recording.id]}
                          >
                            {retrying[recording.id] ? 'Retrying...' : 'Retry Upload'}
                          </Button>
                        )}

                        {/* Delete Audio Files for recordings with audio */}
                        {recording.audioFiles?.length > 0 && (
                          <Button
                            variant="outlined"
                            color="warning"
                            size="small"
                            startIcon={<Delete />}
                            onClick={() => handleDeleteAudio(recording.id)}
                            disabled={deleting[recording.id]}
                          >
                            {deleting[recording.id] ? 'Deleting...' : 'Delete Audio Files'}
                          </Button>
                        )}

                        {/* Delete Recording */}
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          startIcon={<Delete />}
                          onClick={() => {
                            setRecordingToDelete(recording);
                            setShowDeleteDialog(true);
                          }}
                          disabled={deleting[recording.id]}
                        >
                          Delete Recording
                        </Button>
                      </Box>
                    </Box>
                  </Collapse>
                </CardContent>
              </Card>
            ))}
          </List>
        )}
      </Box>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
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
          <Delete color="error" />
          Delete Recording
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            This action cannot be undone. This will permanently delete:
          </Alert>

          <Box component="ul" sx={{ pl: 2, color: 'text.secondary' }}>
            <li>The recording entry</li>
            <li>All associated audio files</li>
            {recordingToDelete?.transcriptId && (
              <li>The generated transcript</li>
            )}
            {recordingToDelete?.isParentSession && recordingToDelete?.metadata?.totalSegments > 1 && (
              <li>All {recordingToDelete.metadata.totalSegments} recording segments</li>
            )}
          </Box>

          <Typography variant="body2" sx={{ mt: 2, color: 'text.secondary' }}>
            <strong>Recording:</strong> {recordingToDelete?.title || 'Untitled'}
          </Typography>

          {recordingToDelete?.isParentSession && (
            <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
              <strong>Session ID:</strong> {recordingToDelete?.sessionId}
            </Typography>
          )}
        </DialogContent>

        <DialogActions sx={{
          backgroundColor: '#1a1a1a',
          borderTop: '1px solid #333',
          gap: 1,
          p: 2
        }}>
          <Button onClick={() => setShowDeleteDialog(false)}>
            Cancel
          </Button>

          <Button
            onClick={handleDeleteConfirm}
            variant="contained"
            color="error"
            disabled={deleting[recordingToDelete?.id]}
          >
            {deleting[recordingToDelete?.id] ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default RecordingsManager; 