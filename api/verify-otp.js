/* =========================================================
   KOPI NUSANTARA — api/verify-otp.js
   POST { idToken, code } -> validates the 6-digit code against
   the kn_otp cookie. On success: clears kn_otp, sets kn_verified.
   On failure: increments attempts (re-signed, same expiry).
========================================================= */
var firebaseAuth = require('./_lib/firebaseAuth.js');
var session = require('./_lib/session.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  var idToken = req.body && req.body.idToken;
  var code = req.body && String(req.body.code || '').trim();

  var uid, email;
  try {
    var decoded = await firebaseAuth.verifyFirebaseIdToken(idToken);
    uid = decoded.uid;
    email = decoded.email;
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'invalid_session', message: 'Sesi login tidak valid. Silakan login ulang.' });
  }

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ ok: false, error: 'invalid_code_format', message: 'Kode harus 6 digit angka.' });
  }

  var cookies = session.parseCookies(req);
  var otpCookie = cookies[session.OTP_COOKIE_NAME];
  if (!otpCookie) {
    return res.status(400).json({ ok: false, error: 'otp_not_found', message: 'Kode kadaluarsa atau belum diminta. Silakan minta kode baru.' });
  }

  var otpSession;
  try {
    otpSession = session.verifyOtpSession(otpCookie);
  } catch (err) {
    res.setHeader('Set-Cookie', session.clearCookie(session.OTP_COOKIE_NAME));
    return res.status(400).json({ ok: false, error: 'otp_expired', message: 'Kode kadaluarsa. Silakan minta kode baru.' });
  }

  if (otpSession.uid !== uid) {
    return res.status(403).json({ ok: false, error: 'otp_session_mismatch', message: 'Sesi verifikasi tidak cocok dengan akun ini.' });
  }

  if (otpSession.attempts >= session.MAX_OTP_ATTEMPTS) {
    res.setHeader('Set-Cookie', session.clearCookie(session.OTP_COOKIE_NAME));
    return res.status(429).json({ ok: false, error: 'max_attempts', message: 'Terlalu banyak percobaan. Silakan minta kode baru.' });
  }

  var submittedHash = session.hashOtp(code, uid);
  var isMatch = session.timingSafeEqualHex(submittedHash, otpSession.otpHash);

  if (!isMatch) {
    var attemptsLeft = session.MAX_OTP_ATTEMPTS - (otpSession.attempts + 1);
    var reSigned = session.signOtpSession({
      uid: otpSession.uid,
      email: otpSession.email,
      otpHash: otpSession.otpHash,
      attempts: otpSession.attempts + 1,
      resendAt: otpSession.resendAt,
      exp: otpSession.exp // preserve original expiry — wrong guesses don't extend the window
    });
    res.setHeader('Set-Cookie', session.serializeCookie(session.OTP_COOKIE_NAME, reSigned, Math.max(1, otpSession.exp - Math.floor(Date.now() / 1000))));
    return res.status(400).json({
      ok: false,
      error: 'wrong_code',
      message: attemptsLeft > 0 ? 'Kode salah. Sisa percobaan: ' + attemptsLeft + '.' : 'Kode salah. Percobaan habis.',
      attemptsLeft: Math.max(0, attemptsLeft)
    });
  }

  var verifiedCookie = session.signVerifiedSession(uid, email);
  res.setHeader('Set-Cookie', [
    session.clearCookie(session.OTP_COOKIE_NAME),
    session.serializeCookie(session.VERIFIED_COOKIE_NAME, verifiedCookie, session.VERIFIED_TTL)
  ]);
  return res.status(200).json({ ok: true, message: 'Verifikasi berhasil.' });
};
