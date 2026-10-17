/**
 * plugins/download.js — song/video (YouTube), TikTok, mediafire, gitclone, etc.
 */
const config = require('../lib/config');
const { fetchJson, fetchBuffer, formatBytes } = require('../lib/utils');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function ytFind(query) {
  const yts = require('yt-search');
  const r = await yts(query);
  return r.videos?.[0] || null;
}

async function ytDownload(ctx, { mode, asDocument = false }) {
  let url = ctx.argText.trim();
  if (!url || !url.startsWith('http')) {
    await ctx.reply(`🔍 Searching: *${ctx.argText || '…'}*`);
    const found = await ytFind(ctx.argText);
    if (!found) return ctx.reply('❌ Nothing found');
    url = found.url;
    var title = found.title; var duration = found.timestamp;
  }
  await ctx.react('⏳');
  const ytdl = require('@distube/ytdl-core');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agx-'));
  try {
    const isAudio = mode === 'audio';
    const file = tmp + '/media.' + (isAudio ? 'm4a' : 'mp4');
    await new Promise((res, rej) => {
      const stream = ytdl(url, isAudio
        ? { filter: 'audioonly', quality: 'highestaudio' }
        : { filter: 'videoandaudio', quality: asDocument ? '18' : 'highest' });
      const out = fs.createWriteStream(file);
      stream.on('error', rej);
      out.on('error', rej);
      stream.pipe(out);
      out.on('finish', () => res());
      setTimeout(() => rej(new Error('download timeout (3 min)')), 180000);
    });
    const size = fs.statSync(file).size;
    if (size > (asDocument ? 180 : 60) * 1024 * 1024) throw new Error(`file too big (${formatBytes(size)})`);
    const buf = fs.readFileSync(file);
    const title2 = title || 'media';
    if (isAudio) {
      await ctx.sock.sendMessage(ctx.chatId, {
        audio: buf, mimetype: 'audio/mp4',
        fileName: `${title2}.m4a`,
        caption: asDocument ? undefined : `🎵 *${title2}* (${duration || ''})\n> ${config.botName}`,
      }, asDocument ? { quoted: ctx.m, asDocument: true } : { quoted: ctx.m });
    } else {
      await ctx.sock.sendMessage(ctx.chatId, {
        video: buf, mimetype: 'video/mp4',
        fileName: `${title2}.mp4`,
        caption: asDocument ? `🎬 *${title2}*\n${formatBytes(size)}` : `🎬 *${title2}* (${duration || ''})\n> ${config.botName}`,
      }, { quoted: ctx.m });
    }
    await ctx.react('✅');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = (reg) => reg.addAll([
  {
    name: 'song', aliases: ['play', 'yta', 'music'],
    category: 'Download',
    desc: 'Download a song from YouTube',
    usage: 'song <name or link>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}song <song name or youtube link>`);
      await ytDownload(ctx, { mode: 'audio' });
    },
  },
  {
    name: 'video', aliases: ['ytmp4', 'mp4'],
    category: 'Download',
    desc: 'Download a video from YouTube',
    usage: 'video <name or link>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}video <name or youtube link>`);
      await ytDownload(ctx, { mode: 'video' });
    },
  },
  {
    name: 'ytmp3', aliases: ['songdoc'],
    category: 'Download',
    desc: 'YouTube audio as document',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}ytmp3 <name or link>`);
      await ytDownload(ctx, { mode: 'audio', asDocument: true });
    },
  },

  {
    name: 'tiktok', aliases: ['tt', 'tiktokdl'],
    category: 'Download',
    desc: 'Download a TikTok video (no watermark)',
    usage: 'tiktok <link>',
    handler: async (ctx) => {
      const url = ctx.argText.trim();
      if (!url.includes('tiktok.com')) return ctx.reply(`Usage: ${ctx.prefix}tiktok <tiktok link>`);
      await ctx.react('⏳');
      try {
        const data = await fetchJson('https://tikwm.com/api/?url=' + encodeURIComponent(url));
        const d = data?.data;
        if (!d?.play) throw new Error('video unavailable');
        const buf = await fetchBuffer(d.play);
        await ctx.sock.sendMessage(ctx.chatId, {
          video: buf, caption: `🎬 *TikTok*\n> @${d.author?.unique_id || 'user'}\n> ${config.botName}`,
        }, { quoted: ctx.m });
        await ctx.react('✅');
      } catch (e) { await ctx.react('❌'); await ctx.reply('❌ ' + e.message); }
    },
  },
  {
    name: 'tiktokaudio', aliases: ['tta'],
    category: 'Download',
    desc: 'TikTok audio only',
    handler: async (ctx) => {
      const url = ctx.argText.trim();
      if (!url.includes('tiktok.com')) return ctx.reply(`Usage: ${ctx.prefix}tiktokaudio <link>`);
      try {
        const data = await fetchJson('https://tikwm.com/api/?url=' + encodeURIComponent(url));
        const music = data?.data?.music;
        if (!music) throw new Error('no audio found');
        const buf = await fetchBuffer(music);
        await ctx.sock.sendMessage(ctx.chatId, { audio: buf, mimetype: 'audio/mpeg' }, { quoted: ctx.m });
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },

  {
    name: 'instagram', aliases: ['ig'],
    category: 'Download',
    desc: 'Download Instagram media (via APIFY-like env or public API)',
    usage: 'instagram <link>',
    handler: async (ctx) => {
      const url = ctx.argText.trim();
      if (!url.includes('instagram.com')) return ctx.reply(`Usage: ${ctx.prefix}instagram <link>`);
      const api = process.env.IG_API_URL;
      if (!api) return ctx.reply('⚙️ Set *IG_API_URL* env (an API that returns {url} for an instagram link) to enable this');
      try {
        const data = await fetchJson(api.replace('{url}', encodeURIComponent(url)));
        const mediaUrl = data?.url || data?.[0]?.url;
        if (!mediaUrl) throw new Error('no media in response');
        const buf = await fetchBuffer(mediaUrl);
        await ctx.sock.sendMessage(ctx.chatId, { image: buf, caption: '📸 Instagram' }, { quoted: ctx.m });
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },
  {
    name: 'facebook', aliases: ['fb'],
    category: 'Download',
    desc: 'Download Facebook video',
    usage: 'facebook <link>',
    handler: async (ctx) => {
      const url = ctx.argText.trim();
      if (!url.includes('facebook.com') && !url.includes('fb.watch')) return ctx.reply(`Usage: ${ctx.prefix}facebook <link>`);
      await ctx.react('⏳');
      try {
        const data = await fetchJson('https://tikwm.com/api/fb?url=' + encodeURIComponent(url));
        const mediaUrl = data?.data?.hd || data?.data?.sd;
        if (!mediaUrl) throw new Error('video unavailable');
        const buf = await fetchBuffer(mediaUrl);
        await ctx.sock.sendMessage(ctx.chatId, { video: buf, caption: '🎬 Facebook' }, { quoted: ctx.m });
        await ctx.react('✅');
      } catch (e) { await ctx.react('❌'); await ctx.reply('❌ ' + e.message); }
    },
  },
  {
    name: 'twitter', aliases: ['tw', 'x'],
    category: 'Download',
    desc: 'Download X/Twitter video',
    usage: 'twitter <link>',
    handler: async (ctx) => {
      const url = ctx.argText.trim();
      if (!/(twitter|x)\.com/.test(url)) return ctx.reply(`Usage: ${ctx.prefix}twitter <link>`);
      await ctx.react('⏳');
      try {
        const data = await fetchJson('https://tikwm.com/api/tw?url=' + encodeURIComponent(url));
        const mediaUrl = data?.data?.hd || data?.data?.sd || data?.data?.url;
        if (!mediaUrl) throw new Error('video unavailable');
        const buf = await fetchBuffer(mediaUrl);
        await ctx.sock.sendMessage(ctx.chatId, { video: buf, caption: '🎬 X/Twitter' }, { quoted: ctx.m });
        await ctx.react('✅');
      } catch (e) { await ctx.react('❌'); await ctx.reply('❌ ' + e.message); }
    },
  },

  {
    name: 'mediafire', aliases: ['mf'],
    category: 'Download',
    desc: 'Download a mediafire file',
    usage: 'mediafire <link>',
    handler: async (ctx) => {
      const url = ctx.argText.trim();
      if (!url.includes('mediafire.com')) return ctx.reply(`Usage: ${ctx.prefix}mediafire <link>`);
      await ctx.react('⏳');
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
        const html = await res.text();
        const link = html.match(/href="(https:\/\/download\d+\.mediafire\.com\/[^"]+)"/)?.[1];
        if (!link) throw new Error('direct link not found');
        const name = decodeURIComponent(link.split('/').pop().replace(/\?.*/, ''));
        const buf = await fetchBuffer(link, {}, 180000);
        await ctx.sock.sendMessage(ctx.chatId, { document: buf, mimetype: 'application/octet-stream', fileName: name, caption: `📦 ${name}\n${formatBytes(buf.length)}` }, { quoted: ctx.m });
        await ctx.react('✅');
      } catch (e) { await ctx.react('❌'); await ctx.reply('❌ ' + e.message); }
    },
  },

  {
    name: 'gitclone', aliases: ['gitzip'],
    category: 'Download',
    desc: 'Download a GitHub repo as zip',
    usage: 'gitclone <user/repo>',
    handler: async (ctx) => {
      const slug = ctx.argText.match(/([\w.-]+\/[\w.-]+)/)?.[1];
      if (!slug) return ctx.reply(`Usage: ${ctx.prefix}gitclone <user/repo or link>`);
      await ctx.react('⏳');
      try {
        let zip = await fetchBuffer(`https://github.com/${slug}/archive/refs/heads/main.zip`, { redirect: 'follow' }, 120000);
        if (zip.length < 300) throw new Error('fallback');
        await sendZip(ctx, zip, slug);
      } catch {
        try {
          const zip = await fetchBuffer(`https://github.com/${slug}/archive/refs/heads/master.zip`, { redirect: 'follow' }, 120000);
          await sendZip(ctx, zip, slug);
        } catch (e) { await ctx.react('❌'); await ctx.reply('❌ Repo not found or private'); }
      }
    },
  },

  {
    name: 'image', aliases: ['photo'],
    category: 'Download',
    desc: 'AI image search/generation (keyless)',
    usage: 'image <prompt>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}image <prompt>`);
      await ctx.react('⏳');
      try {
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(ctx.argText)}?width=1024&height=1024&nologo=true`;
        await ctx.sock.sendMessage(ctx.chatId, { image: { url }, caption: `🖼️ *${ctx.argText}*\n> ${config.botName}` }, { quoted: ctx.m });
        await ctx.react('✅');
      } catch (e) { await ctx.react('❌'); await ctx.reply('❌ ' + e.message); }
    },
  },
]);

async function sendZip(ctx, zip, slug) {
  await ctx.sock.sendMessage(ctx.chatId, {
    document: zip, mimetype: 'application/zip',
    fileName: slug.replace('/', '-') + '.zip',
    caption: `📦 ${slug}\n> ${config.botName}`,
  }, { quoted: ctx.m });
  await ctx.react('✅');
}
