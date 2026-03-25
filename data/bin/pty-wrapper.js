#!/usr/bin/env node
// PTY wrapper — runs inside dtach, spawns claude with a PTY, tees output to a buffer file.
// Survives server restarts (dtach keeps this process alive).
// Usage: node pty-wrapper.js <buffer-file> <meta-file> <command> [args...]

const pty = require(require('path').join(__dirname, '../../node_modules/node-pty'));
const fs = require('fs');
const path = require('path');

const bufferFile = process.argv[2];
const metaFile = process.argv[3];
const cmd = process.argv[4];
const args = process.argv.slice(5);

if (!bufferFile || !cmd) {
  process.stderr.write('Usage: pty-wrapper.js <buffer-file> <meta-file> <command> [args...]\n');
  process.exit(1);
}

// Write metadata for server recovery
const meta = { pid: process.pid, startedAt: Date.now() };
try { fs.mkdirSync(path.dirname(metaFile), { recursive: true }); } catch {}
fs.writeFileSync(metaFile, JSON.stringify(meta));

// Spawn child with PTY
const child = pty.spawn(cmd, args, {
  name: process.env.TERM || 'xterm-256color',
  cols: process.stdout.columns || 120,
  rows: process.stdout.rows || 30,
  cwd: process.cwd(),
  env: process.env,
});

// Buffer management
let buffer = '';
const MAX_BUFFER = 50000;
let writeTimer = null;

function persistBuffer() {
  writeTimer = null;
  try { fs.writeFileSync(bufferFile, buffer); } catch {}
}

// Child output → stdout (dtach PTY) + buffer file
child.onData((data) => {
  process.stdout.write(data);
  buffer = (buffer + data).slice(-MAX_BUFFER);
  if (!writeTimer) writeTimer = setTimeout(persistBuffer, 2000);
});

// stdin (dtach PTY) → child
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', (data) => child.write(data));

// Propagate SIGWINCH to child PTY
process.on('SIGWINCH', () => {
  child.resize(process.stdout.columns || 120, process.stdout.rows || 30);
});

// Child exit → persist final buffer and exit
child.onExit(({ exitCode }) => {
  if (writeTimer) { clearTimeout(writeTimer); persistBuffer(); }
  try { fs.unlinkSync(metaFile); } catch {}
  process.exit(exitCode);
});
