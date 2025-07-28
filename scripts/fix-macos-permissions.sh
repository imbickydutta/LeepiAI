#!/bin/bash

# Fix macOS permissions and remove quarantine attributes
# This script runs after the build to make the app work without system changes

echo "🔧 Fixing macOS app permissions..."

# Get the dist directory
DIST_DIR="dist"

# Remove quarantine attributes from DMG files
if [ -f "$DIST_DIR/LeepiAI Interview Recorder-1.0.0.dmg" ]; then
    echo "📦 Removing quarantine from Intel DMG..."
    xattr -d com.apple.quarantine "$DIST_DIR/LeepiAI Interview Recorder-1.0.0.dmg" 2>/dev/null || true
fi

if [ -f "$DIST_DIR/LeepiAI Interview Recorder-1.0.0-arm64.dmg" ]; then
    echo "📦 Removing quarantine from Apple Silicon DMG..."
    xattr -d com.apple.quarantine "$DIST_DIR/LeepiAI Interview Recorder-1.0.0-arm64.dmg" 2>/dev/null || true
fi

# Remove quarantine from the app bundles inside DMG
echo "🔧 Mounting DMG files to fix app permissions..."

# Function to fix app permissions in DMG
fix_dmg_permissions() {
    local dmg_file="$1"
    local mount_point="/tmp/leepi_mount_$$"
    
    echo "📦 Processing: $dmg_file"
    
    # Mount the DMG
    hdiutil attach "$dmg_file" -mountpoint "$mount_point" -readonly 2>/dev/null
    
    if [ $? -eq 0 ]; then
        # Find and fix the app bundle
        find "$mount_point" -name "*.app" -type d | while read app_path; do
            echo "🔧 Fixing permissions for: $(basename "$app_path")"
            
            # Remove quarantine from app bundle
            xattr -d com.apple.quarantine "$app_path" 2>/dev/null || true
            
            # Remove quarantine from all files inside app bundle
            find "$app_path" -type f -exec xattr -d com.apple.quarantine {} \; 2>/dev/null || true
            
            # Make sure the app is executable
            chmod +x "$app_path/Contents/MacOS/"* 2>/dev/null || true
        done
        
        # Unmount
        hdiutil detach "$mount_point" 2>/dev/null || true
    fi
}

# Fix both DMG files
fix_dmg_permissions "$DIST_DIR/LeepiAI Interview Recorder-1.0.0.dmg"
fix_dmg_permissions "$DIST_DIR/LeepiAI Interview Recorder-1.0.0-arm64.dmg"

echo "✅ macOS permissions fixed!"
echo "📋 The DMG files should now work without requiring system changes." 