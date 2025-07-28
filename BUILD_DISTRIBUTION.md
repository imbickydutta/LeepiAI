# LeepiAI Distribution Guide

This guide explains how to build distributable packages of LeepiAI for macOS, Windows, and Linux.

---

## 📋 Prerequisites

### Required Tools:
- **Node.js** (v16 or later)
- **npm** or **yarn**
- **Python** (for transcription dependencies)

### Platform-Specific Requirements:

**macOS (for macOS builds):**
- Xcode Command Line Tools: `xcode-select --install`
- Optional: Apple Developer Account (for code signing)

**Windows (for Windows builds):**
- Windows 10/11
- Visual Studio Build Tools or Visual Studio Community

**Linux (for Linux builds):**
- Build essentials: `sudo apt install build-essential`

---

## 🔧 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Install Python Dependencies
```bash
npm run setup-python
```

### 3. Verify Setup
```bash
npm run verify
```

---

## 🎨 Icons and Assets

### Create App Icons:
1. **Design** a 1024x1024 px app icon
2. **Save** in multiple formats:
   - `build-resources/icon.icns` (macOS)
   - `build-resources/icon.ico` (Windows)
   - `build-resources/icon.png` (Linux)

### Generate Icons Automatically:
```bash
# Install electron-icon-builder
npm install -g electron-icon-builder

# Generate from a single 1024x1024 PNG
electron-icon-builder --input=./icon-source.png --output=./build-resources/
```

---

## 🏗️ Building Packages

### Build for Current Platform:
```bash
npm run dist
```

### Build for Specific Platforms:

**macOS (.dmg and .pkg):**
```bash
npm run dist-mac
```

**Windows (.exe installer and portable):**
```bash
npm run dist-win
```

**Linux (.AppImage, .deb, .rpm, .tar.gz):**
```bash
npm run dist-linux
```

### Build for All Platforms:
```bash
npm run dist-all
```

### Development Build (no installer):
```bash
npm run pack
```

---

## 📦 Output Files

After building, you'll find packages in the `dist/` directory:

### macOS:
- **LeepiAI Interview Recorder-1.0.0.dmg** (Drag & Drop installer)
- **LeepiAI Interview Recorder-1.0.0.pkg** (Traditional installer)
- **LeepiAI Interview Recorder-1.0.0-arm64.dmg** (Apple Silicon)
- **LeepiAI Interview Recorder-1.0.0-x64.dmg** (Intel)

### Windows:
- **LeepiAI Interview Recorder Setup 1.0.0.exe** (NSIS installer)
- **LeepiAI Interview Recorder 1.0.0.exe** (Portable version)

### Linux:
- **LeepiAI Interview Recorder-1.0.0.AppImage** (Universal)
- **leepi-interview-recorder_1.0.0_amd64.deb** (Debian/Ubuntu)
- **leepi-interview-recorder-1.0.0.x86_64.rpm** (RedHat/Fedora)
- **leepi-interview-recorder-1.0.0.tar.gz** (Archive)

---

## 🔒 Code Signing (Optional)

### macOS Code Signing:
```bash
# Set environment variables
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate_password"

# Build with signing
npm run dist-mac
```

### Windows Code Signing:
```bash
# Set environment variables
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate_password"

# Build with signing
npm run dist-win
```

---

## 🌐 Cross-Platform Building

### Build Windows from macOS/Linux:
```bash
# Install wine (for macOS)
brew install wine

# Build Windows packages
npm run dist-win
```

### Build macOS from Linux:
```bash
# Install additional dependencies
sudo apt install icnsutils graphicsmagick

# Build macOS packages (unsigned)
npm run dist-mac
```

---

## 📋 Distribution Checklist

### Before Building:
- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md`
- [ ] Test app functionality
- [ ] Verify all dependencies are included
- [ ] Create/update app icons

### After Building:
- [ ] Test installers on clean systems
- [ ] Verify virtual audio setup guides are included
- [ ] Check file sizes (optimize if too large)
- [ ] Upload to distribution platform
- [ ] Update download links

---

## 🚀 Distribution Platforms

### Direct Distribution:
- **GitHub Releases** (free, automatic with CI/CD)
- **Your Website** (direct download links)

### App Stores:
- **Mac App Store** (requires Apple Developer Account)
- **Microsoft Store** (requires Developer Account)
- **Snap Store** (Linux, free)
- **Flathub** (Linux, free)

### Package Managers:
- **Homebrew** (macOS): Create a Cask
- **Chocolatey** (Windows): Submit package
- **AUR** (Arch Linux): Create PKGBUILD

---

## 🔧 Troubleshooting

### Common Build Issues:

**"Cannot find module" errors:**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Icon not found:**
```bash
# Create placeholder icons
mkdir -p build-resources
touch build-resources/icon.icns
touch build-resources/icon.ico
touch build-resources/icon.png
```

**Code signing errors:**
- Ensure certificates are valid
- Check environment variables
- Use `CSC_IDENTITY_AUTO_DISCOVERY=false` to disable auto-discovery

**Large package size:**
- Use `npm run pack` to see uncompressed size
- Check `node_modules` for unnecessary dependencies
- Consider `--publish=never` for local builds

### Platform-Specific Issues:

**macOS:**
- Gatekeeper warnings: Users need to right-click → Open
- Notarization required for distribution outside App Store

**Windows:**
- SmartScreen warnings: Code signing reduces warnings
- Antivirus false positives: Submit to vendors for whitelisting

**Linux:**
- AppImage permissions: Make executable with `chmod +x`
- Missing dependencies: Include in package or document requirements

---

## 📊 Build Optimization

### Reduce Package Size:
```json
// In package.json build config
"files": [
  "build/**/*",
  "src/main/**/*",
  "!src/**/*.{ts,tsx}",
  "!**/node_modules/**/*.{md,txt}"
]
```

### Exclude Development Dependencies:
```bash
npm install --production
npm run dist
```

### Use asar Archive:
```json
// In package.json build config
"asar": true
```

---

## 🤖 Automated Builds (CI/CD)

### GitHub Actions Example:
```yaml
# .github/workflows/build.yml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm install
      - run: npm run dist
      
      - uses: actions/upload-artifact@v3
        with:
          name: dist-${{ matrix.os }}
          path: dist/
```

---

## 📋 Quick Commands Summary

```bash
# Development
npm start                 # Run in development
npm run build            # Build React app
npm run pack             # Package without installer

# Distribution
npm run dist             # Build for current platform
npm run dist-mac         # Build macOS packages
npm run dist-win         # Build Windows packages  
npm run dist-linux       # Build Linux packages
npm run dist-all         # Build for all platforms

# Utilities
npm run verify           # Verify setup
npm run setup-python     # Install Python dependencies
```

---

## 🎉 Ready to Distribute!

Your LeepiAI Interview Recorder packages will include:
- ✅ **Main Application** with dual-stream recording
- ✅ **Setup Guides** for virtual audio devices
- ✅ **Installation Scripts** for automated setup
- ✅ **Professional Icons** and branding
- ✅ **Cross-Platform Support** (macOS, Windows, Linux)

Share your packages with confidence! 🚀 