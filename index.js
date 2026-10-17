/**
 * ANGIE GANGSTA X — full-featured multi-device WhatsApp bot
 * Built on Baileys. Entry point: loads plugins, starts web console,
 * connects to WhatsApp (QR + pairing code), wires all events.
 */
require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const fs = require('fs');
const path = require('path');
const P = require('pino');

const db = require('./lib/db');
const config = require('./lib/config');
const log = require('./lib/logger');
const Registry = require('./lib/registry');
const { startWebConsole } = require('./lib/webconsole');
const handler = require('./lib/handler');
const { runtime } = require('./lib/utils');

const startTime = Date.now();
let qrCurrent = null;
let sock = null;
let reconnectAttempts = 0;

// ---------- load plugins ----------
const registry = new Registry();
const PLUGIN_DIR = path.join(__dirname, 'plugins');
for (const file of fs.readdirSync(PLUGIN_DIR).filter((f) => f.endsWith('.js')).sort()) {
  try {
    require(path.join(PLUGIN_DIR, file))(registry);
    log.ok('PLUGINS', `${file} loaded`);
  } catch (e) {
    log.error('PLUGINS', `${file} failed: ${e.message}`);
  }
}
log.info('PLUGINS', `${registry.size} commands registered`);

// ---------- web console ----------
const web = startWebConsole({
  getQr: () => qrCurrent,
  getStatus: () => ({
    connected: !!sock?.user?.id,
    number: sock?.user?.id ? handler.jidNumber(sock.user.id) : null,
    version: config.version,
    uptimeLabel: runtime(Date.now() - startTime),
    mode: db.settings.mode,
  }),
  requestPair: async (phone) => {
    if (!sock || !sock.authState?.creds) throw new Error('Bot socket not ready yet, try again in a few seconds');
    if (sock.authState.creds.registered) throw new Error('Already paired! Delete the session folder to re-pair.');
    const code = await sock.requestPairingCode(phone);
    log.ok('PAIR', `pairing code for ${phone}: ${code}`);
    return code;
  },
  loggerBuffer: log.buffer,
  startTime,
});

// ---------- baileys ----------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
  const { version } = await fetchLatestBaileysVersion();
  const logger = P({ level: 'silent' });

  sock = makeWASocket({
    version,
    logger,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    markOnlineOnConnect: !!db.settings.alwaysonline,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.process(async (events) => {
    // ---- connection ----
    if (events['connection.update']) {
      const u = events['connection.update'];
      const { connection, lastDisconnect, qr } = u;

      if (qr) {
        qrCurrent = qr;
        const qrcodeTerminal = require('qrcode-terminal');
        console.log('\n' + qrcodeTerminal.generate(qr, { small: true }));
        log.info('AUTH', 'Scan the QR above, or open the web console to pair by phone number');
        web.setQr(qr);

        // auto pairing code if PAIR_PHONE is configured
        if (config.pairPhone && !sock.authState.creds.registered) {
          try {
            const code = await sock.requestPairingCode(config.pairPhone);
            log.ok('AUTH', `Pairing code for ${config.pairPhone}: *${code}* (enter in WhatsApp → Linked Devices → Link with phone number)`);
          } catch (e) {
            log.error('AUTH', 'pairing code request failed: ' + e.message);
          }
        }
      }

      if (connection === 'open') {
        reconnectAttempts = 0;
        qrCurrent = null;
        web.setQr(null);
        const myId = sock.user.id;
        const myNumber = handler.jidNumber(myId);
        if (!config.ownerNumber) config.ownerNumber = myNumber; // auto-detect owner
        log.ok('AUTH', `✅ CONNECTED as ${myId} (${sock.user.name || 'unknown'})`);
        log.info('AUTH', `owner: ${config.ownerNumber} | prefix: ${db.settings.prefix} | mode: ${db.settings.mode}`);
        if (db.settings.autobio) {
          sock.updateProfileStatus(`🔥 ${config.botName} bot • prefix ${db.settings.prefix}cmd • by ${config.ownerName}`).catch(() => {});
        }
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        log.warn('AUTH', `connection closed (code ${code})`);
        if (code === DisconnectReason.loggedOut) {
          // session dead — archive it so a fresh QR/pair can happen
          const dead = `${config.sessionDir}.dead-${Date.now()}`;
          try { fs.renameSync(config.sessionDir, dead); log.warn('AUTH', `session logged out — moved to ${dead}, re-pairing from scratch`); } catch {}
          setTimeout(startBot, 3000);
          return;
        }
        reconnectAttempts++;
        const delay = Math.min(60000, 2000 * Math.pow(2, reconnectAttempts));
        log.info('AUTH', `reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})`);
        setTimeout(startBot, delay);
      }
    }

    // ---- messages ----
    if (events['messages.upsert']) {
      const { messages, type } = events['messages.upsert'];
      for (const m of messages) {
        if (m.key.remoteJid === 'status@broadcast') {
          await handler.handleStatus(sock, m);
          continue;
        }
        if (type !== 'notify' && type !== 'append') continue;
        handler.handleMessage(sock, m, registry, startTime).catch((e) => log.error('MSG', e.message));
      }
    }

    if (events['messages.update']) {
      for (const upd of events['messages.update']) {
        handler.handleMessageUpdate(sock, upd).catch(() => {});
      }
    }

    if (events['group-participants.update']) {
      handler.handleGroupUpdate(sock, events['group-participants.update']).catch(() => {});
    }

    if (events['call']) {
      handler.handleCall(sock, events['call']).catch(() => {});
    }
  });

  return sock;
}

// ---------- banner ----------
log.banner(`
  █████╗ ███╗   ██╗ ██████╗ ██╗███████╗
 ██╔══██╗████╗  ██║██╔════╝ ██║██╔════╝
 ███████║██╔██╗ ██║██║  ███╗██║█████╗
 ██╔══██║██║╚██╗██║██║   ██║██║██╔══╝
 ██║  ██║██║ ╚████║╚██████╔╝██║███████╗
 ╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝╚══════╝
      G A N G S T A   X  v${config.version}
  full-featured WhatsApp bot • by yobbyking
`);

startBot().catch((e) => {
  log.error('BOOT', e.message);
  process.exit(1);
});

process.on('unhandledRejection', (e) => log.error('UNHANDLED', e?.message || String(e)));
process.on('uncaughtException', (e) => log.error('UNCAUGHT', e?.message || String(e)));
