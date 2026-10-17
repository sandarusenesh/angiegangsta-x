/**
 * lib/webconsole.js — built-in web console so you can pair and monitor the bot
 * from a browser (essential on Railway/Render where there is no terminal).
 *
 *   GET  /           status page (live status + QR + pairing form)
 *   GET  /health     json health probe
 *   GET  /qr         current QR as PNG (if waiting for pairing)
 *   GET  /logs       recent log lines (text)
 *   POST /api/pair   { phone } → { code }  pairing code via WhatsApp
 */
const express = require('express');
const crypto = require('crypto');
const log = require('./logger');
const config = require('./config');

function startWebConsole({ getQr, getStatus, requestPair, loggerBuffer, startTime }) {
  const app = express();
  app.use(express.json());
  const PORT = process.env.PORT || 3000;

  let pairingCode = null;
  let pairingPhone = null;
  let qrString = null;

  // wire up QR updates
  const origGetQr = getQr;

  app.get('/health', (req, res) => {
    const st = getStatus();
    res.json({ ok: true, service: 'angiegangsta-x', ...st, uptime: Date.now() - startTime });
  });

  app.get('/logs', (req, res) => {
    const lines = loggerBuffer.slice(-parseInt(req.query.lines || '200', 10));
    res.type('text/plain').send(lines.map((l) => `[${new Date(l.ts).toISOString()}] ${l.text}`).join('\n'));
  });

  app.get('/qr.png', async (req, res) => {
    const qr = qrString || origGetQr();
    if (!qr) return res.status(404).send('No QR right now (already paired or pairing by code)');
    try {
      const QRCode = require('qrcode');
      const png = await QRCode.toBuffer(qr, { width: 512, margin: 1 });
      res.type('image/png').send(png);
    } catch (e) {
      res.status(500).send(e.message);
    }
  });

  app.post('/api/pair', async (req, res) => {
    try {
      const phone = String(req.body?.phone || '').replace(/\D/g, '');
      if (!/^\d{8,15}$/.test(phone)) {
        return res.status(400).json({ error: 'Enter number with country code, digits only (e.g. 254712345678)' });
      }
      const code = await requestPair(phone);
      pairingCode = code;
      pairingPhone = phone;
      res.json({ code });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/', (req, res) => {
    const st = getStatus();
    const paired = !!st.connected;
    const qr = qrString || origGetQr();
    res.send(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ANGIE GANGSTA X · Console</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--bg:#05010d;--card:rgba(255,255,255,.045);--border:rgba(255,255,255,.09);--pink:#ff5c8a;--purple:#c44fe8;--gold:#ffb938;--green:#4ade80;--text:#efe8f5;--muted:#9a8fae}
body{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh;position:relative}
body::before{content:"";position:fixed;inset:0;z-index:-1;background:radial-gradient(ellipse 800px 600px at 0% 0%,rgba(255,92,138,.13),transparent 60%),radial-gradient(ellipse 800px 600px at 100% 100%,rgba(196,79,232,.13),transparent 60%)}
.wrap{max-width:560px;margin:0 auto;padding:40px 18px}
.logo{width:70px;height:70px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;font-size:36px;background:linear-gradient(135deg,var(--pink),var(--purple));border-radius:22px;box-shadow:0 10px 34px rgba(255,92,138,.4)}
h1{text-align:center;font-size:24px;letter-spacing:2px;background:linear-gradient(135deg,#fff,#ffb9e1);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sub{text-align:center;color:var(--muted);font-size:13px;margin:6px 0 26px}
.card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:22px;margin-bottom:16px}
.badge{display:inline-block;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.on{background:rgba(74,222,128,.12);color:#a7f3c4;border:1px solid rgba(74,222,128,.35)}
.off{background:rgba(255,185,56,.12);color:#ffd88a;border:1px solid rgba(255,185,56,.35)}
.kv{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px dashed rgba(255,255,255,.06);font-size:14px}
.kv:last-child{border:none}
.kv b{color:var(--muted);font-weight:600}
h2{font-size:14px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);margin-bottom:12px}
input{width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:12px;padding:13px;color:var(--text);font-size:15px;outline:none;margin-bottom:10px}
input:focus{border-color:var(--pink)}
button{width:100%;border:none;border-radius:12px;padding:14px;background:linear-gradient(135deg,var(--pink),var(--purple));color:#fff;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
button:disabled{opacity:.5}
.code{font-family:Menlo,Consolas,monospace;font-size:30px;font-weight:800;letter-spacing:6px;color:var(--gold);text-align:center;padding:16px;text-shadow:0 0 22px rgba(255,185,56,.45)}
.hint{color:var(--muted);font-size:12.5px;line-height:1.7;margin-top:10px}
img.qr{display:block;margin:8px auto 0;width:230px;height:230px;border-radius:14px;background:#fff;padding:8px}
ul{margin:8px 0 0 18px;color:var(--muted);font-size:13px;line-height:1.9}
footer{text-align:center;color:var(--muted);font-size:12px;margin-top:24px}
</style></head><body>
<div class="wrap">
  <div class="logo">🔥</div>
  <h1>ANGIE GANGSTA X</h1>
  <p class="sub">WhatsApp Bot · Live Console</p>

  <div class="card">
    <span class="badge ${paired ? 'on' : 'off'}">${paired ? '● Connected' : '● Not paired'}</span>
    <div style="height:10px"></div>
    <div class="kv"><b>Number</b><span>${st.number || '—'}</span></div>
    <div class="kv"><b>Version</b><span>${st.version}</span></div>
    <div class="kv"><b>Uptime</b><span>${st.uptimeLabel}</span></div>
    <div class="kv"><b>Mode</b><span>${st.mode}</span></div>
  </div>

  ${paired ? '' : `<div class="card">
    <h2>Pair your WhatsApp</h2>
    <div id="pair-area">
      <input id="phone" type="tel" inputmode="numeric" placeholder="2547XXXXXXXX (country code + number)">
      <button id="pair-btn">Get Pairing Code</button>
      <div id="code-out"></div>
      <p class="hint">WhatsApp → <b>Settings → Linked Devices → Link a Device → Link with phone number instead</b>, then enter the code.</p>
    </div>
    ${qr ? '<p class="hint" style="text-align:center">…or scan the QR below (WhatsApp → Linked Devices → Link a Device)</p><img class="qr" src="/qr.png" alt="QR">' : ''}
  </div>`}

  <div class="card">
    <h2>Quick links</h2>
    <ul>
      <li><a href="/health" style="color:#ff9dbd">/health</a> — json status</li>
      <li><a href="/logs" style="color:#ff9dbd">/logs</a> — live log tail</li>
      <li><a href="/qr.png" style="color:#ff9dbd">/qr.png</a> — current QR</li>
    </ul>
  </div>

  <footer>ANGIE GANGSTA X v${st.version} · by yobbyking</footer>
</div>
<script>
const btn=document.getElementById('pair-btn'),out=document.getElementById('code-out'),phone=document.getElementById('phone');
btn&&(btn.onclick=async()=>{btn.disabled=true;btn.textContent='Contacting WhatsApp…';
try{const r=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:phone.value})});
const d=await r.json();if(!r.ok)throw new Error(d.error||'Failed');
out.innerHTML='<div class="code">'+d.code+'</div>';btn.textContent='Get Pairing Code';}
catch(e){out.innerHTML='<p class="hint" style="color:#f87171">'+e.message+'</p>';btn.textContent='Get Pairing Code';}
finally{btn.disabled=false;};});
</script>
</body></html>`);
  });

  const server = app.listen(PORT, '0.0.0.0', () => {
    log.ok('WEB', `Console running on http://0.0.0.0:${PORT}`);
  });

  return {
    setQr(qr) { qrString = qr; },
    server,
  };
}

module.exports = { startWebConsole };
