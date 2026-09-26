/* =========================================================
   KOPI NUSANTARA — api/send-otp.js
   POST { idToken } -> sends a 6-digit OTP to the user's own
   Gmail address (taken from the verified ID token, never from
   client-supplied text) and sets the kn_otp session cookie.
========================================================= */
var firebaseAuth = require('./lib/firebaseAuth.js');
var session = require('./lib/session.js');
var mailer = require('./lib/mailer.js');

var GMAIL_DOMAIN_RE = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

function maskEmail(email) {
  var parts = email.split('@');
  var name = parts[0];
  var masked = name.length <= 1 ? name : name[0] + '***';
  return masked + '@' + parts[1];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  var idToken = req.body && req.body.idToken;

  var uid, email;
  try {
    var decoded = await firebaseAuth.verifyFirebaseIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email;
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'invalid_session', message: 'Sesi login tidak valid. Silakan login ulang.' });
  }

  if (!GMAIL_DOMAIN_RE.test(email)) {
    return res.status(403).json({ ok: false, error: 'domain_not_allowed', message: 'Hanya alamat Gmail (@gmail.com) yang didukung untuk verifikasi ini.' });
  }

  // Resend cooldown — enforced from the existing signed cookie, if any.
  var cookies = session.parseCookies(req);
  var existingCookie = cookies[session.OTP_COOKIE_NAME];
  if (existingCookie) {
    try {
      var existing = session.verifyOtpSession(existingCookie);
      if (existing.uid === uid && existing.resendAt && Date.now() < existing.resendAt) {
        var secondsLeft = Math.ceil((existing.resendAt - Date.now()) / 1000);
        return res.status(429).json({
          ok: false,
          error: 'resend_cooldown',
          message: 'Mohon tunggu sebelum meminta kode baru.',
          secondsLeft: secondsLeft
        });
      }
    } catch (e) {
      // expired/invalid old cookie — fine, proceed to issue a new one.
    }
  }

  var code = session.generateOtpCode();
  var otpHash = session.hashOtp(code, uid);
  var now = Date.now();

  var cookieValue;
  try {
    cookieValue = session.signOtpSession({
      uid: uid,
      email: email,
      otpHash: otpHash,
      attempts: 0,
      resendAt: now + session.RESEND_COOLDOWN * 1000
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'server_misconfigured', message: 'Konfigurasi server belum lengkap (SESSION_SECRET).' });
  }

  try {
    await mailer.sendOtpEmail(email, code);
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'email_send_failed', message: 'Gagal mengirim email kode verifikasi. Coba lagi sebentar lagi.' });
  }

  res.setHeader('Set-Cookie', session.serializeCookie(session.OTP_COOKIE_NAME, cookieValue, session.OTP_TTL));
  return res.status(200).json({
    ok: true,
    maskedEmail: maskEmail(email),
    expiresInSeconds: session.OTP_TTL,
    resendCooldownSeconds: session.RESEND_COOLDOWN
  });
};
