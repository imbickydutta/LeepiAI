import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  LinearProgress,
  Alert,
  Collapse,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  CloudUpload,
  CloudOff,
  Refresh,
  Delete,
  Info,
  Warning,
  CheckCircle,
  Error,
  ExpandMore,
  ExpandLess,
  Storage,
  Replay
} from '@mui/icons-material';
import OfflineStorageService from '../services/OfflineStorageService';
import ApiService from '../services/ApiService';

function OfflineRecordingsManager({ onSuccess, onError, onRefreshTranscripts }) {
  const [offlineRecordings, setOfflineRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showDetails, setShowDetails] = useState({});
  const [retryDialog, setRetryDialog] = useState({ open: false, recording: null });
  const [retrySettings, setRetrySettings] = useState({
    maxAttempts: 3,
    delayBetweenAttempts: 5000
  });
  const [storageStats, setStorageStats] = useState(null);

  useEffect(() => {
    loadOfflineRecordings();
    loadStorageStats();
  }, []);

  const loadOfflineRecordings = async () => {
    try {
      setLoading(true);
      const recordings = await OfflineStorageService.getAllRecordings();
      setOfflineRecordings(recordings);
      console.log('📱 Loaded offline recordings:', recordings.length);
    } catch (error) {
      console.error('❌ Failed to load offline recordings:', error);
      onError('Failed to load offline recordings');
    } finally {
      setLoading(false);
    }
  };

  const loadStorageStats = async () => {
    try {
      const stats = await OfflineStorageService.getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('❌ Failed to load storage stats:', error);
    }
  };

  const handleRetryUpload = async (recording) => {
    try {
      setUploading(true);

      // Check if recording has exceeded max attempts
      if (recording.attempts >= retrySettings.maxAttempts) {
        onError(`Recording has exceeded maximum retry attempts (${retrySettings.maxAttempts})`);
        return;
      }

      console.log('🔄 Retrying upload for recording:', recording.id);

      // Update status to uploading
      await OfflineStorageService.updateRecordingStatus(recording.id, 'uploading', {
        lastAttempt: new Date().toISOString()
      });

      // Attempt upload based on recording type
      let result;
      if (recording.outputFiles && recording.outputFiles.length > 0 &&
        recording.inputFiles && recording.inputFiles.length > 0) {
        // Dual audio upload
        result = await ApiService.uploadRawAudioArrays(
          recording.inputFiles,
          recording.outputFiles,
          (progress) => {
            console.log(`📤 Upload progress for ${recording.id}: ${progress}%`);
          },
          {
            segments: recording.segments || [],
            totalDuration: recording.totalDuration || 0,
            totalSegments: recording.totalSegments || 0
          }
        );
      } else if (recording.inputFiles && recording.inputFiles.length > 0) {
        // Single audio upload (segmented)
        result = await ApiService.uploadRawAudioArrays(
          recording.inputFiles,
          [], // No system audio
          (progress) => {
            console.log(`📤 Upload progress for ${recording.id}: ${progress}%`);
          },
          {
            segments: recording.segments || [],
            totalDuration: recording.totalDuration || 0,
            totalSegments: recording.totalSegments || 0
          }
        );
      } else {
        throw new Error('No valid audio files found');
      }

      if (result.success) {
        // Mark as successfully uploaded
        await OfflineStorageService.markAsUploaded(recording.id, result);
        onSuccess(`Recording ${recording.id} uploaded successfully!`);

        // Refresh data
        await loadOfflineRecordings();
        await loadStorageStats();

        // Refresh transcripts if callback provided
        if (onRefreshTranscripts) {
          await onRefreshTranscripts();
        }
      } else {
        // Mark as failed
        await OfflineStorageService.markAsFailed(recording.id, result.error);
        onError(`Upload failed: ${result.error}`);

        // Refresh data
        await loadOfflineRecordings();
        await loadStorageStats();
      }
    } catch (error) {
      console.error('❌ Retry upload failed:', error);

      // Mark as failed
      await OfflineStorageService.markAsFailed(recording.id, error.message);
      onError(`Retry failed: ${error.message}`);

      // Refresh data
      await loadOfflineRecordings();
      await loadStorageStats();
    } finally {
      setUploading(false);
    }
  };

  const handleRetryAll = async () => {
    const pendingRecordings = offlineRecordings.filter(r => r.status === 'pending' || r.status === 'failed');

    if (pendingRecordings.length === 0) {
      onSuccess('No recordings to retry');
      return;
    }

    setUploading(true);

    try {
      for (const recording of pendingRecordings) {
        if (recording.attempts >= retrySettings.maxAttempts) {
          console.log(`⚠️ Skipping ${recording.id} - exceeded max attempts`);
          continue;
        }

        console.log(`🔄 Retrying ${recording.id} (${pendingRecordings.indexOf(recording) + 1}/${pendingRecordings.length})`);
        await handleRetryUpload(recording);

        // Add delay between attempts
        if (pendingRecordings.indexOf(recording) < pendingRecordings.length - 1) {
          await new Promise(resolve => setTimeout(resolve, retrySettings.delayBetweenAttempts));
        }
      }

      onSuccess(`Retry completed for ${pendingRecordings.length} recordings`);
    } catch (error) {
      console.error('❌ Bulk retry failed:', error);
      onError('Bulk retry failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteRecording = async (recordingId) => {
    try {
      await OfflineStorageService.deleteRecording(recordingId);
      onSuccess('Recording deleted from offline storage');
      await loadOfflineRecordings();
      await loadStorageStats();
    } catch (error) {
      console.error('❌ Failed to delete recording:', error);
      onError('Failed to delete recording');
    }
  };

  const handleClearAll = async () => {
    try {
      await OfflineStorageService.clearAllRecordings();
      onSuccess('All offline recordings cleared');
      await loadOfflineRecordings();
      await loadStorageStats();
    } catch (error) {
      console.error('❌ Failed to clear all recordings:', error);
      onError('Failed to clear all recordings');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'warning';
      case 'uploading': return 'info';
      case 'completed': return 'success';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return <CloudOff />;
      case 'uploading': return <CloudUpload />;
      case 'completed': return <CheckCircle />;
      case 'failed': return <Error />;
      default: return <Info />;
    }
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatFileSize = (files) => {
    const totalSize = files.reduce((size, file) => size + file.size, 0);
    return OfflineStorageService.formatBytes(totalSize);
  };

  if (loading) {
    return (
      <Box>
        <LinearProgress />
        <Typography>Loading offline recordings...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header with stats */}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" display="flex" alignItems="center">
              <Storage sx={{ mr: 1 }} />
              Offline Recordings
            </Typography>
            <Box>
              <Button
                startIcon={<Refresh />}
                onClick={loadOfflineRecordings}
                disabled={loading}
                sx={{ mr: 1 }}
              >
                Refresh
              </Button>
              <Button
                startIcon={<CloudUpload />}
                onClick={handleRetryAll}
                disabled={uploading || offlineRecordings.filter(r => r.status === 'pending' || r.status === 'failed').length === 0}
                variant="contained"
                color="primary"
              >
                Retry All
              </Button>
            </Box>
          </Box>

          {storageStats && (
            <Box display="flex" gap={2} flexWrap="wrap">
              <Chip
                label={`Total: ${storageStats.totalRecordings}`}
                color="default"
                variant="outlined"
              />
              <Chip
                label={`Pending: ${storageStats.pendingRecordings}`}
                color="warning"
                variant="outlined"
              />
              <Chip
                label={`Failed: ${storageStats.failedRecordings}`}
                color="error"
                variant="outlined"
              />
              <Chip
                label={`Completed: ${storageStats.completedRecordings}`}
                color="success"
                variant="outlined"
              />
              <Chip
                label={`Size: ${storageStats.totalSize}`}
                color="info"
                variant="outlined"
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Recordings list */}
      {offlineRecordings.length === 0 ? (
        <Card>
          <CardContent>
            <Typography align="center" color="textSecondary">
              No offline recordings found
            </Typography>
          </CardContent>
        </Card>
      ) : (
        offlineRecordings.map((recording) => (
          <Card key={recording.id} sx={{ mb: 2 }}>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box flex={1}>
                  <Box display="flex" alignItems="center" mb={1}>
                    <Chip
                      icon={getStatusIcon(recording.status)}
                      label={recording.status}
                      color={getStatusColor(recording.status)}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    <Typography variant="body2" color="textSecondary">
                      {formatTimestamp(recording.timestamp)}
                    </Typography>
                  </Box>

                  <Typography variant="body2" color="textSecondary" mb={1}>
                    ID: {recording.id}
                  </Typography>

                  <Box display="flex" gap={1} mb={1}>
                    {recording.inputFiles && recording.inputFiles.length > 0 && (
                      <Chip
                        label={`MIC: ${recording.inputFiles.length} files (${formatFileSize(recording.inputFiles)})`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                    {recording.outputFiles && recording.outputFiles.length > 0 && (
                      <Chip
                        label={`SYS: ${recording.outputFiles.length} files (${formatFileSize(recording.outputFiles)})`}
                        size="small"
                        variant="outlined"
                      />
                    )}
                  </Box>

                  {recording.attempts > 0 && (
                    <Typography variant="body2" color="textSecondary">
                      Attempts: {recording.attempts}
                      {recording.lastAttempt && ` (Last: ${formatTimestamp(recording.lastAttempt)})`}
                    </Typography>
                  )}

                  {recording.error && (
                    <Alert severity="error" sx={{ mt: 1 }}>
                      {recording.error}
                    </Alert>
                  )}

                  <Collapse in={showDetails[recording.id]}>
                    <Box mt={2}>
                      <Typography variant="subtitle2" gutterBottom>Input Files:</Typography>
                      <List dense>
                        {recording.inputFiles?.map((file, index) => (
                          <ListItem key={index}>
                            <ListItemText
                              primary={file.name}
                              secondary={`${OfflineStorageService.formatBytes(file.size)} - ${file.type}`}
                            />
                          </ListItem>
                        ))}
                      </List>

                      {recording.outputFiles && recording.outputFiles.length > 0 && (
                        <>
                          <Typography variant="subtitle2" gutterBottom>Output Files:</Typography>
                          <List dense>
                            {recording.outputFiles.map((file, index) => (
                              <ListItem key={index}>
                                <ListItemText
                                  primary={file.name}
                                  secondary={`${OfflineStorageService.formatBytes(file.size)} - ${file.type}`}
                                />
                              </ListItem>
                            ))}
                          </List>
                        </>
                      )}
                    </Box>
                  </Collapse>
                </Box>

                <Box display="flex" flexDirection="column" gap={1}>
                  <IconButton
                    onClick={() => setShowDetails(prev => ({ ...prev, [recording.id]: !prev[recording.id] }))}
                    size="small"
                  >
                    {showDetails[recording.id] ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>

                  {(recording.status === 'pending' || recording.status === 'failed') && (
                    <Tooltip title="Retry Upload">
                      <IconButton
                        onClick={() => handleRetryUpload(recording)}
                        disabled={uploading}
                        color="primary"
                        size="small"
                      >
                        <Replay />
                      </IconButton>
                    </Tooltip>
                  )}

                  <Tooltip title="Delete">
                    <IconButton
                      onClick={() => handleDeleteRecording(recording.id)}
                      color="error"
                      size="small"
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))
      )}

      {/* Retry Settings Dialog */}
      <Dialog open={retryDialog.open} onClose={() => setRetryDialog({ open: false, recording: null })}>
        <DialogTitle>Retry Settings</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel>Max Attempts</InputLabel>
            <Select
              value={retrySettings.maxAttempts}
              onChange={(e) => setRetrySettings(prev => ({ ...prev, maxAttempts: e.target.value }))}
            >
              <MenuItem value={1}>1</MenuItem>
              <MenuItem value={2}>2</MenuItem>
              <MenuItem value={3}>3</MenuItem>
              <MenuItem value={5}>5</MenuItem>
              <MenuItem value={10}>10</MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Delay Between Attempts (ms)</InputLabel>
            <Select
              value={retrySettings.delayBetweenAttempts}
              onChange={(e) => setRetrySettings(prev => ({ ...prev, delayBetweenAttempts: e.target.value }))}
            >
              <MenuItem value={1000}>1 second</MenuItem>
              <MenuItem value={5000}>5 seconds</MenuItem>
              <MenuItem value={10000}>10 seconds</MenuItem>
              <MenuItem value={30000}>30 seconds</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRetryDialog({ open: false, recording: null })}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Actions */}
      {offlineRecordings.length > 0 && (
        <Card sx={{ mt: 2 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="textSecondary">
                {offlineRecordings.length} total recordings
              </Typography>
              <Box>
                <Button
                  onClick={() => setRetryDialog({ open: true, recording: null })}
                  sx={{ mr: 1 }}
                >
                  Retry Settings
                </Button>
                <Button
                  onClick={handleClearAll}
                  color="error"
                  variant="outlined"
                >
                  Clear All
                </Button>
              </Box>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Upload Progress */}
      {uploading && (
        <Box sx={{ mt: 2 }}>
          <LinearProgress />
          <Typography variant="body2" align="center" sx={{ mt: 1 }}>
            Uploading recordings...
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default OfflineRecordingsManager; 