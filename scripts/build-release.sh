#!/bin/bash

# LeepiAI Release Build Script
# Builds distributable packages for all platforms

set -e

echo "🚀 LeepiAI Release Build Script"
echo "==============================="

# Get version from package.json
VERSION=$(node -p "require('./package.json').version")
echo "📦 Building version: $VERSION"

# Detect current platform
OS="$(uname)"
if [[ "$OS" == "Darwin" ]]; then
    CURRENT_PLATFORM="macOS"
elif [[ "$OS" == "Linux" ]]; then
    CURRENT_PLATFORM="Linux"
elif [[ "$OS" == MINGW* ]] || [[ "$OS" == MSYS* ]] || [[ "$OS" == CYGWIN* ]]; then
    CURRENT_PLATFORM="Windows"
else
    CURRENT_PLATFORM="Unknown"
fi

echo "🔍 Current platform: $CURRENT_PLATFORM"

# Parse command line arguments
BUILD_TARGET="current"
SKIP_TESTS=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            BUILD_TARGET="$2"
            shift 2
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --help)
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --target TARGET    Build target: current, mac, win, linux, all"
            echo "  --skip-tests       Skip verification tests"
            echo "  --help            Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                 # Build for current platform"
            echo "  $0 --target mac    # Build macOS packages"
            echo "  $0 --target all    # Build for all platforms"
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Pre-build checks
echo ""
echo "🔍 Pre-build checks..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if build directory exists (React build)
if [ ! -d "build" ]; then
    echo "⚛️ Building React app..."
    npm run build
fi

# Run verification tests (unless skipped)
if [ "$SKIP_TESTS" = false ]; then
    echo "🧪 Running verification tests..."
    npm run verify
fi

# Check for required build resources
echo "🎨 Checking build resources..."
if [ ! -f "build-resources/icon.png" ] || [ ! -s "build-resources/icon.png" ]; then
    echo "⚠️  Warning: App icon not found or empty. Using placeholder."
    echo "   Create a 1024x1024 icon and save as build-resources/icon.png"
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist/

# Build packages based on target
echo ""
echo "🏗️ Building packages..."

case $BUILD_TARGET in
    "current")
        echo "📦 Building for current platform ($CURRENT_PLATFORM)..."
        npm run dist
        ;;
    "mac"|"macos")
        echo "🍎 Building macOS packages..."
        npm run dist-mac
        ;;
    "win"|"windows")
        echo "🪟 Building Windows packages..."
        npm run dist-win
        ;;
    "linux")
        echo "🐧 Building Linux packages..."
        npm run dist-linux
        ;;
    "all")
        echo "🌍 Building for all platforms..."
        npm run dist-all
        ;;
    *)
        echo "❌ Invalid target: $BUILD_TARGET"
        echo "Valid targets: current, mac, win, linux, all"
        exit 1
        ;;
esac

# Display results
echo ""
echo "✅ Build completed successfully!"
echo ""
echo "📦 Generated packages:"

if [ -d "dist" ]; then
    # List all files in dist directory with sizes
    find dist -type f -name "*.dmg" -o -name "*.pkg" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.tar.gz" | while read -r file; do
        size=$(du -h "$file" | cut -f1)
        echo "  📄 $(basename "$file") - $size"
    done
else
    echo "  ❌ No packages found in dist/ directory"
fi

# Calculate total size
if [ -d "dist" ]; then
    total_size=$(du -sh dist/ | cut -f1)
    echo ""
    echo "📊 Total package size: $total_size"
fi

# Display next steps
echo ""
echo "🎯 Next steps:"
echo "  1. Test installers on clean systems"
echo "  2. Upload to your distribution platform"
echo "  3. Update download links and documentation"
echo ""

# Platform-specific distribution notes
case $CURRENT_PLATFORM in
    "macOS")
        echo "🍎 macOS Distribution Notes:"
        echo "  • DMG files: Drag & drop installation"
        echo "  • PKG files: Traditional installer"
        echo "  • For App Store: Use Xcode or Application Loader"
        echo "  • Code signing: Set CSC_LINK and CSC_KEY_PASSWORD env vars"
        ;;
    "Linux")
        echo "🐧 Linux Distribution Notes:"
        echo "  • AppImage: Universal, no installation required"
        echo "  • DEB: For Debian/Ubuntu: dpkg -i package.deb"
        echo "  • RPM: For RedHat/Fedora: rpm -i package.rpm"
        echo "  • Upload to Flathub, Snap Store, or AUR"
        ;;
    "Windows")
        echo "🪟 Windows Distribution Notes:"
        echo "  • EXE Setup: Full installer with uninstaller"
        echo "  • Portable EXE: No installation required"
        echo "  • For Microsoft Store: Use Partner Center"
        echo "  • Code signing recommended to avoid SmartScreen warnings"
        ;;
esac

echo ""
echo "📚 Full documentation: BUILD_DISTRIBUTION.md"
echo "🎉 Happy distributing!" 