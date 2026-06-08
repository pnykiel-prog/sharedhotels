// ==========================================================================
//  Shared Hotels — obsługa formularzy na Vercel (funkcja serverless, Node.js)
//  Wysyłka przez Resend (https://resend.com) — darmowy plan wystarcza na start.
//
//  WYMAGANE w Vercel → Settings → Environment Variables:
//    RESEND_API_KEY   = re_xxx           (klucz z panelu Resend)
//    MAIL_TO          = office@sharedhotels.com
//    MAIL_FROM        = "Shared Hotels <no-reply@sharedhotels.com>"   (domena zweryfikowana w Resend)
//
//  We froncie (index.html) ustaw:  const MAIL_ENDPOINT = '/api/send';
// ==========================================================================
const fs = require('fs');
const path = require('path');

const PROSPEKTY = ['SH_Prospekt_1_HR.html', 'SH_Prospekt_2_Informator.html'];

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function clean(v){ return String(v == null ? '' : v).replace(/[\r\n]+/g,' ').trim(); }

async function resendSend(payload) {
  if (!process.env.RESEND_API_KEY) { console.error('[resend] brak zmiennej RESEND_API_KEY'); return false; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    let detail = '';
    try { detail = await r.text(); } catch (_) {}
    console.error('[resend] HTTP ' + r.status + ' from=' + JSON.stringify(payload.from) + ' to=' + JSON.stringify(payload.to) + ' :: ' + detail);
  }
  return r.ok;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok:false, msg:'Metoda niedozwolona' }); return; }

  // Body może przyjść jako obiekt (Vercel parsuje form/json) lub string
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch(_) { b = Object.fromEntries(new URLSearchParams(b)); } }

  if (b._honey) { res.status(200).json({ ok:true }); return; } // bot

  const type  = b.type || '';
  const imie  = clean(b.imie);
  const email = clean(b.email);
  const firma = clean(b.firma);
  const TO    = process.env.MAIL_TO   || 'office@sharedhotels.com';
  const FROM  = process.env.MAIL_FROM || 'Shared Hotels <no-reply@sharedhotels.com>';

  if (!imie || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ ok:false, msg:'Brak danych' }); return; }

  try {
    if (type === 'prospekt') {
      const admin = `<h2>Nowe pobranie prospektu</h2>
        <p><b>Imię:</b> ${esc(imie)}<br><b>E-mail:</b> ${esc(email)}<br><b>Firma:</b> ${esc(firma)}<br>
        <b>Stanowisko:</b> ${esc(clean(b.stanowisko))}<br><b>Liczba pracowników:</b> ${esc(clean(b.pracownicy))}<br>
        <b>Obszar:</b> ${esc(clean(b.obszar))}</p>`;
      await resendSend({ from: FROM, to: [TO], reply_to: email, subject: `Prospekt — ${firma} (${imie})`, html: admin });

      const attachments = PROSPEKTY.map(name => {
        try {
          const p = path.join(process.cwd(), 'prospekty', name);
          return { filename: name, content: fs.readFileSync(p).toString('base64') };
        } catch(_) { return null; }
      }).filter(Boolean);

      const client = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1a1a18">
        <p>Dzień dobry ${esc(imie)},</p>
        <p>dziękujemy za zainteresowanie programem <b>Shared Hotels</b>. W załączniku przesyłamy prospekt informacyjny oraz informator z modelem działania programu.</p>
        <p>Skontaktujemy się z Tobą w ciągu 24–48 godzin.</p>
        <p>Pozdrawiamy,<br>Zespół Shared Hotels</p></div>`;
      const ok = await resendSend({ from: FROM, to: [email], reply_to: TO, subject: 'Twój prospekt Shared Hotels', html: client, attachments });
      res.status(ok ? 200 : 500).json({ ok });
      return;
    }

    if (type === 'konsultacja') {
      const telefon = clean(b.telefon), data = clean(b.data), pora = clean(b.pora);
      const admin = `<h2>Nowa prośba o konsultację telefoniczną</h2>
        <p><b>Imię:</b> ${esc(imie)}<br><b>E-mail:</b> ${esc(email)}<br><b>Telefon:</b> ${esc(telefon)}<br>
        <b>Firma:</b> ${esc(firma)}<br><b>Preferowana data:</b> ${esc(data)}<br><b>Pora dnia:</b> ${esc(pora)}</p>`;
      await resendSend({ from: FROM, to: [TO], reply_to: email, subject: `Konsultacja — ${imie} (${data}, ${pora})`, html: admin });

      const client = `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1a1a18">
        <p>Dzień dobry ${esc(imie)},</p>
        <p>dziękujemy za umówienie rozmowy. Oddzwonimy w wybranym terminie:</p>
        <p style="font-size:17px"><b>${esc(data)}</b><br>Pora dnia: <b>${esc(pora)}</b></p>
        <p>Rozmowa jest niezobowiązująca i potrwa ok. 20 minut. Gdyby termin wymagał zmiany — odpisz na tę wiadomość.</p>
        <p>Do usłyszenia,<br>Zespół Shared Hotels</p></div>`;
      const ok = await resendSend({ from: FROM, to: [email], reply_to: TO, subject: 'Potwierdzenie rozmowy — Shared Hotels', html: client });
      res.status(ok ? 200 : 500).json({ ok });
      return;
    }

    res.status(400).json({ ok:false, msg:'Nieznany typ formularza' });
  } catch (e) {
    console.error('[send] wyjątek:', e && e.stack ? e.stack : e);
    res.status(500).json({ ok:false, msg:'Błąd serwera' });
  }
};
