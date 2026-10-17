/**
 * lib/ai.js — AI client: any OpenAI-compatible chat endpoint + keyless
 * image generation fallback (pollinations.ai). Per-chat conversation memory.
 */
const config = require('./config');
const { fetchJson, fetchBuffer } = require('./utils');

const SYSTEM_PROMPT =
  'You are ANGIE GANGSTA X, a helpful, witty WhatsApp bot. Reply in the same language the user writes in. ' +
  'Keep answers short and chat-friendly (WhatsApp style), use emojis sparingly. Never mention that you are a language model.';

const memory = new Map(); // chatId -> [{role, content}]
const MAX_TURNS = 12;

function getHistory(chatId) {
  if (!memory.has(chatId)) memory.set(chatId, []);
  return memory.get(chatId);
}

function remember(chatId, role, content) {
  const hist = getHistory(chatId);
  hist.push({ role, content });
  while (hist.length > MAX_TURNS) hist.shift();
}

function forget(chatId) {
  memory.delete(chatId);
}

async function ask(chatId, prompt) {
  if (!config.ai.key) {
    throw new Error('No AI key configured. Owner must set AI_API_KEY (and optionally AI_BASE_URL / AI_MODEL) in the environment, then .restart');
  }
  remember(chatId, 'user', prompt);
  const body = {
    model: config.ai.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      ...getHistory(chatId),
    ],
    max_tokens: 800,
    temperature: 0.7,
  };
  const data = await fetchJson(`${config.ai.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.ai.key}`,
    },
    body: JSON.stringify(body),
  }, 45000);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('AI returned an empty response');
  remember(chatId, 'assistant', text);
  return text;
}

/**
 * Image generation — keyless by default via pollinations.ai,
 * or a custom endpoint via AI_IMG_URL (POST {prompt} → image bytes not assumed;
 * custom URL is used as a GET template with {prompt} placeholder returning an image).
 */
async function genImage(prompt) {
  const custom = process.env.AI_IMG_URL;
  if (custom && custom.includes('{prompt}')) {
    return fetchBuffer(custom.replace('{prompt}', encodeURIComponent(prompt)), {}, 120000);
  }
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;
  return fetchBuffer(url, {}, 120000);
}

module.exports = { ask, genImage, remember, forget, getHistory, SYSTEM_PROMPT };
