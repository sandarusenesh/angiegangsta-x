/**
 * plugins/settings.js — feature toggles, per-chat config, global settings.
 */
const db = require('../lib/db');
const config = require('../lib/config');

const FEATURE_LABELS = {
  antilink: 'block links', antidelete: 'anti-delete', antisticker: 'anti-sticker',
  antiimage: 'anti-image', antivideo: 'anti-video', antiaudio: 'anti-audio',
  antidocument: 'anti-document', antipoll: 'anti-poll', antireaction: 'anti-reaction',
  anticontact: 'anti-contact', antilocation: 'anti-location', antiviewonce: 'anti-viewonce',
  antiforward: 'anti-forward', antipromote: 'anti-demote', autosticker: 'auto-sticker',
  mediaonly: 'media-only', welcome: 'welcome', goodbye: 'goodbye',
  autoread: 'auto-read', autotyping: 'auto-typing', autorecord: 'auto-record',
  alwaysonline: 'always-online', autobio: 'auto-bio', autoreact: 'auto-react',
  autoviewstatus: 'auto-view-status', autostatusreact: 'auto-status-react',
  anticall: 'anti-call', chatbot: 'AI chatbot',
};

module.exports = (reg) => reg.addAll([
  {
    name: 'enable', aliases: ['on'],
    category: 'Settings',
    desc: 'Enable a feature (anti-link, chatbot, welcome, …)',
    usage: 'enable <feature>',
    handler: async (ctx) => toggle(ctx, true),
  },
  {
    name: 'disable', aliases: ['off'],
    category: 'Settings',
    desc: 'Disable a feature',
    usage: 'disable <feature>',
    handler: async (ctx) => toggle(ctx, false),
  },
  {
    name: 'features', aliases: ['featurelist'],
    category: 'Settings',
    desc: 'List all toggleable features & their state here',
    handler: async (ctx) => {
      const c = db.chat(ctx.chatId);
      const lines = ['┏▣ ◈ *FEATURES* ◈'];
      for (const f of db.CHAT_FEATURES) lines.push(`│➽ ${ctx.prefix}${c[f] ? '✅' : '❌'} ${f} — ${FEATURE_LABELS[f] || f}`);
      lines.push('┗▣', '', '┏▣ ◈ *GLOBAL* ◈');
      for (const f of db.GLOBAL_FEATURES) lines.push(`│➽ ${ctx.prefix}${db.settings[f] ? '✅' : '❌'} ${f} — ${FEATURE_LABELS[f] || f}`);
      lines.push('┗▣', '', '> owner toggles globals; admins toggle group features');
      await ctx.reply(lines.join('\n'));
    },
  },

  {
    name: 'mode', aliases: [],
    category: 'Settings',
    desc: 'Bot access mode (owner)',
    usage: 'mode public/private/groups/dms',
    ownerOnly: true,
    handler: async (ctx) => {
      const v = ctx.argText.trim().toLowerCase();
      if (['public', 'private', 'groups', 'dms'].includes(v)) {
        db.settings.mode = v; db.save();
        return ctx.reply(`✅ Mode set to *${v}*`);
      }
      await ctx.reply(`*Current mode:* ${db.settings.mode}\n> usage: ${ctx.prefix}mode public/private/groups/dms`);
    },
  },

  {
    name: 'setprefix', aliases: ['prefix'],
    category: 'Settings',
    desc: 'Change command prefix (owner)',
    usage: 'setprefix <char|none>',
    ownerOnly: true,
    handler: async (ctx) => {
      const p = ctx.argText.trim();
      if (!p) return ctx.reply(`Current prefix: *${ctx.prefix}*\n> usage: ${ctx.prefix}setprefix . (or "none")`);
      if (p === 'none' || p.length === 1) {
        db.settings.prefix = p === 'none' ? 'none' : p; db.save();
        return ctx.reply(`✅ Prefix set to *${p === 'none' ? '(none)' : p}*`);
      }
      await ctx.reply('❌ Prefix must be a single character or "none"');
    },
  },

  {
    name: 'setwelcome', aliases: [],
    category: 'Settings',
    desc: 'Set welcome message in this group',
    usage: 'setwelcome <text> — vars: @user {group} {count} {desc}',
    adminOnly: true, groupOnly: true,
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}setwelcome <text>\n> vars: @user, {user}, {group}, {count}, {desc}`);
      db.chat(ctx.chatId).welcome = ctx.argText; db.save();
      await ctx.reply('✅ *Welcome message saved!*\n> test it: ' + ctx.prefix + 'testwelcome');
    },
  },
  {
    name: 'setgoodbye', aliases: [],
    category: 'Settings',
    desc: 'Set goodbye message in this group',
    usage: 'setgoodbye <text>',
    adminOnly: true, groupOnly: true,
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}setgoodbye <text>`);
      db.chat(ctx.chatId).goodbye = ctx.argText; db.save();
      await ctx.reply('✅ *Goodbye message saved!*');
    },
  },
  {
    name: 'delwelcome', aliases: ['resetwelcome'],
    category: 'Settings',
    desc: 'Reset welcome to default',
    adminOnly: true, groupOnly: true,
    handler: async (ctx) => { db.chat(ctx.chatId).welcome = null; db.save(); await ctx.reply('✅ Welcome reset to default'); },
  },
  {
    name: 'delgoodbye', aliases: ['resetgoodbye'],
    category: 'Settings',
    desc: 'Reset goodbye to default',
    adminOnly: true, groupOnly: true,
    handler: async (ctx) => { db.chat(ctx.chatId).goodbye = null; db.save(); await ctx.reply('✅ Goodbye reset to default'); },
  },
  {
    name: 'testwelcome', aliases: [],
    category: 'Settings',
    desc: 'Preview the welcome message',
    groupOnly: true, adminOnly: true,
    handler: async (ctx) => {
      await preview(ctx, 'welcome');
    },
  },
  {
    name: 'testgoodbye', aliases: [],
    category: 'Settings',
    desc: 'Preview the goodbye message',
    groupOnly: true, adminOnly: true,
    handler: async (ctx) => {
      await preview(ctx, 'goodbye');
    },
  },

  {
    name: 'addbadword', aliases: [],
    category: 'Settings',
    desc: 'Add a banned word in this group',
    usage: 'addbadword <word> [word2 …]',
    adminOnly: true, groupOnly: true,
    handler: async (ctx) => {
      const words = ctx.args.map((w) => w.toLowerCase());
      if (!words.length) return ctx.reply(`Usage: ${ctx.prefix}addbadword <word>`);
      const c = db.chat(ctx.chatId);
      for (const w of words) if (!c.antiBadwords.includes(w)) c.antiBadwords.push(w);
      db.save();
      await ctx.reply(`✅ Banned words: *${c.antiBadwords.join(', ') || '—'}*`);
    },
  },
  {
    name: 'delbadword', aliases: [],
    category: 'Settings',
    desc: 'Remove a banned word',
    adminOnly: true, groupOnly: true,
    handler: async (ctx) => {
      const c = db.chat(ctx.chatId);
      c.antiBadwords = c.antiBadwords.filter((w) => !ctx.args.map((x) => x.toLowerCase()).includes(w));
      db.save();
      await ctx.reply(`✅ Banned words now: *${c.antiBadwords.join(', ') || 'none'}*`);
    },
  },
  {
    name: 'listbadword', aliases: ['badwords'],
    category: 'Settings',
    desc: 'List banned words here',
    groupOnly: true,
    handler: async (ctx) => {
      const c = db.chat(ctx.chatId);
      await ctx.reply(`🚫 *Banned words here:*\n> ${c.antiBadwords.join(', ') || 'none'}`);
    },
  },

  {
    name: 'setbotname', aliases: ['setname2'],
    category: 'Settings',
    desc: 'Change bot display name (owner)',
    ownerOnly: true,
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}setbotname <name>`);
      db.settings.botname = ctx.argText; db.save();
      await ctx.reply(`✅ Bot name: *${ctx.argText}*`);
    },
  },

  {
    name: 'getsettings', aliases: ['settings'],
    category: 'Settings',
    desc: 'Show current settings',
    handler: async (ctx) => {
      const s = db.settings; const c = db.chat(ctx.chatId);
      const chatFeat = db.CHAT_FEATURES.filter((f) => c[f]).join(', ') || 'none';
      await ctx.reply(`⚙️ *SETTINGS*
> prefix: ${ctx.prefix || '(none)'}
> mode: ${s.mode}
> chat features on: ${chatFeat}
> global: ${db.GLOBAL_FEATURES.filter((f) => s[f]).join(', ') || 'none'}
> sudo users: ${db.sudos.length}`);
    },
  },
]);

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

async function preview(ctx, kind) {
  const tpl = db.chat(ctx.chatId)[kind] || (kind === 'welcome' ? DEFAULT_WELCOME : DEFAULT_GOODBYE);
  const out = tpl
    .replace(/@user/g, `@${ctx.senderNumber}`)
    .replace(/\{user\}/g, ctx.pushName || ctx.senderNumber)
    .replace(/\{group\}/g, ctx.groupMeta?.subject || 'this group')
    .replace(/\{desc\}/g, ctx.groupMeta?.desc || '—')
    .replace(/\{count\}/g, String(ctx.groupMeta?.participants?.length || '?'));
  await ctx.sock.sendMessage(ctx.chatId, {
    text: `*(preview)*\n\n${out}`,
    mentions: [ctx.sender],
  }, { quoted: ctx.m });
}

async function toggle(ctx, on) {
  const normalized = ctx.argText.trim().toLowerCase();

  // chat-level feature?
  if (db.CHAT_FEATURES.includes(normalized)) {
    if (!ctx.isGroup) return ctx.reply('❌ That feature is group-level — use it inside a group.');
    if (!ctx.isAdmin && !ctx.isOwner) return ctx.reply('❌ Admins only.');
    db.chat(ctx.chatId)[normalized] = on; db.save();
    return ctx.reply(`✅ *${FEATURE_LABELS[normalized] || normalized}* ${on ? 'ENABLED' : 'DISABLED'} for this chat`);
  }
  // global feature?
  if (db.GLOBAL_FEATURES.includes(normalized)) {
    if (!ctx.isOwner) return ctx.reply('🔒 Global features are *owner only*.');
    db.settings[normalized] = on; db.save();
    if (normalized === 'alwaysonline') { try { await ctx.sock.sendPresenceUpdate(on ? 'available' : 'unavailable', ctx.chatId); } catch {} }
    return ctx.reply(`✅ *${FEATURE_LABELS[normalized] || normalized}* ${on ? 'ENABLED' : 'DISABLED'} globally`);
  }
  await ctx.reply(`❓ Unknown feature *"${normalized}"*\n> ${ctx.prefix}features to see the list`);
}
