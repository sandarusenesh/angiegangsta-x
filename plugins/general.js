/**
 * plugins/general.js — menu, status & misc public commands.
 */
const os = require('os');
const config = require('../lib/config');
const { buildMenu, buildCategoryMenu, buildAlive } = require('../lib/menu');
const { runtime } = require('../lib/utils');

module.exports = (reg) => reg.addAll([
  {
    name: 'menu', aliases: ['help', 'cmds', 'commands'],
    category: 'General',
    desc: 'Show the full command menu (or one category)',
    usage: 'menu / menu <category>',
    handler: async (ctx) => {
      const cat = ctx.argText.toLowerCase();
      if (cat && ctx.registry.byCategory().has(cat[0].toUpperCase() + cat.slice(1))) {
        return ctx.reply(buildCategoryMenu(cat[0].toUpperCase() + cat.slice(1), ctx.registry, {
          botName: config.botName, ownerName: config.ownerName, prefix: ctx.prefix,
        }));
      }
      if (cat) return ctx.reply(`❓ No such category *"${cat}"*\nCategories: ${[...ctx.registry.byCategory().keys()].map((c) => c.toLowerCase()).join(', ')}`);
      await ctx.reply(buildMenu({
        botName: config.botName,
        ownerName: config.ownerName,
        ownerNumber: config.ownerNumber,
        prefix: ctx.prefix,
        mode: ctx.isOwner ? require('../lib/db').settings.mode : require('../lib/db').settings.mode,
        version: config.version,
        pluginCount: ctx.registry.size,
        registry: ctx.registry,
        uptimeMs: Date.now() - ctx.startTime,
      }));
    },
  },

  {
    name: 'all', aliases: ['fullmenu'],
    category: 'General',
    desc: 'Show every command with descriptions',
    handler: async (ctx) => {
      const lines = [];
      for (const [cat, cmds] of [...ctx.registry.byCategory().entries()].sort()) {
        lines.push(`┏▣ ◈ *${cat.toUpperCase()}* ◈`);
        for (const c of cmds) lines.push(`│➽ ${ctx.prefix}${c.name} — ${c.desc}`);
        lines.push('┗▣', '');
      }
      await ctx.reply(lines.join('\n'));
    },
  },

  {
    name: 'ping', aliases: ['pong', 'speed'],
    category: 'General',
    desc: 'Check bot latency',
    handler: async (ctx) => {
      const t = Date.now();
      const sent = await ctx.sock.sendMessage(ctx.chatId, { text: '🏓 Pinging…' }, { quoted: ctx.m });
      const latency = Date.now() - t;
      await ctx.sock.sendMessage(ctx.chatId, { text: `*PONG* 🏓\n> latency: *${latency} ms*\n> uptime: *${runtime(Date.now() - ctx.startTime)}*`, edit: sent.key });
    },
  },

  {
    name: 'alive', aliases: ['botstatus', 'status'],
    category: 'General',
    desc: 'Is the bot alive?',
    handler: async (ctx) => {
      const db = require('../lib/db');
      await ctx.reply(buildAlive({
        botName: config.botName, ownerName: config.ownerName,
        mode: db.settings.mode, uptimeMs: Date.now() - ctx.startTime,
      }));
    },
  },

  {
    name: 'owner', aliases: ['creator'],
    category: 'General',
    desc: 'Show bot owner contact',
    handler: async (ctx) => {
      await ctx.reply(`*${config.botName} OWNER* 👑
> name: ${config.ownerName}
> number: ${config.ownerNumber || 'auto (the linked number)'}
> github: ${config.repo}`);
    },
  },

  {
    name: 'whoami', aliases: ['myinfo'],
    category: 'General',
    desc: 'Your info & access level',
    handler: async (ctx) => {
      const role = ctx.isOwner ? 'Owner 👑' : ctx.isSudo ? 'Sudo 🔑' : 'User';
      await ctx.reply(`*YOU* 👤
> name: ${ctx.pushName}
> number: ${ctx.senderNumber}
> role: ${role}
> chat: ${ctx.isGroup ? 'Group' : 'DM'}`);
    },
  },

  {
    name: 'uptime', aliases: ['runtime'],
    category: 'General',
    desc: 'How long the bot has been running',
    handler: async (ctx) => {
      await ctx.reply(`⏱️ *Uptime:* ${runtime(Date.now() - ctx.startTime)}\n> system: ${runtime(os.uptime() * 1000)}`);
    },
  },

  {
    name: 'repo', aliases: ['script', 'source'],
    category: 'General',
    desc: 'Bot source code link',
    handler: async (ctx) => {
      await ctx.reply(`📦 *${config.botName} v${config.version}*
> github: ${config.repo}
> ${ctx.registry.size} commands • Baileys powered`);
    },
  },

  {
    name: 'list', aliases: ['cmdlist'],
    category: 'General',
    desc: 'Plain list of all command names',
    handler: async (ctx) => {
      const names = ctx.registry.commands.map((c) => ctx.prefix + c.name).sort();
      await ctx.reply(`*${ctx.registry.size} COMMANDS*\n\n${names.join('  •  ')}`);
    },
  },
]);
