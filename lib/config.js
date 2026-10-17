/**
 * lib/config.js — central configuration (env + runtime overrides from db).
 */
const db = require('./db');

const config = {
  get botName() { return db.settings.botname || process.env.BOT_NAME || 'ANGIE GANGSTA X'; },
  get ownerName() { return process.env.OWNER_NAME || 'Angie'; },
  ownerNumber: process.env.OWNER_NUMBER || null, // set at runtime once linked
  sessionDir: process.env.SESSION_DIR || 'session',
  pairPhone: (process.env.PAIR_PHONE || '').replace(/\D/g, ''),
  ai: {
    key: process.env.AI_API_KEY || '',
    baseUrl: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: process.env.AI_MODEL || 'gpt-4o-mini',
  },
  version: '1.0.0',
  repo: 'https://github.com/yobbyking/angiegangsta-x',
};

module.exports = config;
