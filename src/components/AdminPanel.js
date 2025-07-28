import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Tabs,
  Tab,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Grid,
  LinearProgress,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Switch,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import {
  Close,
  Delete,
  Edit,
  AdminPanelSettings,
  People,
  Analytics,
  Settings,
  Person,
  Description,
  Schedule,
  TrendingUp,
  Storage,
  Security,
  Refresh,
  Search,
  FilterList,
  Visibility,
  ExpandMore,
  ExpandLess,
  Add,
  AutoFixHigh,
} from '@mui/icons-material';
import apiService from '../services/ApiService';

// Reusable markdown components configuration
const markdownComponents = {
  p: ({ children }) => (
    <Typography variant="body2" sx={{ mb: 1 }}>
      {children}
    </Typography>
  ),
  h1: ({ children }) => (
    <Typography variant="h6" sx={{ mb: 1, mt: 1 }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="subtitle1" sx={{ mb: 1, mt: 1, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="subtitle2" sx={{ mb: 1, mt: 1, fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 2, mb: 1 }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 2, mb: 1 }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography variant="body2" component="li" sx={{ mb: 0.5 }}>
      {children}
    </Typography>
  ),
  strong: ({ children }) => (
    <Typography variant="body2" component="span" sx={{ fontWeight: 'bold' }}>
      {children}
    </Typography>
  ),
  em: ({ children }) => (
    <Typography variant="body2" component="span" sx={{ fontStyle: 'italic' }}>
      {children}
    </Typography>
  ),
  code: ({ children }) => (
    <Typography 
      variant="body2" 
      component="code" 
      sx={{ 
        backgroundColor: '#333', 
        px: 1, 
        py: 0.5, 
        borderRadius: 0.5,
        fontFamily: 'monospace',
        fontSize: '0.875rem'
      }}
    >
      {children}
    </Typography>
  ),
  blockquote: ({ children }) => (
    <Box 
      component="blockquote" 
      sx={{ 
        borderLeft: '4px solid #666', 
        pl: 2, 
        ml: 0, 
        my: 1,
        fontStyle: 'italic'
      }}
    >
      {children}
    </Box>
  )
};

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`admin-tabpanel-${index}`}
      aria-labelledby={`admin-tab-${index}`}
      style={{ height: '100%' }}
      {...other}
    >
      {value === index && (
        <Box sx={{ height: '100%', p: 2 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function AdminPanel({ open, onClose, onError, onSuccess }) {
  const [tabValue, setTabValue] = useState(0);
  const [users, setUsers] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  
  // Filter states
  const [userFilters, setUserFilters] = useState({
    search: '',
    role: '',
    isActive: ''
  });
  
  const [transcriptFilters, setTranscriptFilters] = useState({
    search: '',
    userId: '',
    hasSummary: '',
    hasDebrief: ''
  });
  
  // Pagination states
  const [userPagination, setUserPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasMore: false
  });
  
  const [transcriptPagination, setTranscriptPagination] = useState({
    limit: 20,
    offset: 0,
    total: 0,
    hasMore: false
  });
  
  // Expanded transcripts state
  const [expandedTranscripts, setExpandedTranscripts] = useState(new Set());
  const [transcriptDetails, setTranscriptDetails] = useState({});
  const [generatingSummary, setGeneratingSummary] = useState(new Set());
  const [generatingDebrief, setGeneratingDebrief] = useState(new Set());

  useEffect(() => {
    if (open) {
      loadAdminData();
    }
  }, [open]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      // Load users, analytics, and settings
      const [usersResult, analyticsResult, settingsResult] = await Promise.all([
        apiService.getUsers(userPagination),
        apiService.getAnalytics(),
        apiService.getSystemSettings()
      ]);

      if (usersResult.success) {
        setUsers(usersResult.users);
        setUserPagination(prev => ({
          ...prev,
          total: usersResult.pagination.total,
          hasMore: usersResult.pagination.hasMore
        }));
      }
      
      if (analyticsResult.success) {
        setAnalytics(analyticsResult.analytics);
      }

      if (settingsResult.success) {
        setSettings(settingsResult.settings);
      }
    } catch (error) {
      onError('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const loadTranscripts = async (filters = transcriptFilters, pagination = transcriptPagination) => {
    setLoading(true);
    try {
      const options = {
        ...pagination,
        ...filters
      };
      
      const result = await apiService.getAllTranscripts(options);
      
      if (result.success) {
        setTranscripts(result.transcripts);
        setTranscriptPagination(prev => ({
          ...prev,
          total: result.pagination.total,
          hasMore: result.pagination.hasMore
        }));
      }
    } catch (error) {
      onError('Failed to load transcripts');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (filters = userFilters, pagination = userPagination) => {
    setLoading(true);
    try {
      const options = {
        ...pagination,
        ...filters
      };
      
      const result = await apiService.getUsers(options);
      
      if (result.success) {
        setUsers(result.users);
        setUserPagination(prev => ({
          ...prev,
          total: result.pagination.total,
          hasMore: result.pagination.hasMore
        }));
      }
    } catch (error) {
      onError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleTranscriptExpand = async (transcriptId) => {
    const newExpanded = new Set(expandedTranscripts);
    if (newExpanded.has(transcriptId)) {
      newExpanded.delete(transcriptId);
    } else {
      newExpanded.add(transcriptId);
      // Load full transcript details if not already loaded
      if (!transcriptDetails[transcriptId]) {
        try {
          const result = await apiService.getTranscriptForAdmin(transcriptId);
          if (result.success) {
            setTranscriptDetails(prev => ({
              ...prev,
              [transcriptId]: result.transcript
            }));
          }
        } catch (error) {
          onError('Failed to load transcript details');
        }
      }
    }
    setExpandedTranscripts(newExpanded);
  };

  const handleGenerateSummary = async (transcriptId) => {
    setGeneratingSummary(prev => new Set(prev).add(transcriptId));
    try {
      const result = await apiService.generateSummaryForAdmin(transcriptId);
      if (result.success) {
        // Update the transcript details
        setTranscriptDetails(prev => ({
          ...prev,
          [transcriptId]: {
            ...prev[transcriptId],
            summary: result.summary
          }
        }));
        // Update the transcript in the list
        setTranscripts(prev => prev.map(t => 
          t.id === transcriptId ? { ...t, summary: result.summary } : t
        ));
        onSuccess('Summary generated successfully');
      } else {
        onError(result.error || 'Failed to generate summary');
      }
    } catch (error) {
      onError('Failed to generate summary');
    } finally {
      setGeneratingSummary(prev => {
        const newSet = new Set(prev);
        newSet.delete(transcriptId);
        return newSet;
      });
    }
  };

  const handleGenerateDebrief = async (transcriptId) => {
    setGeneratingDebrief(prev => new Set(prev).add(transcriptId));
    try {
      const result = await apiService.generateDebriefForAdmin(transcriptId);
      if (result.success) {
        // Update the transcript details
        setTranscriptDetails(prev => ({
          ...prev,
          [transcriptId]: {
            ...prev[transcriptId],
            debrief: result.debrief
          }
        }));
        // Update the transcript in the list
        setTranscripts(prev => prev.map(t => 
          t.id === transcriptId ? { ...t, debrief: result.debrief } : t
        ));
        onSuccess('Debrief generated successfully');
      } else {
        onError(result.error || 'Failed to generate debrief');
      }
    } catch (error) {
      onError('Failed to generate debrief');
    } finally {
      setGeneratingDebrief(prev => {
        const newSet = new Set(prev);
        newSet.delete(transcriptId);
        return newSet;
      });
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    // Load data when switching tabs
    if (newValue === 1 && transcripts.length === 0) {
      loadTranscripts();
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        const result = await apiService.deleteUser(userId);
        if (result.success) {
          onSuccess('User deleted successfully');
          loadAdminData();
        } else {
          onError('Failed to delete user');
        }
      } catch (error) {
        onError('Failed to delete user');
      }
    }
  };

  const handleUpdateUserRole = async (userId, newRole) => {
    try {
      const result = await apiService.updateUserRole(userId, newRole);
      if (result.success) {
        onSuccess('User role updated successfully');
        loadAdminData();
      } else {
        onError('Failed to update user role');
      }
    } catch (error) {
      onError('Failed to update user role');
    }
  };

  const handleUpdateSetting = async (key, value) => {
    try {
      const result = await apiService.updateSystemSetting(key, value);
      if (result.success) {
        onSuccess('Setting updated successfully');
        setSettings(prev => ({ ...prev, [key]: value }));
      } else {
        onError('Failed to update setting');
      }
    } catch (error) {
      onError('Failed to update setting');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString() + ' ' + 
           new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getRoleColor = (role) => {
    switch (role) {
      case 'admin': return 'error';
      case 'user': return 'primary';
      default: return 'default';
    }
  };

  const renderUsersTab = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">User Management</Typography>
        <Button startIcon={<Refresh />} onClick={() => loadUsers()} size="small">
          Refresh
        </Button>
      </Box>

      {/* User Filters */}
      <Card sx={{ backgroundColor: '#1e1e1e', mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            <FilterList sx={{ mr: 1, verticalAlign: 'middle' }} />
            Filters
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                placeholder="Search name or email..."
                value={userFilters.search}
                onChange={(e) => setUserFilters(prev => ({ ...prev, search: e.target.value }))}
                InputProps={{
                  endAdornment: <Search />
                }}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Role</InputLabel>
                <Select
                  value={userFilters.role}
                  onChange={(e) => setUserFilters(prev => ({ ...prev, role: e.target.value }))}
                  label="Role"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="user">User</MenuItem>
                  <MenuItem value="admin">Admin</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  value={userFilters.isActive}
                  onChange={(e) => setUserFilters(prev => ({ ...prev, isActive: e.target.value }))}
                  label="Status"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Active</MenuItem>
                  <MenuItem value="false">Inactive</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button 
              variant="contained" 
              onClick={() => loadUsers(userFilters, { ...userPagination, offset: 0 })}
              size="small"
            >
              Apply Filters
            </Button>
          </Box>
        </CardContent>
      </Card>

      <TableContainer component={Paper} sx={{ backgroundColor: '#1e1e1e' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Joined</TableCell>
              <TableCell>Transcripts</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Person />
                    {user.firstName} {user.lastName}
                  </Box>
                </TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <FormControl size="small" sx={{ minWidth: 100 }}>
                    <Select
                      value={user.role}
                      onChange={(e) => handleUpdateUserRole(user.id, e.target.value)}
                      sx={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                    >
                      <MenuItem value="user">User</MenuItem>
                      <MenuItem value="admin">Admin</MenuItem>
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(user.createdAt)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Chip
                      label={user.transcriptCount || 0}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                    {user.lastTranscriptAt && (
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(user.lastTranscriptAt)}
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Tooltip title="Delete user">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteUser(user.id)}
                    >
                      <Delete />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {userPagination.total > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {userPagination.offset + 1} to {Math.min(userPagination.offset + userPagination.limit, userPagination.total)} of {userPagination.total} users
          </Typography>
          <Box>
            <Button
              size="small"
              disabled={userPagination.offset === 0}
              onClick={() => {
                const newOffset = Math.max(0, userPagination.offset - userPagination.limit);
                loadUsers(userFilters, { ...userPagination, offset: newOffset });
              }}
            >
              Previous
            </Button>
            <Button
              size="small"
              disabled={!userPagination.hasMore}
              onClick={() => {
                const newOffset = userPagination.offset + userPagination.limit;
                loadUsers(userFilters, { ...userPagination, offset: newOffset });
              }}
            >
              Next
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );

  const renderTranscriptsTab = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">All Transcripts</Typography>
        <Button startIcon={<Refresh />} onClick={() => loadTranscripts()} size="small">
          Refresh
        </Button>
      </Box>

      {/* Filters */}
      <Card sx={{ backgroundColor: '#1e1e1e', mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            <FilterList sx={{ mr: 1, verticalAlign: 'middle' }} />
            Filters
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                placeholder="Search title, content, summary..."
                value={transcriptFilters.search}
                onChange={(e) => setTranscriptFilters(prev => ({ ...prev, search: e.target.value }))}
                InputProps={{
                  endAdornment: <Search />
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="User ID"
                placeholder="Filter by user ID"
                value={transcriptFilters.userId}
                onChange={(e) => setTranscriptFilters(prev => ({ ...prev, userId: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Has Summary</InputLabel>
                <Select
                  value={transcriptFilters.hasSummary}
                  onChange={(e) => setTranscriptFilters(prev => ({ ...prev, hasSummary: e.target.value }))}
                  label="Has Summary"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>Has Debrief</InputLabel>
                <Select
                  value={transcriptFilters.hasDebrief}
                  onChange={(e) => setTranscriptFilters(prev => ({ ...prev, hasDebrief: e.target.value }))}
                  label="Has Debrief"
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="true">Yes</MenuItem>
                  <MenuItem value="false">No</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2 }}>
            <Button 
              variant="contained" 
              onClick={() => loadTranscripts(transcriptFilters, { ...transcriptPagination, offset: 0 })}
              size="small"
            >
              Apply Filters
            </Button>
          </Box>
        </CardContent>
      </Card>

      <TableContainer component={Paper} sx={{ backgroundColor: '#1e1e1e' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox"></TableCell>
              <TableCell>Title</TableCell>
              <TableCell>User</TableCell>
              <TableCell>Duration</TableCell>
              <TableCell>Summary</TableCell>
              <TableCell>Debrief</TableCell>
              <TableCell>Created</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {transcripts.map((transcript) => {
              const isExpanded = expandedTranscripts.has(transcript.id);
              const details = transcriptDetails[transcript.id];
              const isGeneratingSummary = generatingSummary.has(transcript.id);
              const isGeneratingDebrief = generatingDebrief.has(transcript.id);
              
              return (
                <React.Fragment key={transcript.id}>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <IconButton
                        size="small"
                        onClick={() => handleTranscriptExpand(transcript.id)}
                      >
                        {isExpanded ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {transcript.title || 'Untitled'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2">
                          {transcript.userInfo?.name || 'Unknown User'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {transcript.userInfo?.email || 'No email'}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${Math.round(transcript.metadata?.duration || 0)}min`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={transcript.summary ? 'Yes' : 'No'}
                        size="small"
                        color={transcript.summary ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={transcript.debrief ? 'Yes' : 'No'}
                        size="small"
                        color={transcript.debrief ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(transcript.createdAt)}
                      </Typography>
                    </TableCell>
                  </TableRow>
                  
                  {/* Expanded Details Row */}
                  {isExpanded && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ p: 0 }}>
                        <Box sx={{ p: 2, backgroundColor: '#2a2a2a' }}>
                          {details ? (
                            <Grid container spacing={2}>
                              {/* Content */}
                              <Grid item xs={12}>
                                <Typography variant="h6" sx={{ mb: 1 }}>
                                  Content
                                </Typography>
                                <Box sx={{ 
                                  backgroundColor: '#1e1e1e', 
                                  p: 2, 
                                  borderRadius: 1,
                                  maxHeight: 200,
                                  overflow: 'auto'
                                }}>
                                  {details.content ? (
                                    <ReactMarkdown 
                                      remarkPlugins={[remarkGfm]}
                                      components={markdownComponents}
                                    >
                                      {details.content}
                                    </ReactMarkdown>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                      No content available
                                    </Typography>
                                  )}
                                </Box>
                              </Grid>
                              
                              {/* Summary Section */}
                              <Grid item xs={12} md={6}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                  <Typography variant="h6">Summary</Typography>
                                  {!details.summary && (
                                    <Button
                                      size="small"
                                      startIcon={<AutoFixHigh />}
                                      onClick={() => handleGenerateSummary(transcript.id)}
                                      disabled={isGeneratingSummary}
                                      variant="outlined"
                                    >
                                      {isGeneratingSummary ? 'Generating...' : 'Generate'}
                                    </Button>
                                  )}
                                </Box>
                                {details.summary ? (
                                  <Box sx={{ 
                                    backgroundColor: '#1e1e1e', 
                                    p: 2, 
                                    borderRadius: 1,
                                    maxHeight: 150,
                                    overflow: 'auto'
                                  }}>
                                    <ReactMarkdown 
                                      remarkPlugins={[remarkGfm]}
                                      components={markdownComponents}
                                    >
                                      {details.summary}
                                    </ReactMarkdown>
                                  </Box>
                                ) : (
                                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    No summary available
                                  </Typography>
                                )}
                              </Grid>
                              
                              {/* Debrief Section */}
                              <Grid item xs={12} md={6}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                  <Typography variant="h6">Debrief</Typography>
                                  {!details.debrief && (
                                    <Button
                                      size="small"
                                      startIcon={<AutoFixHigh />}
                                      onClick={() => handleGenerateDebrief(transcript.id)}
                                      disabled={isGeneratingDebrief}
                                      variant="outlined"
                                    >
                                      {isGeneratingDebrief ? 'Generating...' : 'Generate'}
                                    </Button>
                                  )}
                                </Box>
                                {details.debrief ? (
                                  <Box sx={{ 
                                    backgroundColor: '#1e1e1e', 
                                    p: 2, 
                                    borderRadius: 1,
                                    maxHeight: 150,
                                    overflow: 'auto'
                                  }}>
                                    {details.debrief.content && (
                                      <Box sx={{ mb: 2 }}>
                                        <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                                          Content:
                                        </Typography>
                                        <ReactMarkdown 
                                          remarkPlugins={[remarkGfm]}
                                          components={markdownComponents}
                                        >
                                          {details.debrief.content}
                                        </ReactMarkdown>
                                      </Box>
                                    )}
                                    {details.debrief.score && (
                                      <Typography variant="body2" sx={{ mb: 1 }}>
                                        <strong>Score:</strong> {details.debrief.score}/100
                                      </Typography>
                                    )}
                                    {details.debrief.strengths && details.debrief.strengths.length > 0 && (
                                      <Typography variant="body2" sx={{ mb: 1 }}>
                                        <strong>Strengths:</strong> {details.debrief.strengths.join(', ')}
                                      </Typography>
                                    )}
                                    {details.debrief.improvements && details.debrief.improvements.length > 0 && (
                                      <Typography variant="body2">
                                        <strong>Improvements:</strong> {details.debrief.improvements.join(', ')}
                                      </Typography>
                                    )}
                                  </Box>
                                ) : (
                                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                    No debrief available
                                  </Typography>
                                )}
                              </Grid>
                              
                              {/* Segments */}
                              {details.segments && details.segments.length > 0 && (
                                <Grid item xs={12}>
                                  <Typography variant="h6" sx={{ mb: 1 }}>
                                    Segments ({details.segments.length})
                                  </Typography>
                                  <Box sx={{ 
                                    backgroundColor: '#1e1e1e', 
                                    p: 2, 
                                    borderRadius: 1,
                                    maxHeight: 200,
                                    overflow: 'auto'
                                  }}>
                                    {details.segments.map((segment, index) => (
                                      <Box key={index} sx={{ mb: 1, p: 1, borderBottom: '1px solid #333' }}>
                                        <Typography variant="caption" color="text.secondary">
                                          {segment.start}s - {segment.end}s ({segment.speaker || 'Unknown'})
                                        </Typography>
                                        <Typography variant="body2">
                                          {segment.text}
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Box>
                                </Grid>
                              )}
                            </Grid>
                          ) : (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                              <Typography>Loading transcript details...</Typography>
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Pagination */}
      {transcriptPagination.total > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Showing {transcriptPagination.offset + 1} to {Math.min(transcriptPagination.offset + transcriptPagination.limit, transcriptPagination.total)} of {transcriptPagination.total} transcripts
          </Typography>
          <Box>
            <Button
              size="small"
              disabled={transcriptPagination.offset === 0}
              onClick={() => {
                const newOffset = Math.max(0, transcriptPagination.offset - transcriptPagination.limit);
                loadTranscripts(transcriptFilters, { ...transcriptPagination, offset: newOffset });
              }}
            >
              Previous
            </Button>
            <Button
              size="small"
              disabled={!transcriptPagination.hasMore}
              onClick={() => {
                const newOffset = transcriptPagination.offset + transcriptPagination.limit;
                loadTranscripts(transcriptFilters, { ...transcriptPagination, offset: newOffset });
              }}
            >
              Next
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );

  const renderAnalyticsTab = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 3 }}>System Analytics</Typography>
      
      {analytics ? (
        <Grid container spacing={3}>
          {/* Overview Cards */}
          <Grid item xs={12} md={3}>
            <Card sx={{ backgroundColor: '#1e1e1e' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <People color="primary" />
                  <Typography variant="h6">{analytics.totalUsers}</Typography>
                </Box>
                <Typography color="text.secondary">Total Users</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ backgroundColor: '#1e1e1e' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Description color="secondary" />
                  <Typography variant="h6">{analytics.totalTranscripts}</Typography>
                </Box>
                <Typography color="text.secondary">Total Transcripts</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ backgroundColor: '#1e1e1e' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Schedule color="warning" />
                  <Typography variant="h6">{Math.round(analytics.avgTranscriptDuration || 0)}min</Typography>
                </Box>
                <Typography color="text.secondary">Avg Duration</Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={3}>
            <Card sx={{ backgroundColor: '#1e1e1e' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TrendingUp color="success" />
                  <Typography variant="h6">{analytics.transcriptsThisWeek}</Typography>
                </Box>
                <Typography color="text.secondary">This Week</Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Usage Stats */}
          <Grid item xs={12} md={6}>
            <Card sx={{ backgroundColor: '#1e1e1e' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Storage Usage</Typography>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    {analytics.storageUsed} / {analytics.storageLimit} GB
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(analytics.storageUsed / analytics.storageLimit) * 100}
                    sx={{ mt: 1 }}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={6}>
            <Card sx={{ backgroundColor: '#1e1e1e' }}>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2 }}>Recent Activity</Typography>
                <List dense>
                  {analytics.recentActivity?.map((activity, index) => (
                    <ListItem key={index}>
                      <ListItemText
                        primary={activity.action}
                        secondary={formatDate(activity.timestamp)}
                      />
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      ) : (
        <Alert severity="info">Loading analytics data...</Alert>
      )}
    </Box>
  );

  const renderSettingsTab = () => (
    <Box>
      <Typography variant="h6" sx={{ mb: 3 }}>System Settings</Typography>
      
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card sx={{ backgroundColor: '#1e1e1e' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <Security sx={{ mr: 1, verticalAlign: 'middle' }} />
                Security Settings
              </Typography>
              
              <List>
                <ListItem>
                  <ListItemText
                    primary="Require Email Verification"
                    secondary="New users must verify their email"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.requireEmailVerification || false}
                      onChange={(e) => handleUpdateSetting('requireEmailVerification', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
                
                <ListItem>
                  <ListItemText
                    primary="Enable Registration"
                    secondary="Allow new user registrations"
                  />
                  <ListItemSecondaryAction>
                    <Switch
                      checked={settings.enableRegistration !== false}
                      onChange={(e) => handleUpdateSetting('enableRegistration', e.target.checked)}
                    />
                  </ListItemSecondaryAction>
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ backgroundColor: '#1e1e1e' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <Storage sx={{ mr: 1, verticalAlign: 'middle' }} />
                Storage Settings
              </Typography>
              
              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  label="Max File Size (MB)"
                  type="number"
                  value={settings.maxFileSize || 100}
                  onChange={(e) => handleUpdateSetting('maxFileSize', parseInt(e.target.value))}
                  size="small"
                />
              </Box>

              <Box sx={{ mb: 2 }}>
                <TextField
                  fullWidth
                  label="Auto-delete after (days)"
                  type="number"
                  value={settings.autoDeleteDays || 365}
                  onChange={(e) => handleUpdateSetting('autoDeleteDays', parseInt(e.target.value))}
                  size="small"
                  helperText="0 = never delete"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card sx={{ backgroundColor: '#1e1e1e' }}>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>
                <Settings sx={{ mr: 1, verticalAlign: 'middle' }} />
                AI Settings
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Default AI Model</InputLabel>
                    <Select
                      value={settings.defaultAiModel || 'gemini-pro'}
                      onChange={(e) => handleUpdateSetting('defaultAiModel', e.target.value)}
                    >
                      <MenuItem value="gemini-pro">Gemini Pro</MenuItem>
                      <MenuItem value="gpt-4">GPT-4</MenuItem>
                      <MenuItem value="gpt-3.5-turbo">GPT-3.5 Turbo</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Max Tokens"
                    type="number"
                    value={settings.maxTokens || 4000}
                    onChange={(e) => handleUpdateSetting('maxTokens', parseInt(e.target.value))}
                    size="small"
                  />
                </Grid>

                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Temperature"
                    type="number"
                    inputProps={{ min: 0, max: 1, step: 0.1 }}
                    value={settings.temperature || 0.7}
                    onChange={(e) => handleUpdateSetting('temperature', parseFloat(e.target.value))}
                    size="small"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: '#1e1e1e',
          border: '1px solid #333',
          height: '90vh',
        },
      }}
    >
      <DialogTitle sx={{ 
        backgroundColor: '#1a1a1a', 
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AdminPanelSettings />
          Admin Panel
        </Box>
        <IconButton onClick={onClose} size="small">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, height: '100%' }}>
        {loading && (
          <Box sx={{ p: 2 }}>
            <LinearProgress />
          </Box>
        )}

        <Tabs
          value={tabValue}
          onChange={handleTabChange}
          sx={{
            borderBottom: '1px solid #333',
            backgroundColor: '#1a1a1a',
          }}
        >
          <Tab label="Users" icon={<People />} />
          <Tab label="Transcripts" icon={<Description />} />
          <Tab label="Analytics" icon={<Analytics />} />
          <Tab label="Settings" icon={<Settings />} />
        </Tabs>

        <Box sx={{ height: 'calc(100% - 48px)', overflow: 'auto' }}>
          <TabPanel value={tabValue} index={0}>
            {renderUsersTab()}
          </TabPanel>
          <TabPanel value={tabValue} index={1}>
            {renderTranscriptsTab()}
          </TabPanel>
          <TabPanel value={tabValue} index={2}>
            {renderAnalyticsTab()}
          </TabPanel>
          <TabPanel value={tabValue} index={3}>
            {renderSettingsTab()}
          </TabPanel>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default AdminPanel; 