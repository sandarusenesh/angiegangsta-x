const db = require('./db');
const config = require('./config');

async function shareToGroup(sock, media, from) {
  const gid = db.settings.vvgroup;
  if (!gid) throw new Error('No target group set. Open your group and send .setvvgroup');
  const cap = `🔓 *view once saved*${from ? '\n> from ' + from : ''}${media.caption ? '\n> ' + media.caption : ''}\n> ${config.botName}`;
  if (media.type === 'video') await sock.sendMessage(gid, { video: media.buffer, caption: cap });
  else if (media.type === 'audio') {
    await sock.sendMessage(gid, { text: cap });
    await sock.sendMessage(gid, { audio: media.buffer, mimetype: media.mimetype || 'audio/ogg; codecs=opus', ptt: true });
  } else await sock.sendMessage(gid, { image: media.buffer, caption: cap });
}

module.exports = { shareToGroup };
