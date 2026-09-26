/* =========================================================
   KOPI NUSANTARA — api/_lib/session.js
   -----------------------------------------------------------
   OTP state is carried in a signed, httpOnly cookie instead of
   Firestore — no npm dependency, just Node's built-in crypto
   via crypto-jwt.js. The cookie is opaque and tamper-proof
   (HS256, server-only secret): the browser can store it but
   can't read or forge its contents.
========================================================= */
var crypto = require('node:crypto');
var jwt = require('./crypto-jwt.js');

function getSecret() {
  var secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('server_misconfigured_missing_session_secret');
  }
  return secret;
}

var OTP_COOKIE_NAME = 'kn_otp';
var VERIFIED_COOKIE_NAME = 'kn_verified';

var OTP_TTL_SECONDS = 5 * 60;             // 5 menit
var RESEND_COOLDOWN_SECONDS = 60;         // 60 detik
var MAX_ATTEMPTS = 5;
var VERIFIED_TTL_SECONDS = 12 * 60 * 60;  // 12 jam

/* ---------------------------------------------------------
   Cookie parsing / serializing (no extra dependency)
--------------------------------------------------------- */
function parseCookies(req) {
  var header = req.headers.cookie;
  var out = {};
  if (!header) return out;
  header.split(';').forEach(function (part) {
    var idx = part.indexOf('=');
    if (idx === -1) return;
    var key = part.slice(0, idx).trim();
    var val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function serializeCookie(name, value, maxAgeSeconds) {
  var parts = [name + '=' + encodeURIComponent(value), 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict'];
  parts.push('Max-Age=' + Math.max(0, maxAgeSeconds));
  return parts.join('; ');
}

function clearCookie(name) {
  return serializeCookie(name, '', 0);
}

/* ---------------------------------------------------------
   OTP code + hash
--------------------------------------------------------- */
function generateOtpCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(code, uid) {
  var secret = process.env.SESSION_SECRET || '';
  return crypto.createHash('sha256').update(code + ':' + uid + ':' + secret).digest('hex');
}

function timingSafeEqualHex(a, b) {
  var bufA = Buffer.from(a, 'hex');
  var bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/* ---------------------------------------------------------
   OTP session cookie (purpose: "otp")
--------------------------------------------------------- */
function signOtpSession(payload) {
  var secret = getSecret();
  var now = Math.floor(Date.now() / 1000);
  return jwt.signHS256({
    purpose: 'otp',
    uid: payload.uid,
    email: payload.email,
    otpHash: payload.otpHash,
    attempts: payload.attempts,
    resendAt: payload.resendAt,
    iat: payload.iat || now,
    exp: payload.exp || (now + OTP_TTL_SECONDS)
  }, secret);
}

function verifyOtpSession(token) {
  var secret = getSecret();
  var payload = jwt.verifyHS256(token, secret);
  if (payload.purpose !== 'otp') throw new Error('wrong_cookie_purpose');
  return payload;
}

/* ---------------------------------------------------------
   Verified session cookie (purpose: "verified")
--------------------------------------------------------- */
function signVerifiedSession(uid, email) {
  var secret = getSecret();
  var now = Math.floor(Date.now() / 1000);
  return jwt.signHS256({
    purpose: 'verified',
    uid: uid,
    email: email,
    iat: now,
    exp: now + VERIFIED_TTL_SECONDS
  }, secret);
}

function verifyVerifiedSession(token) {
  var secret = getSecret();
  var payload = jwt.verifyHS256(token, secret);
  if (payload.purpose !== 'verified') throw new Error('wrong_cookie_purpose');
  return payload;
}

module.exports = {
  OTP_COOKIE_NAME: OTP_COOKIE_NAME,
  VERIFIED_COOKIE_NAME: VERIFIED_COOKIE_NAME,
  OTP_TTL: OTP_TTL_SECONDS,
  RESEND_COOLDOWN: RESEND_COOLDOWN_SECONDS,
  MAX_OTP_ATTEMPTS: MAX_ATTEMPTS,
  VERIFIED_TTL: VERIFIED_TTL_SECONDS,
  parseCookies: parseCookies,
  serializeCookie: serializeCookie,
  clearCookie: clearCookie,
  generateOtpCode: generateOtpCode,
  hashOtp: hashOtp,
  timingSafeEqualHex: timingSafeEqualHex,
  signOtpSession: signOtpSession,
  verifyOtpSession: verifyOtpSession,
  signVerifiedSession: signVerifiedSession,
  verifyVerifiedSession: verifyVerifiedSession
};
