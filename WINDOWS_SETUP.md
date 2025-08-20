# Windows Audio Setup Guide

This guide will help you set up audio recording on Windows for the LeepiAI application.

## Prerequisites

### 1. Install SoX (Sound eXchange)

SoX is required for audio recording on Windows.

**Download and Install:**
1. Go to: https://sourceforge.net/projects/sox/files/sox/
2. Download the latest Windows version (e.g., `sox-14.4.2-win32.exe`)
3. Run the installer
4. **Important:** Make sure to check "Add to PATH" during installation
5. Restart your computer after installation

**Verify Installation:**
- Open Command Prompt
- Type: `sox --version`
- You should see version information

### 2. Enable Stereo Mix (Virtual Audio Device)

Stereo Mix allows recording system audio on Windows.

**Enable Stereo Mix:**
1. Right-click the speaker icon in the taskbar
2. Select "Open Sound settings"
3. Click "Sound Control Panel" (under Related Settings)
4. Go to the "Recording" tab
5. Right-click in empty space
6. Select "Show Disabled Devices"
7. Right-click "Stereo Mix"
8. Select "Enable"
9. Right-click "Stereo Mix" again
10. Select "Set as Default Device" (optional)

**Alternative Method (if Stereo Mix is not available):**
1. Right-click the speaker icon in the taskbar
2. Select "Open Sound settings"
3. Click "Sound Control Panel"
4. Go to "Recording" tab
5. Right-click in empty space
6. Select "Show Disabled Devices"
7. Look for "What U Hear" (Creative Sound Blaster) or similar
8. Enable the available virtual audio device

## Testing the Setup

### 1. Test Microphone Recording
- Open the LeepiAI application
- Go to Settings > Audio Devices
- Verify your microphone is detected
- Try a short recording to test microphone input

### 2. Test System Audio Recording
- Play some audio on your computer (music, video, etc.)
- Start a recording in LeepiAI
- Check if system audio is captured in the transcript

## Troubleshooting

### SoX Not Found
**Error:** "SoX not found on Windows"
**Solution:**
1. Reinstall SoX and ensure "Add to PATH" is checked
2. Restart your computer
3. Open Command Prompt and verify: `sox --version`

### No System Audio
**Problem:** Only microphone audio is recorded
**Solutions:**
1. Enable Stereo Mix (see steps above)
2. Try alternative virtual audio devices
3. Check Windows privacy settings for microphone access
4. Ensure no other applications are using the audio device

### Recording Quality Issues
**Problem:** Poor audio quality or noise
**Solutions:**
1. Check microphone levels in Windows Sound settings
2. Ensure microphone is set as default input device
3. Close other applications that might be using audio
4. Check for audio drivers updates

### Permission Issues
**Problem:** "Access denied" or permission errors
**Solutions:**
1. Run LeepiAI as Administrator
2. Check Windows privacy settings
3. Allow microphone access in Windows settings
4. Disable antivirus temporarily to test

## Advanced Configuration

### Custom Audio Devices
If you have multiple audio devices, you can configure them:

1. Open Windows Sound settings
2. Go to "Sound Control Panel"
3. Set your preferred devices as default
4. Restart LeepiAI

### Audio Quality Settings
The application uses these default settings:
- Sample Rate: 6kHz (efficient for speech recognition, reduced from 16kHz)
- Channels: 1 (mono) for microphone, 2 (stereo) for system audio
- Format: WAV (uncompressed for best quality)

## Platform Differences

### Windows vs macOS
- **Windows:** Uses SoX + Stereo Mix for system audio
- **macOS:** Uses BlackHole for system audio
- **Linux:** Uses PulseAudio for system audio

### Recording Capabilities
- **Microphone:** Works on all platforms
- **System Audio:** 
  - Windows: Requires Stereo Mix or similar virtual device
  - macOS: Requires BlackHole
  - Linux: Requires PulseAudio configuration

## Support

If you continue to have issues:

1. Check the application logs for error messages
2. Verify all prerequisites are installed
3. Test with a different microphone if available
4. Contact support with specific error messages

## Notes

- The application automatically detects your platform and adjusts settings
- Segmented recording (1-minute chunks) works the same on all platforms
- File sizes are optimized for Whisper transcription
- Temporary files are automatically cleaned up 