#!/bin/bash
# Build script for MailKit helper binary

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
SOURCE_FILE="$SCRIPT_DIR/MailKitHelper.swift"
RESOURCES_DIR="$REPO_ROOT/resources"

echo "Building MailKit helper..."

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  arm64)
    BINARY_NAME="mailkit-helper-arm64"
    ;;
  x86_64)
    BINARY_NAME="mailkit-helper-intel"
    ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

BINARY_PATH="$RESOURCES_DIR/$BINARY_NAME"

# Create resources directory if it doesn't exist
mkdir -p "$RESOURCES_DIR"

# Compile Swift to binary
echo "Compiling Swift source for $ARCH..."
swiftc -O "$SOURCE_FILE" -o "$BINARY_PATH"

# Make executable
chmod +x "$BINARY_PATH"

echo "✅ Built: $BINARY_PATH"
echo "Size: $(du -h "$BINARY_PATH" | cut -f1)"
