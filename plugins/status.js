/**
 * plugins/status.js — status helpers & self-actions.
 */
const config = require('../lib/config');

module.exports = (reg) => reg.addAll([
  {
    name: 'getstatus', aliases: ['fetchstatus'],
    category: 'Status',
    desc: 'Save a status you are viewing (reply to a status)',
    ownerOnly: true,
    handler: async (ctx) => {
      // statuses come in as normal messages when replying from the status view
      const media = await ctx.download();
      if (!media) return ctx.reply('Reply to a *status* to save it');
      if (media.type === 'video') {
        await ctx.sock.sendMessage(ctx.chatId, { video: media.buffer, caption: '💾 saved status' }, { quoted: ctx.m });
      } else {
        await ctx.sock.sendMessage(ctx.chatId, { image: media.buffer, caption: '💾 saved status' }, { quoted: ctx.m });
      }
    },
  },
  {
    name: 'presence', aliases: ['online'],
    category: 'Status',
    desc: 'Toggle always-online presence (owner)',
    ownerOnly: true,
    handler: async (ctx) => {
      const db = require('../lib/db');
      db.settings.alwaysonline = !db.settings.alwaysonline;
      db.save();
      try { await ctx.sock.sendPresenceUpdate(db.settings.alwaysonline ? 'available' : 'unavailable', ctx.chatId); } catch {}
      await ctx.reply(`🟢 Always online: *${db.settings.alwaysonline ? 'ON' : 'OFF'}*`);
    },
  },
  {
    name: 'pingstatus', aliases: [],
    category: 'Status',
    desc: 'Show what auto-status features are on',
    handler: async (ctx) => {
      const s = require('../lib/db').settings;
      await ctx.reply(`📸 *Status features*
> auto-view status: ${s.autoviewstatus ? '✅' : '❌'}
> auto-react status: ${s.autostatusreact ? '✅' : '❌'}
> toggle with ${ctx.prefix}enable autoviewstatus / ${ctx.prefix}enable autostatusreact`);
    },
  },
]);
