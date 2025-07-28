import React from 'react';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Typography,
  Tooltip,
  Chip,
  CircularProgress,
  Button,
} from '@mui/material';
import {
  Delete,
  Refresh,
  Description,
  Schedule,
  Person,
} from '@mui/icons-material';

function TranscriptList({ 
  transcripts, 
  selectedTranscript, 
  onTranscriptSelect, 
  onTranscriptDelete, 
  loading, 
  onRefresh 
}) {
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

  const handleDelete = (e, transcriptId) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this transcript?')) {
      onTranscriptDelete(transcriptId);
    }
  };

  const getSpeakerCount = (transcript) => {
    return transcript.speakers ? transcript.speakers.length : 0;
  };

  const getTranscriptPreview = (content) => {
    if (!content) return 'No content available';
    
    // Get first line or first 100 characters
    const firstLine = content.split('\n')[0];
    return firstLine.length > 80 
      ? firstLine.substring(0, 80) + '...' 
      : firstLine;
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
        <CircularProgress />
        <Typography variant="body2" color="text.secondary">
          Loading transcripts...
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
      }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Transcripts ({transcripts.length})
        </Typography>
        
        <Tooltip title="Refresh list">
          <IconButton onClick={onRefresh} size="small">
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Transcript List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {transcripts.length === 0 ? (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            p: 3,
            textAlign: 'center',
          }}>
            <Description sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
              No transcripts yet
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Start recording an interview to create your first transcript
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {transcripts.map((transcript) => (
              <ListItem
                key={transcript.id}
                disablePadding
                sx={{
                  borderBottom: '1px solid #333',
                  backgroundColor: selectedTranscript?.id === transcript.id 
                    ? 'rgba(0, 188, 212, 0.1)' 
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: selectedTranscript?.id === transcript.id 
                      ? 'rgba(0, 188, 212, 0.15)' 
                      : 'rgba(255, 255, 255, 0.05)',
                  },
                }}
              >
                <ListItemButton
                  onClick={() => onTranscriptSelect(transcript)}
                  sx={{ 
                    py: 2,
                    px: 2,
                    display: 'flex',
                    alignItems: 'flex-start',
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Title and Date */}
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                      <Typography 
                        variant="subtitle2" 
                        sx={{ 
                          fontWeight: 600,
                          color: selectedTranscript?.id === transcript.id 
                            ? 'primary.main' 
                            : 'text.primary',
                          flexGrow: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {transcript.title || 'Interview Transcript'}
                      </Typography>
                    </Box>

                    {/* Metadata */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                      <Chip
                        icon={<Schedule />}
                        label={formatDuration(transcript.metadata?.duration)}
                        size="small"
                        variant="outlined"
                        sx={{ 
                          fontSize: '0.7rem',
                          height: 20,
                          '& .MuiChip-icon': { fontSize: 12 },
                        }}
                      />
                      
                      {getSpeakerCount(transcript) > 0 && (
                        <Chip
                          icon={<Person />}
                          label={`${getSpeakerCount(transcript)} speakers`}
                          size="small"
                          variant="outlined"
                          sx={{ 
                            fontSize: '0.7rem',
                            height: 20,
                            '& .MuiChip-icon': { fontSize: 12 },
                          }}
                        />
                      )}
                    </Box>

                    {/* Preview */}
                    <Typography 
                      variant="body2" 
                      color="text.secondary"
                      sx={{ 
                        mb: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        fontSize: '0.75rem',
                        lineHeight: 1.3,
                      }}
                    >
                      {getTranscriptPreview(transcript.content)}
                    </Typography>

                    {/* Date */}
                    <Typography 
                      variant="caption" 
                      color="text.secondary"
                      sx={{ fontSize: '0.7rem' }}
                    >
                      {formatDate(transcript.createdAt)}
                    </Typography>

                    {/* AI Analysis Status */}
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 1 }}>
                      {transcript.summary && (
                        <Chip
                          label="Summary"
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ 
                            fontSize: '0.6rem',
                            height: 16,
                          }}
                        />
                      )}
                      {transcript.debrief && (
                        <Chip
                          label="Debrief"
                          size="small"
                          color="secondary"
                          variant="outlined"
                          sx={{ 
                            fontSize: '0.6rem',
                            height: 16,
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                </ListItemButton>

                <ListItemSecondaryAction sx={{ mr: 1 }}>
                  <Tooltip title="Delete transcript">
                    <IconButton
                      edge="end"
                      aria-label="delete"
                      onClick={(e) => handleDelete(e, transcript.id)}
                      size="small"
                      sx={{ 
                        color: 'text.secondary',
                        '&:hover': { 
                          color: 'error.main',
                          backgroundColor: 'rgba(244, 67, 54, 0.1)',
                        },
                      }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Box>

      {/* Footer */}
      {transcripts.length > 0 && (
        <Box sx={{ 
          p: 2, 
          borderTop: '1px solid #333',
          backgroundColor: '#1a1a1a',
          textAlign: 'center',
        }}>
          <Typography variant="caption" color="text.secondary">
            Select a transcript to view details and chat with AI
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export default TranscriptList; 