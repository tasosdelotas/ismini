#!/bin/bash
# ismini installer: puts the app in ~/ismini and installs the launcher.
# Works from the makeself package (temp dir) or from any existing folder.
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

# canonical location: move the app to ~/ismini (survives makeself's temp-dir cleanup)
if [ "$DIR" != "$DEST" ]; then
  mkdir -p "$DEST"
  cp -a "$DIR"/. "$DEST"/
  rm -f "$DEST/makeself" "$DEST/makeself.sh"
  rm -rf "$DIR"
  exec bash "$DEST/install.sh"
fi

[ -f "$DIR/ismini" ] || { echo "ERROR: app not found in $DIR"; exit 1; }

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
