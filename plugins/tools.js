/**
 * plugins/tools.js — calculators, converters, lookups, generators.
 */
const crypto = require('crypto');
const { fetchJson, fetchBuffer, fancyText, formatBytes } = require('../lib/utils');

module.exports = (reg) => reg.addAll([
  {
    name: 'calc', aliases: ['calculate', 'math'],
    category: 'Tools',
    desc: 'Evaluate a math expression',
    usage: 'calc 2*(3+4)/7',
    handler: async (ctx) => {
      const expr = ctx.argText;
      if (!expr) return ctx.reply(`Usage: ${ctx.prefix}calc 12*(3+4)`);
      const safe = expr.replace(/[^0-9+\-*/().,%\s^]/g, '').replace(/\^/g, '**');
      try {
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return (' + safe + ')')();
        await ctx.reply(`🔢 ${expr} = *${result}*`);
      } catch { await ctx.reply('❌ Invalid expression'); }
    },
  },

  {
    name: 'qr', aliases: ['qrcode'],
    category: 'Tools',
    desc: 'Generate a QR code image',
    usage: 'qr <text>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}qr <text>`);
      try {
        const QRCode = require('qrcode');
        const png = await QRCode.toBuffer(ctx.argText, { width: 512, margin: 2 });
        await ctx.sock.sendMessage(ctx.chatId, { image: png, caption: `📱 ${ctx.argText.slice(0, 100)}` }, { quoted: ctx.m });
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },

  {
    name: 'shorten', aliases: ['tinyurl', 'shorturl'],
    category: 'Tools',
    desc: 'Shorten a URL',
    usage: 'shorten <url>',
    handler: async (ctx) => {
      const url = ctx.argText.trim();
      if (!/^https?:\/\//.test(url)) return ctx.reply(`Usage: ${ctx.prefix}shorten https://…`);
      try {
        const data = await fetchJson('https://tinyurl.com/api-create.php?url=' + encodeURIComponent(url), {}, 15000);
        await ctx.reply(`🔗 ${url}\n✂️ ${data}`);
      } catch { await ctx.reply('❌ Shortening failed'); }
    },
  },

  {
    name: 'define', aliases: ['dictionary'],
    category: 'Tools',
    desc: 'Dictionary definition of a word',
    usage: 'define <word>',
    handler: async (ctx) => {
      const word = ctx.argText.trim();
      if (!word) return ctx.reply(`Usage: ${ctx.prefix}define serendipity`);
      try {
        const data = await fetchJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        const entry = data[0];
        const phon = entry.phonetic || entry.phonetics?.find((p) => p.text)?.text || '';
        const meanings = entry.meanings.slice(0, 3).map((m) =>
          `*${m.partOfSpeech}*\n${m.definitions.slice(0, 2).map((d) => '➽ ' + d.definition).join('\n')}`).join('\n\n');
        await ctx.reply(`📖 *${entry.word}* ${phon}\n\n${meanings}`);
      } catch { await ctx.reply(`❌ No definition found for *${word}*`); }
    },
  },

  {
    name: 'weather', aliases: ['climate'],
    category: 'Tools',
    desc: 'Current weather for a city',
    usage: 'weather Nairobi',
    handler: async (ctx) => {
      const city = ctx.argText.trim();
      if (!city) return ctx.reply(`Usage: ${ctx.prefix}weather Nairobi`);
      try {
        const data = await fetchJson(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
        const cur = data.current_condition[0];
        await ctx.reply(`🌦️ *Weather — ${city}*
> 🌡️ temp: ${cur.temp_C}°C (feels ${cur.FeelsLikeC}°C)
> ☁️ ${cur.weatherDesc[0].value}
> 💧 humidity: ${cur.humidity}%
> 🌬️ wind: ${cur.windspeedKmph} km/h`);
      } catch { await ctx.reply('❌ City not found'); }
    },
  },

  {
    name: 'lyrics', aliases: ['lyric'],
    category: 'Tools',
    desc: 'Song lyrics',
    usage: 'lyrics <song name>',
    handler: async (ctx) => {
      const q = ctx.argText.trim();
      if (!q) return ctx.reply(`Usage: ${ctx.prefix}lyrics <song name>`);
      try {
        const data = await fetchJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
        const hit = data.find((d) => d.plainLyrics);
        if (!hit) throw new Error('no lyrics found');
        await ctx.reply(`🎵 *${hit.trackName}*\n> ${hit.artistName}\n\n${hit.plainLyrics.slice(0, 3500)}`);
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },

  {
    name: 'base64', aliases: ['b64'],
    category: 'Tools',
    desc: 'Encode/decode base64',
    usage: 'base64 encode <text> | base64 decode <b64>',
    handler: async (ctx) => {
      const [mode, ...rest] = ctx.args;
      const text = rest.join(' ');
      if (!mode || !text) return ctx.reply(`Usage: ${ctx.prefix}base64 encode hello | ${ctx.prefix}base64 decode aGVsbG8=`);
      try {
        if (mode === 'encode') await ctx.reply('🔐 ' + Buffer.from(text, 'utf-8').toString('base64'));
        else await ctx.reply('🔓 ' + Buffer.from(text, 'base64').toString('utf-8'));
      } catch { await ctx.reply('❌ Invalid base64'); }
    },
  },

  {
    name: 'hash', aliases: [],
    category: 'Tools',
    desc: 'MD5 / SHA256 of a text',
    usage: 'hash <text>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}hash <text>`);
      await ctx.reply(`🔐 *Hashes of your text*\n> md5: ${crypto.createHash('md5').update(ctx.argText).digest('hex')}\n> sha256: ${crypto.createHash('sha256').update(ctx.argText).digest('hex')}`);
    },
  },

  {
    name: 'uuid', aliases: [],
    category: 'Tools',
    desc: 'Generate a random UUID',
    handler: async (ctx) => ctx.reply(`🆔 \`${crypto.randomUUID()}\``),
  },

  {
    name: 'pass', aliases: ['genpass', 'password'],
    category: 'Tools',
    desc: 'Generate a strong password',
    usage: 'pass [length]',
    handler: async (ctx) => {
      const len = Math.min(64, parseInt(ctx.args[0]) || 14);
      const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*?';
      const bytes = crypto.randomBytes(len);
      let out = '';
      for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
      await ctx.reply(`🔑 *Your password:*\n\`${out}\`\n> keep it secret 🤫`);
    },
  },

  {
    name: 'fancy', aliases: ['font'],
    category: 'Tools',
    desc: 'Convert text to fancy unicode fonts',
    usage: 'fancy <text>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}fancy hello`);
      await ctx.reply('✨ *Fancy fonts*\n\n' + fancyText(ctx.argText));
    },
  },

  {
    name: 'fliptext', aliases: ['flip'],
    category: 'Tools',
    desc: 'Flip text upside down',
    handler: async (ctx) => {
      const map = { a: 'ɐ', b: 'q', c: 'ɔ', d: 'p', e: 'ǝ', f: 'ɟ', g: 'ƃ', h: 'ɥ', i: 'ᴉ', j: 'ɾ', k: 'ʞ', l: 'l', m: 'ɯ', n: 'u', o: 'o', p: 'd', q: 'b', r: 'ɹ', s: 's', t: 'ʇ', u: 'n', v: 'ʌ', w: 'ʍ', x: 'x', y: 'ʎ', z: 'z', '?': '¿', '!': '¡', '.': '˙', ',': "'" };
      const out = ctx.argText.toLowerCase().split('').reverse().map((c) => map[c] || c).join('');
      await ctx.reply(out || '…');
    },
  },

  {
    name: 'readmore', aliases: ['rm'],
    category: 'Tools',
    desc: 'Hide text behind "Read more"',
    usage: 'readmore visible-text | hidden-text',
    handler: async (ctx) => {
      const [visible, hidden] = ctx.argText.split('|');
      if (!hidden) return ctx.reply(`Usage: ${ctx.prefix}readmore seen text | hidden text`);
      await ctx.reply(`${visible || ''}\u200e`.repeat(1) + '\u200e'.repeat(800) + (hidden || ''));
    },
  },

  {
    name: 'trackip', aliases: ['ip'],
    category: 'Tools',
    desc: 'IP address lookup',
    usage: 'trackip <ip>',
    handler: async (ctx) => {
      const ip = ctx.argText.trim();
      if (!/^[\d.]+$/.test(ip)) return ctx.reply(`Usage: ${ctx.prefix}trackip 8.8.8.8`);
      try {
        const d = await fetchJson(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query`);
        if (d.status !== 'success') throw new Error('lookup failed');
        await ctx.reply(`🌐 *IP ${d.query}*
> 📍 ${d.city}, ${d.regionName}, ${d.country}
> 🕐 ${d.timezone}
> 🏢 ISP: ${d.isp}
> 🔖 org: ${d.org || '—'}
> coords: ${d.lat}, ${d.lon}`);
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },

  {
    name: 'sitecheck', aliases: ['pingweb'],
    category: 'Tools',
    desc: 'Check if a website is up',
    usage: 'sitecheck <url>',
    handler: async (ctx) => {
      let url = ctx.argText.trim();
      if (!url) return ctx.reply(`Usage: ${ctx.prefix}sitecheck example.com`);
      if (!/^https?:\/\//.test(url)) url = 'https://' + url;
      const t = Date.now();
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        await ctx.reply(`✅ *${url}* is UP\n> status: ${res.status}\n> time: ${Date.now() - t} ms`);
      } catch {
        await ctx.reply(`❌ *${url}* is DOWN or unreachable (${Date.now() - t} ms)`);
      }
    },
  },

  {
    name: 'bmi', aliases: [],
    category: 'Tools',
    desc: 'Body Mass Index',
    usage: 'bmi <weight-kg> <height-m>',
    handler: async (ctx) => {
      const [w, h] = ctx.args.map(Number);
      if (!w || !h) return ctx.reply(`Usage: ${ctx.prefix}bmi 70 1.75`);
      const bmi = w / (h * h);
      const cat = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal ✅' : bmi < 30 ? 'Overweight' : 'Obese';
      await ctx.reply(`⚖️ *BMI: ${bmi.toFixed(1)}* — ${cat}`);
    },
  },

  {
    name: 'roman', aliases: [],
    category: 'Tools',
    desc: 'Convert number ↔ roman numerals',
    usage: 'roman 42 | roman XLII',
    handler: async (ctx) => {
      const input = ctx.argText.trim().toUpperCase();
      if (/^\d+$/.test(input)) {
        const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
        let n = parseInt(input); let out = '';
        for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
        return ctx.reply(`🔢 ${input} = *${out}*`);
      }
      const vals = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
      let total = 0;
      for (let i = 0; i < input.length; i++) {
        if (vals[input[i + 1]] > vals[input[i]]) total -= vals[input[i]];
        else total += vals[input[i]];
      }
      await ctx.reply(`🔢 ${input} = *${total}*`);
    },
  },

  {
    name: 'unit', aliases: ['convert'],
    category: 'Tools',
    desc: 'Convert units',
    usage: 'unit 10 km to miles',
    handler: async (ctx) => {
      const m = ctx.argText.match(/^([\d.]+)\s*(\w+)\s*(?:to|in)\s*(\w+)$/i);
      if (!m) return ctx.reply(`Usage: ${ctx.prefix}unit 10 km to miles`);
      const val = parseFloat(m[1]); const from = m[2].toLowerCase(); const to = m[3].toLowerCase();
      const factors = {
        km: 1000, m: 1, cm: 0.01, mi: 1609.34, miles: 1609.34, mile: 1609.34, ft: 0.3048, feet: 0.3048,
        kg: 1, g: 0.001, lb: 0.453592, lbs: 0.453592, oz: 0.0283495,
      };
      const sameDim = (a, b) => {
        const dims = { length: ['km', 'm', 'cm', 'mi', 'miles', 'mile', 'ft', 'feet'], mass: ['kg', 'g', 'lb', 'lbs', 'oz'] };
        return (dims.length.includes(a) && dims.length.includes(b)) || (dims.mass.includes(a) && dims.mass.includes(b));
      };
      if (!factors[from] || !factors[to] || !sameDim(from, to)) return ctx.reply('❌ Unsupported conversion');
      const result = (val * factors[from]) / factors[to];
      await ctx.reply(`📐 ${val} ${from} = *${result.toFixed(4)} ${to}*`);
    },
  },
]);
