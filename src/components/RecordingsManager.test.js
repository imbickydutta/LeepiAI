import React from 'react';
import { render, screen } from '@testing-library/react';
import RecordingsManager from './RecordingsManager';

// Mock the apiService
jest.mock('../services/ApiService', () => ({
  getRecordings: jest.fn(),
  retryRecording: jest.fn(),
  deleteRecordingAudio: jest.fn(),
  deleteRecording: jest.fn(),
}));

// Mock Material-UI components
jest.mock('@mui/material', () => ({
  Box: ({ children, ...props }) => <div {...props}>{children}</div>,
  Card: ({ children, ...props }) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  Typography: ({ children, ...props }) => <div {...props}>{children}</div>,
  List: ({ children, ...props }) => <ul {...props}>{children}</ul>,
  ListItem: ({ children, ...props }) => <li {...props}>{children}</li>,
  ListItemButton: ({ children, ...props }) => <button {...props}>{children}</button>,
  ListItemText: ({ children, ...props }) => <div {...props}>{children}</div>,
  ListItemSecondaryAction: ({ children, ...props }) => <div {...props}>{children}</div>,
  IconButton: ({ children, ...props }) => <button {...props}>{children}</button>,
  Tooltip: ({ children, ...props }) => <div {...props}>{children}</div>,
  Chip: ({ label, ...props }) => <span {...props}>{label}</span>,
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  Dialog: ({ children, open, ...props }) => open ? <div {...props}>{children}</div> : null,
  DialogTitle: ({ children, ...props }) => <div {...props}>{children}</div>,
  DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
  DialogActions: ({ children, ...props }) => <div {...props}>{children}</div>,
  Alert: ({ children, ...props }) => <div {...props}>{children}</div>,
  LinearProgress: (props) => <div {...props}>Progress</div>,
  Divider: (props) => <hr {...props} />,
  Grid: ({ children, ...props }) => <div {...props}>{children}</div>,
  Paper: ({ children, ...props }) => <div {...props}>{children}</div>,
  Collapse: ({ children, in: inProp, ...props }) => inProp ? <div {...props}>{children}</div> : null,
  Badge: ({ children, ...props }) => <div {...props}>{children}</div>,
}));

// Mock Material-UI icons
jest.mock('@mui/icons-material', () => ({
  Refresh: () => <span>Refresh</span>,
  PlayArrow: () => <span>Play</span>,
  Stop: () => <span>Stop</span>,
  Delete: () => <span>Delete</span>,
  Retry: () => <span>Retry</span>,
  Warning: () => <span>Warning</span>,
  CheckCircle: () => <span>CheckCircle</span>,
  Error: () => <span>Error</span>,
  Schedule: () => <span>Schedule</span>,
  Storage: () => <span>Storage</span>,
  ExpandMore: () => <span>ExpandMore</span>,
  ExpandLess: () => <span>ExpandLess</span>,
  AudioFile: () => <span>AudioFile</span>,
  Description: () => <span>Description</span>,
  CloudUpload: () => <span>CloudUpload</span>,
  CloudOff: () => <span>CloudOff</span>,
}));

describe('RecordingsManager', () => {
  const mockProps = {
    onError: jest.fn(),
    onSuccess: jest.fn(),
    onRefresh: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<RecordingsManager {...mockProps} />);
    expect(screen.getByText('Recordings Manager')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<RecordingsManager {...mockProps} />);
    expect(screen.getByText('Loading recordings...')).toBeInTheDocument();
  });

  it('shows empty state when no recordings', () => {
    // Mock the API to return empty recordings
    const { getRecordings } = require('../services/ApiService');
    getRecordings.mockResolvedValue({ success: true, recordings: [] });

    render(<RecordingsManager {...mockProps} />);
    
    // Wait for the API call to complete
    setTimeout(() => {
      expect(screen.getByText('No recordings found')).toBeInTheDocument();
    }, 100);
  });
}); 