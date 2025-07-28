import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Button,
  Menu,
  MenuItem,
  Chip,
  Divider,
  Card,
  CardContent,
  Tab,
  Tabs,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Download,
  AutoAwesome,
  Assessment,
  MoreVert,
  ContentCopy,
  Share,
  Edit,
} from '@mui/icons-material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import apiService from '../services/ApiService';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`transcript-tabpanel-${index}`}
      aria-labelledby={`transcript-tab-${index}`}
      style={{ height: '100%', overflow: 'hidden' }}
      {...other}
    >
      {value === index && (
        <Box sx={{ 
          height: '100%', 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function TranscriptViewer({ transcript, onError, onSuccess, onTranscriptUpdate }) {
  const [tabValue, setTabValue] = useState(0);
  const [anchorEl, setAnchorEl] = useState(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isGeneratingDebrief, setIsGeneratingDebrief] = useState(false);
  const [summaryDialog, setSummaryDialog] = useState(false);
  const [debriefDialog, setDebriefDialog] = useState(false);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const formatSpeakerLine = (line) => {
    // Handle non-string inputs safely
    if (typeof line !== 'string') {
      return { speaker: '', text: line?.text || '', source: null };
    }
    
    const parts = line.split(': ');
    if (parts.length < 2) return { speaker: '', text: line, source: null };
    
    const speaker = parts[0];
    const text = parts.slice(1).join(': ');
    
    return { speaker, text, source: null };
  };

  const formatSegmentLine = (segment) => {
    // Handle new segment format with source information
    if (segment && typeof segment === 'object' && segment.text !== undefined) {
      return {
        speaker: segment.speaker || '',
        text: segment.text || '',
        source: segment.source || null,
        start: segment.start,
        end: segment.end
      };
    }
    
    // Handle string format (fallback to old format)
    if (typeof segment === 'string') {
      return formatSpeakerLine(segment);
    }
    
    // Safety fallback for any other type
    return { speaker: '', text: String(segment || ''), source: null };
  };

  const getSpeakerColor = (speaker) => {
    switch (speaker.toLowerCase()) {
      case 'interviewer':
        return 'primary';
      case 'user':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getSourceColor = (source) => {
    switch (source) {
      case 'input':
        return 'success';
      case 'output':
        return 'warning';
      default:
        return 'default';
    }
  };

  const getSourceLabel = (source) => {
    switch (source) {
      case 'input':
        return 'MIC';
      case 'output':
        return 'SYS';
      default:
        return '';
    }
  };

  const handleCopyTranscript = () => {
    navigator.clipboard.writeText(transcript.content);
    onSuccess('Transcript copied to clipboard');
    handleMenuClose();
  };

  const handleDownload = async (format) => {
    try {
      let content = '';
      let filename = '';
      
      switch (format) {
        case 'txt':
          content = transcript.content;
          filename = `interview-transcript-${new Date().toISOString().split('T')[0]}.txt`;
          break;
        case 'json':
          content = JSON.stringify(transcript, null, 2);
          filename = `interview-transcript-${new Date().toISOString().split('T')[0]}.json`;
          break;
        case 'md':
          content = `# Interview Transcript\n\n${transcript.content}\n\n## Summary\n${transcript.summary || 'No summary available'}\n\n## Debrief\n${transcript.debrief?.content || transcript.debrief || 'No debrief available'}`;
          filename = `interview-transcript-${new Date().toISOString().split('T')[0]}.md`;
          break;
      }

      // Create blob and trigger download via electron
      const blob = new Blob([content], { type: 'text/plain' });
      const result = await window.electronAPI.file.downloadBlob({
        blob: Array.from(new Uint8Array(await blob.arrayBuffer())),
        filename
      });
      
      if (result.success) {
        onSuccess(`Transcript exported as ${format.toUpperCase()}`);
      } else {
        onError('Failed to export transcript');
      }
    } catch (error) {
      onError('Failed to export transcript');
    }
    handleMenuClose();
  };

  const handleGenerateSummary = async () => {
    if (!transcript.summary) {
      try {
        setIsGeneratingSummary(true);
        const result = await apiService.generateSummary(transcript.id);
        
        if (result.success) {
          // Update transcript with summary
          const updatedTranscript = { ...transcript, summary: result.summary };
          if (onTranscriptUpdate) {
            onTranscriptUpdate(updatedTranscript);
          }
          onSuccess('Summary generated successfully');
        } else {
          onError('Failed to generate summary');
        }
      } catch (error) {
        onError('Failed to generate summary');
      } finally {
        setIsGeneratingSummary(false);
      }
    } else {
      setSummaryDialog(true);
    }
  };

  const handleGenerateDebrief = async () => {
    console.log('🎯 DEBUG: handleGenerateDebrief called', {
      hasDebrief: !!transcript.debrief,
      transcriptId: transcript.id,
      isGenerating: isGeneratingDebrief,
      debriefType: typeof transcript.debrief,
      debriefFormat: transcript.debrief?.format
    });
    
    // Check if we should regenerate (no debrief, or empty legacy debrief)
    const shouldRegenerate = !transcript.debrief || 
      (transcript.debrief && !transcript.debrief.format && 
        (!transcript.debrief.feedback || transcript.debrief.feedback.trim() === '') &&
        (!transcript.debrief.strengths || transcript.debrief.strengths.length === 0) &&
        (!transcript.debrief.improvements || transcript.debrief.improvements.length === 0));
    
    console.log('🔄 DEBUG: Should regenerate debrief?', {
      shouldRegenerate,
      hasDebrief: !!transcript.debrief,
      hasFormat: !!transcript.debrief?.format,
      hasFeedback: !!(transcript.debrief?.feedback && transcript.debrief.feedback.trim()),
      strengthsCount: transcript.debrief?.strengths?.length || 0,
      improvementsCount: transcript.debrief?.improvements?.length || 0
    });
    
    if (shouldRegenerate) {
      try {
        setIsGeneratingDebrief(true);
        console.log('🔄 DEBUG: Starting debrief generation for transcript:', transcript.id);
        
        const result = await apiService.generateDebrief(transcript.id);
        console.log('📊 DEBUG: Debrief generation result:', result);
        
        if (result.success) {
          // Update transcript with debrief
          const updatedTranscript = { ...transcript, debrief: result.debrief };
          console.log('✅ DEBUG: Debrief saved to transcript:', result.debrief);
          if (onTranscriptUpdate) {
            onTranscriptUpdate(updatedTranscript);
          }
          onSuccess('Interview debrief generated successfully');
        } else {
          console.error('❌ DEBUG: Debrief generation failed:', result.error);
          onError(`Failed to generate debrief: ${result.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('❌ DEBUG: Exception during debrief generation:', error);
        onError(`Failed to generate debrief: ${error.message}`);
      } finally {
        setIsGeneratingDebrief(false);
      }
    } else {
      console.log('📄 DEBUG: Debrief already exists, opening dialog');
      setDebriefDialog(true);
    }
  };

  const renderTranscriptContent = () => {
    console.log('🔍 DEBUG: TranscriptViewer transcript object:', {
      hasContent: !!transcript.content,
      contentType: typeof transcript.content,
      contentPreview: typeof transcript.content === 'string' ? transcript.content.substring(0, 100) : transcript.content,
      hasSegments: !!transcript.segments,
      segmentsLength: transcript.segments?.length,
      segmentPreview: transcript.segments?.slice(0, 2)
    });
    
    if (!transcript.content) {
      return (
        <Typography color="text.secondary" sx={{ fontStyle: 'italic', p: 2 }}>
          No transcript content available
        </Typography>
      );
    }

    // Use formatted content first, then fall back to segments
    let segments = [];
    
    // First try to use the formatted content (string format)
    if (transcript.content && typeof transcript.content === 'string') {
      const lines = transcript.content.split('\n').filter(line => line.trim());
      segments = lines;
    } 
    // Fallback to raw segments if content is not available
    else if (transcript.segments && Array.isArray(transcript.segments)) {
      segments = transcript.segments;
    }
    
    console.log('🔍 DEBUG: TranscriptViewer segments:', segments.slice(0, 3));

    return (
      <Box sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <Box sx={{ 
          flex: 1,
          p: 2, 
          overflow: 'auto'
        }}>
          {segments.map((segment, index) => {
            const { speaker, text, source, start, end } = formatSegmentLine(segment);
            
            return (
              <Box key={index} sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 120 }}>
                  {speaker && (
                    <Chip
                      label={speaker}
                      color={getSpeakerColor(speaker)}
                      size="small"
                      sx={{ 
                        fontWeight: 600,
                        textTransform: 'capitalize',
                      }}
                    />
                  )}
                  {source && (
                    <Chip
                      label={getSourceLabel(source)}
                      color={getSourceColor(source)}
                      variant="outlined"
                      size="small"
                      sx={{ 
                        fontSize: '0.65rem',
                        height: '20px',
                        fontWeight: 500,
                      }}
                    />
                  )}
                  {start !== undefined && end !== undefined && (
                    <Typography 
                      variant="caption" 
                      color="text.secondary"
                      sx={{ fontSize: '0.65rem' }}
                    >
                      {start.toFixed(1)}s - {end.toFixed(1)}s
                    </Typography>
                  )}
                </Box>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    flex: 1,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {text}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  const renderSummary = () => {
    if (isGeneratingSummary) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <LinearProgress sx={{ mb: 2 }} />
          <Typography color="text.secondary">
            Generating AI summary...
          </Typography>
        </Box>
      );
    }

    if (!transcript.summary) {
      return (
        <Box sx={{ 
          p: 3, 
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}>
          <AutoAwesome sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 2 }}>
            No Summary Available
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Generate an AI-powered summary of this interview transcript
          </Typography>
          <Button
            variant="contained"
            startIcon={<AutoAwesome />}
            onClick={handleGenerateSummary}
          >
            Generate Summary
          </Button>
        </Box>
      );
    }

    return (
      <Box sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <Box sx={{ 
          flex: 1,
          p: 2, 
          overflow: 'auto',
          '& h1, & h2, & h3, & h4, & h5, & h6': {
            color: 'primary.main',
            marginTop: 2,
            marginBottom: 1,
          },
          '& p': {
            marginBottom: 1.5,
            lineHeight: 1.6,
          },
          '& ul, & ol': {
            paddingLeft: 2,
            marginBottom: 1.5,
          },
          '& li': {
            marginBottom: 0.5,
          },
          '& blockquote': {
            borderLeft: '4px solid #00bcd4',
            paddingLeft: 2,
            marginLeft: 0,
            fontStyle: 'italic',
            backgroundColor: 'rgba(0, 188, 212, 0.1)',
            padding: 1,
            borderRadius: 1,
          },
          '& code': {
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '2px 4px',
            borderRadius: 1,
            fontSize: '0.875em',
          },
          '& pre': {
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            padding: 2,
            borderRadius: 1,
            overflow: 'auto',
          },
        }}>
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({children}) => (
                <Typography variant="h4" component="h1" sx={{ color: 'primary.main', mb: 2, mt: 2 }}>
                  {children}
                </Typography>
              ),
              h2: ({children}) => (
                <Typography variant="h5" component="h2" sx={{ color: 'primary.main', mb: 1.5, mt: 2 }}>
                  {children}
                </Typography>
              ),
              h3: ({children}) => (
                <Typography variant="h6" component="h3" sx={{ color: 'primary.main', mb: 1, mt: 1.5 }}>
                  {children}
                </Typography>
              ),
              p: ({children}) => (
                <Typography variant="body1" component="p" sx={{ mb: 1.5, lineHeight: 1.6 }}>
                  {children}
                </Typography>
              ),
              li: ({children}) => (
                <Typography variant="body2" component="li" sx={{ mb: 0.5 }}>
                  {children}
                </Typography>
              ),
            }}
          >
            {transcript.summary}
          </ReactMarkdown>
        </Box>
      </Box>
    );
  };

  const renderDebrief = () => {
    console.log('🔍 DEBUG: renderDebrief called', {
      isGeneratingDebrief,
      hasDebrief: !!transcript.debrief,
      debriefType: typeof transcript.debrief,
      debriefFormat: transcript.debrief?.format,
      debriefPreview: transcript.debrief ? JSON.stringify(transcript.debrief).substring(0, 100) : 'none'
    });
    
    if (isGeneratingDebrief) {
      return (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <LinearProgress sx={{ mb: 2 }} />
          <Typography color="text.secondary">
            Generating interview debrief...
          </Typography>
        </Box>
      );
    }

    if (!transcript.debrief) {
      return (
        <Box sx={{ 
          p: 3, 
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}>
          <Assessment sx={{ fontSize: 48, color: 'secondary.main', mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 2 }}>
            No Debrief Available
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Generate an AI-powered interview analysis with feedback and insights
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Assessment />}
            onClick={handleGenerateDebrief}
          >
            Generate Debrief
          </Button>
        </Box>
      );
    }

    const debrief = transcript.debrief;

    // Check if debrief is in new markdown format
    if (debrief && debrief.format === 'markdown') {
      return (
        <Box sx={{ 
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <Box sx={{ 
            flex: 1,
            p: 2, 
            overflow: 'auto',
            '& h1, & h2, & h3, & h4, & h5, & h6': {
              color: 'primary.main',
              marginTop: 2,
              marginBottom: 1,
            },
            '& p': {
              marginBottom: 1.5,
              lineHeight: 1.6,
            },
            '& ul, & ol': {
              paddingLeft: 2,
              marginBottom: 1.5,
            },
            '& li': {
              marginBottom: 0.5,
            },
            '& blockquote': {
              borderLeft: '4px solid #f44336',
              paddingLeft: 2,
              marginLeft: 0,
              fontStyle: 'italic',
              backgroundColor: 'rgba(244, 67, 54, 0.1)',
              padding: 1,
              borderRadius: 1,
            },
            '& code': {
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              padding: '2px 4px',
              borderRadius: 1,
              fontSize: '0.875em',
            },
            '& pre': {
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: 2,
              borderRadius: 1,
              overflow: 'auto',
            },
            '& hr': {
              border: 'none',
              borderTop: '2px solid rgba(255, 255, 255, 0.1)',
              margin: '2rem 0',
            },
          }}>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({children}) => (
                  <Typography variant="h4" component="h1" sx={{ color: 'primary.main', mb: 2, mt: 2 }}>
                    {children}
                  </Typography>
                ),
                h2: ({children}) => (
                  <Typography variant="h5" component="h2" sx={{ color: 'secondary.main', mb: 1.5, mt: 2 }}>
                    {children}
                  </Typography>
                ),
                h3: ({children}) => (
                  <Typography variant="h6" component="h3" sx={{ color: 'text.primary', mb: 1, mt: 1.5 }}>
                    {children}
                  </Typography>
                ),
                p: ({children}) => (
                  <Typography variant="body1" component="p" sx={{ mb: 1.5, lineHeight: 1.6 }}>
                    {children}
                  </Typography>
                ),
                li: ({children}) => (
                  <Typography variant="body2" component="li" sx={{ mb: 0.5 }}>
                    {children}
                  </Typography>
                ),
                strong: ({children}) => (
                  <Box component="span" sx={{ fontWeight: 'bold', color: 'primary.light' }}>
                    {children}
                  </Box>
                ),
              }}
            >
              {debrief.content}
            </ReactMarkdown>
          </Box>
        </Box>
      );
    }

    // Legacy format handling (fallback for old JSON format)
    // Check if legacy debrief is essentially empty
    const isEmptyLegacyDebrief = debrief && 
      (!debrief.feedback || debrief.feedback.trim() === '') &&
      (!debrief.strengths || debrief.strengths.length === 0) &&
      (!debrief.improvements || debrief.improvements.length === 0) &&
      (!debrief.score || debrief.score === 0);

    if (isEmptyLegacyDebrief) {
      return (
        <Box sx={{ 
          p: 3, 
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
        }}>
          <Assessment sx={{ fontSize: 48, color: 'warning.main', mb: 2 }} />
          <Typography variant="h6" sx={{ mb: 2 }}>
            Debrief Needs Regeneration
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            This debrief appears to be empty or incomplete. Generate a new comprehensive analysis.
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<Assessment />}
            onClick={handleGenerateDebrief}
          >
            Regenerate Debrief
          </Button>
        </Box>
      );
    }

    return (
      <Box sx={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <Box sx={{ 
          flex: 1,
          p: 2, 
          overflow: 'auto'
        }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* Score */}
            {debrief.score && (
              <Card sx={{ background: 'linear-gradient(45deg, #00bcd4 30%, #4dd0e1 90%)' }}>
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h4" sx={{ fontWeight: 600, color: 'white' }}>
                    {debrief.score}/100
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'white', opacity: 0.9 }}>
                    Overall Performance Score
                  </Typography>
                </CardContent>
              </Card>
            )}

            {/* Feedback */}
            {debrief.feedback && (
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1, color: 'primary.main' }}>
                    Overall Feedback
                  </Typography>
                  <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                    {debrief.feedback}
                  </Typography>
                </CardContent>
              </Card>
            )}

            {/* Strengths */}
            {debrief.strengths && debrief.strengths.length > 0 && (
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1, color: 'success.main' }}>
                    Strengths
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {debrief.strengths.map((strength, index) => (
                      <li key={index}>
                        <Typography variant="body2">{strength}</Typography>
                      </li>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}

            {/* Improvements */}
            {debrief.improvements && debrief.improvements.length > 0 && (
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1, color: 'warning.main' }}>
                    Areas for Improvement
                  </Typography>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {debrief.improvements.map((improvement, index) => (
                      <li key={index}>
                        <Typography variant="body2">{improvement}</Typography>
                      </li>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      '@keyframes pulse': {
        '0%': { opacity: 1 },
        '50%': { opacity: 0.5 },
        '100%': { opacity: 1 },
      },
    }}>
      {/* Header */}
      <Box sx={{ 
        p: 2, 
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
      }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {transcript.title || 'Interview Transcript'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {new Date(transcript.createdAt).toLocaleDateString()} • 
            {transcript.metadata?.duration ? ` ${Math.floor(transcript.metadata.duration / 60)}min` : ' Unknown duration'}
            {transcript.speakers && ` • ${transcript.speakers.length} speakers`}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Generate Summary">
            <IconButton 
              onClick={handleGenerateSummary}
              disabled={isGeneratingSummary}
              color={transcript.summary ? 'primary' : 'default'}
            >
              <AutoAwesome />
            </IconButton>
          </Tooltip>
          
          <Tooltip title={transcript.debrief ? "View Debrief" : "Generate Debrief"}>
            <IconButton 
              onClick={handleGenerateDebrief}
              disabled={isGeneratingDebrief}
              color={transcript.debrief ? 'secondary' : 'default'}
              sx={{
                '&:hover': {
                  backgroundColor: transcript.debrief ? 'secondary.dark' : 'primary.dark',
                },
                ...(isGeneratingDebrief && {
                  animation: 'pulse 1.5s ease-in-out infinite',
                })
              }}
            >
              <Assessment />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="More options">
            <IconButton onClick={handleMenuOpen}>
              <MoreVert />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Options Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            backgroundColor: '#1e1e1e',
            border: '1px solid #333',
          },
        }}
      >
        <MenuItem onClick={handleCopyTranscript}>
          <ContentCopy sx={{ mr: 2 }} />
          Copy Transcript
        </MenuItem>
        <Divider />
        <MenuItem onClick={() => handleDownload('txt')}>
          <Download sx={{ mr: 2 }} />
          Export as TXT
        </MenuItem>
        <MenuItem onClick={() => handleDownload('md')}>
          <Download sx={{ mr: 2 }} />
          Export as Markdown
        </MenuItem>
        <MenuItem onClick={() => handleDownload('json')}>
          <Download sx={{ mr: 2 }} />
          Export as JSON
        </MenuItem>
      </Menu>

      {/* Tabs */}
      <Tabs
        value={tabValue}
        onChange={handleTabChange}
        sx={{
          borderBottom: '1px solid #333',
          backgroundColor: '#1a1a1a',
          '& .MuiTabs-indicator': {
            background: 'linear-gradient(45deg, #00bcd4, #4dd0e1)',
          },
        }}
      >
        <Tab label="Transcript" />
        <Tab 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Summary
              {transcript.summary && <Chip label="✓" size="small" color="primary" />}
            </Box>
          }
        />
        <Tab 
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              Debrief
              {transcript.debrief && transcript.debrief.format === 'markdown' && (
                <Chip label="✓" size="small" color="secondary" />
              )}
              {transcript.debrief && !transcript.debrief.format && (
                <Chip label="!" size="small" color="warning" />
              )}
            </Box>
          }
        />
      </Tabs>

      {/* Tab Content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <TabPanel value={tabValue} index={0}>
          {renderTranscriptContent()}
        </TabPanel>
        <TabPanel value={tabValue} index={1}>
          {renderSummary()}
        </TabPanel>
        <TabPanel value={tabValue} index={2}>
          {renderDebrief()}
        </TabPanel>
      </Box>
    </Box>
  );
}

export default TranscriptViewer;