/* =========================================================
   KOPI NUSANTARA — api/check-verified.js
   GET, Authorization: Bearer <idToken>
   -> { ok: true, verified: boolean }
   Read-only status check; never issues or clears cookies.
========================================================= */
var firebaseAuth = require('./_lib/firebaseAuth.js');
var session = require('./_lib/session.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  var authHeader = req.headers.authorization || '';
  var idToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : null;

  var uid;
  try {
    var decoded = await firebaseAuth.verifyFirebaseIdToken(idToken);
    uid = decoded.uid;
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'invalid_session' });
  }

  var cookies = session.parseCookies(req);
  var verifiedCookie = cookies[session.VERIFIED_COOKIE_NAME];
  if (!verifiedCookie) {
    return res.status(200).json({ ok: true, verified: false });
  }

  try {
    var payload = session.verifyVerifiedSession(verifiedCookie);
    return res.status(200).json({ ok: true, verified: payload.uid === uid });
  } catch (err) {
    return res.status(200).json({ ok: true, verified: false });
  }
};
