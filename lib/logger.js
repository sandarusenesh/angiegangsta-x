/**
 * lib/logger.js — pretty console logger with an in-memory ring buffer
 * (the web console reads the buffer to show recent logs).
 */

const MAX_BUFFER = 500;
const buffer = [];

function push(type, text) {
  buffer.push({ type, text, ts: Date.now() });
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

const STYLES = {
  info: '\x1b[36m',    // cyan
  ok: '\x1b[32m',      // green
  warn: '\x1b[33m',    // yellow
  error: '\x1b[31m',   // red
  cmd: '\x1b[35m',     // magenta
  banner: '\x1b[95m',  // bright magenta
  reset: '\x1b[0m',
};

function ts() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function line(type, tag, msg) {
  const c = STYLES[type] || STYLES.info;
  const out = `${c}[${ts()}] [${tag}]${STYLES.reset} ${msg}`;
  console.log(out);
  push(type, `[${tag}] ${msg}`);
}

module.exports = {
  buffer,
  info: (tag, msg) => line('info', tag, msg),
  ok: (tag, msg) => line('ok', tag, msg),
  warn: (tag, msg) => line('warn', tag, msg),
  error: (tag, msg) => line('error', tag, msg instanceof Error ? msg.message : msg),
  cmd: (tag, msg) => line('cmd', tag, msg),
  banner: (msg) => line('banner', 'ANGIE', msg),
};
