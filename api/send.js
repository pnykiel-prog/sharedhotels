// ==========================================================================
//  Shared Hotels — obsługa formularzy na Vercel (funkcja serverless, Node.js)
//  Wysyłka przez SMTP OVH (nodemailer).
//
//  WYMAGANE w Vercel → Settings → Environment Variables:
//    SMTP_HOST = ssl0.ovh.net           (MX Plan; Email Pro: pro*.mail.ovh.net)
//    SMTP_PORT = 465                    (465 = SSL, 587 = STARTTLS)
//    SMTP_USER = no-reply@sharedhotels.com   (pełny adres skrzynki OVH)
//    SMTP_PASS = ********               (hasło skrzynki)
//    MAIL_TO   = office@sharedhotels.com
//    MAIL_FROM = "Shared Hotels <no-reply@sharedhotels.com>"  (= SMTP_USER lub jego alias)
//
//  We froncie (index.html) ustaw:  const MAIL_ENDPOINT = '/api/send';
// ==========================================================================
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PROSPEKTY = ['SH_Prospekt_1_HR.pdf', 'SH_Prospekt_2_Informator.pdf'];
const PROSPEKTY_EN = ['SH_Prospekt_1_HR_EN.pdf', 'SH_Prospekt_2_Informator_EN.pdf'];

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function clean(v){ return String(v == null ? '' : v).replace(/[\r\n]+/g,' ').trim(); }

// Transport tworzony raz i reużywany między wywołaniami (warm start).
let _tx = null;
function getTransporter() {
  if (_tx) return _tx;
  const port = Number(process.env.SMTP_PORT || 465);
  _tx = nodemailer.createTransport({
    host: process.env.SMTP_HOST,        // ssl0.ovh.net
    port,
    secure: port === 465,               // 465 = SSL/TLS, 587 = STARTTLS
    requireTLS: port !== 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
  return _tx;
}

async function mailSend(msg) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[mail] brak konfiguracji SMTP (SMTP_HOST/SMTP_USER/SMTP_PASS)');
    return false;
  }
  try {
    await getTransporter().sendMail(msg);
    return true;
  } catch (e) {
    console.error('[mail] błąd SMTP from=' + JSON.stringify(msg.from) + ' to=' + JSON.stringify(msg.to) +
      ' :: ' + (e && e.message ? e.message : e));
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok:false, msg:'Metoda niedozwolona' }); return; }

  // Body może przyjść jako obiekt (Vercel parsuje form/json) lub string
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch(_) { b = Object.fromEntries(new URLSearchParams(b)); } }

  if (b._honey) { res.status(200).json({ ok:true }); return; } // bot

  const type  = b.type || '';
  const lang  = (b.lang === 'en') ? 'en' : 'pl';
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
      await mailSend({ from: FROM, to: TO, replyTo: email, subject: `Prospekt — ${firma} (${imie})`, html: admin });

      const attachments = (lang === 'en' ? PROSPEKTY_EN : PROSPEKTY).map(name => {
        try {
          const p = path.join(process.cwd(), 'prospekty', name);
          return { filename: name, content: fs.readFileSync(p) };
        } catch(_) { return null; }
      }).filter(Boolean);

      const client = (lang === 'en')
        ? `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1a1a18">
          <p>Hello ${esc(imie)},</p>
          <p>thank you for your interest in the <b>Shared Hotels</b> programme. Attached you'll find the information brochure and the sheet describing how the programme works.</p>
          <p>We'll be in touch within 24–48 hours.</p>
          <p>Best regards,<br>The Shared Hotels Team</p></div>`
        : `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1a1a18">
          <p>Dzień dobry ${esc(imie)},</p>
          <p>dziękujemy za zainteresowanie programem <b>Shared Hotels</b>. W załączniku przesyłamy prospekt informacyjny oraz informator z modelem działania programu.</p>
          <p>Skontaktujemy się z Tobą w ciągu 24–48 godzin.</p>
          <p>Pozdrawiamy,<br>Zespół Shared Hotels</p></div>`;
      const subject = (lang === 'en') ? 'Your Shared Hotels brochure' : 'Twój prospekt Shared Hotels';
      const ok = await mailSend({ from: FROM, to: email, replyTo: TO, subject, html: client, attachments });
      res.status(ok ? 200 : 500).json({ ok });
      return;
    }

    if (type === 'konsultacja') {
      const telefon = clean(b.telefon), data = clean(b.data), pora = clean(b.pora);
      const admin = `<h2>Nowa prośba o konsultację telefoniczną</h2>
        <p><b>Imię:</b> ${esc(imie)}<br><b>E-mail:</b> ${esc(email)}<br><b>Telefon:</b> ${esc(telefon)}<br>
        <b>Firma:</b> ${esc(firma)}<br><b>Preferowana data:</b> ${esc(data)}<br><b>Pora dnia:</b> ${esc(pora)}</p>`;
      await mailSend({ from: FROM, to: TO, replyTo: email, subject: `Konsultacja — ${imie} (${data}, ${pora})`, html: admin });

      const client = (lang === 'en')
        ? `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1a1a18">
          <p>Hello ${esc(imie)},</p>
          <p>thank you for booking a call. We'll call you back at the chosen time:</p>
          <p style="font-size:17px"><b>${esc(data)}</b><br>Time of day: <b>${esc(pora)}</b></p>
          <p>The call is non-binding and takes about 20 minutes. If the time needs changing — just reply to this message.</p>
          <p>Talk soon,<br>The Shared Hotels Team</p></div>`
        : `<div style="font-family:sans-serif;font-size:15px;line-height:1.6;color:#1a1a18">
          <p>Dzień dobry ${esc(imie)},</p>
          <p>dziękujemy za umówienie rozmowy. Oddzwonimy w wybranym terminie:</p>
          <p style="font-size:17px"><b>${esc(data)}</b><br>Pora dnia: <b>${esc(pora)}</b></p>
          <p>Rozmowa jest niezobowiązująca i potrwa ok. 20 minut. Gdyby termin wymagał zmiany — odpisz na tę wiadomość.</p>
          <p>Do usłyszenia,<br>Zespół Shared Hotels</p></div>`;
      const subject = (lang === 'en') ? 'Call confirmation — Shared Hotels' : 'Potwierdzenie rozmowy — Shared Hotels';
      const ok = await mailSend({ from: FROM, to: email, replyTo: TO, subject, html: client });
      res.status(ok ? 200 : 500).json({ ok });
      return;
    }

    res.status(400).json({ ok:false, msg:'Nieznany typ formularza' });
  } catch (e) {
    console.error('[send] wyjątek:', e && e.stack ? e.stack : e);
    res.status(500).json({ ok:false, msg:'Błąd serwera' });
  }
};
