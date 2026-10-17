/**
 * lib/utils.js — shared helpers: fetch, formatting, media extraction,
 * view-once unwrap, sticker conversion (sharp + webpmux), misc.
 */
const config = require('./config');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------- generic helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function isUrl(str) {
  return /^https?:\/\/\S+$/.test(String(str || '').trim());
}

function formatBytes(b) {
  if (!b && b !== 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function runtime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${sec}s`;
  if (m) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function parseDuration(str) {
  // "5m", "30s", "2h", "1d", "5m 30s" → ms
  const re = /(\d+)\s*(s|m|h|d)/gi;
  let ms = 0; let m; let found = false;
  while ((m = re.exec(String(str)))) {
    found = true;
    const n = parseInt(m[1], 10);
    if (/s/i.test(m[2])) ms += n * 1000;
    else if (/m/i.test(m[2])) ms += n * 60000;
    else if (/h/i.test(m[2])) ms += n * 3600000;
    else if (/d/i.test(m[2])) ms += n * 86400000;
  }
  return found ? ms : 0;
}

// ---------- fetch helpers (Node 20 global fetch) ----------
async function fetchJson(url, opts = {}, timeoutMs = 20000) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.slice(0, 80)}`);
  return res.json();
}

async function fetchBuffer(url, opts = {}, timeoutMs = 60000) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---------- message unwrapping (view-once, ephemeral, doc-with-caption) ----------
function unwrapMessage(message) {
  if (!message) return null;
  const inner =
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.viewOnceMessageV2Extension?.message ||
    message.ephemeralMessage?.message ||
    message.documentWithCaptionMessage?.message ||
    message.editedMessage?.message ||
    null;
  return inner || message;
}

function extractMediaType(message) {
  const m = unwrapMessage(message);
  if (!m) return null;
  if (m.imageMessage) return { type: 'image', node: m.imageMessage, holder: m };
  if (m.videoMessage) return { type: 'video', node: m.videoMessage, holder: m };
  if (m.audioMessage) return { type: 'audio', node: m.audioMessage, holder: m };
  if (m.stickerMessage) return { type: 'sticker', node: m.stickerMessage, holder: m };
  if (m.documentMessage) return { type: 'document', node: m.documentMessage, holder: m };
  if (m.documentWithCaptionMessage?.message?.documentMessage) {
    return { type: 'document', node: m.documentWithCaptionMessage.message.documentMessage, holder: m };
  }
  return null;
}

/**
 * Download media from the quoted message of `m` (or from m itself if no quote
 * and the message carries media). Returns { buffer, type, caption, isViewOnce }.
 */
async function downloadMessageMedia(sock, m, { preferQuoted = true } = {}) {
  const P = require('pino');
  const silent = P({ level: 'silent' });
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');

  const msg = m.message || {};
  const ctx = msg.extendedTextMessage?.contextInfo;
  let target = null;
  let isViewOnce = false;

  if (preferQuoted && ctx?.quotedMessage) {
    const info = extractMediaType(ctx.quotedMessage);
    if (info) {
      target = {
        key: {
          remoteJid: m.key.remoteJid,
          id: ctx.stanzaId,
          participant: ctx.participant,
          fromMe: false,
        },
        message: info.holder,
      };
      isViewOnce = !!(ctx.quotedMessage.viewOnceMessage || ctx.quotedMessage.viewOnceMessageV2 ||
        ctx.quotedMessage.viewOnceMessageV2Extension);
    }
  }
  if (!target) {
    const info = extractMediaType(msg);
    if (info) target = { key: m.key, message: info.holder };
  }
  if (!target) return null;

  const info = extractMediaType(target.message);
  const buffer = await downloadMediaMessage(target, 'buffer', {}, { logger: silent, reuploadRequest: sock.updateMediaMessage });
  return {
    buffer: Buffer.from(buffer),
    type: info?.type || 'image',
    caption: info?.node?.caption || '',
    isViewOnce,
    mimetype: info?.node?.mimetype || '',
  };
}

// ---------- stickers ----------
let sharpDep = null;
function getSharp() {
  try {
    if (!sharpDep) sharpDep = require('sharp');
    return sharpDep;
  } catch {
    return null;
  }
}

async function makeStickerFromImage(buffer, packName, authorName) {
  const sharp = getSharp();
  if (!sharp) return buffer; // fall back to raw (Baileys converts natively, no exif)
  const webp = await sharp(buffer)
    .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toBuffer();
  return setStickerExif(webp, packName, authorName);
}

async function setStickerExif(webpBuffer, packName, authorName) {
  try {
    const WebP = require('node-webpmux');
    const img = new WebP.Image();
    await img.load(webpBuffer);
    const exif = {
      'sticker-pack-id': 'angiegangsta-x',
      'sticker-pack-name': packName,
      'sticker-pack-publisher': authorName,
      'android-app-store-link': config.repo,
    };
    const exifBuf = Buffer.from(JSON.stringify(exif));
    // webp exif header: "EXIF\x00\x00" + 10-char padded length + payload
    const payload = Buffer.concat([Buffer.from('EXIF\x00\x00'), Buffer.alloc(10), exifBuf]);
    payload.write(exifBuf.length.toString(16).padStart(2, '0').padEnd(8, '0'), 8);
    img.exif = payload;
    return img.save();
  } catch {
    return webpBuffer;
  }
}

// ---------- text formatting ----------
const SMALL_MAP = {
  a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ғ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ',
  k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 's', t: 'ᴛ',
  u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ',
};

function smallcaps(str) {
  return String(str).toLowerCase().split('').map((c) => SMALL_MAP[c] || c).join('');
}

// fancy unicode fonts for .fancy
const FONTS = {
  bold: { 0x61: 0x1d400, A: 0x1d400 },          // handled generically below
};
const FONT_SETS = [
  { name: 'Bold', offsetUpper: 0x1d400, offsetLower: 0x1d41a },
  { name: 'Italic', offsetUpper: 0x1d434, offsetLower: 0x1d44e },
  { name: 'BoldItalic', offsetUpper: 0x1d468, offsetLower: 0x1d482 },
  { name: 'Script', offsetUpper: 0x1d49c, offsetLower: 0x1d4b6 },
  { name: 'Double', offsetUpper: 0x1d538, offsetLower: 0x1d552 },
  { name: 'Mono', offsetUpper: 0x1d670, offsetLower: 0x1d68a },
];

function applyFont(text, set) {
  return String(text).split('').map((ch) => {
    const code = ch.codePointAt(0);
    if (code >= 65 && code <= 90) return String.fromCodePoint(set.offsetUpper + (code - 65));
    if (code >= 97 && code <= 122) return String.fromCodePoint(set.offsetLower + (code - 97));
    return ch;
  }).join('');
}

function fancyText(text) {
  const out = FONT_SETS.map((s) => `*${s.name}:* ${applyFont(text, s)}`);
  out.push(`*SmallCaps:* ${smallcaps(text)}`);
  out.push(`*Spaced:* ${String(text).split('').join(' ')}`);
  out.push(`*Reversed:* ${String(text).split('').reverse().join('')}`);
  return out.join('\n');
}

function bar(pct, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((pct / 100) * size)));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

module.exports = {
  sleep, pick, isUrl, formatBytes, runtime, parseDuration,
  fetchJson, fetchBuffer, UA,
  unwrapMessage, extractMediaType, downloadMessageMedia,
  getSharp, makeStickerFromImage, setStickerExif,
  smallcaps, fancyText, applyFont, bar,
};
