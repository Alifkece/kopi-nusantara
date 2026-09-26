/* =========================================================
   KOPI NUSANTARA — api/_lib/crypto-jwt.js
   -----------------------------------------------------------
   Zero-dependency JWT helpers using only Node's built-in
   `crypto` module (no jose / jsonwebtoken package, so nothing
   needs to be npm-installed on Vercel for this feature).
========================================================= */
var crypto = require('node:crypto');

function base64url(input) {
  var buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  var s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

/* ---------------------------------------------------------
   HS256 — for our own OTP / verified session cookies.
--------------------------------------------------------- */
function signHS256(payload, secret) {
  var header = { alg: 'HS256', typ: 'JWT' };
  var data = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(payload));
  var sig = crypto.createHmac('sha256', secret).update(data).digest();
  return data + '.' + base64url(sig);
}

function verifyHS256(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('missing_token');
  var parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed_token');
  var data = parts[0] + '.' + parts[1];
  var expected = crypto.createHmac('sha256', secret).update(data).digest();
  var actual = base64urlDecode(parts[2]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('invalid_signature');
  }
  var payload = JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
  var now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error('token_expired');
  return payload;
}

/* ---------------------------------------------------------
   RS256 verify against a raw JWK (for Google/Firebase's
   securetoken-signed ID tokens — public key only, no signing).
--------------------------------------------------------- */
function decodeHeader(token) {
  var parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed_token');
  return JSON.parse(base64urlDecode(parts[0]).toString('utf8'));
}

function verifyRS256WithJwk(token, jwk) {
  var parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed_token');
  var data = parts[0] + '.' + parts[1];
  var signature = base64urlDecode(parts[2]);
  var publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  var isValid = crypto.verify('RSA-SHA256', Buffer.from(data), publicKey, signature);
  if (!isValid) throw new Error('invalid_signature');
  return JSON.parse(base64urlDecode(parts[1]).toString('utf8'));
}

module.exports = {
  base64url: base64url,
  base64urlDecode: base64urlDecode,
  signHS256: signHS256,
  verifyHS256: verifyHS256,
  decodeHeader: decodeHeader,
  verifyRS256WithJwk: verifyRS256WithJwk
};
