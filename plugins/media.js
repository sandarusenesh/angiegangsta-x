/**
 * plugins/media.js — stickers, conversion, emoji-mix, uploads, screenshots.
 */
const config = require('../lib/config');
const { makeStickerFromImage, setStickerExif, fetchBuffer, fetchJson, downloadMessageMedia, getSharp } = require('../lib/utils');
const { execFile } = require('child_process');

async function stickerFromContext(ctx) {
  const media = await ctx.download();
  if (!media) return null;
  if (media.type === 'image') return makeStickerFromImage(media.buffer, config.botName, config.ownerName);
  // video / gif / webp → pass to baileys natively (it converts mp4→animated webp)
  return media.buffer;
}

module.exports = (reg) => reg.addAll([
  {
    name: 'sticker', aliases: ['s', 'stiker'],
    category: 'Media',
    desc: 'Turn an image/video into a sticker (reply or caption)',
    usage: 'reply to media: .sticker',
    handler: async (ctx) => {
      const media = await ctx.download();
      if (!media) return ctx.reply(`📸 *Reply* to an image/video with ${ctx.prefix}sticker (or send media with ${ctx.prefix}sticker as caption)`);
      await ctx.react('⏳');
      try {
        let sticker;
        if (media.type === 'image') {
          sticker = await makeStickerFromImage(media.buffer, config.botName, config.ownerName);
        } else if (media.type === 'sticker') {
          sticker = await setStickerExif(media.buffer, config.botName, config.ownerName);
        } else {
          sticker = media.buffer; // video/gif — Baileys converts
        }
        await ctx.sendSticker(sticker);
        await ctx.react('✅');
      } catch (e) {
        await ctx.react('❌');
        await ctx.reply('❌ Sticker failed: ' + e.message);
      }
    },
  },

  {
    name: 'take', aliases: ['steal'],
    category: 'Media',
    desc: 'Re-brand a sticker with your pack name',
    usage: 'reply to sticker: .take [pack|author]',
    handler: async (ctx) => {
      const media = await ctx.download();
      if (!media || media.type !== 'sticker') return ctx.reply('🏷️ Reply to a *sticker*');
      const [pack, author] = ctx.argText.split('|').map((s) => s.trim());
      const out = await setStickerExif(media.buffer, pack || config.botName, author || config.ownerName);
      await ctx.sendSticker(out);
    },
  },

  {
    name: 'toimg', aliases: ['toimage'],
    category: 'Media',
    desc: 'Convert a sticker to a photo',
    usage: 'reply to sticker: .toimg',
    handler: async (ctx) => {
      const media = await ctx.download();
      if (!media || media.type !== 'sticker') return ctx.reply('🖼️ Reply to a *sticker*');
      const sharp = getSharp();
      if (!sharp) return ctx.reply('❌ sharp not installed — cannot convert');
      const png = await sharp(media.buffer).png().toBuffer();
      await ctx.sock.sendMessage(ctx.chatId, { image: png, caption: '🖼️ here you go!' }, { quoted: ctx.m });
    },
  },

  {
    name: 'smeme', aliases: ['stickermeme'],
    category: 'Media',
    desc: 'Sticker with caption text on an image (reply to image)',
    usage: 'smeme top text | bottom text',
    handler: async (ctx) => {
      const sharp = getSharp();
      if (!sharp) return ctx.reply('❌ sharp not installed');
      const media = await ctx.download();
      if (!media || media.type !== 'image') return ctx.reply('📸 Reply to an image');
      const parts = ctx.argText.split('|').map((s) => s.trim());
      const top = parts[0] || ' '; const bottom = parts[1] || '';
      const img = sharp(media.buffer);
      const meta = await img.metadata();
      const w = meta.width || 512;
      const svg = `<svg width="${w}" height="${Math.round(w * 0.3)}">
        <text x="50%" y="38%" font-size="${Math.round(w / 10)}" font-family="Impact, sans-serif" fill="white" stroke="black" stroke-width="3" text-anchor="middle" font-weight="bold">${escapeXml(top)}</text>
        ${bottom ? `<text x="50%" y="92%" font-size="${Math.round(w / 10)}" font-family="Impact, sans-serif" fill="white" stroke="black" stroke-width="3" text-anchor="middle" font-weight="bold">${escapeXml(bottom)}</text>` : ''}
      </svg>`;
      const composited = await img.composite([{ input: Buffer.from(svg), top: Math.round(-w * 0.05), left: 0 }]).toBuffer();
      const sticker = await makeStickerFromImage(composited, config.botName, config.ownerName);
      await ctx.sendSticker(sticker);
    },
  },

  {
    name: 'emojimix', aliases: ['emix'],
    category: 'Media',
    desc: 'Mix two emojis into a sticker',
    usage: 'emojimix 😅+😍',
    handler: async (ctx) => {
      const parts = ctx.argText.split('+').map((s) => s.trim());
      if (parts.length !== 2) return ctx.reply(`Usage: ${ctx.prefix}emojimix 😅+😍`);
      const key = 'AIzaSyAyimkuYQYQ_FXCVexr6V3CTzc6nBJZvyU'; // tenor public sample key (keyless usage)
      try {
        const data = await fetchJson(`https://tenor.googleapis.com/v2/search?key=${key}&q=${encodeURIComponent(parts.join(' '))}&limit=1&media_filter=gif&contentfilter=high`);
        const gifUrl = data?.results?.[0]?.media_formats?.gif?.url || data?.results?.[0]?.media_formats?.tinygif?.url;
        if (!gifUrl) return ctx.reply('❌ No mixed emoji found for that combo');
        const buf = await fetchBuffer(gifUrl);
        await ctx.sock.sendMessage(ctx.chatId, { sticker: buf }, { quoted: ctx.m });
      } catch (e) {
        await ctx.reply('❌ ' + e.message);
      }
    },
  },

  {
    name: 'tourl', aliases: ['url', 'upload'],
    category: 'Media',
    desc: 'Upload media and get a link (catbox.moe)',
    usage: 'reply to media: .tourl',
    handler: async (ctx) => {
      const media = await ctx.download();
      if (!media) return ctx.reply('📎 Reply to any media');
      await ctx.react('⏳');
      try {
        const fd = new FormData();
        fd.append('reqtype', 'fileupload');
        fd.append('fileToUpload', new Blob([media.buffer]), 'file.' + (media.type === 'image' ? 'png' : 'bin'));
        const res = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: fd, signal: AbortSignal.timeout(120000) });
        const url = (await res.text()).trim();
        if (!url.startsWith('http')) throw new Error('upload rejected');
        await ctx.react('✅');
        await ctx.reply(`🔗 *Your link:*\n${url}`);
      } catch (e) {
        await ctx.react('❌');
        await ctx.reply('❌ Upload failed: ' + e.message);
      }
    },
  },

  {
    name: 'ssweb', aliases: ['screenshot'],
    category: 'Media',
    desc: 'Screenshot a website',
    usage: 'ssweb <url>',
    handler: async (ctx) => {
      let url = ctx.argText.trim();
      if (!url) return ctx.reply(`Usage: ${ctx.prefix}ssweb https://example.com`);
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      await ctx.sock.sendMessage(ctx.chatId, {
        image: { url: `https://thum.io/get/width/1200/${url}` },
        caption: `🖥️ ${url}\n> ${config.botName}`,
      }, { quoted: ctx.m });
    },
  },

  {
    name: 'toaudio', aliases: ['tomp3'],
    category: 'Media',
    desc: 'Extract audio from a video (needs ffmpeg on host)',
    usage: 'reply to video: .toaudio',
    handler: async (ctx) => {
      const media = await ctx.download();
      if (!media || media.type !== 'video') return ctx.reply('🎬 Reply to a *video*');
      const ok = await new Promise((r) => execFile('ffmpeg', ['-version'], (e) => r(!e)));
      if (!ok) return ctx.reply('❌ ffmpeg is not installed on this host — deploy with a Dockerfile that includes ffmpeg');
      await ctx.react('⏳');
      const path = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'agx-'));
      const src = path + '/in.mp4'; const out = path + '/out.mp3';
      require('fs').writeFileSync(src, media.buffer);
      await new Promise((res, rej) => execFile('ffmpeg', ['-y', '-i', src, '-vn', '-b:a', '128k', out], (e) => (e ? rej(e) : res())));
      const buf = require('fs').readFileSync(out);
      await ctx.sock.sendMessage(ctx.chatId, { audio: buf, mimetype: 'audio/mpeg', ptt: false }, { quoted: ctx.m });
      await ctx.react('✅');
      require('fs').rmSync(path, { recursive: true, force: true });
    },
  },

  {
    name: 'vv', aliases: ['viewonce', 'reveal'],
    category: 'ViewOnce',
    desc: 'Unlock a view-once photo/video/audio (reply to it)',
    usage: 'reply: .vv',
    handler: async (ctx) => vvHandler(ctx, 'media'),
  },
  {
    name: 'vv2', aliases: [],
    category: 'ViewOnce',
    desc: 'Unlock view-once and send as document',
    handler: async (ctx) => vvHandler(ctx, 'document'),
  },
  {
    name: 'vv3', aliases: [],
    category: 'ViewOnce',
    desc: 'Unlock view-once image as sticker',
    handler: async (ctx) => vvHandler(ctx, 'sticker'),
  },
]);

async function vvHandler(ctx, mode) {
  const media = await downloadMessageMedia(ctx.sock, ctx.m, { preferQuoted: true });
  if (!media) {
    return ctx.reply(`🔓 *View-Once Unlocker*\n> reply to a *view once* photo/video/voice note with ${ctx.prefix}${ctx.command}`);
  }
  await ctx.react('🔓');
  try {
    if (mode === 'document') {
      const ext = media.mimetype.split('/')[1] || 'bin';
      await ctx.sock.sendMessage(ctx.chatId, {
        document: media.buffer, mimetype: media.mimetype,
        fileName: `viewonce-unlocked.${ext}`,
        caption: '🔓 unlocked by ' + config.botName,
      }, { quoted: ctx.m });
    } else if (mode === 'sticker' && media.type !== 'video' && media.type !== 'audio') {
      const s = await makeStickerFromImage(media.buffer, config.botName, config.ownerName);
      await ctx.sendSticker(s);
    } else if (media.type === 'video') {
      await ctx.sock.sendMessage(ctx.chatId, { video: media.buffer, caption: '🔓 *view once unlocked*' }, { quoted: ctx.m });
    } else if (media.type === 'audio') {
      await ctx.sock.sendMessage(ctx.chatId, { audio: media.buffer, mimetype: 'audio/mpeg', ptt: true }, { quoted: ctx.m });
    } else {
      await ctx.sock.sendMessage(ctx.chatId, { image: media.buffer, caption: '🔓 *view once unlocked*\n> ' + config.botName }, { quoted: ctx.m });
    }
    await ctx.react('✅');
  } catch (e) {
    await ctx.react('❌');
    await ctx.reply('❌ ' + e.message);
  }
}

function escapeXml(s) {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}
