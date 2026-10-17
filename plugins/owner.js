/**
 * plugins/owner.js — owner & sudo commands.
 */
const config = require('../lib/config');
const db = require('../lib/db');

module.exports = (reg) => reg.addAll([
  {
    name: 'block', aliases: [],
    category: 'Owner', ownerOnly: true,
    desc: 'Block a user (reply/mention or number)',
    usage: 'block @user',
    handler: async (ctx) => {
      const jid = await resolveTarget(ctx);
      if (!jid) return ctx.reply(`Usage: reply to a message or ${ctx.prefix}block <number|@user>`);
      await ctx.sock.updateBlockStatus(jid, 'block');
      await ctx.reply(`🚫 Blocked *+${require('../lib/handler').jidNumber(jid)}*`);
    },
  },
  {
    name: 'unblock', aliases: [],
    category: 'Owner', ownerOnly: true,
    desc: 'Unblock a user',
    handler: async (ctx) => {
      const jid = await resolveTarget(ctx);
      if (!jid) return ctx.reply('Usage: reply / mention / number');
      await ctx.sock.updateBlockStatus(jid, 'unblock');
      await ctx.reply('✅ Unblocked');
    },
  },
  {
    name: 'blocklist', aliases: ['listblock'],
    category: 'Owner', ownerOnly: true,
    desc: 'List blocked numbers',
    handler: async (ctx) => {
      const list = await ctx.sock.fetchBlocklist();
      await ctx.reply(`🚫 *Blocked (${list.length}):*\n${list.map((j) => '➽ +' + require('../lib/handler').jidNumber(j)).join('\n') || 'none'}`);
    },
  },

  {
    name: 'bc', aliases: ['broadcast'],
    category: 'Owner', ownerOnly: true,
    desc: 'Broadcast to all chats the bot has seen',
    usage: 'bc <text>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}bc <text>`);
      const chats = new Set(Object.keys(db.store.chats));
      let sent = 0;
      for (const jid of chats) {
        if (jid.endsWith('@broadcast') || jid.endsWith('status')) continue;
        try { await ctx.sock.sendMessage(jid, { text: `📣 *BROADCAST*\n\n${ctx.argText}\n\n> ${config.botName}` }); sent++; } catch {}
        await new Promise((r) => setTimeout(r, 350)); // avoid flood limits
      }
      await ctx.reply(`✅ Broadcast sent to *${sent}* chats`);
    },
  },
  {
    name: 'story', aliases: ['upsw', 'bcstatus'],
    category: 'Owner', ownerOnly: true,
    desc: 'Post text/image/video to your WhatsApp status (reply to media or type text)',
    handler: async (ctx) => {
      const opts = { statusJidList: [ctx.sender] };
      try {
        const media = await ctx.download();
        if (media) {
          const type = media.type === 'video' ? 'video' : 'image';
          await ctx.sock.sendMessage(ctx.sock.user.id, { [type]: media.buffer, caption: ctx.argText || '', ...opts });
          return ctx.reply('✅ Posted to status!');
        }
        if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}story <text> or reply to media`);
        await ctx.sock.sendMessage(ctx.sock.user.id, { text: ctx.argText, ...opts });
        await ctx.reply('✅ Posted to status!');
      } catch (e) {
        await ctx.reply('❌ Failed: ' + e.message);
      }
    },
  },

  {
    name: 'join', aliases: [],
    category: 'Owner', ownerOnly: true,
    desc: 'Join a group via invite link/code',
    usage: 'join <link|code>',
    handler: async (ctx) => {
      const code = ctx.argText.match(/chat\.whatsapp\.com\/(?:invite\/)?([\w-]+)/)?.[1] || ctx.argText.trim();
      try {
        const res = await ctx.sock.groupAcceptInvite(code);
        await ctx.reply('✅ Joined: ' + (res || 'group'));
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },
  {
    name: 'leave', aliases: ['gcleave'],
    category: 'Owner', ownerOnly: true, groupOnly: true,
    desc: 'Bot leaves this group',
    handler: async (ctx) => {
      await ctx.reply('👋 bye!').catch(() => {});
      await ctx.sock.groupLeave(ctx.chatId);
    },
  },

  {
    name: 'setname', aliases: ['setpname'],
    category: 'Owner', ownerOnly: true,
    desc: 'Change bot profile name',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}setname <name>`);
      await ctx.sock.updateProfileName(ctx.argText);
      await ctx.reply(`✅ Profile name: *${ctx.argText}*`);
    },
  },
  {
    name: 'setbio', aliases: [],
    category: 'Owner', ownerOnly: true,
    desc: 'Change bot profile status/bio',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}setbio <text>`);
      await ctx.sock.updateProfileStatus(ctx.argText);
      await ctx.reply(`✅ Bio set: *${ctx.argText}*`);
    },
  },
  {
    name: 'setpp', aliases: ['setprofilepic'],
    category: 'Owner', ownerOnly: true,
    desc: 'Set bot profile picture (reply to image)',
    handler: async (ctx) => {
      const media = await ctx.download();
      if (!media || media.type !== 'image') return ctx.reply('📸 Reply to an *image* with this command');
      await ctx.sock.updateProfilePicture(ctx.sock.user.id, media.buffer);
      await ctx.reply('✅ Profile picture updated!');
    },
  },
  {
    name: 'getpp', aliases: ['getpic'],
    category: 'Owner', ownerOnly: true,
    desc: 'Get profile picture of a user (reply/mention)',
    handler: async (ctx) => {
      const jid = await resolveTarget(ctx);
      if (!jid) return ctx.reply('Reply / mention / number needed');
      try {
        const url = await ctx.sock.profilePictureUrl(jid, 'image');
        await ctx.sock.sendMessage(ctx.chatId, { image: { url }, caption: '📸 profile picture' }, { quoted: ctx.m });
      } catch { await ctx.reply('❌ No profile picture set'); }
    },
  },

  {
    name: 'addsudo', aliases: [],
    category: 'Owner', ownerOnly: true,
    desc: 'Grant sudo access to a number',
    usage: 'addsudo <number>',
    handler: async (ctx) => {
      const num = ctx.argText.replace(/\D/g, '');
      if (!num) return ctx.reply(`Usage: ${ctx.prefix}addsudo <number>`);
      db.addSudo(num);
      await ctx.reply(`✅ *+${num}* is now a sudo user 🔑`);
    },
  },
  {
    name: 'delsudo', aliases: [],
    category: 'Owner', ownerOnly: true,
    desc: 'Remove sudo access',
    handler: async (ctx) => {
      const num = ctx.argText.replace(/\D/g, '');
      db.delSudo(num);
      await ctx.reply(`✅ Removed. Sudo users: ${db.sudos.map((n) => '+' + n).join(', ') || 'none'}`);
    },
  },
  {
    name: 'sudolist', aliases: ['listsudo'],
    category: 'Owner', ownerOnly: true,
    desc: 'List sudo users',
    handler: async (ctx) => {
      await ctx.reply(`🔑 *Sudo users:*\n${db.sudos.map((n) => '➽ +' + n).join('\n') || 'none'}`);
    },
  },

  {
    name: 'del', aliases: ['delete'],
    category: 'Owner', ownerOnly: true,
    desc: 'Delete a bot message (reply to it)',
    handler: async (ctx) => {
      const q = ctx.quoted;
      if (!q?.stanzaId) return ctx.reply('Reply to a bot message to delete it');
      await ctx.sock.sendMessage(ctx.chatId, { delete: { remoteJid: ctx.chatId, fromMe: true, id: q.stanzaId, participant: q.sender } });
    },
  },

  {
    name: 'restart', aliases: ['reboot'],
    category: 'Owner', ownerOnly: true,
    desc: 'Restart the bot process',
    handler: async (ctx) => {
      await ctx.reply('♻️ Restarting…');
      setTimeout(() => process.exit(0), 1200); // supervisor/pm2/web restart policy brings it back
    },
  },
]);

async function resolveTarget(ctx) {
  const mention = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mention) return mention;
  const q = ctx.quoted;
  if (q?.sender) return q.sender;
  const num = ctx.argText.replace(/\D/g, '');
  if (num) return num + '@s.whatsapp.net';
  return null;
}
