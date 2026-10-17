/**
 * plugins/aicmds.js — AI commands (chat, image, translate, tts).
 */
const config = require('../lib/config');
const ai = require('../lib/ai');
const { fetchBuffer } = require('../lib/utils');

const LANGS = {
  en: 'English', sw: 'Swahili', fr: 'French', es: 'Spanish', de: 'German',
  pt: 'Portuguese', it: 'Italian', ar: 'Arabic', hi: 'Hindi', zh: 'Chinese',
  ja: 'Japanese', ko: 'Korean', ru: 'Russian', am: 'Amharic', yo: 'Yoruba', ig: 'Igbo',
};

module.exports = (reg) => reg.addAll([
  {
    name: 'ai', aliases: ['gpt', 'chatgpt', 'ask', 'bot'],
    category: 'AI',
    desc: 'Chat with AI (remembers context per chat)',
    usage: 'ai <question>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}ai <question>\n> clear memory: ${ctx.prefix}aiclear`);
      await ctx.react('🧠');
      try {
        const answer = await ai.ask(ctx.chatId, ctx.argText);
        await ctx.reply(answer);
        await ctx.react('✅');
      } catch (e) {
        await ctx.react('❌');
        await ctx.reply('❌ ' + e.message);
      }
    },
  },
  {
    name: 'aiclear', aliases: ['resetai'],
    category: 'AI',
    desc: 'Clear AI conversation memory for this chat',
    handler: async (ctx) => {
      ai.forget(ctx.chatId);
      await ctx.reply('🧹 AI memory cleared for this chat');
    },
  },
  {
    name: 'aichat', aliases: ['chatbot'],
    category: 'AI',
    desc: 'Toggle AI chatbot mode (replies to every DM)',
    handler: async (ctx) => {
      if (!ctx.isOwner) return ctx.reply('🔒 owner only');
      const db = require('../lib/db');
      db.settings.chatbot = !db.settings.chatbot; db.save();
      await ctx.reply(`🤖 AI chatbot *${db.settings.chatbot ? 'ON — I now reply to DMs' : 'OFF'}*`);
    },
  },
  {
    name: 'img', aliases: ['dalle', 'imagine', 'genimage'],
    category: 'AI',
    desc: 'Generate an image from text (keyless)',
    usage: 'img <prompt>',
    handler: async (ctx) => {
      if (!ctx.argText) return ctx.reply(`Usage: ${ctx.prefix}img a neon cyberpunk cat`);
      await ctx.react('🎨');
      try {
        const buf = await ai.genImage(ctx.argText);
        await ctx.sock.sendMessage(ctx.chatId, { image: buf, caption: `🎨 *${ctx.argText}*\n> ${config.botName}` }, { quoted: ctx.m });
        await ctx.react('✅');
      } catch (e) {
        await ctx.react('❌');
        await ctx.reply('❌ ' + e.message);
      }
    },
  },
  {
    name: 'translate', aliases: ['tr', 'terjemah'],
    category: 'AI',
    desc: 'Translate text (auto-detects source)',
    usage: 'translate <lang> <text>  e.g. translate sw hello how are you',
    handler: async (ctx) => {
      const target = ctx.args[0]?.toLowerCase();
      const text = ctx.args.slice(1).join(' ');
      if (!target || !text || !LANGS[target]) {
        return ctx.reply(`Usage: ${ctx.prefix}translate <lang> <text>\n> langs: ${Object.keys(LANGS).join(', ')}`);
      }
      try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${target}`;
        const data = await require('../lib/utils').fetchJson(url);
        const out = data?.responseData?.translatedText;
        if (!out) throw new Error('translation failed');
        await ctx.reply(`🌐 *${LANGS[target]}*\n${out}`);
      } catch (e) {
        await ctx.reply('❌ ' + e.message);
      }
    },
  },
  {
    name: 'tts', aliases: ['say'],
    category: 'AI',
    desc: 'Text to speech (Google TTS)',
    usage: 'tts [lang] <text>',
    handler: async (ctx) => {
      let lang = 'en'; let text = ctx.argText;
      if (ctx.args[0] && LANGS[ctx.args[0]?.toLowerCase()] && ctx.args.length > 1) {
        lang = ctx.args[0].toLowerCase();
        text = ctx.args.slice(1).join(' ');
      }
      if (!text) return ctx.reply(`Usage: ${ctx.prefix}tts [lang] <text>`);
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(text.slice(0, 200))}`;
        const buf = await fetchBuffer(url, { headers: { Referer: 'https://translate.google.com' } });
        await ctx.sock.sendMessage(ctx.chatId, { audio: buf, mimetype: 'audio/mpeg', ptt: true }, { quoted: ctx.m });
      } catch (e) {
        await ctx.reply('❌ ' + e.message);
      }
    },
  },
  {
    name: 'summarize', aliases: ['summary'],
    category: 'AI',
    desc: 'Summarize a long text (reply or type)',
    handler: async (ctx) => {
      const quoted = ctx.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      const body = ctx.argText || quoted?.conversation || quoted?.extendedTextMessage?.text;
      if (!body) return ctx.reply('Send/reply with a long text to summarize');
      try {
        const answer = await ai.ask(ctx.chatId, `Summarize this in 3-5 bullet points:\n\n${body.slice(0, 8000)}`);
        await ctx.reply('📋 *Summary*\n' + answer);
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },
]);
