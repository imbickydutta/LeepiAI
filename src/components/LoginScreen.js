import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Tab,
  Tabs,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Email,
  Person,
  Lock,
  RecordVoiceOver,
} from '@mui/icons-material';

function TabPanel({ children, value, index, ...other }) {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`auth-tabpanel-${index}`}
      aria-labelledby={`auth-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

function LoginScreen({ onLogin, onRegister, loading }) {
  const [tabValue, setTabValue] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Login form state
  const [loginData, setLoginData] = useState({
    email: '',
    password: '',
  });
  
  // Register form state
  const [registerData, setRegisterData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  
  const [errors, setErrors] = useState({});

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    setErrors({});
  };

  const handleLoginChange = (field) => (event) => {
    setLoginData({
      ...loginData,
      [field]: event.target.value
    });
    if (errors[field]) {
      setErrors({
        ...errors,
        [field]: ''
      });
    }
  };

  const handleRegisterChange = (field) => (event) => {
    setRegisterData({
      ...registerData,
      [field]: event.target.value
    });
    if (errors[field]) {
      setErrors({
        ...errors,
        [field]: ''
      });
    }
  };

  const validateLogin = () => {
    const newErrors = {};
    
    if (!loginData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(loginData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!loginData.password) {
      newErrors.password = 'Password is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRegister = () => {
    const newErrors = {};
    
    if (!registerData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }
    
    if (!registerData.lastName.trim()) {
      newErrors.lastName = 'Last name is required';
    }
    
    if (!registerData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(registerData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    
    if (!registerData.password) {
      newErrors.password = 'Password is required';
    } else if (registerData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }
    
    if (registerData.password !== registerData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateLogin()) return;
    
    const result = await onLogin({
      email: loginData.email.trim(),
      password: loginData.password
    });
    
    if (!result.success && result.error) {
      setErrors({ submit: result.error });
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    
    if (!validateRegister()) return;
    
    const result = await onRegister({
      firstName: registerData.firstName.trim(),
      lastName: registerData.lastName.trim(),
      email: registerData.email.trim(),
      password: registerData.password
    });
    
    if (!result.success && result.error) {
      setErrors({ submit: result.error });
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        padding: 2,
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 450,
          background: 'linear-gradient(145deg, #1e1e1e 0%, #2a2a2a 100%)',
          border: '1px solid #333',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Header */}
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <RecordVoiceOver 
              sx={{ 
                fontSize: 48, 
                color: 'primary.main',
                mb: 1
              }} 
            />
            <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
              LeepiAI
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Interview Recorder & AI Analysis
            </Typography>
          </Box>

          {/* Tabs */}
          <Tabs
            value={tabValue}
            onChange={handleTabChange}
            sx={{
              mb: 2,
              '& .MuiTabs-indicator': {
                background: 'linear-gradient(45deg, #00bcd4, #4dd0e1)',
                height: 3,
              },
            }}
          >
            <Tab label="Sign In" sx={{ flex: 1, fontWeight: 500 }} />
            <Tab label="Sign Up" sx={{ flex: 1, fontWeight: 500 }} />
          </Tabs>

          {/* Error Message */}
          {errors.submit && (
            <Box
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 1,
                backgroundColor: 'error.dark',
                border: '1px solid',
                borderColor: 'error.main',
              }}
            >
              <Typography variant="body2" color="error.light">
                {errors.submit}
              </Typography>
            </Box>
          )}

          {/* Login Tab */}
          <TabPanel value={tabValue} index={0}>
            <form onSubmit={handleLoginSubmit}>
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={loginData.email}
                onChange={handleLoginChange('email')}
                error={!!errors.email}
                helperText={errors.email}
                disabled={loading}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
              
              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={loginData.password}
                onChange={handleLoginChange('password')}
                error={!!errors.password}
                helperText={errors.password}
                disabled={loading}
                sx={{ mb: 3 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        sx={{ color: 'text.secondary' }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  py: 1.5,
                  fontWeight: 600,
                  fontSize: '1rem',
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>
          </TabPanel>

          {/* Register Tab */}
          <TabPanel value={tabValue} index={1}>
            <form onSubmit={handleRegisterSubmit}>
              <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <TextField
                  fullWidth
                  label="First Name"
                  value={registerData.firstName}
                  onChange={handleRegisterChange('firstName')}
                  error={!!errors.firstName}
                  helperText={errors.firstName}
                  disabled={loading}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Person sx={{ color: 'text.secondary' }} />
                      </InputAdornment>
                    ),
                  }}
                />
                
                <TextField
                  fullWidth
                  label="Last Name"
                  value={registerData.lastName}
                  onChange={handleRegisterChange('lastName')}
                  error={!!errors.lastName}
                  helperText={errors.lastName}
                  disabled={loading}
                />
              </Box>
              
              <TextField
                fullWidth
                label="Email"
                type="email"
                value={registerData.email}
                onChange={handleRegisterChange('email')}
                error={!!errors.email}
                helperText={errors.email}
                disabled={loading}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                }}
              />
              
              <TextField
                fullWidth
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={registerData.password}
                onChange={handleRegisterChange('password')}
                error={!!errors.password}
                helperText={errors.password}
                disabled={loading}
                sx={{ mb: 2 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword(!showPassword)}
                        edge="end"
                        sx={{ color: 'text.secondary' }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <TextField
                fullWidth
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={registerData.confirmPassword}
                onChange={handleRegisterChange('confirmPassword')}
                error={!!errors.confirmPassword}
                helperText={errors.confirmPassword}
                disabled={loading}
                sx={{ mb: 3 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Lock sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        edge="end"
                        sx={{ color: 'text.secondary' }}
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{
                  py: 1.5,
                  fontWeight: 600,
                  fontSize: '1rem',
                }}
              >
                {loading ? (
                  <CircularProgress size={24} color="inherit" />
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>
          </TabPanel>
        </CardContent>
      </Card>
    </Box>
  );
}

export default LoginScreen; 