/**
 * plugins/search.js — search & info lookups.
 */
const { fetchJson } = require('../lib/utils');

module.exports = (reg) => reg.addAll([
  {
    name: 'yts', aliases: ['ytsearch', 'yt'],
    category: 'Search',
    desc: 'Search YouTube videos',
    usage: 'yts <query>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}yts <query>`);
      const yts = require('yt-search');
      const r = await yts(ctx.argText);
      const vids = r.videos.slice(0, 8);
      if (!vids.length) return ctx.reply('❌ No results');
      const lines = vids.map((v, i) =>
        `┏▣ *${i + 1}. ${v.title}*\n┃ ⏱️ ${v.timestamp} • 👁️ ${v.views.toLocaleString()}\n┃ ▶️ ${v.url}\n┗▣`).join('\n');
      await ctx.reply(`🔎 *YouTube results for "${ctx.argText}"*\n\n${lines}`);
    },
  },
  {
    name: 'element', aliases: ['periodictable'],
    category: 'Search',
    desc: 'Chemical element info',
    usage: 'element Fe',
    handler: async (ctx) => {
      const q = ctx.argText.trim().toLowerCase();
      if (!q) return ctx.reply(`Usage: ${ctx.prefix}element fe`);
      try {
        const d = await fetchJson(`https://api.periodic-table.tech/v1/elements`);
        const el = d.find((e) => e.symbol.toLowerCase() === q || e.name.toLowerCase() === q || String(e.number) === q);
        if (!el) return ctx.reply('❌ Element not found');
        await ctx.reply(`🧪 *${el.name} (${el.symbol})*
> atomic number: ${el.number}
> mass: ${el.atomic_mass}
> category: ${el.category}
> phase: ${el.phase}
> discovered by: ${el.discovered_by || '—'}`);
      } catch { await ctx.reply('❌ lookup failed'); }
    },
  },
  {
    name: 'wikipedia', aliases: ['wiki'],
    category: 'Search',
    desc: 'Wikipedia summary',
    usage: 'wiki <topic>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}wiki Kenya`);
      try {
        const d = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(ctx.argText)}`);
        if (d.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') throw new Error('not found');
        await ctx.reply(`📖 *${d.title}*\n\n${d.extract}\n\n> ${d.content_urls?.desktop?.page || ''}`);
      } catch { await ctx.reply('❌ No article found'); }
    },
  },
  {
    name: 'anime', aliases: [],
    category: 'Search',
    desc: 'Search an anime',
    usage: 'anime naruto',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}anime <title>`);
      try {
        const d = await fetchJson(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(ctx.argText)}&limit=1`);
        const a = d.data?.[0];
        if (!a) throw new Error('not found');
        await ctx.reply(`🌸 *${a.title}* (${a.year || '—'})
> score: ⭐ ${a.score || '—'}
> episodes: ${a.episodes || '?'}
> status: ${a.status}
> genres: ${(a.genres || []).map((g) => g.name).join(', ')}
> synopsis: ${(a.synopsis || '').slice(0, 400)}…`);
      } catch { await ctx.reply('❌ Not found'); }
    },
  },
]);
