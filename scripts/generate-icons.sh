#!/bin/bash

# LeepiAI Icon Generation Script
# Generates app icons for macOS, Windows, and Linux from a source image

set -e

echo "🎨 LeepiAI Icon Generation Script"
echo "================================="

# Check if source image is provided
if [ $# -eq 0 ]; then
    echo "❌ Usage: $0 <source-image.png>"
    echo ""
    echo "Requirements:"
    echo "  • Source image should be 1024x1024 pixels"
    echo "  • PNG format recommended"
    echo "  • High quality, square image"
    echo ""
    echo "Example:"
    echo "  $0 my-app-icon.png"
    exit 1
fi

SOURCE_IMAGE="$1"
OUTPUT_DIR="build-resources"

# Validate source image
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "❌ Source image not found: $SOURCE_IMAGE"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "📂 Source: $SOURCE_IMAGE"
echo "📂 Output: $OUTPUT_DIR/"
echo ""

# Method 1: Try electron-icon-builder (if available)
if command -v electron-icon-builder &> /dev/null; then
    echo "🔧 Method 1: Using electron-icon-builder..."
    if electron-icon-builder --input="$SOURCE_IMAGE" --output="$OUTPUT_DIR/" 2>/dev/null; then
        echo "✅ electron-icon-builder completed successfully"
        echo ""
        echo "📦 Generated files:"
        ls -la "$OUTPUT_DIR/"
        exit 0
    else
        echo "⚠️  electron-icon-builder failed, trying alternative methods..."
    fi
fi

# Method 2: Try ImageMagick (convert command)
if command -v convert &> /dev/null; then
    echo "🔧 Method 2: Using ImageMagick..."
    
    # Generate PNG for Linux
    convert "$SOURCE_IMAGE" -resize 512x512 "$OUTPUT_DIR/icon.png"
    echo "✅ Created: icon.png"
    
    # Generate ICO for Windows (multiple sizes)
    convert "$SOURCE_IMAGE" \( -clone 0 -resize 16x16 \) \( -clone 0 -resize 32x32 \) \( -clone 0 -resize 48x48 \) \( -clone 0 -resize 64x64 \) \( -clone 0 -resize 128x128 \) \( -clone 0 -resize 256x256 \) -delete 0 "$OUTPUT_DIR/icon.ico"
    echo "✅ Created: icon.ico"
    
    # Generate ICNS for macOS (requires additional steps)
    if command -v png2icns &> /dev/null; then
        png2icns "$OUTPUT_DIR/icon.icns" "$SOURCE_IMAGE"
        echo "✅ Created: icon.icns"
    else
        echo "⚠️  png2icns not found, will create basic ICNS..."
        # Create iconset directory
        ICONSET_DIR="$OUTPUT_DIR/icon.iconset"
        mkdir -p "$ICONSET_DIR"
        
        # Generate multiple sizes for macOS
        convert "$SOURCE_IMAGE" -resize 16x16 "$ICONSET_DIR/icon_16x16.png"
        convert "$SOURCE_IMAGE" -resize 32x32 "$ICONSET_DIR/icon_16x16@2x.png"
        convert "$SOURCE_IMAGE" -resize 32x32 "$ICONSET_DIR/icon_32x32.png"
        convert "$SOURCE_IMAGE" -resize 64x64 "$ICONSET_DIR/icon_32x32@2x.png"
        convert "$SOURCE_IMAGE" -resize 128x128 "$ICONSET_DIR/icon_128x128.png"
        convert "$SOURCE_IMAGE" -resize 256x256 "$ICONSET_DIR/icon_128x128@2x.png"
        convert "$SOURCE_IMAGE" -resize 256x256 "$ICONSET_DIR/icon_256x256.png"
        convert "$SOURCE_IMAGE" -resize 512x512 "$ICONSET_DIR/icon_256x256@2x.png"
        convert "$SOURCE_IMAGE" -resize 512x512 "$ICONSET_DIR/icon_512x512.png"
        convert "$SOURCE_IMAGE" -resize 1024x1024 "$ICONSET_DIR/icon_512x512@2x.png"
        
        # Try to create ICNS with iconutil (macOS only)
        if command -v iconutil &> /dev/null; then
            iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_DIR/icon.icns"
            echo "✅ Created: icon.icns"
            rm -rf "$ICONSET_DIR"
        else
            echo "⚠️  iconutil not found (macOS only), keeping iconset directory"
        fi
    fi
    
    echo ""
    echo "📦 Generated files:"
    ls -la "$OUTPUT_DIR/"
    exit 0
fi

# Method 3: Try sips (macOS only)
if command -v sips &> /dev/null; then
    echo "🔧 Method 3: Using sips (macOS)..."
    
    # Generate PNG
    sips -z 512 512 "$SOURCE_IMAGE" --out "$OUTPUT_DIR/icon.png"
    echo "✅ Created: icon.png"
    
    # Create iconset for ICNS
    ICONSET_DIR="$OUTPUT_DIR/icon.iconset"
    mkdir -p "$ICONSET_DIR"
    
    sips -z 16 16 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16.png"
    sips -z 32 32 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_16x16@2x.png"
    sips -z 32 32 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32.png"
    sips -z 64 64 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_32x32@2x.png"
    sips -z 128 128 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128.png"
    sips -z 256 256 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_128x128@2x.png"
    sips -z 256 256 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256.png"
    sips -z 512 512 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_256x256@2x.png"
    sips -z 512 512 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512.png"
    sips -z 1024 1024 "$SOURCE_IMAGE" --out "$ICONSET_DIR/icon_512x512@2x.png"
    
    # Create ICNS
    if command -v iconutil &> /dev/null; then
        iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_DIR/icon.icns"
        echo "✅ Created: icon.icns"
        rm -rf "$ICONSET_DIR"
    fi
    
    echo "⚠️  ICO format not supported by sips. Install ImageMagick for Windows icons."
    echo ""
    echo "📦 Generated files:"
    ls -la "$OUTPUT_DIR/"
    exit 0
fi

# Method 4: Manual instructions
echo "❌ No suitable image conversion tools found!"
echo ""
echo "Please install one of the following:"
echo ""
echo "🍎 macOS:"
echo "  brew install imagemagick"
echo "  # sips is pre-installed"
echo ""
echo "🐧 Linux:"
echo "  sudo apt install imagemagick"
echo "  # or"
echo "  sudo yum install ImageMagick"
echo ""
echo "🪟 Windows:"
echo "  # Install ImageMagick from: https://imagemagick.org/script/download.php"
echo "  # Or use WSL with Linux commands"
echo ""
echo "Alternative: Manual Icon Creation"
echo "================================="
echo ""
echo "Create these files manually in build-resources/:"
echo ""
echo "icon.png (512x512) - For Linux"
echo "icon.ico (multi-size) - For Windows"
echo "icon.icns (multi-size) - For macOS"
echo ""
echo "Online converters:"
echo "• https://icoconvert.com/ (PNG to ICO)"
echo "• https://iconverticons.com/ (PNG to ICNS)"
echo "• https://cloudconvert.com/ (Multi-format)"

exit 1 