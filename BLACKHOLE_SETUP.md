# BlackHole Setup Guide for LeepiAI

## 📋 What is BlackHole?

BlackHole is a modern virtual audio driver that allows you to pass audio between applications with zero additional latency. For LeepiAI, it enables us to capture system audio (like Zoom, Teams, or any other application audio) separately from your microphone.

## 🔧 Installation

BlackHole has been installed via Homebrew:
```bash
brew install blackhole-2ch
```

**⚠️ IMPORTANT: You must reboot your Mac for BlackHole to take effect!**

## ⚙️ Configuration Steps

### Step 1: Reboot Your Mac
After installation, restart your computer to activate the BlackHole driver.

### Step 2: Verify BlackHole Installation
1. Open **System Preferences** → **Sound**
2. Check both **Output** and **Input** tabs
3. You should see "BlackHole 2ch" in both lists

### Step 3: Create Multi-Output Device (Recommended)
1. Open **Applications** → **Utilities** → **Audio MIDI Setup**
2. Click the **"+"** button (bottom left) → **Create Multi-Output Device**
3. Name it "BlackHole + Speakers"
4. Check both:
   - ✅ **Built-in Output** (so you can hear audio)
   - ✅ **BlackHole 2ch** (so LeepiAI can capture it)
5. Set **Built-in Output** as the master device (clock source)

### Step 4: Configure System Audio Output
1. Go to **System Preferences** → **Sound** → **Output**
2. Select **"BlackHole + Speakers"** (or just "BlackHole 2ch" if you don't mind not hearing system audio)

### Step 5: Test the Setup
1. Play some music or video
2. You should still hear the audio through your speakers/headphones
3. Open LeepiAI and start recording
4. The system audio should now be captured in the "SYS" channel

## 🎙️ How It Works with LeepiAI

### Recording Sources:
- **MIC Channel**: Your microphone input (can be muted during recording)
- **SYS Channel**: System audio routed through BlackHole (Zoom, music, etc.)

### During Interview Recording:
1. Set your video call app (Zoom, Teams, etc.) to use **default output**
2. Your voice goes to the microphone → **MIC** channel
3. Remote participant's voice goes through system audio → BlackHole → **SYS** channel
4. LeepiAI captures both streams separately and merges them with timestamps

## 🔧 Troubleshooting

### BlackHole Not Appearing in Audio Devices
- **Solution**: Reboot your Mac (this is required after installation)

### No System Audio Being Captured
1. Check that your system output is set to "BlackHole + Speakers" or "BlackHole 2ch"
2. Verify the multi-output device is configured correctly
3. Test by playing music and checking if LeepiAI captures it

### Can't Hear System Audio
- **Solution**: Use the Multi-Output Device setup (Step 3) to route audio to both your speakers and BlackHole

### Audio Quality Issues
- Keep BlackHole sample rate at 48kHz (default)
- Ensure all devices in Audio MIDI Setup use the same sample rate

## 🎯 Quick Setup for Interviews

### Before Each Interview:
1. **System Output**: Set to "BlackHole + Speakers"
2. **Interview App**: Use default audio settings
3. **LeepiAI**: Start dual recording
4. **Microphone**: Can be muted/unmuted during recording without affecting system audio capture

### Optimal Settings:
- **Zoom/Teams Output**: Default or Built-in Output
- **Zoom/Teams Input**: Your microphone
- **System Output**: BlackHole + Speakers
- **LeepiAI**: Will automatically detect and use BlackHole for system audio

## 📊 Expected Results

With proper setup, your LeepiAI transcripts will show:
```
MIC [0.5s]: Hello, can you hear me?
SYS [2.1s]: Yes, I can hear you clearly!
MIC [4.3s]: Great, let's begin the interview.
SYS [6.8s]: Perfect, I'm ready.
```

Where:
- **MIC**: Your voice from the microphone
- **SYS**: Remote participant's voice from system audio

## 🆘 Need Help?

If you encounter issues:
1. Check that BlackHole appears in System Preferences → Sound
2. Verify the Multi-Output Device is created and selected
3. Test with music/video before starting an interview
4. Restart LeepiAI if audio devices don't appear correctly

---

🎉 **You're all set!** BlackHole will enable professional-quality dual-stream audio recording for your interviews. 