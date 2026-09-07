#!/bin/bash
# ismini installer: puts the app in ~/ismini and installs the launcher.
# Run it from anywhere — the extracted zip folder, a git clone, wherever.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/ismini"

# prerequisite: Node.js 18+ (ismini is pure Node stdlib, no npm packages)
node_path="$(command -v node 2>/dev/null || true)"
if [ -z "$node_path" ]; then
  echo
  echo "ERROR: Node.js was not found on this system."
  echo "ismini needs Node.js 18 or newer to run."
  echo
  echo "Install the latest version here:  https://nodejs.org/"
  echo "then re-run this installer."
  exit 1
fi
node_version="$("$node_path" --version 2>/dev/null || echo v0.0.0)"
node_major="${node_version#v}"
node_major="${node_major%%.*}"
case "$node_major" in ''|*[!0-9]*) node_major=0 ;; esac
if [ "$node_major" -lt 18 ]; then
  echo
  echo "ERROR: found Node.js $node_version, but ismini needs 18 or newer."
  echo
  echo "Install the latest version here:  https://nodejs.org/"
  echo "then re-run this installer."
  exit 1
fi
echo "Node.js $node_version found - OK."

# canonical location: copy the app to ~/ismini so there is one live copy.
# The source folder is left untouched (it may be your dev copy or a zip you
# just extracted) — re-run install.sh from it after updating the app.
if [ "$DIR" != "$DEST" ]; then
  mkdir -p "$DEST"
  cp -a "$DIR"/. "$DEST"/
  echo "App installed to: $DEST (source folder left untouched: $DIR)"
  exec bash "$DEST/install.sh"
fi

[ -f "$DIR/web.js" ] || { echo "ERROR: app not found in $DIR"; exit 1; }

if [ -d "$HOME/Desktop" ]; then
  cat > "$HOME/Desktop/ismini.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=ismini
Comment=Minimal local agent runtime (Web UI)
Exec=$DIR/ismini-web
Icon=$DIR/ismini.png
Terminal=false
Categories=Development;Network;Utility;
EOF
  chmod +x "$HOME/Desktop/ismini.desktop"
  gio set "$HOME/Desktop/ismini.desktop" metadata::trusted true 2>/dev/null || true
  echo "Desktop launcher installed: $HOME/Desktop/ismini.desktop"
fi

if [ -d "$HOME/.local/share/applications" ]; then
  cp "$DIR/ismini.desktop" "$HOME/.local/share/applications/ismini.desktop"
  sed -i "s|^Exec=.*|Exec=$DIR/ismini-web|; s|^Icon=.*|Icon=$DIR/ismini.png|" "$HOME/.local/share/applications/ismini.desktop"
  update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
  echo "App menu entry installed."
fi
echo "Done. Start ismini with: $DIR/ismini-web"
