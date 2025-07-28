import React from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { RecordVoiceOver } from '@mui/icons-material';

function LoadingScreen({ message = 'Loading application...' }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        color: 'white',
        gap: 3,
      }}
    >
      <RecordVoiceOver 
        sx={{ 
          fontSize: 64, 
          color: 'primary.main',
          animation: 'pulse 2s ease-in-out infinite',
          '@keyframes pulse': {
            '0%': {
              transform: 'scale(1)',
              opacity: 1,
            },
            '50%': {
              transform: 'scale(1.1)',
              opacity: 0.7,
            },
            '100%': {
              transform: 'scale(1)',
              opacity: 1,
            },
          },
        }} 
      />
      
      <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
        LeepiAI Interview Recorder
      </Typography>
      
      <CircularProgress 
        size={40} 
        thickness={4}
        sx={{ 
          color: 'primary.main',
          mb: 2,
        }} 
      />
      
      <Typography variant="body1" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}

export default LoadingScreen; 