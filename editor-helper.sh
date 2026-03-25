#!/bin/bash
# Claude Code external editor for WebUI — NO terminal output.
FILE="$1"
SIGNAL="/tmp/claude-webui-edit-signal-$$"
PORT="${CLAUDE_WEBUI_PORT:-3456}"
curl -sf -X POST "http://localhost:${PORT}/api/editor/open" \
  -H "Content-Type: application/json" \
  -d "{\"file\":\"$FILE\",\"signal\":\"$SIGNAL\"}" >/dev/null 2>&1 &
while [ ! -f "$SIGNAL" ]; do sleep 0.2; done
rm -f "$SIGNAL"
