#!/bin/bash
set -e

# Claude Code WebUI — One-line installer
# Usage: curl -fsSL <url>/install.sh | bash
#   or:  bash install.sh

INSTALL_DIR="${CLAUDE_WEBUI_DIR:-$HOME/claude-code-webui}"
PORT="${PORT:-3456}"

echo ""
echo "  Claude Code WebUI Installer"
echo "  ============================"
echo ""

# ── Check prerequisites ──

# Node.js 18+
if ! command -v node &>/dev/null; then
  echo "  [!] Node.js not found."
  if [[ "$OSTYPE" == darwin* ]]; then
    echo "      Install via: brew install node"
  else
    echo "      Install via: https://nodejs.org/ or your package manager"
  fi
  exit 1
fi

NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo "  [!] Node.js 18+ required (found v$(node -v))"
  exit 1
fi
echo "  [OK] Node.js $(node -v)"

# dtach
if ! command -v dtach &>/dev/null; then
  echo "  [!] dtach not found. Installing..."
  if [[ "$OSTYPE" == darwin* ]]; then
    if command -v brew &>/dev/null; then
      brew install dtach
    else
      echo "      Please install Homebrew first: https://brew.sh"
      echo "      Then run: brew install dtach"
      exit 1
    fi
  elif command -v apt-get &>/dev/null; then
    sudo apt-get install -y dtach
  elif command -v yum &>/dev/null; then
    sudo yum install -y dtach
  else
    echo "      Please install dtach manually"
    exit 1
  fi
fi
echo "  [OK] dtach $(dtach --help 2>&1 | head -1 || echo 'installed')"

# Claude CLI
if ! command -v claude &>/dev/null; then
  echo "  [!] Claude CLI not found."
  echo "      Install via: npm install -g @anthropic-ai/claude-code"
  echo "      Then run: claude (to complete setup/login)"
  exit 1
fi
echo "  [OK] Claude CLI found"

# ── Install ──

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/server.js" ]; then
  echo ""
  echo "  Existing installation found at $INSTALL_DIR"
  echo "  Updating..."
  cd "$INSTALL_DIR"
else
  echo ""
  echo "  Installing to $INSTALL_DIR ..."

  # If running from within the project directory (has server.js), use it
  if [ -f "server.js" ] && [ -f "package.json" ]; then
    if [ "$(pwd)" != "$INSTALL_DIR" ]; then
      mkdir -p "$INSTALL_DIR"
      cp -r . "$INSTALL_DIR/"
    fi
    cd "$INSTALL_DIR"
  else
    echo "  [!] Please run this script from the project directory"
    echo "      or set CLAUDE_WEBUI_DIR to the project path"
    exit 1
  fi
fi

echo "  Installing dependencies..."
npm install --no-fund --no-audit 2>&1 | tail -1

echo "  Building frontend..."
npm run build 2>&1 | tail -1

# Create data directories
mkdir -p data/sockets data/session-meta data/session-buffers data/bin

echo ""
echo "  ✅ Installation complete!"
echo ""
echo "  To start:"
echo "    cd $INSTALL_DIR"
echo "    npm start"
echo ""
echo "  Then open http://localhost:${PORT} in your browser."
echo ""
echo "  Tips:"
echo "    - Set PORT=xxxx to use a different port"
echo "    - Sessions persist across server restarts"
echo "    - Press Ctrl+C to stop the server (sessions keep running)"
echo ""
