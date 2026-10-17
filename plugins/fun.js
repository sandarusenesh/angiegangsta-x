/**
 * plugins/fun.js — games & fun interactions.
 */
const { pick } = require('../lib/utils');

module.exports = (reg) => reg.addAll([
  {
    name: 'joke', aliases: ['jokes'],
    category: 'Fun',
    desc: 'Random joke',
    handler: async (ctx) => {
      try {
        const d = await require('../lib/utils').fetchJson('https://v2.jokeapi.dev/joke/Any?safe-mode');
        await ctx.reply(d.type === 'single' ? `😂 ${d.joke}` : `😂 ${d.setup}\n\n||${d.delivery}||`);
      } catch { await ctx.reply('😂 Why did the programmer quit? Because he didn\'t get arrays. (offline joke)'); }
    },
  },
  {
    name: 'quote', aliases: ['quotes'],
    category: 'Fun',
    desc: 'Motivational quote',
    handler: async (ctx) => {
      const local = [
        'Discipline is choosing what you want most over what you want now.',
        'Small steps every day beat a big step once a year.',
        'You don\'t have to be great to start, but you have to start to be great.',
      ];
      try {
        const d = await require('../lib/utils').fetchJson('https://zenquotes.io/api/random', {}, 10000);
        await ctx.reply(`💬 "${d[0].q}"\n> — ${d[0].a}`);
      } catch { await ctx.reply(`💬 "${pick(local)}"\n> — ${require('../lib/config').botName}`); }
    },
  },
  {
    name: 'fact', aliases: ['facts'],
    category: 'Fun',
    desc: 'Random interesting fact',
    handler: async (ctx) => {
      try {
        const d = await require('../lib/utils').fetchJson('https://uselessfacts.jsph.pl/api/v2/facts/random');
        await ctx.reply(`🤓 ${d.text}`);
      } catch { await ctx.reply('🤓 Honey never spoils — 3000-year-old honey is still edible.'); }
    },
  },
  {
    name: '8ball', aliases: ['eightball'],
    category: 'Fun',
    desc: 'Ask the magic 8-ball',
    usage: '8ball will I be rich?',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Ask a question: ${ctx.prefix}8ball will today be great?`);
      const answers = ['It is certain ✅', 'Without a doubt ✅', 'Yes definitely ✅', 'Most likely 👍', 'Outlook good 👍', 'Ask again later 🤔', 'Better not tell you now 🤐', 'Concentrate and ask again 🔁', 'Don\'t count on it 👎', 'My reply is no ❌', 'Very doubtful 😬'];
      await ctx.reply(`🎱 ${ctx.argText}\n\n*${pick(answers)}*`);
    },
  },
  {
    name: 'truth', aliases: [],
    category: 'Fun',
    desc: 'Random truth question',
    handler: async (ctx) => {
      const t = ['What\'s the most embarrassing thing you\'ve done drunk?', 'Who was your first crush?', 'What\'s a lie you told that snowballed?', 'What secret talent do you hide?', 'Who in this chat would you trade lives with for a day?'];
      await ctx.reply(`🔴 *TRUTH*\n> ${pick(t)}`);
    },
  },
  {
    name: 'dare', aliases: [],
    category: 'Fun',
    desc: 'Random dare',
    handler: async (ctx) => {
      const d = ['Send a voice note singing the chorus of your favourite song 🎤', 'Text the 5th person in your chat list "I love you" 😅', 'Change your status to something silly for 1 hour', 'Do 10 pushups and send proof 💪', 'Post the oldest photo on your phone to status 📸'];
      await ctx.reply(`🟡 *DARE*\n> ${pick(d)}`);
    },
  },
  {
    name: 'ship', aliases: ['couple'],
    category: 'Fun',
    desc: 'Ship two users (mention two)',
    handler: async (ctx) => {
      const mentions = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      let a; let b;
      if (mentions.length >= 2) { [a, b] = mentions; }
      else if (mentions.length === 1) { a = ctx.sender; b = mentions[0]; }
      else { a = ctx.sender; b = ctx.sock.user.id; }
      const pct = Math.floor(Math.random() * 101);
      const hearts = '❤️'.repeat(Math.round(pct / 10)) + '🖤'.repeat(10 - Math.round(pct / 10));
      await ctx.reply(`💌 *LOVE SHIP*\n@${a.split('@')[0]} × @${b.split('@')[0]}\n\n${hearts}\n*${pct}%* ${pct > 80 ? '— soulmates!! 😍' : pct > 50 ? '— strong match 🔥' : pct > 20 ? '— maybe with work 🌱' : '— hmm… risky 💀'}`, { mentions: [a, b] });
    },
  },
  {
    name: 'rps', aliases: ['rockpaperscissors'],
    category: 'Fun',
    desc: 'Rock paper scissors vs bot',
    usage: 'rps rock',
    handler: async (ctx) => {
      const user = ctx.argText.toLowerCase().trim();
      const map = { rock: '🪨', paper: '📄', scissors: '✂️' };
      if (!map[user]) return ctx.reply(`Usage: ${ctx.prefix}rps rock|paper|scissors`);
      const bot = pick(Object.keys(map));
      const win = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
      const res = user === bot ? 'DRAW 🤝' : win[user] === bot ? 'YOU WIN 🎉' : 'I WIN 😎';
      await ctx.reply(`You: ${map[user]}\nMe: ${map[bot]}\n\n*${res}*`);
    },
  },
  {
    name: 'slap', aliases: [],
    category: 'Fun',
    desc: 'Slap someone (reply/mention)',
    handler: async (ctx) => {
      const u = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || ctx.quoted?.sender;
      if (!u) return ctx.reply('Mention who to slap 👋');
      await ctx.reply(`👋 *@${ctx.senderNumber} slapped @${u.split('@')[0]} — ${pick(['WAKE UP!', 'for the memes', 'they deserved it', 'too slow'])}*`, { mentions: [ctx.sender, u] });
    },
  },
  {
    name: 'hug', aliases: [],
    category: 'Fun',
    desc: 'Hug someone (reply/mention)',
    handler: async (ctx) => {
      const u = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || ctx.quoted?.sender;
      if (!u) return ctx.reply('Mention who to hug 🤗');
      await ctx.reply(`🤗 *@${ctx.senderNumber} hugged @${u.split('@')[0]} — cozy!*`, { mentions: [ctx.sender, u] });
    },
  },
  {
    name: 'kiss', aliases: [],
    category: 'Fun',
    desc: 'Kiss someone (reply/mention)',
    handler: async (ctx) => {
      const u = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || ctx.quoted?.sender;
      if (!u) return ctx.reply('Mention who to kiss 😘');
      await ctx.reply(`😘 *@${ctx.senderNumber} kissed @${u.split('@')[0]} — mwah!*`, { mentions: [ctx.sender, u] });
    },
  },
  {
    name: 'flirt', aliases: [],
    category: 'Fun',
    desc: 'Random pickup line',
    handler: async (ctx) => {
      const lines = ['Are you a parking ticket? Because you\'ve got FINE written all over you 😏', 'Do you have a map? I keep getting lost in your eyes 🗺️', 'Is your name Wi-Fi? Because I\'m feeling a connection 📶', 'Are you French? Because Eiffel for you 💘', 'I was blinded by your beauty… I\'m going to need your name and number for insurance purposes 🤕'];
      await ctx.reply(`😏 ${pick(lines)}`);
    },
  },
  {
    name: 'dice', aliases: ['roll'],
    category: 'Fun',
    desc: 'Roll a dice',
    handler: async (ctx) => {
      const n = Math.floor(Math.random() * 6) + 1;
      const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      await ctx.reply(`🎲 ${faces[n - 1]} *${n}*`);
    },
  },
  {
    name: 'coin', aliases: ['cointoss'],
    category: 'Fun',
    desc: 'Flip a coin',
    handler: async (ctx) => ctx.reply(`🪙 *${pick(['HEADS', 'TAILS'])}*`),
  },
  {
    name: 'lovecalc', aliases: ['love'],
    category: 'Fun',
    desc: 'Love compatibility (mention two)',
    handler: async (ctx) => {
      const mentions = ctx.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
      const a = mentions[0] || ctx.sender; const b = mentions[1] || ctx.sock.user.id;
      const pct = Math.floor(Math.random() * 101);
      await ctx.reply(`💘 *LOVE CALCULATOR*\n@${a.split('@')[0]} + @${b.split('@')[0]} = *${pct}%*\n${pct > 75 ? 'marry already!! 💍' : pct > 40 ? 'it can work 🌹' : 'friendship is safer 😅'}`, { mentions: [a, b] });
    },
  },
  {
    name: 'rate', aliases: ['rated'],
    category: 'Fun',
    desc: 'Rate something/someone',
    handler: async (ctx) => {
      const pct = Math.floor(Math.random() * 101);
      await ctx.reply(`📊 ${ctx.argText || 'you'} = *${pct}%* ${pct > 80 ? '🔥🔥' : pct > 50 ? '👍' : '💀'}`);
    },
  },
  {
    name: 'pick', aliases: ['choose'],
    category: 'Fun',
    desc: 'Bot picks one of your options',
    usage: 'pick option1 | option2 | …',
    handler: async (ctx) => {
      const opts = ctx.argText.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
      if (opts.length < 2) return ctx.reply(`Usage: ${ctx.prefix}pick tea | coffee | juice`);
      await ctx.reply(`🤔 I choose: *${pick(opts)}*`);
    },
  },
]);
