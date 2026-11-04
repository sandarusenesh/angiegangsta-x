/**
 * lib/handler.js — message pipeline: auto features → anti features →
 * command dispatch → chatbot fallback.
 */
const db = require('./db');
const config = require('./config');
const log = require('./logger');
const ai = require('./ai');
const { buildMenu, buildAlive } = require('./menu');
const {
  sleep, pick, isUrl, smallcaps, makeStickerFromImage, downloadMessageMedia,
} = require('./utils');

const cooldowns = new Map(); // sender -> last command ts
const msgCache = new Map(); // keyId -> {chatId, sender, text, type, ts} (anti-delete)
const groupMetaCache = new Map(); // chatId -> {meta, ts}

const RANDOM_EMOJIS = ['😀', '😃', '😄', '😁', '😊', '🥰', '😍', '🤩', '😎', '🔥', '💜', '⚡', '🌟', '✨', '👍', '❤️', '💯', '🎉'];

// ---------- helpers ----------
function jidNumber(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

async function getGroupMeta(sock, chatId) {
  const cached = groupMetaCache.get(chatId);
  if (cached && Date.now() - cached.ts < 60000) return cached.meta;
  try {
    const meta = await sock.groupMetadata(chatId);
    groupMetaCache.set(chatId, { meta, ts: Date.now() });
    return meta;
  } catch {
    return null;
  }
}

function invalidateGroupMeta(chatId) {
  groupMetaCache.delete(chatId);
}

function isAdminIn(meta, senderJid) {
  if (!meta) return false;
  const num = jidNumber(senderJid);
  return meta.participants.some((p) =>
    jidNumber(p.id) === num || jidNumber(p.pn || p.jid || '') === num);
}

function botIsAdmin(meta) {
  if (!meta) return false;
  return meta.participants.some((p) => p.admin === 'admin' || p.admin === 'superadmin');
}

function extractText(m) {
  const msg = m.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.documentWithCaptionMessage?.message?.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

function isSenderOwner(m, senderJid) {
  const num = jidNumber(senderJid);
  if (config.ownerNumber && num === config.ownerNumber) return true;
  if (m.key.fromMe) return true;
  if (db.sudos.includes(num)) return true; // sudo counts as owner-level for commands
  return false;
}

function isSenderSudo(m, senderJid) {
  return db.sudos.includes(jidNumber(senderJid));
}

// ---------- auto features ----------
async function runAutoFeatures(sock, m, ctx) {
  const s = db.settings;

  if (s.autoread && !m.key.fromMe) {
    try { await sock.readMessages([m.key]); } catch {}
  }
  if (s.autoreact && !ctx.command) {
    try { await sock.sendMessage(ctx.chatId, { react: { text: pick(RANDOM_EMOJIS), key: m.key } }); } catch {}
  }
  const mm = m.message || {};
  if (s.vvauto && s.vvgroup && ctx.chatId !== s.vvgroup && !m.key.fromMe &&
      (mm.viewOnceMessage || mm.viewOnceMessageV2 || mm.viewOnceMessageV2Extension)) {
    try {
      const media = await downloadMessageMedia(sock, m, { preferQuoted: false });
      if (media) await require('./vvsave').shareToGroup(sock, media, ctx.pushName);
    } catch (e) { log.warn?.('vvauto failed: ' + e.message); }
  }
}
// ---------- anti features (groups) ----------
async function runAntiFeatures(sock, m, ctx) {
  if (!ctx.isGroup) return true;
  const c = db.chat(ctx.chatId);
  const meta = ctx.groupMeta;
  const iAmAdmin = botIsAdmin(meta);

  const violation = (reason) => `> 🛑 *${reason}*\n> protected by ${config.botName}`;

  async function punish(reason) {
    try {
      if (iAmAdmin) await sock.sendMessage(ctx.chatId, { delete: m.key });
    } catch {}
    await ctx.reply(violation(reason)).catch(() => {});
    await addWarning(sock, ctx, reason);
  }

  const msg = m.message || {};
  const unwrapped = msg.viewOnceMessage || msg.viewOnceMessageV2 || msg.viewOnceMessageV2Extension;
  const forwarded = (msg.contextInfo?.isForwarded || (msg.contextInfo?.forwardingScore || 0) > 0) ||
    Object.values(msg).some((v) => v?.contextInfo?.isForwarded || (v?.contextInfo?.forwardingScore || 0) > 0);

  if (c.mediaonly && !ctx.command && !ctx.isAdmin) {
    const hasMedia = !!(msg.imageMessage || msg.videoMessage || msg.audioMessage || msg.documentMessage ||
      msg.stickerMessage || unwrapped);
    if (!hasMedia) {
      try { if (iAmAdmin) await sock.sendMessage(ctx.chatId, { delete: m.key }); } catch {}
      await ctx.reply('> 📎 *Media only group!*\n> text messages are not allowed here').catch(() => {});
      return false;
    }
  }

  if (unwrapped && c.antiviewonce) return punish('View once not allowed'), false;
  if (forwarded && c.antiforward) return punish('Forwarded messages not allowed'), false;
  if (msg.stickerMessage && c.antisticker) return punish('Stickers not allowed'), false;
  if (msg.imageMessage && c.antiimage) return punish('Images not allowed'), false;
  if (msg.videoMessage && c.antivideo) return punish('Videos not allowed'), false;
  if (msg.audioMessage && c.antiaudio) return punish('Audio not allowed'), false;
  if (msg.documentMessage && c.antidocument) return punish('Documents not allowed'), false;
  if ((msg.pollCreationMessage || msg.pollCreationMessageV3) && c.antipoll) return punish('Polls not allowed'), false;
  if (msg.reactionMessage && c.antireaction) return false; // silently drop
  if ((msg.contactMessage || msg.contactsArrayMessage) && c.anticontact) return punish('Contacts not allowed'), false;
  if ((msg.locationMessage || msg.liveLocationMessage) && c.antilocation) return punish('Locations not allowed'), false;

  if (c.antilink && ctx.text && isUrl(ctx.text) && !ctx.isAdmin) {
    return punish('Links are not allowed'), false;
  }

  if (c.antiBadwords.length && ctx.text && !ctx.isAdmin) {
    const lower = ctx.text.toLowerCase();
    const hit = c.antiBadwords.find((w) => lower.includes(w));
    if (hit) return punish('Bad words not allowed'), false;
  }

  // autosticker: every image → sticker
  if (c.autosticker && msg.imageMessage && !ctx.command) {
    try {
      const media = await downloadMessageMedia(sock, m, { preferQuoted: false });
      if (media) {
        const sticker = await makeStickerFromImage(media.buffer, config.botName, config.ownerName);
        await sock.sendMessage(ctx.chatId, { sticker });
      }
    } catch {}
  }

  return true;
}

async function addWarning(sock, ctx, reason) {
  const c = db.chat(ctx.chatId);
  const num = ctx.senderNumber;
  c.warnings[num] = (c.warnings[num] || 0) + 1;
  db.save();
  const count = c.warnings[num];
  if (count >= 3) {
    if (ctx.isBotAdmin && !ctx.isAdmin) {
      try {
        await sock.groupParticipantsUpdate(ctx.chatId, [ctx.sender], 'remove');
        await ctx.reply(`> 🚨 *${ctx.pushName || num}* kicked — 3/3 warnings`).catch(() => {});
      } catch {}
      c.warnings[num] = 0;
      db.save();
    }
  } else {
    await ctx.reply(`> ⚠️ Warning *${count}/3* — ${reason}`).catch(() => {});
  }
}

// ---------- main message handler ----------
async function handleMessage(sock, m, registry, startTime) {
  const chatId = m.key.remoteJid;
  if (!chatId || chatId === 'status@broadcast') return;

  const isGroup = chatId.endsWith('@g.us');
  const sender = isGroup ? (m.key.participantPn || m.key.participant || chatId) : chatId;
  const senderNumber = jidNumber(sender);
  const pushName = m.pushName || senderNumber;
  const msg = m.message;

  // cache for anti-delete
  if (msg) {
    const t = extractText(m);
    const type = msg.imageMessage ? 'image' : msg.videoMessage ? 'video' : msg.audioMessage ? 'audio'
      : msg.stickerMessage ? 'sticker' : msg.documentMessage ? 'document' : 'text';
    if (t || type !== 'text') {
      msgCache.set(chatId + '|' + m.key.id, { chatId, sender: senderNumber, pushName, text: t, type, ts: Date.now() });
      if (msgCache.size > 800) {
        const first = msgCache.keys().next().value;
        msgCache.delete(first);
      }
    }
  }

  if (!msg) return; // ephemeral/notification-only

  // ---- ignore our own messages outside self-chat ----
  const selfChat = !isGroup && senderNumber === jidNumber(sock.user?.id);
  if (m.key.fromMe && !selfChat) return;

  // ---- build context ----
  const text = extractText(m).trim();
  const settings = db.settings;
  const prefix = settings.prefix === 'none' ? '' : settings.prefix;

  let command = null; let args = []; let argText = '';
  const stripped = text.replace(/^[*_`~]+/, '').trim();
  if (prefix ? stripped.toLowerCase().startsWith(prefix.toLowerCase()) : /^[a-zA-Z]/.test(stripped)) {
    const body = prefix ? stripped.slice(prefix.length) : stripped;
    const parts = body.trim().split(/\s+/);
    if (parts[0]) {
      command = parts[0].toLowerCase();
      args = parts.slice(1);
      argText = args.join(' ');
    }
  }

  const groupMeta = isGroup ? await getGroupMeta(sock, chatId) : null;
  const isOwner = isSenderOwner(m, sender);
  const isSudo = isSenderSudo(m, sender);
  const isAdmin = isGroup ? isAdminIn(groupMeta, sender) : isOwner;
  const isBotAdmin = isGroup ? botIsAdmin(groupMeta) : false;

  const ctx = {
    sock, m, chatId, sender, senderNumber, pushName,
    isGroup, isOwner, isSudo, isAdmin, isBotAdmin,
    prefix, command, args, argText, text,
    groupMeta, registry, startTime,
    message: msg,
    quoted: msg?.extendedTextMessage?.contextInfo?.quotedMessage
      ? {
          message: msg.extendedTextMessage.contextInfo.quotedMessage,
          sender: msg.extendedTextMessage.contextInfo.participant,
          stanzaId: msg.extendedTextMessage.contextInfo.stanzaId,
        }
      : null,
    async reply(textOut, extra = {}) {
      if (settings.autotyping || settings.autorecord) {
        try { await sock.sendPresenceUpdate(settings.autorecord && !settings.autotyping ? 'recording' : 'composing', chatId); await sleep(400); } catch {}
      }
      return sock.sendMessage(chatId, { text: textOut, ...extra }, { quoted: m });
    },
    async react(emoji) {
      return sock.sendMessage(chatId, { react: { text: emoji, key: m.key } });
    },
    async download(opts) {
      return downloadMessageMedia(sock, m, opts);
    },
    async sendSticker(buffer) {
      return sock.sendMessage(chatId, { sticker: buffer }, { quoted: m });
    },
  };

  // ---- mode gate ----
  const mode = settings.mode;
  if (!isOwner && !isSudo) {
    if (mode === 'private') return;
    if (mode === 'groups' && !isGroup) return;
    if (mode === 'dms' && isGroup) return;
  }

  // ---- auto features ----
  await runAutoFeatures(sock, m, ctx);

  // ---- anti features (can swallow the message) ----
  if (m.key.fromMe) {
    // never anti-process our own output
  } else {
    const proceed = await runAntiFeatures(sock, m, ctx);
    if (!proceed) return;
  }

  // ---- antidelete + chatbot + status handled elsewhere ----

  // ---- command dispatch ----
  if (command) {
    const cmd = registry.get(command);
    if (cmd) {
      // cooldown (2s, owner exempt)
      if (!isOwner) {
        const last = cooldowns.get(sender) || 0;
        if (Date.now() - last < 2000) return;
        cooldowns.set(sender, Date.now());
      }
      log.cmd('CMD', `${isGroup ? 'GC' : 'DM'} ${senderNumber}: ${prefix}${command} ${argText}`.slice(0, 100));

      if (cmd.groupOnly && !isGroup) return ctx.reply('❌ This command works in *groups only*.');
      if (cmd.privateOnly && isGroup && !isOwner) return ctx.reply('❌ This command works in *DM only*.');
      if (cmd.ownerOnly && !isOwner) {
        return ctx.reply(`> 🔒 *Owner only command*\n> ask ${config.ownerName} for access`);
      }
      if (cmd.adminOnly) {
        if (!isGroup) {
          if (!isOwner) return ctx.reply('❌ Admin command — groups only.');
        } else if (!isAdmin && !isOwner) {
          return ctx.reply('❌ This command requires *group admin*.');
        }
      }

      try {
        await cmd.handler(ctx);
      } catch (e) {
        log.error('CMD', `${command}: ${e.message}`);
        await ctx.reply(`❌ *Error:* ${e.message}`).catch(() => {});
      }
      return;
    } else if (prefix && stripped.startsWith(prefix)) {
      // unknown command with prefix
      const known = registry.get(command);
      if (!known && command.length > 1) {
        await ctx.reply(`❓ Unknown command *${prefix}${command}*\nType *${prefix}menu* to see all commands.`).catch(() => {});
      }
      return;
    }
  }

  // ---- chatbot (AI) fallback ----
  if (db.settings.chatbot && text && !isGroup && !m.key.fromMe) {
    try {
      const answer = await ai.ask(chatId, text);
      if (answer) await ctx.reply(answer);
    } catch (e) {
      log.warn('CHATBOT', e.message);
    }
    return;
  }

  // group mention-triggered AI: @bot mention
  if (db.settings.chatbot && isGroup && text && msg.extendedTextMessage?.contextInfo?.mentionedJid?.some((j) => jidNumber(j) === jidNumber(sock.user?.id))) {
    const q = text.replace(/@\d+/g, '').trim();
    if (q) {
      try {
        const answer = await ai.ask(chatId, q);
        if (answer) await ctx.reply(answer);
      } catch {}
    }
  }
}

// ---------- message updates (anti-delete) ----------
async function handleMessageUpdate(sock, update) {
  const { key, message } = update;
  if (message !== null || !key) return; // only deletions
  const cacheKey = key.remoteJid + '|' + key.id;
  const cached = msgCache.get(cacheKey);
  if (!cached) return;

  const chat = db.chat(key.remoteJid);
  if (!chat.antidelete) return;

  try {
    const text = `*🗑️ ANTI-DELETE ALERT*\n> from: @${cached.sender}\n` +
      (cached.text ? `\n${cached.text}` : `\n> [deleted ${cached.type} — content not recoverable]`);
    await sock.sendMessage(key.remoteJid, { text, mentions: [cached.sender + '@s.whatsapp.net'] });
  } catch {}
}

// ---------- group updates (welcome / goodbye / antipromote) ----------
function fillTemplate(tpl, { user, group, desc, count }) {
  return tpl
    .replace(/@user/g, `@${user}`)
    .replace(/\{user\}/g, user)
    .replace(/\{group\}/g, group)
    .replace(/\{desc\}/g, desc || '—')
    .replace(/\{count\}/g, String(count));
}

const DEFAULT_WELCOME = `┏▣ ◈ *WELCOME* ◈
┃ Hey @user! 👋
┃ Welcome to *{group}*
┃ You are member *#{count}*
┗▣
> enjoy your stay 🔥`;

const DEFAULT_GOODBYE = `┏▣ ◈ *GOODBYE* ◈
┃ @user left *{group}* 😢
┃ Members: *{count}*
┗▣
> we will miss you ✌️`;

async function handleGroupUpdate(sock, update) {
  const { id: chatId, participants, action } = update;
  invalidateGroupMeta(chatId);
  const chat = db.chat(chatId);
  if (mutedWelcome(chatId, action)) return;

  let meta = null;
  try { meta = await sock.groupMetadata(chatId); } catch {}
  const group = meta?.subject || 'the group';
  const desc = meta?.desc || '';
  const count = meta?.participants?.length || '?';

  for (const user of participants) {
    const num = jidNumber(user);
    if (action === 'add' && chat.welcome !== false) {
      const tpl = chat.welcome || DEFAULT_WELCOME;
      await sock.sendMessage(chatId, {
        text: fillTemplate(tpl, { user: num, group, desc, count }),
        mentions: [user],
      }).catch(() => {});
    }
    if (action === 'remove' && chat.goodbye !== false) {
      const tpl = chat.goodbye || DEFAULT_GOODBYE;
      await sock.sendMessage(chatId, {
        text: fillTemplate(tpl, { user: num, group, desc, count }),
        mentions: [user],
      }).catch(() => {});
    }
    if (action === 'demote' && chat.antipromote) {
      // revert demotion (protect the member)
      try {
        await sock.groupParticipantsUpdate(chatId, [user], 'promote');
        await sock.sendMessage(chatId, { text: `> 🛡️ *Anti-demote* — @${num} re-promoted`, mentions: [user] });
      } catch {}
    }
  }
}

function mutedWelcome() { return false; }

// ---------- calls (anticall) ----------
async function handleCall(sock, calls) {
  if (!db.settings.anticall) return;
  for (const call of calls) {
    try {
      await sock.rejectCall(call.id, call.from);
      await sock.sendMessage(call.from, {
        text: `> ☎️ *Calls are not allowed*\n> please text instead — ${config.botName}`,
      }).catch(() => {});
    } catch {}
  }
}

// ---------- status (autoview / autoreact) ----------
async function handleStatus(sock, m) {
  const s = db.settings;
  if (s.autoviewstatus) {
    try { await sock.readMessages([m.key]); } catch {}
  }
  if (s.autostatusreact) {
    try { await sock.sendMessage(m.key.remoteJid, { react: { text: pick(RANDOM_EMOJIS), key: m.key } }); } catch {}
  }
}

module.exports = {
  handleMessage,
  handleMessageUpdate,
  handleGroupUpdate,
  handleCall,
  handleStatus,
  jidNumber,
  getGroupMeta,
  isAdminIn,
  botIsAdmin,
};
