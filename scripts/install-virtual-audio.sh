#!/bin/bash

# LeepiAI Virtual Audio Setup Script
# Automatically installs the best virtual audio solution for your platform

set -e

echo "🎙️ LeepiAI Virtual Audio Setup"
echo "================================"

# Detect operating system
OS="$(uname)"
DISTRO=""

if [[ "$OS" == "Darwin" ]]; then
    PLATFORM="macOS"
elif [[ "$OS" == "Linux" ]]; then
    PLATFORM="Linux"
    # Detect Linux distribution
    if command -v apt-get &> /dev/null; then
        DISTRO="debian"
    elif command -v yum &> /dev/null; then
        DISTRO="redhat"
    elif command -v pacman &> /dev/null; then
        DISTRO="arch"
    fi
elif [[ "$OS" == MINGW* ]] || [[ "$OS" == MSYS* ]] || [[ "$OS" == CYGWIN* ]]; then
    PLATFORM="Windows"
else
    echo "❌ Unsupported operating system: $OS"
    exit 1
fi

echo "🔍 Detected platform: $PLATFORM"

# Platform-specific installation
case $PLATFORM in
    "macOS")
        echo "📦 Installing BlackHole for macOS..."
        
        # Check if Homebrew is installed
        if ! command -v brew &> /dev/null; then
            echo "❌ Homebrew not found. Please install Homebrew first:"
            echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
        
        # Install BlackHole
        brew install blackhole-2ch
        
        echo "✅ BlackHole installed successfully!"
        echo ""
        echo "⚠️  IMPORTANT: You must REBOOT your Mac for BlackHole to work!"
        echo ""
        echo "📋 Next steps:"
        echo "1. Reboot your Mac"
        echo "2. Open Audio MIDI Setup"
        echo "3. Create Multi-Output Device (Built-in Output + BlackHole 2ch)"
        echo "4. Set as system default output"
        echo ""
        echo "📖 Detailed guide: BLACKHOLE_SETUP.md"
        ;;
        
    "Linux")
        echo "📦 Setting up PulseAudio virtual devices for Linux..."
        
        case $DISTRO in
            "debian")
                # Ubuntu/Debian
                echo "🔧 Installing PulseAudio utilities..."
                sudo apt update
                sudo apt install -y pulseaudio pulseaudio-utils pavucontrol
                ;;
            "redhat")
                # RHEL/CentOS/Fedora
                echo "🔧 Installing PulseAudio utilities..."
                sudo yum install -y pulseaudio pulseaudio-utils pavucontrol
                ;;
            "arch")
                # Arch Linux
                echo "🔧 Installing PulseAudio utilities..."
                sudo pacman -S --noconfirm pulseaudio pulseaudio-alsa pavucontrol
                ;;
            *)
                echo "⚠️  Unknown Linux distribution. Please install PulseAudio manually."
                ;;
        esac
        
        # Create virtual audio device
        echo "🎛️ Creating virtual audio device..."
        
        # Add to PulseAudio config
        PULSE_CONFIG="$HOME/.config/pulse/default.pa"
        mkdir -p "$(dirname "$PULSE_CONFIG")"
        
        # Create or append to PulseAudio config
        cat >> "$PULSE_CONFIG" << 'EOF'

# LeepiAI Virtual Audio Device
load-module module-null-sink sink_name=leepi_virtual sink_properties=device.description="LeepiAI_Virtual_Output"
load-module module-loopback source=leepi_virtual.monitor sink=@DEFAULT_SINK@

EOF
        
        # Restart PulseAudio
        pulseaudio --kill 2>/dev/null || true
        sleep 2
        pulseaudio --start
        
        echo "✅ Linux virtual audio setup complete!"
        echo ""
        echo "📋 Next steps:"
        echo "1. Set 'LeepiAI Virtual Output' as default output in sound settings"
        echo "2. Or use pavucontrol to route specific applications"
        echo "3. Start LeepiAI recording"
        echo ""
        echo "🎛️ GUI Control: Run 'pavucontrol' to manage audio routing"
        ;;
        
    "Windows")
        echo "📦 Windows virtual audio setup..."
        echo ""
        echo "⚠️  Automatic installation not available for Windows."
        echo "    Please follow manual installation steps:"
        echo ""
        echo "🔗 Option 1: VB-CABLE (Recommended)"
        echo "   Download: https://vb-audio.com/Cable/"
        echo "   1. Download VBCABLE_Setup_x64.exe"
        echo "   2. Run as Administrator"
        echo "   3. Reboot Windows"
        echo "   4. Set 'CABLE Input' as default output"
        echo ""
        echo "🔗 Option 2: VoiceMeeter (Advanced)"
        echo "   Download: https://vb-audio.com/Voicemeeter/"
        echo "   1. Download VoiceMeeter Banana"
        echo "   2. Install and reboot"
        echo "   3. Configure audio routing"
        echo ""
        echo "📖 Detailed guide: VIRTUAL_AUDIO_SETUP.md"
        ;;
esac

echo ""
echo "🎉 Setup complete for $PLATFORM!"
echo ""
echo "🧪 Test your setup:"
echo "1. Play music/video"
echo "2. Start LeepiAI dual recording"
echo "3. Check that 'SYS' channel captures system audio"
echo ""
echo "📚 Full documentation: VIRTUAL_AUDIO_SETUP.md" 