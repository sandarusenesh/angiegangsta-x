/**
 * plugins/group.js — group management & protection commands.
 */
const db = require('../lib/db');
const { jidNumber, getGroupMeta } = require('../lib/handler');
const { parseDuration } = require('../lib/utils');

async function targetUser(ctx) {
  const mention = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mention) return mention;
  if (ctx.quoted?.sender) return ctx.quoted.sender;
  const num = ctx.argText.split(/\s+/)[0]?.replace(/\D/g, '');
  if (num) return num + '@s.whatsapp.net';
  return null;
}

module.exports = (reg) => reg.addAll([
  {
    name: 'kick', aliases: ['remove'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Remove a member',
    usage: 'kick @user [reason]',
    handler: async (ctx) => {
      const user = await targetUser(ctx);
      if (!user) return ctx.reply('Reply / mention the person to kick');
      const num = jidNumber(user);
      const c = db.chat(ctx.chatId);
      c.warnings[num] = 0; db.save();
      await ctx.reply(`🦶 *Kicked* @${num}\n${ctx.argText.split(/\s+/).slice(1).join(' ') || ''}`, { mentions: [user] }).catch(() => {});
      try { await ctx.sock.groupParticipantsUpdate(ctx.chatId, [user], 'remove'); } catch (e) {
        await ctx.reply('❌ Failed — am I admin?');
      }
    },
  },
  {
    name: 'add', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Add a member by number',
    usage: 'add 2547XXXXXXXX',
    handler: async (ctx) => {
      const num = ctx.argText.replace(/\D/g, '');
      if (!num) return ctx.reply(`Usage: ${ctx.prefix}add <number-with-country-code>`);
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.chatId, [num + '@s.whatsapp.net'], 'add');
        await ctx.reply(`✅ Added *+${num}* 🎉`);
      } catch (e) {
        await ctx.reply(`❌ Couldn't add: invite link may be required\n> ${ctx.prefix}link to get the invite`);
      }
    },
  },
  {
    name: 'promote', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Make a member admin',
    handler: async (ctx) => {
      const user = await targetUser(ctx);
      if (!user) return ctx.reply('Reply / mention who to promote');
      await ctx.sock.groupParticipantsUpdate(ctx.chatId, [user], 'promote');
      await ctx.reply(`👑 *@${jidNumber(user)} is now admin!*`, { mentions: [user] });
    },
  },
  {
    name: 'demote', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Remove admin from a member',
    handler: async (ctx) => {
      const user = await targetUser(ctx);
      if (!user) return ctx.reply('Reply / mention who to demote');
      await ctx.sock.groupParticipantsUpdate(ctx.chatId, [user], 'demote');
      await ctx.reply(`📉 *@${jidNumber(user)} is no longer admin*`, { mentions: [user] });
    },
  },

  {
    name: 'tagall', aliases: ['everyone'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Tag every member',
    handler: async (ctx) => {
      const meta = ctx.groupMeta || await getGroupMeta(ctx.sock, ctx.chatId);
      const mentions = meta.participants.map((p) => p.id);
      const msg = `┏▣ *MENTION ALL* ▣\n┃ ${ctx.argText || 'attention everyone!'}\n┃ members: ${mentions.length}\n┗▣\n\n` +
        mentions.map((p) => '➽ @' + jidNumber(p)).join('\n');
      await ctx.sock.sendMessage(ctx.chatId, { text: msg, mentions }, { quoted: ctx.m });
    },
  },
  {
    name: 'hidetag', aliases: ['htag'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Tag everyone invisibly',
    handler: async (ctx) => {
      const meta = ctx.groupMeta || await getGroupMeta(ctx.sock, ctx.chatId);
      const mentions = meta.participants.map((p) => p.id);
      await ctx.sock.sendMessage(ctx.chatId, { text: ctx.argText || '🔥', mentions }, { quoted: ctx.m });
    },
  },
  {
    name: 'tagadmin', aliases: ['admins'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Tag all group admins',
    handler: async (ctx) => {
      const meta = ctx.groupMeta || await getGroupMeta(ctx.sock, ctx.chatId);
      const admins = meta.participants.filter((p) => p.admin).map((p) => p.id);
      await ctx.sock.sendMessage(ctx.chatId, {
        text: `📢 *Admins*\n${admins.map((a) => '➽ @' + jidNumber(a)).join('\n')}\n\n${ctx.argText || ''}`,
        mentions: admins,
      }, { quoted: ctx.m });
    },
  },

  {
    name: 'poll', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Create a poll',
    usage: 'poll question | option1 | option2 | …',
    handler: async (ctx) => {
      const [q, ...opts] = ctx.argText.split('|').map((s) => s.trim());
      if (!q || opts.length < 2) return ctx.reply(`Usage: ${ctx.prefix}poll best footballer | messi | ronaldo | hazard`);
      await ctx.sock.sendMessage(ctx.chatId, { poll: { name: q, values: opts.slice(0, 12), selectableCount: 1 } }, { quoted: ctx.m });
    },
  },

  {
    name: 'open', aliases: ['unlock'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Open the group (members can chat)',
    handler: async (ctx) => {
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'not_announcement');
      await ctx.reply('🔓 *Group opened* — everyone can chat');
    },
  },
  {
    name: 'close', aliases: ['lock'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Close the group (admins only)',
    handler: async (ctx) => {
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'announcement');
      await ctx.reply('🔒 *Group closed* — only admins can chat');
    },
  },
  {
    name: 'closetime', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Close group for a duration, then auto-open',
    usage: 'closetime 30m',
    handler: async (ctx) => {
      const ms = parseDuration(ctx.argText);
      if (!ms) return ctx.reply(`Usage: ${ctx.prefix}closetime 30m  (s/m/h/d)`);
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'announcement');
      await ctx.reply(`🔒 Group closed for *${ctx.argText}* — will auto-open`);
      setTimeout(async () => {
        try { await ctx.sock.groupSettingUpdate(ctx.chatId, 'not_announcement'); await ctx.sock.sendMessage(ctx.chatId, { text: '🔓 *Auto-open* — timer expired' }); } catch {}
      }, ms);
    },
  },
  {
    name: 'opentime', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Open group for a duration, then auto-close',
    usage: 'opentime 2h',
    handler: async (ctx) => {
      const ms = parseDuration(ctx.argText);
      if (!ms) return ctx.reply(`Usage: ${ctx.prefix}opentime 2h`);
      await ctx.sock.groupSettingUpdate(ctx.chatId, 'not_announcement');
      await ctx.reply(`🔓 Group open for *${ctx.argText}* — will auto-close`);
      setTimeout(async () => {
        try { await ctx.sock.groupSettingUpdate(ctx.chatId, 'announcement'); await ctx.sock.sendMessage(ctx.chatId, { text: '🔒 *Auto-close* — timer expired' }); } catch {}
      }, ms);
    },
  },

  {
    name: 'link', aliases: ['grouplink', 'invite'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Get the group invite link',
    handler: async (ctx) => {
      const code = await ctx.sock.groupInviteCode(ctx.chatId);
      await ctx.reply(`🔗 *${ctx.groupMeta?.subject || 'Group'}*\nhttps://chat.whatsapp.com/${code}`);
    },
  },
  {
    name: 'resetlink', aliases: ['revoke'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Revoke & regenerate the invite link',
    handler: async (ctx) => {
      const code = await ctx.sock.groupRevokeInvite(ctx.chatId);
      await ctx.reply('♻️ Link reset!\nhttps://chat.whatsapp.com/' + code);
    },
  },

  {
    name: 'ginfo', aliases: ['groupinfo'],
    category: 'Group', groupOnly: true,
    desc: 'Group details',
    handler: async (ctx) => {
      const meta = ctx.groupMeta || await getGroupMeta(ctx.sock, ctx.chatId);
      const admins = meta.participants.filter((p) => p.admin).map((p) => '+' + jidNumber(p.id));
      await ctx.reply(`┏▣ ◈ *GROUP INFO* ◈
┃ *name*: ${meta.subject}
┃ *id*: ${meta.id}
┃ *members*: ${meta.participants.length}
┃ *admins*: ${admins.length}
┃ *created*: ${new Date(meta.creation * 1000).toDateString()}
┗▣
> desc: ${meta.desc || '—'}`);
    },
  },
  {
    name: 'setgname', aliases: ['subject'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Change the group name',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}setgname <name>`);
      await ctx.sock.groupUpdateSubject(ctx.chatId, ctx.argText);
      await ctx.reply(`✅ Group name: *${ctx.argText}*`);
    },
  },
  {
    name: 'setgdesc', aliases: ['gdesc'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Change the group description',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}setgdesc <text>`);
      await ctx.sock.groupUpdateDescription(ctx.chatId, ctx.argText);
      await ctx.reply('✅ Description updated');
    },
  },
  {
    name: 'gpp', aliases: ['setgpp'],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Set group picture (reply to image)',
    handler: async (ctx) => {
      const media = await ctx.download();
      if (!media || media.type !== 'image') return ctx.reply('📸 Reply to an image');
      await ctx.sock.updateProfilePicture(ctx.chatId, media.buffer);
      await ctx.reply('✅ Group picture updated!');
    },
  },

  {
    name: 'warn', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Warn a member (3 = auto-kick)',
    usage: 'warn @user [reason]',
    handler: async (ctx) => {
      const user = await targetUser(ctx);
      if (!user) return ctx.reply('Reply / mention who to warn');
      const c = db.chat(ctx.chatId);
      const num = jidNumber(user);
      c.warnings[num] = (c.warnings[num] || 0) + 1;
      db.save();
      const count = c.warnings[num];
      if (count >= 3 && ctx.isBotAdmin) {
        try {
          await ctx.sock.groupParticipantsUpdate(ctx.chatId, [user], 'remove');
          c.warnings[num] = 0; db.save();
          return ctx.reply(`🚨 *@${num} kicked — 3/3 warnings!*`, { mentions: [user] });
        } catch {}
      }
      await ctx.reply(`⚠️ *@${num} warned (${count}/3)*\n> ${ctx.argText.split(/\s+/).slice(1).join(' ') || 'no reason given'}`, { mentions: [user] });
    },
  },
  {
    name: 'warnings', aliases: ['warnlist'],
    category: 'Group', groupOnly: true,
    desc: 'Show warning counts',
    handler: async (ctx) => {
      const c = db.chat(ctx.chatId);
      const entries = Object.entries(c.warnings).filter(([, v]) => v > 0);
      await ctx.reply(`⚠️ *Warnings here:*\n${entries.map(([n, v]) => `➽ +${n}: ${v}/3`).join('\n') || 'none 🎉'}`);
    },
  },
  {
    name: 'resetwarn', aliases: [],
    category: 'Group', adminOnly: true, groupOnly: true,
    desc: 'Clear warnings (reply/mention or all)',
    handler: async (ctx) => {
      const c = db.chat(ctx.chatId);
      if (ctx.argText.includes('all')) { c.warnings = {}; db.save(); return ctx.reply('✅ All warnings cleared'); }
      const user = await targetUser(ctx);
      if (!user) return ctx.reply(`Usage: ${ctx.prefix}resetwarn @user | all`);
      c.warnings[jidNumber(user)] = 0; db.save();
      await ctx.reply('✅ Warnings cleared');
    },
  },
]);
