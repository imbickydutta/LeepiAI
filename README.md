# LeepiAI Interview Recorder

> AI-powered interview recording and analysis application built with ElectronJS

## 🎯 Overview

LeepiAI Interview Recorder is a cross-platform desktop application that captures system audio, transcribes interviews using AI, and provides intelligent analysis through speaker diarization, summaries, and interactive chat features.

### Key Features

- **🎙️ System Audio Recording**: Capture both microphone input and system output
- **🤖 AI Transcription**: Powered by OpenAI Whisper for accurate speech-to-text
- **👥 Speaker Diarization**: Automatically distinguish between interviewer and interviewee
- **📝 AI Analysis**: Generate summaries and interview debriefs using Google Gemini
- **💬 Interactive Chat**: Ask questions about your transcripts with AI assistance
- **🌐 Cross-Platform**: Works on macOS, Windows, and Linux
- **☁️ Cloud Storage**: Store transcripts securely in MongoDB Atlas
- **📊 Export Options**: Export transcripts in TXT, Markdown, and JSON formats

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE                      │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Electron   │───▶│   React     │───▶│  Material   │     │
│  │    Main     │    │     UI      │    │     UI      │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Audio     │───▶│   Whisper   │───▶│  MongoDB    │     │
│  │  Capture    │    │Transcription│    │  Database   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
│         │                   │                   │           │
│         ▼                   ▼                   ▼           │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │ pyannote.   │    │   Gemini    │    │    User     │     │
│  │   audio     │    │     AI      │    │    Auth     │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher)
- **Python 3.8+** (for audio processing)
- **MongoDB** (local or Atlas)
- **Audio Dependencies**:
  - macOS: `brew install sox`
  - Windows: Download FFmpeg
  - Linux: `sudo apt-get install ffmpeg pulseaudio`

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/leepi-interview-recorder.git
   cd leepi-interview-recorder
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   npm run setup-python
   # or manually:
   pip install torch torchaudio openai-whisper pyannote.audio
   ```

4. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   MONGODB_URI=mongodb://localhost:27017/leepi-interview-recorder
   JWT_SECRET=your-super-secret-jwt-key-change-in-production
   GEMINI_API_KEY=your-google-gemini-api-key
   ```

5. **Start the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production build
   npm run build
   npm run start
   ```

## 🔧 Configuration

### MongoDB Setup

**Option 1: Local MongoDB**
```bash
# Install MongoDB locally
brew install mongodb-community  # macOS
# or follow MongoDB installation guide for your OS

# Start MongoDB
brew services start mongodb-community
```

**Option 2: MongoDB Atlas (Recommended)**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a cluster and get connection string
3. Update `MONGODB_URI` in your `.env` file

### Google Gemini API

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create an API key
3. Add it to your `.env` file as `GEMINI_API_KEY`

### Audio Setup

**macOS**
```bash
# Install SoX for audio processing
brew install sox

# For system audio capture, install BlackHole
brew install blackhole-2ch
```

**Windows**
1. Download and install [FFmpeg](https://ffmpeg.org/download.html)
2. Add FFmpeg to your system PATH
3. Optionally install Virtual Audio Cable for system audio

**Linux**
```bash
# Install audio dependencies
sudo apt-get update
sudo apt-get install ffmpeg pulseaudio sox
```

## 💡 Usage

### Recording Interviews

1. **Login** to your account or create a new one
2. **Start Recording** - Click the record button to begin capturing audio
3. **Conduct Interview** - Both sides of the conversation will be recorded
4. **Stop Recording** - Click stop when the interview is complete
5. **Wait for Processing** - AI will transcribe and analyze the audio

### AI Features

- **Summaries**: Generate AI-powered summaries of your interviews
- **Debriefs**: Get detailed performance analysis and feedback
- **Chat**: Ask questions about your transcripts using natural language
- **Export**: Download transcripts in multiple formats

### Speaker Diarization

The application automatically identifies:
- **Interviewer**: Questions and prompts
- **User/Interviewee**: Responses and answers

## 🔒 Security Best Practices

### Environment Security
- **Never commit `.env` files** to version control
- **Use strong JWT secrets** in production
- **Rotate API keys** regularly
- **Enable MongoDB authentication** in production

### Data Protection
- All transcripts are **encrypted in transit**
- User passwords are **hashed with bcrypt**
- **JWT tokens expire** after 7 days
- **Session cleanup** removes expired tokens

### Audio Privacy
- **Local processing** for sensitive interviews
- **Temporary files** are automatically cleaned up
- **No audio data** is sent to third parties without consent

## 🛠️ Development

### Project Structure
```
leepi-interview-recorder/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.js          # Entry point
│   │   ├── preload.js       # IPC bridge
│   │   └── services/        # Backend services
│   │       ├── AudioCaptureManager.js
│   │       ├── TranscriptionService.js
│   │       ├── DatabaseService.js
│   │       └── AIService.js
│   ├── components/          # React components
│   │   ├── LoginScreen.js
│   │   ├── MainInterface.js
│   │   ├── RecordingPanel.js
│   │   ├── TranscriptList.js
│   │   ├── TranscriptViewer.js
│   │   └── AIChat.js
│   └── App.js              # Main React app
├── public/                 # Static assets
├── package.json           # Dependencies
└── README.md             # This file
```

### Available Scripts

- `npm start` - Start production build
- `npm run dev` - Start development mode
- `npm run build` - Build for production
- `npm run dist` - Create distributables
- `npm run setup-python` - Install Python dependencies

### Building for Distribution

```bash
# Build the React app
npm run build

# Create platform-specific distributables
npm run dist

# Output will be in the dist/ folder
```

## 🔧 Troubleshooting

### Common Issues

**Audio not recording**
- Check microphone permissions
- Verify audio devices are detected
- Install platform-specific audio dependencies

**Transcription fails**
- Ensure Python dependencies are installed
- Check internet connection for Whisper model download
- Verify audio file is not corrupted

**AI features not working**
- Verify `GEMINI_API_KEY` is set correctly
- Check API quota and billing
- Ensure internet connectivity

**Database connection fails**
- Verify MongoDB is running (local) or connection string (Atlas)
- Check network connectivity
- Validate database credentials

### Debug Mode

Enable verbose logging:
```bash
# Set environment variable
DEBUG=leepi:* npm run dev

# Or add to your .env file
DEBUG=leepi:*
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit a pull request

### Development Guidelines

- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Ensure cross-platform compatibility

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙋 Support

- **Documentation**: Check this README and inline comments
- **Issues**: Create an issue on GitHub for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas

## 🔮 Roadmap

- [ ] Real-time transcription during recording
- [ ] Multiple language support
- [ ] Advanced speaker recognition
- [ ] Integration with calendar applications
- [ ] Video recording capabilities
- [ ] Team collaboration features
- [ ] Advanced analytics dashboard

## 🏆 Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) for speech recognition
- [pyannote.audio](https://github.com/pyannote/pyannote-audio) for speaker diarization
- [Google Gemini](https://ai.google.com/) for AI analysis
- [Electron](https://www.electronjs.org/) for cross-platform development
- [Material-UI](https://mui.com/) for the user interface

---

**Made with ❤️ by the LeepiAI Team** 