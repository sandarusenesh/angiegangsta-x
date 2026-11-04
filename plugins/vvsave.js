const db = require('../lib/db');
const { shareToGroup } = require('../lib/vvsave');

module.exports = (reg) => reg.addAll([
  {
    name: 'setvvgroup', aliases: [],
    category: 'ViewOnce', ownerOnly: true,
    desc: 'Use this group as the destination for saved view-once media',
    handler: async (ctx) => {
      if (!ctx.isGroup) return ctx.reply(`Send ${ctx.prefix}setvvgroup inside the group you want to save to.`);
      db.settings.vvgroup = ctx.chatId; db.save();
      await ctx.reply('✅ Saved view-once media will be shared to this group.');
    },
  },
  {
    name: 'vvsave', aliases: ['vvs', 'savevv'],
    category: 'ViewOnce', ownerOnly: true,
    desc: 'Reply to a view-once message: save it and share it to your group',
    handler: async (ctx) => {
      const media = await ctx.download({ preferQuoted: true });
      if (!media) return ctx.reply(`Reply to a view-once photo/video/voice note with ${ctx.prefix}vvsave`);
      try {
        await shareToGroup(ctx.sock, media, ctx.quoted?.sender?.split('@')[0]);
        await ctx.react('✅');
      } catch (e) { await ctx.react('❌'); await ctx.reply('❌ ' + e.message); }
    },
  },
  {
    name: 'vvauto', aliases: [],
    category: 'ViewOnce', ownerOnly: true,
    desc: 'Auto-save every incoming view-once to your group (on/off)',
    handler: async (ctx) => {
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['on', 'off'].includes(v)) return ctx.reply(`Usage: ${ctx.prefix}vvauto on|off (now: ${db.settings.vvauto ? 'on' : 'off'})`);
      db.settings.vvauto = v === 'on'; db.save();
      await ctx.reply(`✅ vvauto ${v}` + (v === 'on' && !db.settings.vvgroup ? '\n⚠️ no group set yet — use .setvvgroup in your group' : ''));
    },
  },
]);
