#!/bin/bash
# Build script for Flatpak packaging
# Run from the ismini directory: ./flatpak-build.sh
#
# Bundles Node.js 22 inside the Flatpak — no system Node.js needed.

set -e

echo "=== Building Ismini Flatpak ==="

# 1. Check prerequisites
if ! command -v flatpak-builder &> /dev/null; then
    echo "Error: flatpak-builder not found."
    echo "Install with: sudo apt install flatpak-builder"
    exit 1
fi

if ! command -v flatpak &> /dev/null; then
    echo "Error: flatpak not found."
    echo "Install with: sudo apt install flatpak"
    exit 1
fi

# 2. Add Flathub remote if not already present
if ! flatpak remote-list 2>/dev/null | grep -q flathub; then
    echo "Adding Flathub remote..."
    flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
fi

# 3. Create build dir
BUILD_DIR="_flatpak_build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# 4. Build the Flatpak
echo "Building..."
flatpak-builder "$BUILD_DIR" org.ismini.app.yml --force-clean --user

echo ""
echo "=== Build complete! ==="
echo ""
echo "To test it:"
echo "  flatpak run org.ismini.app"
echo ""
echo "To uninstall:"
echo "  flatpak uninstall org.ismini.app"
echo ""
echo "To submit to Flathub:"
echo "  1. Create a GitHub repo: tasosdelotas/ismini"
echo "  2. Push org.ismini.app.yml and all source files"
echo "  3. Create a repo manifest for Flathub"
echo "  4. Submit a PR to https://github.com/flathub/flathub"
