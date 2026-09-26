/* =========================================================
   KOPI NUSANTARA — api/_lib/firebaseAuth.js
   -----------------------------------------------------------
   Verifies a Firebase Auth ID token *without* the Firebase
   Admin SDK and *without* any npm package — just Node's
   built-in `fetch` + `crypto` (via crypto-jwt.js).

   Method follows Firebase's own documented approach for
   verifying ID tokens with a third-party JWT library:
   https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
========================================================= */
var jwt = require('./crypto-jwt.js');

var PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'kopi-nusantara-2d465';
var JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
var JWKS_CACHE_MS = 60 * 60 * 1000; // 1 jam — kunci Google jarang berganti

var jwksCache = { keys: null, fetchedAt: 0 };

async function getGoogleJwks() {
  var now = Date.now();
  if (jwksCache.keys && (now - jwksCache.fetchedAt) < JWKS_CACHE_MS) {
    return jwksCache.keys;
  }
  var resp = await fetch(JWKS_URL);
  if (!resp.ok) throw new Error('jwks_fetch_failed');
  var data = await resp.json();
  if (!data || !Array.isArray(data.keys)) throw new Error('jwks_bad_format');
  jwksCache = { keys: data.keys, fetchedAt: now };
  return jwksCache.keys;
}

/**
 * @param {string} idToken - Firebase ID token from the signed-in client (user.getIdToken()).
 * @returns {Promise<{uid: string, email: string}>}
 */
async function verifyFirebaseIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('missing_id_token');
  }

  var header;
  try {
    header = jwt.decodeHeader(idToken);
  } catch (err) {
    throw new Error('invalid_id_token');
  }
  if (header.alg !== 'RS256') throw new Error('invalid_id_token_alg');

  var keys = await getGoogleJwks();
  var jwk = keys.find(function (k) { return k.kid === header.kid; });
  if (!jwk) {
    // Kunci mungkin baru rotasi — coba refresh sekali sebelum menyerah.
    jwksCache = { keys: null, fetchedAt: 0 };
    keys = await getGoogleJwks();
    jwk = keys.find(function (k) { return k.kid === header.kid; });
    if (!jwk) throw new Error('unknown_signing_key');
  }

  var payload;
  try {
    payload = jwt.verifyRS256WithJwk(idToken, jwk);
  } catch (err) {
    throw new Error('invalid_id_token_signature');
  }

  var now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || now > payload.exp) throw new Error('id_token_expired');
  if (payload.iss !== 'https://securetoken.google.com/' + PROJECT_ID) throw new Error('invalid_issuer');
  if (payload.aud !== PROJECT_ID) throw new Error('invalid_audience');
  if (!payload.sub) throw new Error('invalid_id_token_subject');
  if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now() + 5000) {
    throw new Error('invalid_id_token_auth_time');
  }
  if (!payload.email) throw new Error('id_token_missing_email');

  return { uid: payload.sub, email: String(payload.email) };
}

module.exports = { verifyFirebaseIdToken: verifyFirebaseIdToken };
