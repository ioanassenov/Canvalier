#!/bin/bash

# Build script for Canvalier Chrome Extension

# Exit on any error
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Extract name and version from manifest.json using grep and sed
EXTENSION_NAME=$(grep '"name"' manifest.json | head -1 | sed 's/.*"name": "\(.*\)".*/\1/')
EXTENSION_VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')

# Remove spaces from extension name for filename
EXTENSION_NAME_NO_SPACES=$(echo "$EXTENSION_NAME" | tr -d ' ')

# Create the output filename
OUTPUT_FILE="${EXTENSION_NAME_NO_SPACES}_v${EXTENSION_VERSION}.zip"

# Print build message
echo -e "${BLUE}Beginning build of ${EXTENSION_NAME} v${EXTENSION_VERSION}${NC}"

# Remove old build if it exists
if [ -f "$OUTPUT_FILE" ]; then
    echo "Removing old build: $OUTPUT_FILE"
    rm "$OUTPUT_FILE"
fi

# Create the zip archive
# -r = recursive (for directories)
# -q = quiet mode (less verbose output)
echo "Creating archive..."
zip -r "$OUTPUT_FILE" \
    content.js \
    icons/ \
    manifest.json \
    modules/ \
    styles.css \
    dark-mode.css \
    popup.html \
    popup.js \
    -x "*.DS_Store" \
    -x "__MACOSX/*"

# Print success message
echo -e "${GREEN}✓ Build complete: ${OUTPUT_FILE}${NC}"
echo "Archive contents:"
unzip -l "$OUTPUT_FILE"
