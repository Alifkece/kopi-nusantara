/* =========================================================
   KOPI NUSANTARA — api/_lib/mailer.js
   -----------------------------------------------------------
   Sends the OTP email via raw SMTP over TLS to Gmail — no
   nodemailer package. Talks directly to smtp.gmail.com:465
   using Node's built-in `tls` module and AUTH LOGIN with the
   Gmail App Password.

   SERVER-SIDE ONLY — GMAIL_APP_PASSWORD never reaches the
   client; this file only ever runs inside /api.
========================================================= */
var tls = require('node:tls');

var SMTP_HOST = 'smtp.gmail.com';
var SMTP_PORT = 465;
var SMTP_TIMEOUT_MS = 15000;

function otpEmailHtml(code) {
  return (
    '<div style="background:#F6EEE1;padding:32px 16px;font-family:\'DM Sans\',Arial,sans-serif;">' +
      '<div style="max-width:480px;margin:0 auto;background:#FBF8F3;border-radius:15px;overflow:hidden;border:1px solid rgba(41,34,27,0.12);">' +
        '<div style="background:#29221B;padding:28px 32px;text-align:center;">' +
          '<span style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:24px;font-weight:600;color:#FBF8F3;letter-spacing:.02em;">Kopi Nusantara</span>' +
        '</div>' +
        '<div style="padding:32px;text-align:center;">' +
          '<h1 style="font-family:\'Cormorant Garamond\',Georgia,serif;font-size:22px;color:#29221B;margin:0 0 12px;">Kode Verifikasi Anda</h1>' +
          '<p style="color:#6B4A32;font-size:14px;line-height:1.6;margin:0 0 24px;">Kode verifikasi Anda adalah:</p>' +
          '<div style="display:inline-block;background:#E4D5BE;border-radius:10px;padding:16px 28px;margin-bottom:24px;">' +
            '<span style="font-family:\'DM Sans\',Arial,sans-serif;font-size:32px;font-weight:700;letter-spacing:.3em;color:#29221B;">' + code + '</span>' +
          '</div>' +
          '<p style="color:#6B4A32;font-size:13px;line-height:1.6;margin:0 0 4px;">Kode berlaku selama 5 menit.</p>' +
          '<p style="color:#AD8A52;font-size:12px;line-height:1.6;margin:20px 0 0;">Jangan bagikan kode ini kepada siapa pun.<br>Jika Anda tidak meminta kode ini, abaikan email ini.</p>' +
        '</div>' +
        '<div style="background:#E4D5BE;padding:16px;text-align:center;">' +
          '<span style="color:#6B4A32;font-size:11px;letter-spacing:.08em;">KOPI NUSANTARA</span>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function encodeSubject(str) {
  return '=?UTF-8?B?' + Buffer.from(str, 'utf8').toString('base64') + '?=';
}

// Dot-stuff any line that starts with "." per RFC 5321, so a stray line
// starting with a dot in the body doesn't get mistaken for the
// end-of-DATA terminator ("\r\n.\r\n").
function dotStuff(message) {
  return message.split('\r\n').map(function (line) {
    return line.charAt(0) === '.' ? '.' + line : line;
  }).join('\r\n');
}

function buildMessage(fromEmail, toEmail, code) {
  var boundary = 'kn-otp-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  var subject = encodeSubject('Kode Verifikasi Anda — Kopi Nusantara');
  var text = 'Kode verifikasi Anda adalah: ' + code + '. Kode berlaku selama 5 menit. Jangan bagikan kode ini kepada siapa pun.';
  var html = otpEmailHtml(code);

  return (
    'From: Kopi Nusantara <' + fromEmail + '>\r\n' +
    'To: ' + toEmail + '\r\n' +
    'Subject: ' + subject + '\r\n' +
    'MIME-Version: 1.0\r\n' +
    'Content-Type: multipart/alternative; boundary="' + boundary + '"\r\n' +
    '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    text + '\r\n' +
    '\r\n' +
    '--' + boundary + '\r\n' +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    html + '\r\n' +
    '\r\n' +
    '--' + boundary + '--\r\n'
  );
}

/* ---------------------------------------------------------
   Tiny SMTP dialogue helper: buffers incoming lines and
   resolves once a *final* reply line for the current command
   arrives (multi-line replies use "250-", the last line "250 ").
--------------------------------------------------------- */
function createSmtpClient(socket) {
  var buffer = '';
  var waiting = null;

  socket.setEncoding('utf8');
  socket.on('data', function (chunk) {
    buffer += chunk;
    flush();
  });
  socket.on('error', function (err) {
    if (waiting) { var w = waiting; waiting = null; w.reject(err); }
  });
  socket.on('close', function () {
    if (waiting) { var w = waiting; waiting = null; w.reject(new Error('smtp_connection_closed')); }
  });

  function flush() {
    if (!waiting) return;
    var lines = buffer.split('\r\n').filter(function (l) { return l.length > 0; });
    if (lines.length === 0) return;
    var last = lines[lines.length - 1];
    if (/^\d{3} /.test(last)) {
      var code = parseInt(last.slice(0, 3), 10);
      var text = lines.join(' | ');
      buffer = '';
      var w = waiting;
      waiting = null;
      w.resolve({ code: code, text: text });
    }
  }

  return {
    waitReply: function () {
      return new Promise(function (resolve, reject) {
        waiting = { resolve: resolve, reject: reject };
        flush();
      });
    },
    command: function (line, expectedCode) {
      socket.write(line + '\r\n');
      return this.waitReply().then(function (res) {
        if (res.code !== expectedCode) {
          throw new Error('smtp_unexpected_reply: expected ' + expectedCode + ', got ' + res.code + ' (' + res.text + ')');
        }
        return res;
      });
    },
    raw: function (data) { socket.write(data); }
  };
}

async function sendOtpEmail(toEmail, code) {
  var user = process.env.GMAIL_USER;
  var pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error('server_misconfigured_missing_gmail_credentials');

  return new Promise(function (resolve, reject) {
    var settled = false;
    function finish(fn, arg) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn(arg);
    }

    var timeoutId = setTimeout(function () {
      finish(reject, new Error('smtp_timeout'));
      try { socket.destroy(); } catch (e) { /* noop */ }
    }, SMTP_TIMEOUT_MS);

    var socket = tls.connect({ host: SMTP_HOST, port: SMTP_PORT, servername: SMTP_HOST }, function () {
      var client = createSmtpClient(socket);

      client.waitReply() // server greeting, "220 ..."
        .then(function (greeting) {
          if (greeting.code !== 220) throw new Error('smtp_bad_greeting');
          return client.command('EHLO kopi-nusantara.vercel.app', 250);
        })
        .then(function () { return client.command('AUTH LOGIN', 334); })
        .then(function () { return client.command(Buffer.from(user, 'utf8').toString('base64'), 334); })
        .then(function () { return client.command(Buffer.from(pass, 'utf8').toString('base64'), 235); })
        .then(function () { return client.command('MAIL FROM:<' + user + '>', 250); })
        .then(function () { return client.command('RCPT TO:<' + toEmail + '>', 250); })
        .then(function () { return client.command('DATA', 354); })
        .then(function () {
          var message = dotStuff(buildMessage(user, toEmail, code));
          client.raw(message + '\r\n.\r\n');
          return client.waitReply();
        })
        .then(function (res) {
          if (res.code !== 250) throw new Error('smtp_send_failed: ' + res.text);
          try { socket.write('QUIT\r\n'); } catch (e) { /* noop */ }
          socket.end();
          finish(resolve, undefined);
        })
        .catch(function (err) {
          try { socket.destroy(); } catch (e) { /* noop */ }
          finish(reject, err);
        });
    });

    socket.on('error', function (err) { finish(reject, err); });
  });
}

module.exports = { sendOtpEmail: sendOtpEmail };
