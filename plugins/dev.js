/**
 * plugins/dev.js — bot maintenance / host info (owner).
 */
const os = require('os');
const config = require('../lib/config');
const { formatBytes } = require('../lib/utils');

module.exports = (reg) => reg.addAll([
  {
    name: 'botinfo', aliases: ['info'],
    category: 'Owner',
    desc: 'Detailed bot & host info',
    ownerOnly: true,
    handler: async (ctx) => {
      const mem = process.memoryUsage();
      await ctx.reply(`🤖 *${config.botName} v${config.version}*
> node: ${process.version}
> platform: ${os.type()} ${os.release()} (${os.arch()})
> cpus: ${os.cpus().length}
> ram: ${formatBytes(mem.rss)} / ${formatBytes(os.totalmem())}
> heap: ${formatBytes(mem.heapUsed)}
> uptime bot: ${(process.uptime() / 60).toFixed(1)} min
> uptime host: ${(os.uptime() / 3600).toFixed(1)} h
> session: ${config.sessionDir}
> ai: ${config.ai.key ? 'configured ✅' : 'not configured ❌'}`);
    },
  },
  {
    name: 'disk', aliases: [],
    category: 'Owner',
    desc: 'Disk usage',
    ownerOnly: true,
    handler: async (ctx) => {
      try {
        const { execSync } = require('child_process');
        const out = execSync('df -h / | tail -1').toString().trim();
        await ctx.reply('💾 *Disk*\n`' + out + '`');
      } catch (e) { await ctx.reply('❌ ' + e.message); }
    },
  },
  {
    name: 'pinghost', aliases: ['shellping'],
    category: 'Owner',
    desc: 'Check host internet connectivity',
    ownerOnly: true,
    handler: async (ctx) => {
      const t = Date.now();
      try {
        await fetch('https://www.google.com/generate_204', { signal: AbortSignal.timeout(5000) });
        await ctx.reply(`🌐 internet OK — ${Date.now() - t} ms`);
      } catch { await ctx.reply('🔴 host cannot reach the internet!'); }
    },
  },
  {
    name: 'getvar', aliases: ['var'],
    category: 'Owner',
    desc: 'Read an env var (name only, values hidden for secrets)',
    usage: 'getvar PREFIX',
    ownerOnly: true,
    handler: async (ctx) => {
      const key = ctx.argText.trim().toUpperCase();
      if (!key) return ctx.reply(`Usage: ${ctx.prefix}getvar <VAR_NAME>`);
      const secret = /KEY|TOKEN|PASS|SECRET/.test(key);
      const val = process.env[key];
      await ctx.reply(`🏷️ ${key} = ${val === undefined ? '(unset)' : secret ? '***hidden***' : val}`);
    },
  },
]);
