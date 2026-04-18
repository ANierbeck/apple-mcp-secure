#!/bin/bash
set -e

# Build script for EventKitHelper
# Compiles Swift source to binary for current platform

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SWIFT_SOURCE="$SCRIPT_DIR/EventKitHelper.swift"
RESOURCES_DIR="$PROJECT_ROOT/resources"

echo "🔨 Building EventKitHelper..."
echo "Source: $SWIFT_SOURCE"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ]; then
    BINARY_NAME="eventkit-helper-arm64"
    echo "📱 Architecture: Apple Silicon (arm64)"
else
    BINARY_NAME="eventkit-helper-intel"
    echo "💻 Architecture: Intel (x86_64)"
fi

OUTPUT_BINARY="$RESOURCES_DIR/$BINARY_NAME"

# Create resources directory if it doesn't exist
mkdir -p "$RESOURCES_DIR"

# Compile with optimizations
echo "Compiling $BINARY_NAME..."
swiftc "$SWIFT_SOURCE" -o "$OUTPUT_BINARY" -O

# Make executable
chmod +x "$OUTPUT_BINARY"

echo "✅ Build complete: $OUTPUT_BINARY"
echo ""
echo "📊 Binary size: $(du -h "$OUTPUT_BINARY" | cut -f1)"
echo ""
echo "🧪 Testing binary..."
"$OUTPUT_BINARY" --operation list-calendars > /dev/null && echo "✅ Binary works!" || echo "⚠️  Test failed"
