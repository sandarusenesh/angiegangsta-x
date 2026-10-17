/**
 * lib/menu.js — CYPHER-X style menu builders (┏▣ boxes + smallcaps + readmore).
 */
const os = require('os');
const { smallcaps, bar, runtime } = require('./utils');

const READMORE = '\u200e'.repeat(700); // pushes the rest behind WhatsApp "Read more"

function headerBox({ botName, ownerName, ownerNumber, prefix, mode, version, pluginCount, uptimeMs }) {
  const mem = process.memoryUsage().rss;
  const totalGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const ramPct = Math.min(100, Math.round((mem / os.totalmem()) * 100));
  const S = smallcaps;

  return `┏▣ ◈ *${botName.toUpperCase()}* ◈
┃ *${S('owner')}* : ${ownerName}${ownerNumber ? ` (${ownerNumber})` : ''}
┃ *${S('prefix')}* : [ ${prefix || 'None'} ]
┃ *${S('host')}* : ${os.type()} ${os.arch()}
┃ *${S('plugins')}* : ${pluginCount}
┃ *${S('mode')}* : ${mode}
┃ *${S('version')}* : ${version}
┃ *${S('uptime')}* : ${uptimeMs ? runtime(uptimeMs) : runtime(process.uptime() * 1000)}
┃ *${S('usage')}* : ${(mem / 1024 / 1024).toFixed(0)} MB of ${totalGB} GB
┃ *${S('ram')}* : [${bar(ramPct)}] ${ramPct}%
┗▣`;
}

function categoryBox(title, commands, prefix) {
  const lines = commands.map((c) => `│➽ ${prefix}${c.name}`).join('\n');
  return `┏▣ ◈ *${smallcaps(title)}* ◈
${lines}
┗▣`;
}

function buildMenu({ botName, ownerName, ownerNumber, prefix, mode, version, pluginCount, registry, uptimeMs }) {
  const head = headerBox({ botName, ownerName, ownerNumber, prefix, mode, version, pluginCount, uptimeMs });
  const cats = [...registry.byCategory().entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const boxes = cats.map(([cat, cmds]) => categoryBox(`${cat} Menu`, cmds, prefix || '.'));
  const footer = `
> *Powered by ${ownerName}*
> *${botName} ${version}*

\`${botName.toLowerCase()}\``;
  return head + READMORE + '\n\n' + boxes.join('\n\n') + footer;
}

function buildCategoryMenu(cat, registry, { botName, ownerName, prefix }) {
  const cmds = registry.byCategory().get(cat) || [];
  const lines = cmds.map((c) => `│➽ *${prefix}${c.name}* ${c.usage ? '— ' + c.usage : ''}`).join('\n');
  return `┏▣ ◈ *${smallcaps(cat)} ${smallcaps('Menu')}* ◈
${lines}
┗▣

> *Powered by ${ownerName}*`;
}

function buildAlive({ botName, ownerName, mode, uptimeMs }) {
  return `*${botName.toUpperCase()} IS ALIVE ✅*
> owner: ${ownerName}
> mode: ${mode}
> uptime: ${runtime(uptimeMs || process.uptime() * 1000)}
> speed: ${(process.hrtime()[1] / 1e6).toFixed(4)} ms`;
}

module.exports = { buildMenu, buildCategoryMenu, buildAlive, headerBox, categoryBox };
