#!/bin/bash

# Build script for Hugo 0.146.0 on Render
set -e

HUGO_VERSION="0.146.0"
HUGO_TAR="hugo_extended_${HUGO_VERSION}_Linux-64bit.tar.gz"
HUGO_URL="https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/${HUGO_TAR}"

echo "=========================================="
echo "Installing Hugo Extended ${HUGO_VERSION}..."
echo "=========================================="

# Download Hugo Extended
wget -q --show-progress "$HUGO_URL" -O "/tmp/${HUGO_TAR}"

# Extract
echo "Extracting..."
tar -xzf "/tmp/${HUGO_TAR}" -C /tmp

# Verify version
echo "Installed version:"
/tmp/hugo version

echo ""
echo "=========================================="
echo "Building site..."
echo "=========================================="

# Build the site
/tmp/hugo --gc --minify

echo ""
echo "=========================================="
echo "Build complete!"
echo "=========================================="