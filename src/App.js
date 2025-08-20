import React, { useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, Snackbar, Alert, Button, Typography } from '@mui/material';
import LoginScreen from './components/LoginScreen';
import MainInterface from './components/MainInterface';
import LoadingScreen from './components/LoadingScreen';
import apiService from './services/ApiService';

/**
 * Main Application Component
 * 
 * Architecture:
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    REACT APP STRUCTURE                      │
 * │                                                             │
 * │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
 * │  │   Login     │───▶│    Main     │◀───│   Admin     │      │
 * │  │   Screen    │    │ Interface   │    │ Features    │      │
 * │  └─────────────┘    └─────────────┘    └─────────────┘      │
 * │                             │                               │
 * │                             ▼                               │
 * │    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
 * │    │  Recording  │    │ Transcript  │    │  AI Chat    │    │
 * │    │   Panel     │    │   Viewer    │    │   Panel     │    │
 * │    └─────────────┘    └─────────────┘    └─────────────┘    │
 * └─────────────────────────────────────────────────────────────┘
 */

// Dark theme configuration (mobile-first, high-contrast as per user preference)
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00bcd4',
      light: '#4dd0e1',
      dark: '#00838f',
      contrastText: '#000000',
    },
    secondary: {
      main: '#ff4081',
      light: '#ff79b0',
      dark: '#ad2457',
      contrastText: '#ffffff',
    },
    background: {
      default: '#0a0a0a',
      paper: '#121212',
    },
    surface: {
      main: '#1e1e1e',
      light: '#2d2d2d',
      dark: '#0d0d0d',
    },
    text: {
      primary: '#ffffff',
      secondary: '#e0e0e0',
    },
    error: {
      main: '#ff5252',
      dark: '#c62828',
    },
    warning: {
      main: '#ffb74d',
      dark: '#f57c00',
    },
    success: {
      main: '#69f0ae',
      dark: '#00c853',
    },
    info: {
      main: '#40c4ff',
      dark: '#0091ea',
    },
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
    ].join(','),
    h1: {
      fontSize: '2.5rem',
      fontWeight: 700,
      lineHeight: 1.2,
      color: '#ffffff',
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 600,
      lineHeight: 1.3,
      color: '#ffffff',
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 600,
      lineHeight: 1.4,
      color: '#ffffff',
    },
    h4: {
      fontSize: '1.5rem',
      fontWeight: 500,
      lineHeight: 1.4,
      color: '#ffffff',
    },
    h5: {
      fontSize: '1.25rem',
      fontWeight: 500,
      lineHeight: 1.5,
      color: '#ffffff',
    },
    h6: {
      fontSize: '1rem',
      fontWeight: 500,
      lineHeight: 1.5,
      color: '#ffffff',
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.6,
      color: '#ffffff',
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
      color: '#e0e0e0',
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          padding: '10px 20px',
          fontWeight: 600,
          fontSize: '0.95rem',
        },
        containedPrimary: {
          background: 'linear-gradient(45deg, #00bcd4 30%, #4dd0e1 90%)',
          boxShadow: '0 4px 8px 2px rgba(0, 188, 212, .4)',
          color: '#000000',
          '&:hover': {
            background: 'linear-gradient(45deg, #00838f 30%, #00bcd4 90%)',
            boxShadow: '0 6px 12px 2px rgba(0, 188, 212, .5)',
          },
        },
        containedSecondary: {
          background: 'linear-gradient(45deg, #ff4081 30%, #ff79b0 90%)',
          boxShadow: '0 4px 8px 2px rgba(255, 64, 129, .3)',
          '&:hover': {
            background: 'linear-gradient(45deg, #ad2457 30%, #ff4081 90%)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backgroundColor: '#121212',
          border: '1px solid #333333',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            backgroundColor: '#1e1e1e',
            '& fieldset': {
              borderColor: '#444444',
              borderWidth: 2,
            },
            '&:hover fieldset': {
              borderColor: '#666666',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#00bcd4',
              borderWidth: 2,
            },
          },
          '& .MuiInputLabel-root': {
            color: '#e0e0e0',
            '&.Mui-focused': {
              color: '#00bcd4',
            },
          },
          '& .MuiOutlinedInput-input': {
            color: '#ffffff',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#121212',
          backgroundImage: 'none',
        },
      },
    },
  },
});

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [backendStatus, setBackendStatus] = useState({ available: false, checking: true });

  // Check authentication status and backend connectivity on app start
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setLoading(true);
      
      // Check backend status first
      const status = await apiService.checkBackendStatus();
      setBackendStatus({ ...status, checking: false });
      
      if (!status.available) {
        setError('Backend server is not available. Please make sure the LeepiAI Backend is running.');
        setLoading(false);
        return;
      }

      
      // Check if user is logged in
      const currentUser = await apiService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
        console.log('👤 User logged in:', currentUser.email);
      } else {
        console.log('👤 No user logged in');
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setError('Failed to connect to backend server');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (credentials) => {
    try {
      setLoading(true);
      setError('');
      
      const result = await apiService.login(credentials);
      
      if (result.success) {
        setUser(result.user);
        setSuccess(`Welcome back, ${result.user.firstName}!`);
        return { success: true };
      } else {
        setError(result.error || 'Login failed');
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = 'Failed to connect to server';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (userData) => {
    try {
      setLoading(true);
      setError('');
      
      const result = await apiService.register(userData);
      
      if (result.success) {
        setUser(result.user);
        setSuccess(`Account created successfully! Welcome, ${result.user.firstName}!`);
        return { success: true };
      } else {
        setError(result.error || 'Registration failed');
        return { success: false, error: result.error };
      }
    } catch (error) {
      const errorMessage = 'Failed to create account';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      setUser(null);
      setSuccess('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if API call fails
      setUser(null);
    }
  };

  const handleCloseSnackbar = () => {
    setError('');
    setSuccess('');
  };

  const showError = (message) => {
    setError(message);
  };

  const showSuccess = (message) => {
    setSuccess(message);
  };

  const retryConnection = () => {
    initializeApp();
  };

  if (loading) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <LoadingScreen 
          message={backendStatus.checking ? "Connecting to backend..." : "Authenticating..."}
        />
      </ThemeProvider>
    );
  }

  // Show backend connection error
  if (!backendStatus.available) {
    return (
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Box
          sx={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #121212 100%)',
            padding: 2,
          }}
        >
          <Box
            sx={{
              textAlign: 'center',
              maxWidth: 500,
              padding: 4,
              backgroundColor: '#121212',
              borderRadius: 3,
              border: '1px solid #333',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
            }}
          >
            <Typography variant="h4" gutterBottom color="error">
              Backend Connection Failed
            </Typography>
            <Typography variant="body1" sx={{ mb: 3, color: '#e0e0e0' }}>
              Cannot connect to the LeepiAI Backend server. Please make sure it's running on port 3001.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button 
                variant="contained" 
                onClick={retryConnection}
                size="large"
              >
                Retry Connection
              </Button>
              <Button 
                variant="outlined" 
                onClick={() => window.electronAPI?.system.openExternal('http://localhost:3001')}
                size="large"
              >
                Open Backend URL
              </Button>
            </Box>
          </Box>
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <Box
        sx={{
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #121212 100%)',
        }}
      >
        {!user ? (
          <LoginScreen
            onLogin={handleLogin}
            onRegister={handleRegister}
            loading={loading}
          />
        ) : (
          <MainInterface
            user={user}
            onLogout={handleLogout}
            onError={showError}
            onSuccess={showSuccess}
          />
        )}

        {/* Global Notifications */}
        <Snackbar
          open={!!error}
          autoHideDuration={8000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Alert 
            onClose={handleCloseSnackbar} 
            severity="error" 
            variant="filled"
            sx={{ 
              width: '100%',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            {error}
          </Alert>
        </Snackbar>

        <Snackbar
          open={!!success}
          autoHideDuration={4000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Alert 
            onClose={handleCloseSnackbar} 
            severity="success" 
            variant="filled"
            sx={{ 
              width: '100%',
              fontSize: '0.95rem',
              fontWeight: 500,
            }}
          >
            {success}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  );
}

export default App; 