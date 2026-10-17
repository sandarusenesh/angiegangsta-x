<h1 align="center">🔥 ANGIE GANGSTA X 🔥</h1>

<p align="center">
  <b>Full-featured multi-device WhatsApp bot — anti-commands, auto-commands, view-once unlock, AI, downloads, stickers & more.</b><br>
  Built on <a href="https://github.com/WhiskeySockets/Baileys">Baileys</a> • Node 20+ • clean source, no obfuscation
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-20%2B-brightgreen" alt="node">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="license">
  <img src="https://img.shields.io/badge/commands-120%2B-ff5c8a" alt="commands">
</p>

---

## ✨ Highlights

| | |
|---|---|
| 🔓 **View-Once Unlock** | `.vv` / `.vv2` / `.vv3` — reveal view-once photos, videos & voice notes as normal media |
| 🛡️ **Anti-commands** | anti-link, anti-badword, anti-delete, anti-sticker, anti-image, anti-video, anti-audio, anti-document, anti-poll, anti-reaction, anti-contact, anti-location, anti-viewonce, anti-forward, anti-demote, anti-call, media-only |
| ⚡ **Auto-commands** | auto-read, auto-typing, auto-record, auto-react, always-online, auto-bio, auto-view-status, auto-status-react, auto-sticker, AI chatbot |
| 👥 **Group tools** | kick/add/promote/demote, tagall, hidetag, polls, timed open/close, invite links, welcome & goodbye (custom templates), warning system (3 warns → auto-kick) |
| 🤖 **AI** | chat with memory (`.ai`), image generation (`.img`), translate, TTS, summarize — works with any OpenAI-compatible key |
| 📥 **Downloads** | YouTube songs/videos, TikTok (no watermark), Facebook, Twitter/X, MediaFire, GitHub repos |
| 🎨 **Media** | stickers with pack name, sticker → image, emoji mix, meme stickers, media → URL, website screenshots, video → audio (ffmpeg hosts) |
| 🧰 **Tools & Fun** | calculator, QR, URL shortener, dictionary, weather, lyrics, IP tracker, fancy fonts, games, jokes, ship, 8-ball… |

## 🚀 Deploy

### Railway (recommended)
1. Push this repo / fork it, then in Railway: **New Project → Deploy from GitHub** → pick this repo
2. Railway auto-detects `railway.json`
3. Open the deploy URL — you get the **web console**:
   - enter your WhatsApp number (country code, e.g. `254712345678`) → tap **Get Pairing Code**
   - WhatsApp → **Settings → Linked Devices → Link a Device → Link with phone number instead** → enter the code
   - (or scan the QR shown on the page)
4. Bot connects and messages you 🎉

### Render
Deploy from `render.yaml` (auto-detected). Same pairing flow via web console.

### Heroku
Use the `app.json` (Deploy to Heroku button config). Same pairing flow.

### VPS / panel
```bash
git clone https://github.com/yobbyking/angiegangsta-x.git
cd angiegangsta-x
npm install
cp .env.example .env   # optional
node index.js          # QR prints in terminal + web console on :3000
```

## ⚙️ Environment variables (all optional)

| var | default | meaning |
|-----|---------|---------|
| `PORT` | 3000 | web console port (platforms set it automatically) |
| `OWNER_NUMBER` | *(auto)* | owner number — auto-detected from the linked number |
| `OWNER_NAME` | `Angie` | owner display name |
| `BOT_NAME` | `ANGIE GANGSTA X` | bot identity |
| `PREFIX` | `.` | command prefix (`none` = no prefix) |
| `PAIR_PHONE` | — | auto-print pairing code for this number on first boot |
| `AI_API_KEY` | — | OpenAI-compatible API key (OpenAI / Groq / OpenRouter / Gemini-compat) |
| `AI_BASE_URL` | openai | API base URL |
| `AI_MODEL` | gpt-4o-mini | model name |
| `IG_API_URL` | — | endpoint template for Instagram downloads (`{url}` placeholder) |
| `SESSION_DIR` | `session` | where Baileys credentials are stored |

## 📲 Pairing, three ways

1. **Web console** (best for Railway/Render): open the deploy URL → number → code
2. **QR**: open the web console and scan, or watch the terminal
3. **Auto code**: set `PAIR_PHONE=2547XXXXXXXX` before first boot — code prints in logs

> If a session gets logged out, the bot archives it (`session.dead-*`) and asks for pairing again automatically.

## 🧩 Commands

`.menu` shows the live menu grouped by category (CYPHER-X style). Categories:

**General** — menu, all, list, ping, alive, owner, whoami, uptime, repo
**Settings** — enable/disable (all anti & auto features), features, mode, setprefix, setwelcome, setgoodbye, testwelcome, testgoodbye, addbadword, delbadword, listbadword, setbotname, getsettings
**Owner** — block, unblock, blocklist, bc, story, join, leave, setname, setbio, setpp, getpp, addsudo, delsudo, sudolist, del, restart
**Group** — kick, add, promote, demote, tagall, hidetag, tagadmin, poll, open, close, closetime, opentime, link, resetlink, ginfo, setgname, setgdesc, gpp, warn, warnings, resetwarn
**Media** — sticker, take, toimg, smeme, emojimix, tourl, ssweb, toaudio
**ViewOnce** — vv, vv2, vv3
**Download** — song, video, ytmp3, tiktok, tiktokaudio, instagram, facebook, twitter, mediafire, gitclone, image
**AI** — ai, aiclear, aichat, img, translate, tts, summarize
**Tools** — calc, qr, shorten, define, weather, lyrics, base64, hash, uuid, pass, fancy, fliptext, readmore, trackip, sitecheck, bmi, roman, unit
**Fun** — joke, quote, fact, 8ball, truth, dare, ship, rps, slap, hug, kiss, flirt, dice, coin, lovecalc, rate, pick
**Search** — yts, element, wikipedia, anime
**Status** — getstatus, presence, pingstatus

## 🔐 Feature quick-start

```
.enable antilink          ← group admins, protects from links
.enable antidelete        ← resends deleted messages
.enable chatbot           ← owner, AI replies to DMs
.setwelcome Hey @user 🔥  ← custom welcome in a group
.vv                       ← reply to a view-once msg to unlock it
.tagall good news!        ← mention everyone
```

## 📄 License

MIT — © 2026 yobbyking
