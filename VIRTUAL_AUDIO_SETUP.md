# Virtual Audio Setup Guide for LeepiAI

This guide covers setting up virtual audio devices for dual-stream recording (microphone + system audio) on all platforms.

---

## 🍎 macOS - BlackHole

### Installation
```bash
brew install blackhole-2ch
```

### Setup
1. **Reboot** your Mac after installation
2. Open **Audio MIDI Setup** → Create **Multi-Output Device**
3. Include: **Built-in Output** + **BlackHole 2ch**
4. Set system output to the multi-output device

### Benefits
- ✅ Zero latency
- ✅ Professional quality
- ✅ Easy setup
- ✅ Free and open source

**📖 Detailed Guide**: See `BLACKHOLE_SETUP.md`

---

## 🪟 Windows - Virtual Audio Cable

### Option 1: VB-CABLE (Free)
**Download**: https://vb-audio.com/Cable/

1. **Download** VB-CABLE from official website
2. **Extract** and run `VBCABLE_Setup_x64.exe` as **Administrator**
3. **Reboot** Windows
4. **Configure**:
   - Go to **Sound Settings** → **Manage sound devices**
   - Set **CABLE Input** as default output device
   - Applications will play through CABLE, LeepiAI captures from CABLE Output

### Option 2: VoiceMeeter (Advanced, Free)
**Download**: https://vb-audio.com/Voicemeeter/

1. **Download** VoiceMeeter Banana (recommended)
2. **Install** and reboot
3. **Configure**:
   - Hardware Out A1: Your speakers/headphones
   - Hardware Input 1: Your microphone
   - Set VoiceMeeter Input as default output device
   - Route audio through VoiceMeeter for capture

### Option 3: OBS Virtual Audio (Free)
**Requirements**: OBS Studio installed

1. **Install** OBS Studio
2. **Add** Audio Output Capture source
3. **Start Virtual Camera** (includes audio)
4. Use OBS audio monitoring for system audio capture

### Windows Commands for LeepiAI:
```bash
# For VB-CABLE
ffmpeg -f dshow -i audio="CABLE Output (VB-Audio Virtual Cable)" ...

# For VoiceMeeter
ffmpeg -f dshow -i audio="VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)" ...
```

---

## 🐧 Linux - PulseAudio Virtual Devices

### Option 1: PulseAudio Null Sink (Built-in)
```bash
# Create virtual audio device
pacmd load-module module-null-sink sink_name=virtual1
pacmd load-module module-loopback source=virtual1.monitor sink=alsa_output.pci-0000_00_1b.0.analog-stereo

# Set as default output
pacmd set-default-sink virtual1

# Applications → virtual1 → Your speakers + LeepiAI capture
```

### Option 2: JACK Audio (Professional)
```bash
# Install JACK
sudo apt install jackd2 pulseaudio-module-jack

# Start JACK daemon
jackd -dalsa -dhw:0 -r48000 -p1024 -n2

# Use qjackctl for GUI management
sudo apt install qjackctl
```

### Option 3: PipeWire (Modern Alternative)
```bash
# Install PipeWire (available on newer distributions)
sudo apt install pipewire pipewire-pulse

# Create virtual devices using PipeWire
pw-loopback -P "Virtual Output" -C "Virtual Input"
```

### Linux Commands for LeepiAI:
```bash
# Capture from PulseAudio monitor
ffmpeg -f pulse -i virtual1.monitor -ar 16000 -ac 1 system_audio.wav

# Capture from ALSA
ffmpeg -f alsa -i hw:CARD=virtual,DEV=0 -ar 16000 -ac 1 system_audio.wav
```

---

## 🎛️ Platform Comparison

| Platform | Solution | Complexity | Quality | Cost |
|----------|----------|------------|---------|------|
| **macOS** | BlackHole | Easy | Excellent | Free |
| **Windows** | VB-CABLE | Medium | Good | Free |
| **Windows** | VoiceMeeter | Advanced | Excellent | Free |
| **Linux** | PulseAudio | Medium | Good | Free |
| **Linux** | JACK | Advanced | Excellent | Free |

---

## 🚀 Quick Platform Detection

LeepiAI automatically detects and uses the best available virtual audio device:

### macOS Detection Order:
1. BlackHole 2ch
2. SoundFlower
3. Loopback
4. Any virtual device

### Windows Detection Order:
1. VB-CABLE Output
2. VoiceMeeter Output
3. OBS Virtual Audio
4. Any DirectShow virtual device

### Linux Detection Order:
1. PulseAudio null sink monitor
2. JACK virtual devices
3. PipeWire virtual devices
4. ALSA virtual devices

---

## 📋 Testing Your Setup

### Test System Audio Capture:
1. **Install** virtual audio device for your platform
2. **Configure** system output to route through virtual device
3. **Play music/video**
4. **Start LeepiAI recording**
5. **Check** that "SYS" channel captures the audio

### Expected LeepiAI Output:
```
MIC [0.5s]: Testing microphone
SYS [2.1s]: Testing system audio from music/video
MIC [4.2s]: Both channels working!
```

---

## 🔧 Troubleshooting

### Common Issues:

**No System Audio Captured**
- ✅ Verify virtual device is installed and active
- ✅ Check that system output routes through virtual device
- ✅ Test with music/video before interview
- ✅ Restart LeepiAI after configuring audio

**Poor Audio Quality**
- ✅ Match sample rates (16kHz for LeepiAI compatibility)
- ✅ Use uncompressed audio routing
- ✅ Check virtual device buffer settings

**Lag/Latency Issues**
- ✅ Use ASIO drivers on Windows (VoiceMeeter)
- ✅ Reduce buffer sizes in virtual audio software
- ✅ Close unnecessary applications

**Can't Hear System Audio**
- ✅ Set up audio passthrough/monitoring
- ✅ Use multi-output routing (like BlackHole + Speakers)
- ✅ Configure virtual audio software properly

---

## 🎯 Recommended Setups

### For Interviews:
- **macOS**: BlackHole + Multi-Output Device
- **Windows**: VB-CABLE or VoiceMeeter Banana
- **Linux**: PulseAudio null sink with loopback

### For Professional Use:
- **macOS**: BlackHole
- **Windows**: VoiceMeeter Banana + ASIO
- **Linux**: JACK Audio Connection Kit

### For Simple Setup:
- **macOS**: BlackHole (easiest)
- **Windows**: VB-CABLE (one download)
- **Linux**: PulseAudio null sink (built-in)

---

## 📞 Platform-Specific Interview Setup

### macOS (BlackHole):
1. System Output → "BlackHole + Speakers"
2. Zoom/Teams → Default output
3. LeepiAI → Auto-detects BlackHole

### Windows (VB-CABLE):
1. System Output → "CABLE Input"
2. Enable "Listen to this device" on CABLE Input → Your speakers
3. LeepiAI → Captures from "CABLE Output"

### Linux (PulseAudio):
1. System Output → virtual1 sink
2. Loopback virtual1 → physical speakers
3. LeepiAI → Captures from virtual1.monitor

---

🎉 **You're ready for professional dual-stream recording on any platform!** 