# LeepiAI Interview Recorder - Setup Guide

This guide will walk you through setting up the LeepiAI Interview Recorder from scratch.

## Prerequisites Checklist

Before starting, ensure you have the following installed:

- [ ] **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- [ ] **Python** (3.8 or higher) - [Download here](https://www.python.org/downloads/)
- [ ] **Git** - [Download here](https://git-scm.com/)
- [ ] **MongoDB** or **MongoDB Atlas** account
- [ ] **Google Cloud** account for Gemini API

## Step 1: Clone and Install

```bash
# Clone the repository
git clone https://github.com/your-org/leepi-interview-recorder.git
cd leepi-interview-recorder

# Install Node.js dependencies
npm install

# Install Python dependencies for audio processing (optional - fallback only)
pip install torch torchaudio openai-whisper pyannote.audio
# OR use the npm script:
npm run setup-python

# Verify your setup
npm run verify
```

## Step 2: Set Up Audio Dependencies

### macOS Setup
```bash
# Install Homebrew if you haven't already
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install SoX for audio processing
brew install sox

# Install BlackHole for system audio capture (optional but recommended)
brew install blackhole-2ch
```

### Windows Setup
1. **Download FFmpeg**:
   - Go to https://ffmpeg.org/download.html
   - Download the Windows build
   - Extract to `C:\ffmpeg`
   - Add `C:\ffmpeg\bin` to your system PATH

2. **Virtual Audio Cable** (optional):
   - Download from https://vac.muzychenko.net/en/
   - Install for system audio capture

### Linux Setup
```bash
# Update package list
sudo apt-get update

# Install audio dependencies
sudo apt-get install ffmpeg pulseaudio sox python3-pip

# Start PulseAudio if not running
pulseaudio --start
```

## Step 3: Database Setup

### Option A: MongoDB Atlas (Recommended)

1. **Create Account**:
   - Go to https://www.mongodb.com/atlas
   - Sign up for a free account

2. **Create Cluster**:
   - Click "Build a Database"
   - Choose "FREE" tier
   - Select a cloud provider and region
   - Create cluster (takes 1-3 minutes)

3. **Create Database User**:
   - Go to "Database Access"
   - Click "Add New Database User"
   - Create username and password
   - Set permissions to "Read and write to any database"

4. **Configure Network Access**:
   - Go to "Network Access"
   - Click "Add IP Address"
   - Choose "Allow Access from Anywhere" for development
   - (For production, use specific IP addresses)

5. **Get Connection String**:
   - Go to "Databases"
   - Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string

### Option B: Local MongoDB

```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Ubuntu/Debian
sudo apt-get install mongodb
sudo systemctl start mongodb

# Windows
# Download MongoDB Community Server from https://www.mongodb.com/try/download/community
# Follow installation wizard
```

## Step 4: Google Gemini API Setup

1. **Get API Key**:
   - Go to https://makersuite.google.com/app/apikey
   - Sign in with your Google account
   - Click "Create API Key"
   - Copy the generated key

2. **Enable Billing** (if needed):
   - Go to Google Cloud Console
   - Enable billing for your project
   - The Gemini API has a free tier

## Step 5: Environment Configuration

Create a `.env` file in the project root:

```env
# Required - MongoDB Connection
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/leepi-interview-recorder

# Required - JWT Secret (use a strong, unique value)
JWT_SECRET=your-super-secret-jwt-key-change-in-production-make-it-long-and-random

# Required - Google Gemini AI API Key
GEMINI_API_KEY=your-google-gemini-api-key-here

# Required - OpenAI API Key (for Whisper transcription)
OPENAI_API_KEY=your-openai-api-key-here

# Optional - Application Settings
NODE_ENV=development
APP_PORT=3000
DEBUG=leepi:*

# Optional - Audio Processing
AUDIO_SAMPLE_RATE=16000
MAX_AUDIO_DURATION=3600

# Optional - Security
BCRYPT_ROUNDS=12
SESSION_TIMEOUT=604800
```

**Important**: Never commit the `.env` file to version control!

## Step 6: Verify Setup

Before running the application, verify that everything is properly installed and configured:

```bash
npm run verify
```

This verification script will check:
- ✅ Node.js version compatibility
- ✅ Python installation (for fallback transcription)
- ✅ NPM dependencies
- ✅ OpenAI API connectivity (for Whisper transcription)
- ✅ Platform-specific audio dependencies (SoX/FFmpeg)
- ✅ Environment file configuration
- ✅ MongoDB connection
- ✅ Gemini AI API connectivity

**Example output:**
```
🔍 LeepiAI Interview Recorder - Setup Verification

Running setup verification checks...

Node.js                   ✅ Node.js v18.17.0 (✓ meets minimum requirement)
Python                    ✅ Python 3.9.7 (using 'python3' command)
NPM Dependencies          ✅ All key dependencies installed (5 checked)
Whisper Models            ✅ Whisper models directory found
Audio Dependencies        ✅ SoX found
Environment Configuration ✅ All required environment variables configured
MongoDB Connection        ✅ MongoDB connection successful
Gemini AI API            ✅ Gemini API connection successful

============================================================
Setup Verification Summary
============================================================
✅ Passed: 8
❌ Failed: 0

🎉 All checks passed! Your setup is ready.
```

If any checks fail, follow the provided instructions to fix them before proceeding.

## Step 7: First Run

```bash
# Start the application in development mode
npm run dev

# This will:
# 1. Start the React development server on http://localhost:3000
# 2. Launch the Electron app
# 3. Connect to MongoDB
# 4. Initialize AI services
```

## Step 7: Test the Setup

1. **Login/Register**:
   - Create a new account using the registration form
   - Or login with existing credentials

2. **Test Audio**:
   - Click "Start Recording" in the recording panel
   - Speak for a few seconds
   - Click "Stop Recording"
   - Wait for transcription to complete

3. **Test AI Features**:
   - Generate a summary of your test transcript
   - Try the AI chat feature
   - Generate an interview debrief

## Troubleshooting

### Common Issues and Solutions

**"Cannot find module 'electron'"**
```bash
npm install electron --save-dev
```

**"Python module not found"**
```bash
# Ensure Python is in PATH
python --version
pip --version

# Reinstall Python dependencies
pip install --upgrade torch torchaudio openai-whisper pyannote.audio
```

**"MongoDB connection failed"**
- Check your connection string in `.env`
- Verify network access in MongoDB Atlas
- Ensure MongoDB service is running (local installation)

**"Gemini API error"**
- Verify API key is correct
- Check API quotas in Google Cloud Console
- Ensure billing is enabled if needed

**"Audio recording failed"**
- Check microphone permissions
- Install platform-specific audio dependencies
- Verify audio devices are detected

**"Build failed"**
```bash
# Clear node modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Electron cache
npx electron-rebuild
```

### Development Tips

1. **Use Development Tools**:
   - React DevTools: Install browser extension
   - Electron DevTools: Automatically opened in dev mode

2. **Enable Verbose Logging**:
   ```bash
   DEBUG=leepi:* npm run dev
   ```

3. **Hot Reload**: 
   - React changes reload automatically
   - Electron main process changes require restart

4. **Testing Audio**:
   - Use short test recordings initially
   - Check browser console for errors
   - Monitor Python process output

## Production Deployment

### Building for Distribution

```bash
# Build React app
npm run build

# Create Electron distributables
npm run dist

# Platform-specific builds
npm run dist -- --mac
npm run dist -- --win
npm run dist -- --linux
```

### Security Checklist for Production

- [ ] Change JWT_SECRET to a strong, unique value
- [ ] Use MongoDB Atlas with authentication
- [ ] Enable MongoDB IP whitelisting
- [ ] Rotate API keys regularly
- [ ] Enable HTTPS for all connections
- [ ] Set up proper logging and monitoring
- [ ] Test on all target platforms

### Environment Variables for Production

```env
NODE_ENV=production
MONGODB_URI=mongodb+srv://prod-user:strong-password@prod-cluster.mongodb.net/leepi-production
JWT_SECRET=extremely-long-and-random-production-secret-key
GEMINI_API_KEY=production-gemini-api-key
DEBUG=leepi:error
```

## Getting Help

If you encounter issues not covered in this guide:

1. **Check the logs**: Enable DEBUG mode and check console output
2. **Search existing issues**: Look at GitHub issues for similar problems
3. **Create an issue**: Provide detailed error messages and system info
4. **Community support**: Use GitHub Discussions for questions

## Next Steps

Once setup is complete:

1. **Explore Features**: Try all the recording and AI analysis features
2. **Customize Settings**: Adjust audio quality and AI model settings
3. **Import Data**: If migrating from other tools
4. **Set Up Backups**: Configure regular transcript backups
5. **Train Team**: Share usage guidelines with your team

---

**Setup complete!** 🎉 You're ready to start recording and analyzing interviews with AI. 