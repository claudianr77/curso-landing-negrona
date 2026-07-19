const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const DATA_FILE = path.join(__dirname, 'waitlist.json');

function readList() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeList(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_KEY = process.env.ADMIN_KEY || 'negrona2026';

async function notifyWaitlistSignup(email) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[waitlist] Nuevo registro: ${email} (configura RESEND_API_KEY para recibir un correo de aviso)`);
    return;
  }
  const notifyTo = process.env.WAITLIST_NOTIFY_EMAIL || 'hola@claudianegron.com';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Lista de espera <onboarding@resend.dev>',
        to: notifyTo,
        subject: 'Nueva persona en tu lista de espera',
        text: `${email} se acaba de anotar para enterarse cuando abras los cupos.`
      })
    });
    if (!res.ok) console.error('[waitlist] Resend respondió con error:', await res.text());
  } catch (e) {
    console.error('[waitlist] No se pudo enviar el correo de aviso:', e.message);
  }
}

app.post('/api/waitlist', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isValid) return res.status(400).json({ error: 'Email inválido' });

  const list = readList();
  const duplicate = list.some(row => row.email === email);

  if (!duplicate) {
    list.push({ email, created_at: new Date().toISOString() });
    writeList(list);
  }

  res.json({ ok: true, duplicate });

  if (!duplicate) notifyWaitlistSignup(email);
});

app.get('/admin', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Acceso</title></head>
      <body style="font-family:sans-serif;max-width:420px;margin:80px auto;padding:0 20px;text-align:center;color:#333;">
        <h2>Acceso no autorizado</h2>
        <p>Agrega <code>?key=TU_CLAVE</code> al final de esta URL.</p>
      </body></html>`);
  }

  const rows = readList().slice().reverse();
  const rowsHtml = rows.map(r => `<tr><td style="padding:10px 16px;border-bottom:1px solid #eee;">${r.email}</td><td style="padding:10px 16px;border-bottom:1px solid #eee;color:#888;">${new Date(r.created_at).toLocaleString('es-PE')}</td></tr>`).join('');

  res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Lista de espera</title></head>
    <body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 20px;color:#222;">
      <h2>Lista de espera (${rows.length})</h2>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr><th style="text-align:left;padding:10px 16px;border-bottom:2px solid #333;">Email</th><th style="text-align:left;padding:10px 16px;border-bottom:2px solid #333;">Fecha</th></tr></thead>
        <tbody>${rowsHtml || '<tr><td colspan="2" style="padding:16px;color:#888;">Todavía no hay nadie anotado.</td></tr>'}</tbody>
      </table>
    </body></html>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Landing page → http://localhost:${PORT}`));
