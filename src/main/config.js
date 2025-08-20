// Audio configuration for Electron main process
const path = require('path');
const fs = require('fs-extra');

// Try to read from .env file if it exists
let envConfig = {};
try {
  const envPath = path.join(__dirname, '../../.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value && !key.startsWith('#')) {
        envConfig[key.trim()] = value.trim();
      }
    });
  }
} catch (error) {
  console.warn('⚠️ Failed to load .env file:', error.message);
}

// Audio configuration with environment variable fallback
const audioConfig = {
  // Use 16kHz for recording (hardware supported), then downsample to 6kHz
  sampleRate: parseInt(envConfig.REACT_APP_AUDIO_SAMPLE_RATE || envConfig.AUDIO_SAMPLE_RATE || '16000', 10),
  channels: parseInt(envConfig.REACT_APP_AUDIO_CHANNELS || envConfig.AUDIO_CHANNELS || '1', 10),
  threshold: parseFloat(envConfig.REACT_APP_AUDIO_THRESHOLD || envConfig.AUDIO_THRESHOLD || '0.5'),
  silence: parseFloat(envConfig.REACT_APP_AUDIO_SILENCE || envConfig.AUDIO_SILENCE || '2.0'),
  segmentDuration: parseInt(envConfig.RECORDING_SEGMENT_DURATION || '60', 10)
};

console.log('🔧 Audio config:', {
  sampleRate: audioConfig.sampleRate + 'Hz',
  channels: audioConfig.channels
});

module.exports = audioConfig; 