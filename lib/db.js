/**
 * lib/db.js — zero-dependency JSON database with debounced saves.
 * Structure:
 *   settings : global bot settings (prefix, mode, auto-feature toggles)
 *   chats    : per-chat settings (anti-features, welcome/goodbye templates, warnings)
 *   sudos    : array of sudo phone numbers
 */
const fs = require('fs');
const path = require('path');
const log = require('./logger');

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'store.json');

const DEFAULTS = {
  settings: {
    prefix: process.env.PREFIX || '.',
    mode: 'public',            // public | private | groups | dms
    autoread: false,
    autotyping: false,
    autorecord: false,
    alwaysonline: true,
    autobio: false,
    autoreact: false,
    autoviewstatus: false,
    autostatusreact: false,
    anticall: false,
    chatbot: false,
    botname: process.env.BOT_NAME || 'ANGIE GANGSTA X',
  },
  chats: {},
  sudos: [],
};

let store = load();

function load() {
  try {
    if (fs.existsSync(FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
      // deep-merge defaults so new settings always exist
      return {
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
        chats: parsed.chats || {},
        sudos: parsed.sudos || [],
      };
    }
  } catch (e) {
    log.error('DB', 'Corrupt store.json, starting fresh: ' + e.message);
  }
  return JSON.parse(JSON.stringify(DEFAULTS));
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      log.error('DB', 'save failed: ' + e.message);
    }
  }, 400);
}

// ---- chat-scoped helpers ----
const CHAT_DEFAULTS = {
  welcome: null,          // template text (null = use built-in default)
  goodbye: null,
  antilink: false,
  antiBadwords: [],       // array of lowercase words
  antidelete: false,
  antisticker: false,
  antiimage: false,
  antivideo: false,
  antiaudio: false,
  antidocument: false,
  antipoll: false,
  antireaction: false,
  anticontact: false,
  antilocation: false,
  antiviewonce: false,
  antiforward: false,
  antipromote: false,
  autosticker: false,
  mediaonly: false,
  warnings: {},           // userNumber -> count
};

function chat(chatId) {
  if (!store.chats[chatId]) {
    store.chats[chatId] = { ...CHAT_DEFAULTS };
  }
  // make sure newly added default keys exist in older chats
  for (const k of Object.keys(CHAT_DEFAULTS)) {
    if (!(k in store.chats[chatId])) store.chats[chatId][k] = CHAT_DEFAULTS[k];
  }
  return store.chats[chatId];
}

// feature toggle registry used by .enable / .disable
const CHAT_FEATURES = Object.keys(CHAT_DEFAULTS).filter(
  (k) => typeof CHAT_DEFAULTS[k] === 'boolean'
);

const GLOBAL_FEATURES = [
  'autoread', 'autotyping', 'autorecord', 'alwaysonline', 'autobio',
  'autoreact', 'autoviewstatus', 'autostatusreact', 'anticall', 'chatbot',
];

module.exports = {
  store,
  save,
  chat,
  CHAT_FEATURES,
  GLOBAL_FEATURES,
  get settings() { return store.settings; },
  get sudos() { return store.sudos; },
  addSudo(num) { if (!store.sudos.includes(num)) { store.sudos.push(num); save(); } },
  delSudo(num) { store.sudos = store.sudos.filter((n) => n !== num); save(); },
};
