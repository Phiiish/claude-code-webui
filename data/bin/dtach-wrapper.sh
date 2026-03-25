#!/bin/bash
# dtach-wrapper.sh — runs inside dtach, wraps claude with output buffering + metadata
# Usage: dtach-wrapper.sh <webui-session-id> <buffer-dir> <command> [args...]
#
# Creates:
#   <buffer-dir>/<session-id>.json  — metadata (sessionId, pid, startedAt)
#   <buffer-dir>/<session-id>.buf   — raw PTY output captured by script(1)

WEBUI_SESSION_ID="$1"; shift
BUFFER_DIR="$1"; shift

mkdir -p "$BUFFER_DIR"

# Write metadata for server recovery
cat > "$BUFFER_DIR/$WEBUI_SESSION_ID.json" << METAEOF
{"sessionId":"$WEBUI_SESSION_ID","pid":$$,"startedAt":$(date +%s%3N)}
METAEOF

BUFFER_FILE="$BUFFER_DIR/$WEBUI_SESSION_ID.buf"

# Truncate old buffer
> "$BUFFER_FILE"

# script -qf: capture all PTY output to buffer file with flushing
# script creates its own PTY pair, so mouse/scroll/escape sequences pass through
exec script -qf "$BUFFER_FILE" -c "$*"
