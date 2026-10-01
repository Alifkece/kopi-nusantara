/* =========================================================
   KOPI NUSANTARA — js/auth.js
   -----------------------------------------------------------
   Firebase Authentication (Google + Email/Password), Gmail OTP
   verification (server-side, api/send-otp.js + api/verify-otp.js +
   api/check-verified.js), and the Firestore `users/{uid}` profile
   document.

   Firebase Auth success alone is NEVER treated as "logged in" for
   ANY provider (Email/Password, Register, Google): the user must
   also pass server-verified Gmail OTP before window.KopiAuth
   considers them authenticated. See window.KopiAuth below.

   This module only touches auth-related DOM (account menu,
   auth modal, toasts). It never re-initializes Firebase —
   the app/auth/db instances come from js/firebase-init.js —
   and it never touches product/search/cart/modal logic from
   script.js.
========================================================= */
import { auth, db } from './firebase-init.js';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GMAIL_DOMAIN_RE = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;

  /* =======================================================
     0. TOAST NOTIFICATIONS (replaces alert())
  ======================================================= */
  var toastStack = document.getElementById('toastStack');
  function showToast(message, type) {
    if (!toastStack) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast--' + (type || 'info');
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    toastStack.appendChild(toast);
    window.requestAnimationFrame(function () { toast.classList.add('is-visible'); });
    window.setTimeout(function () {
      toast.classList.remove('is-visible');
      window.setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 350);
    }, 4200);
  }
  // Dipakai juga oleh script.js (cart/checkout) — satu sistem notifikasi
  // untuk seluruh situs, bukan alert() atau toast kedua yang terpisah.
  window.KopiToast = showToast;

  /* =======================================================
     1. FRIENDLY ERROR MESSAGES
  ======================================================= */
  var ERROR_MESSAGES = {
    'auth/invalid-credential': 'Email atau password salah.',
    'auth/wrong-password': 'Email atau password salah.',
    'auth/user-not-found': 'Email atau password salah.',
    'auth/email-already-in-use': 'Email ini sudah terdaftar.',
    'auth/weak-password': 'Password terlalu lemah, gunakan minimal 6 karakter.',
    'auth/invalid-email': 'Format email tidak valid.',
    'auth/popup-closed-by-user': 'Login Google dibatalkan.',
    'auth/cancelled-popup-request': 'Login Google dibatalkan.',
    'auth/popup-blocked': 'Popup Google diblokir browser. Izinkan popup lalu coba lagi.',
    'auth/network-request-failed': 'Koneksi bermasalah. Periksa internet Anda dan coba lagi.',
    'auth/too-many-requests': 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
    'auth/invalid-api-key': 'Konfigurasi Firebase (API key) tidak valid. Cek js/firebase-init.js.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Konfigurasi Firebase (API key) tidak valid. Cek js/firebase-init.js.',
    'auth/unauthorized-domain': 'Domain ini belum diizinkan di Firebase Console (Authentication → Settings → Authorized domains).',
    'auth/operation-not-allowed': 'Metode login ini belum diaktifkan di Firebase Console (Authentication → Sign-in method).',
    'auth/configuration-not-found': 'Metode login ini belum diaktifkan di Firebase Console (Authentication → Sign-in method).'
  };
  function friendlyError(err) {
    var code = err && err.code;
    console.error('Firebase auth error:', err);
    return (code && ERROR_MESSAGES[code]) || ('Terjadi kesalahan' + (code ? ' (' + code + ')' : '') + '. Silakan coba lagi.');
  }

  /* =======================================================
     2. BUTTON LOADING STATE
  ======================================================= */
  function setButtonLoading(btn, isLoading) {
    if (!btn) return;
    btn.disabled = isLoading;
    btn.classList.toggle('is-loading', isLoading);
  }

  /* =======================================================
     3. FIRESTORE USER PROFILE
     Creates users/{uid} on first sign-in, updates it (without
     wiping existing fields) on subsequent sign-ins. Never
     stores a password.
  ======================================================= */
  function ensureUserDocument(user, provider) {
    var ref = doc(db, 'users', user.uid);
    return getDoc(ref).then(function (snap) {
      var base = {
        uid: user.uid,
        name: user.displayName || '',
        email: user.email || '',
        photoURL: user.photoURL || '',
        provider: provider,
        updatedAt: serverTimestamp()
      };
      if (!snap.exists()) {
        base.createdAt = serverTimestamp();
      }
      // merge: true keeps any existing fields intact and only touches these.
      return setDoc(ref, base, { merge: true });
    });
  }

  /* =======================================================
     4. ACCOUNT MENU (navbar icon + dropdown)
  ======================================================= */
  var accountMenu = document.getElementById('accountMenu');
  var accountBtn = document.getElementById('accountBtn');
  var accountDropdown = document.getElementById('accountDropdown');
  var accountGuestView = document.getElementById('accountGuestView');
  var accountUserView = document.getElementById('accountUserView');
  var accountAvatarThumb = document.getElementById('accountAvatarThumb');
  var accountAvatarImg = document.getElementById('accountAvatarImg');
  var accountNameText = document.getElementById('accountNameText');
  var accountEmailText = document.getElementById('accountEmailText');
  var openAuthModalBtn = document.getElementById('openAuthModalBtn');
  var logoutBtn = document.getElementById('logoutBtn');

  function isDropdownOpen() {
    return !!(accountDropdown && accountDropdown.classList.contains('is-open'));
  }
  function openAccountDropdown() {
    if (!accountDropdown) return;
    accountDropdown.classList.add('is-open');
    accountDropdown.setAttribute('aria-hidden', 'false');
    if (accountBtn) accountBtn.setAttribute('aria-expanded', 'true');
  }
  function closeAccountDropdown() {
    if (!accountDropdown) return;
    accountDropdown.classList.remove('is-open');
    accountDropdown.setAttribute('aria-hidden', 'true');
    if (accountBtn) accountBtn.setAttribute('aria-expanded', 'false');
  }

  if (accountBtn) {
    accountBtn.addEventListener('click', function () {
      var loggedIn = accountUserView && !accountUserView.hidden;
      if (loggedIn) {
        isDropdownOpen() ? closeAccountDropdown() : openAccountDropdown();
      } else {
        openAuthModal('login');
      }
    });
  }
  document.addEventListener('click', function (e) {
    if (!accountMenu || !isDropdownOpen()) return;
    if (!accountMenu.contains(e.target)) closeAccountDropdown();
  });

  function renderAuthUI(user) {
    if (!accountGuestView || !accountUserView) return;

    if (user) {
      accountGuestView.hidden = true;
      accountUserView.hidden = false;

      var name = user.displayName || (user.email ? user.email.split('@')[0] : 'Pengguna');
      var initialLetter = name.charAt(0).toUpperCase();
      var fallbackAvatar = 'data:image/svg+xml,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="%23AD8A52"/><text x="50%" y="54%" font-family="DM Sans, sans-serif" font-size="26" fill="%23FBF8F3" text-anchor="middle">' + initialLetter + '</text></svg>'
      );
      var avatarSrc = user.photoURL || fallbackAvatar;

      if (accountNameText) accountNameText.textContent = name;
      if (accountEmailText) accountEmailText.textContent = user.email || '';
      if (accountAvatarImg) { accountAvatarImg.src = avatarSrc; accountAvatarImg.alt = name; }
      if (accountAvatarThumb) {
        accountAvatarThumb.src = avatarSrc;
        accountAvatarThumb.alt = name;
        accountAvatarThumb.hidden = false;
      }
      if (accountBtn) accountBtn.classList.add('icon-btn--has-avatar');
    } else {
      accountGuestView.hidden = false;
      accountUserView.hidden = true;
      closeAccountDropdown();
      if (accountAvatarThumb) { accountAvatarThumb.hidden = true; accountAvatarThumb.src = ''; }
      if (accountBtn) accountBtn.classList.remove('icon-btn--has-avatar');
    }
  }

  /* =======================================================
     5. AUTH MODAL (login / register)
  ======================================================= */
  var authModal = document.getElementById('authModal');
  var authModalTitle = document.getElementById('authModalTitle');
  var authContextNote = document.getElementById('authContextNote');
  var loginForm = document.getElementById('loginForm');
  var registerForm = document.getElementById('registerForm');
  var loginError = document.getElementById('loginError');
  var registerError = document.getElementById('registerError');
  var loginSubmitBtn = document.getElementById('loginSubmitBtn');
  var registerSubmitBtn = document.getElementById('registerSubmitBtn');
  var googleAuthBtn = document.getElementById('googleAuthBtn');
  var authTabsEl = authModal ? authModal.querySelector('.auth-screen__tabs') : null;
  var authDividerEl = authModal ? authModal.querySelector('.auth-divider') : null;

  /* =======================================================
     5a. AUTH VIDEO + LIFECYCLE MODAL
     Dua <video> berbagi container visual; TEPAT satu yang tampil per
     breakpoint (CSS: >=861px desktop, <=860px mobile — breakpoint yang
     sama dipakai di sini). Hanya video aktif yang diputar; yang tidak
     aktif di-pause. Tidak ada autoplay di HTML, jadi tidak ada video
     yang berjalan diam-diam saat modal tertutup.

     Suara: play() dicoba dengan suara (kita ada di dalam klik user);
     kalau browser menolak (autoplay policy), otomatis diulang dalam
     keadaan muted — video TIDAK PERNAH dibiarkan diam/freeze. Kalau
     muted pun ditolak (mis. mode hemat daya iOS), diputar ulang pada
     sentuhan pertama di dalam modal.

     Saat ditutup: suara langsung dimatikan, tetapi video baru di-pause
     + di-rewind SETELAH animasi tutup selesai (kalau tidak, video
     terlihat loncat ke frame 0 di tengah fade).
  ======================================================= */
  var authVisualDesktop = authModal ? authModal.querySelector('.auth-screen__visual-media--desktop') : null;
  var authVisualMobile = authModal ? authModal.querySelector('.auth-screen__visual-media--mobile') : null;
  var authDesktopMQ = window.matchMedia('(min-width: 861px)');
  var authVideoToken = 0;
  var authVideoStopTimer = null;
  var authVideoRetryArmed = false;

  function isAuthOpen() { return !!(authModal && authModal.classList.contains('is-open')); }
  // Durasi animasi dibaca dari CSS (--auth-close / --auth-open) supaya JS & CSS selalu sinkron.
  function authCssMs(name, fallback) {
    try {
      var v = window.getComputedStyle(authModal).getPropertyValue(name).trim();
      if (!v) return fallback;
      var n = parseFloat(v);
      if (isNaN(n)) return fallback;
      return /ms$/.test(v) ? n : n * 1000;
    } catch (e) { return fallback; }
  }

  function getActiveAuthVideo() {
    return authDesktopMQ.matches ? authVisualDesktop : authVisualMobile;
  }
  function getInactiveAuthVideo() {
    return authDesktopMQ.matches ? authVisualMobile : authVisualDesktop;
  }
  function pauseAuthVideo(video, rewind) {
    if (!video) return;
    try { video.pause(); } catch (e) { /* ignore */ }
    if (rewind) {
      try { video.currentTime = 0; } catch (e) { /* belum seekable — abaikan */ }
    }
  }

  // Video baru terlihat (fade-in) setelah frame pertamanya siap; sebelum itu
  // yang tampil adalah gambar fallback container, bukan kotak kosong.
  [authVisualDesktop, authVisualMobile].forEach(function (v) {
    if (!v) return;
    var markReady = function () { v.classList.add('is-ready'); };
    v.addEventListener('loadeddata', markReady);
    v.addEventListener('playing', markReady);
    v.addEventListener('error', function () { v.classList.remove('is-ready'); });
    v.loop = true;
    v.muted = true;
    if (v.readyState >= 2) markReady();
  });

  function armAuthVideoRetry() {
    if (authVideoRetryArmed || !authModal) return;
    authVideoRetryArmed = true;
    var retry = function () {
      authVideoRetryArmed = false;
      authModal.removeEventListener('pointerdown', retry, true);
      authModal.removeEventListener('keydown', retry, true);
      if (!isAuthOpen()) return;
      var v = getActiveAuthVideo();
      if (v && v.paused) tryPlayAuthVideo(v, authVideoToken, false);
    };
    authModal.addEventListener('pointerdown', retry, true);
    authModal.addEventListener('keydown', retry, true);
  }

  function tryPlayAuthVideo(video, token, withSound) {
    // Saat animasi OTP berjalan, audio video auth selalu mute (video tetap play) walau play() dipanggil ulang.
    video.muted = !withSound || otpAnimating;
    var playPromise;
    try { playPromise = video.play(); } catch (e) { playPromise = null; }
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(function (err) {
        if (token !== authVideoToken || !isAuthOpen()) return; // modal sudah ditutup / play baru sudah dimulai
        if (err && err.name === 'AbortError') return;            // diinterupsi pause(), bukan diblokir policy
        if (withSound) tryPlayAuthVideo(video, token, false);    // suara diblokir -> putar muted
        else armAuthVideoRetry();                                // muted pun diblokir -> coba lagi saat disentuh
      });
    }
  }

  function playActiveAuthVideo() {
    if (authVideoStopTimer) { window.clearTimeout(authVideoStopTimer); authVideoStopTimer = null; }
    pauseAuthVideo(getInactiveAuthVideo(), true); // video yang tidak tampil tidak boleh jalan
    var active = getActiveAuthVideo();
    if (!active) return;
    var token = ++authVideoToken;
    active.loop = true;
    if (active.paused) {
      try { active.currentTime = 0; } catch (e) { /* belum seekable — abaikan */ }
    }
    tryPlayAuthVideo(active, token, true);
  }

  // Dipanggil saat animasi OTP mulai: HANYA mute audio video auth. Video tidak di-pause dan SFX OTP
  // (elemen Audio terpisah) tidak tersentuh.
  function muteAuthVideoAudio() {
    [authVisualDesktop, authVisualMobile].forEach(function (v) { if (v) v.muted = true; });
  }

  function stopAllAuthVideos() {
    authVideoToken++; // batalkan penanganan play() yang masih menggantung
    [authVisualDesktop, authVisualMobile].forEach(function (v) { if (v) v.muted = true; });
    if (authVideoStopTimer) window.clearTimeout(authVideoStopTimer);
    authVideoStopTimer = window.setTimeout(function () {
      authVideoStopTimer = null;
      pauseAuthVideo(authVisualDesktop, true);
      pauseAuthVideo(authVisualMobile, true);
    }, authCssMs('--auth-close', 280) + 80);
  }

  // Viewport melewati breakpoint saat modal terbuka (rotasi tablet, resize
  // window): ganti video aktif dan hentikan yang lama.
  var handleAuthBreakpointChange = function () {
    if (isAuthOpen()) playActiveAuthVideo();
  };
  if (authDesktopMQ.addEventListener) {
    authDesktopMQ.addEventListener('change', handleAuthBreakpointChange);
  } else if (authDesktopMQ.addListener) {
    authDesktopMQ.addListener(handleAuthBreakpointChange);
  }
  // Browser kadang mem-pause video saat tab di background / hemat daya.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !isAuthOpen()) return;
    var v = getActiveAuthVideo();
    if (v && v.paused) tryPlayAuthVideo(v, authVideoToken, !v.muted);
  });

  /* =======================================================
     5c. GMAIL OTP VERIFICATION (after ANY sign-in: Google,
     Email/Password login, or Register)
     Reuses this same auth-screen: once Firebase Auth resolves
     to a valid @gmail.com address, the modal swaps from the
     Google/login/register panel into this OTP panel instead of
     closing. Firebase Auth alone is NOT treated as "signed in"
     for ANY provider — see window.KopiAuth below.
  ======================================================= */
  var otpForm = document.getElementById('otpForm');
  var otpMaskedEmailEl = document.getElementById('otpMaskedEmail');
  var otpError = document.getElementById('otpError');
  var otpVerifyBtn = document.getElementById('otpVerifyBtn');
  var otpResendBtn = document.getElementById('otpResendBtn');
  var otpBoxes = otpForm ? Array.prototype.slice.call(otpForm.querySelectorAll('.otp-box')) : [];

  var otpPendingUser = null;
  var otpSuccessMessage = 'Berhasil masuk.';
  var resendTimerId = null;
  // Tracks server-verified OTP status for whichever user is currently
  // signed in via Firebase Auth — used for ALL providers (Email/Password,
  // Register, Google), not just Google. See window.KopiAuth below.
  var otpVerificationState = { uid: null, verified: false };

  function maskEmailClient(email) {
    var parts = String(email || '').split('@');
    if (parts.length !== 2) return email || '';
    var name = parts[0];
    return (name.length <= 1 ? name : name[0] + '***') + '@' + parts[1];
  }

  function updateResendLabel(remaining) {
    if (otpResendBtn) otpResendBtn.textContent = 'Kirim ulang dalam ' + remaining + ' detik';
  }
  function stopResendCountdown() {
    if (resendTimerId) { window.clearInterval(resendTimerId); resendTimerId = null; }
  }
  function startResendCountdown(seconds) {
    stopResendCountdown();
    var remaining = Math.max(1, seconds || 60);
    if (otpResendBtn) otpResendBtn.disabled = true;
    updateResendLabel(remaining);
    resendTimerId = window.setInterval(function () {
      remaining -= 1;
      if (remaining <= 0) {
        stopResendCountdown();
        if (otpResendBtn) { otpResendBtn.disabled = false; otpResendBtn.textContent = 'Kirim ulang kode'; }
        return;
      }
      updateResendLabel(remaining);
    }, 1000);
  }

  /* ---- Glass OTP animation (visual only; runs AFTER the server accepted the code) ---- */
  var otpGlass = document.getElementById('otpGlass');
  var otpGlassTitle = document.getElementById('otpGlassTitle');
  var otpGlassSub = document.getElementById('otpGlassSub');
  var otpGlassStage = document.getElementById('otpGlassStage');
  var otpGlassOrbit = document.getElementById('otpGlassOrbit');
  var otpAnimating = false;
  var otpGlassTimers = [];
  var otpGlassResetTimer = null;

  /* ---- SFX tunggal animasi OTP: SATU file eksternal, SATU elemen Audio (tidak pernah menumpuk).
     Mau ganti suara? Cukup replace file di OTP_SFX_SRC; logic di bawah tidak perlu diubah. ---- */
  var OTP_SFX_SRC = 'assets/audio/otp-verification-sfx.mp3';
  var otpSfx = null;
  var otpSfxFadeTimer = null;

  function getOtpSfx() {
    if (otpSfx || typeof window.Audio !== 'function') return otpSfx;
    try { otpSfx = new Audio(OTP_SFX_SRC); otpSfx.preload = 'auto'; } catch (e) { otpSfx = null; }
    return otpSfx;
  }
  function haltOtpSfx() {
    var a = otpSfx;
    if (!a) return;
    try { a.pause(); a.currentTime = 0; a.volume = 1; } catch (e) {}
    a.muted = false;
  }
  // fade=true: fade-out singkat (animasi dibatalkan saat berjalan); false: berhenti seketika.
  function stopOtpSfx(fade) {
    if (otpSfxFadeTimer) { window.clearInterval(otpSfxFadeTimer); otpSfxFadeTimer = null; }
    var a = otpSfx;
    if (!a) return;
    if (!fade || a.paused) { haltOtpSfx(); return; }
    var v = 1;
    otpSfxFadeTimer = window.setInterval(function () {
      v -= 0.2;
      if (v <= 0) { window.clearInterval(otpSfxFadeTimer); otpSfxFadeTimer = null; haltOtpSfx(); return; }
      try { a.volume = v; } catch (e) {}
    }, 40);
  }
  // Dipanggil dari gesture klik "Verifikasi" supaya play() yang baru jalan setelah respons server
  // tidak diblokir browser (Safari/iOS). Diputar muted lalu langsung dihentikan; tidak terdengar.
  function primeOtpSfx() {
    var a = getOtpSfx();
    if (prefersReducedMotion || !a || !a.paused) return;
    a.muted = true;
    var p;
    try { p = a.play(); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(function () {
        if (a.muted) { a.pause(); try { a.currentTime = 0; } catch (e) {} a.muted = false; }
      }, function () { a.muted = false; });
    } else {
      a.muted = false;
    }
  }
  // Mulai tepat saat animasi dimulai (t=0). Reduced-motion: timeline dipadatkan, jadi SFX dilewati.
  function playOtpSfx() {
    if (prefersReducedMotion) return;
    var a = getOtpSfx();
    if (!a) return;
    stopOtpSfx(false); // pastikan mulai dari 0 dan tidak pernah dua instance bersamaan
    var p;
    try { p = a.play(); } catch (e) { p = null; }
    if (p && typeof p.catch === 'function') p.catch(function () {}); // autoplay diblokir -> animasi tetap jalan tanpa suara
  }

  function clearOtpGlassTimers() {
    otpGlassTimers.forEach(function (t) { window.clearTimeout(t); });
    otpGlassTimers = [];
  }
  function otpGlassAfter(ms, fn) { otpGlassTimers.push(window.setTimeout(fn, ms)); }
  function swapGlassText(el, html) {
    if (!el) return;
    el.classList.remove('is-swap');
    el.classList.add('is-out'); // memudar keluar dulu, baru teks baru masuk
    otpGlassAfter(380, function () {
      el.innerHTML = html; // string konstan dari kode ini, bukan input pengguna
      el.classList.remove('is-out'); void el.offsetWidth; el.classList.add('is-swap');
    });
  }
  function resetOtpGlass() {
    clearOtpGlassTimers();
    if (otpGlassResetTimer) { window.clearTimeout(otpGlassResetTimer); otpGlassResetTimer = null; }
    otpAnimating = false;
    stopOtpSfx(false);
    if (!otpGlass) return;
    otpGlass.classList.remove('is-active', 'is-merged', 'is-success');
    otpGlass.setAttribute('aria-hidden', 'true');
    if (otpGlassOrbit) { otpGlassOrbit.classList.remove('is-spinning'); otpGlassOrbit.innerHTML = ''; }
    if (otpGlassTitle) { otpGlassTitle.classList.remove('is-swap', 'is-out'); otpGlassTitle.textContent = 'Verifying...'; }
    if (otpGlassSub) { otpGlassSub.classList.remove('is-swap', 'is-out'); otpGlassSub.textContent = 'Memeriksa kode keamanan Anda'; }
  }
  // Menghentikan animasi seketika; overlay disembunyikan setelah fade tutup modal selesai.
  function cancelOtpGlass() {
    clearOtpGlassTimers();
    otpAnimating = false;
    stopOtpSfx(true);
    if (!otpGlass || !otpGlass.classList.contains('is-active')) return;
    if (otpGlassResetTimer) window.clearTimeout(otpGlassResetTimer);
    otpGlassResetTimer = window.setTimeout(resetOtpGlass, 700);
  }
  // Posisi tiap kotak digit: baris -> lingkaran -> pusat (transform list sama supaya transisinya mulus).
  function layoutGlassDigits(mode) {
    if (!otpGlassOrbit || !otpGlassStage) return;
    var digits = otpGlassOrbit.children, n = digits.length;
    if (!n) return;
    var w = otpGlassStage.clientWidth, h = otpGlassStage.clientHeight;
    var size = digits[0].offsetWidth || 40;
    var step = Math.min(size + 8, (w - 8) / n);
    var radius = Math.max(size, Math.min(w, h) / 2 - size * 0.7);
    for (var i = 0; i < n; i++) {
      var x = 0, y = 0, rot = 0, scale = 1, opacity = 1;
      var a = (i / n) * 2 * Math.PI;
      if (mode === 'row') { x = (i - (n - 1) / 2) * step; }
      else if (mode === 'circle') { x = Math.sin(a) * radius; y = -Math.cos(a) * radius; rot = (a * 180) / Math.PI; }
      else { rot = (a * 180) / Math.PI; scale = 0.3; opacity = 0; }
      digits[i].style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) rotate(' + rot.toFixed(1) + 'deg) scale(' + scale + ')';
      if (mode === 'merge') digits[i].style.opacity = opacity;
    }
  }
  // Urutan (mengikuti video referensi): kotak digit muncul -> berputar -> menyatu -> centang -> lanjut.
  function playOtpGlass(code, onDone) {
    if (!otpGlass || !otpGlassOrbit) { onDone(); return; }
    var slow = prefersReducedMotion ? 0.12 : 1;
    resetOtpGlass();
    otpAnimating = true;
    String(code).split('').forEach(function (ch, idx) {
      var d = document.createElement('span');
      d.className = 'otp-glass__digit';
      d.style.setProperty('--i', idx);
      d.textContent = ch;
      otpGlassOrbit.appendChild(d);
    });
    layoutGlassDigits('row');
    otpGlass.classList.add('is-active');
    otpGlass.setAttribute('aria-hidden', 'false');
    muteAuthVideoAudio(); // t=0.00s — video tetap PLAY + loop, hanya audio video yang di-mute
    playOtpSfx(); // t=0.00s — SFX tunggal, durasi 7.6s mengikuti timeline di bawah

    otpGlassAfter(1300 * slow, function () {           // 1. digit membentuk lingkaran + berputar
      layoutGlassDigits('circle');
      otpGlassOrbit.classList.add('is-spinning');
    });
    otpGlassAfter(3900 * slow, function () {           // 2. digit menyatu ke pusat
      layoutGlassDigits('merge');
    });
    otpGlassAfter(4600 * slow, function () {           // 3. kotak + cincin muncul
      otpGlass.classList.add('is-merged');
    });
    otpGlassAfter(5200 * slow, function () {           // 4. sukses: hijau, centang, teks berubah
      otpGlass.classList.add('is-success');
      swapGlassText(otpGlassTitle, 'Verified <span class="otp-glass__accent">Successfully</span>');
      swapGlassText(otpGlassSub, 'Kode verifikasi berhasil dikonfirmasi');
    });
    otpGlassAfter(7400 * slow, function () {           // 5. tahan sejenak, lalu lanjut flow existing
      otpAnimating = false;
      onDone();
    });
  }

  /* ---- State lifecycle modal (dipakai showOtpPanel / open / close / ganti tab) ---- */
  var authPanelEl = authModal ? authModal.querySelector('.auth-screen__panel') : null;
  var authEnterTimer = null;
  var authFinalizeTimer = null;
  var authCleanupPending = false;
  var authPanelSwapTimer = null;

  function focusFirstOtpBox() {
    if (!otpBoxes[0]) return;
    try { otpBoxes[0].focus({ preventScroll: true }); } catch (e) { otpBoxes[0].focus(); }
  }

  // Memasang tampilan panel OTP: sembunyikan tab / Google / pemisah / form login+daftar.
  function applyOtpPanelView() {
    if (authModalTitle) authModalTitle.textContent = 'Verifikasi Email';
    if (authContextNote) authContextNote.hidden = true;
    if (authTabsEl) authTabsEl.hidden = true;
    if (googleAuthBtn) googleAuthBtn.hidden = true;
    if (authDividerEl) authDividerEl.hidden = true;
    if (loginForm) loginForm.hidden = true;
    if (registerForm) registerForm.hidden = true;
    otpForm.hidden = false;
  }

  function showOtpPanel(maskedEmail) {
    if (!authModal || !otpForm) return;
    if (otpMaskedEmailEl) otpMaskedEmailEl.textContent = maskedEmail || '';
    setFormError(otpError, '');
    resetOtpGlass();
    getOtpSfx(); // preload SFX selagi pengguna mengisi kode
    otpBoxes.forEach(function (b) { b.value = ''; });
    if (authPanelSwapTimer) { window.clearTimeout(authPanelSwapTimer); authPanelSwapTimer = null; }

    // 1) Modal tertutup (mis. checkout meminta OTP): siapkan panel OTP lalu buka.
    if (!isAuthOpen()) {
      finalizeAuthClose();
      applyOtpPanelView();
      activateAuthShell();
      focusFirstOtpBox();
      return;
    }
    // 2) Panel OTP sudah tampil (kirim ulang kode): cukup kosongkan kotak.
    if (!otpForm.hidden) { focusFirstOtpBox(); return; }
    // 3) Modal terbuka di Masuk/Daftar: panel memudar sebentar, isinya diganti
    //    saat tak terlihat, lalu memudar masuk — tanpa kilatan/blank.
    if (prefersReducedMotion || !authPanelEl) {
      applyOtpPanelView();
      focusFirstOtpBox();
      return;
    }
    cancelAuthTabSwitch();
    authModal.classList.remove('is-entering');
    authPanelEl.classList.add('is-swapping');
    authPanelSwapTimer = window.setTimeout(function () {
      authPanelSwapTimer = null;
      if (!isAuthOpen()) { authPanelEl.classList.remove('is-swapping'); return; }
      applyOtpPanelView();
      void authPanelEl.offsetWidth; // pastikan isi baru ter-render (opacity 0) sebelum fade-in
      authPanelEl.classList.remove('is-swapping');
      focusFirstOtpBox();
    }, 180);
  }

  // Hanya bagian LOGIKA (langsung). Pemulihan tampilan (tab/Google/pemisah
  // muncul lagi, form OTP disembunyikan) ditunda sampai animasi tutup selesai
  // — lihat finalizeAuthClose() — supaya isi modal tidak berubah saat memudar.
  function hideOtpPanel() {
    stopResendCountdown();
    otpPendingUser = null;
  }

  function requestOtp(user, successMessage) {
    if (successMessage) otpSuccessMessage = successMessage;
    return user.getIdToken().then(function (idToken) {
      return fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken })
      }).then(function (resp) { return resp.json(); });
    }).then(function (data) {
      if (!data.ok) {
        if (data.error === 'resend_cooldown') {
          otpPendingUser = user;
          showOtpPanel(maskEmailClient(user.email));
          startResendCountdown(data.secondsLeft);
          return;
        }
        return Promise.reject(data);
      }
      otpPendingUser = user;
      showOtpPanel(data.maskedEmail);
      startResendCountdown(data.resendCooldownSeconds || 60);
    });
  }

  function submitOtpCode(code) {
    if (!otpPendingUser) return Promise.reject({ message: 'Sesi verifikasi tidak ditemukan. Silakan masuk ulang.' });
    return otpPendingUser.getIdToken().then(function (idToken) {
      return fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: idToken, code: code })
      }).then(function (resp) { return resp.json(); });
    });
  }

  otpBoxes.forEach(function (box, idx) {
    box.addEventListener('input', function () {
      box.value = box.value.replace(/\D/g, '').slice(0, 1);
      if (box.value && otpBoxes[idx + 1]) otpBoxes[idx + 1].focus();
    });
    box.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !box.value && otpBoxes[idx - 1]) {
        otpBoxes[idx - 1].focus();
      }
    });
    box.addEventListener('paste', function (e) {
      var text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!text) return;
      e.preventDefault();
      for (var i = 0; i < otpBoxes.length; i++) { otpBoxes[i].value = text[i] || ''; }
      var lastIdx = Math.min(text.length, otpBoxes.length) - 1;
      if (otpBoxes[lastIdx]) otpBoxes[lastIdx].focus();
    });
  });

  if (otpForm) {
    otpForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (otpAnimating || otpVerifyBtn.classList.contains('is-loading')) return;
      var code = otpBoxes.map(function (b) { return b.value; }).join('');
      if (!/^\d{6}$/.test(code)) {
        setFormError(otpError, 'Masukkan 6 digit kode.');
        return;
      }
      setFormError(otpError, '');
      setButtonLoading(otpVerifyBtn, true);
      primeOtpSfx();
      submitOtpCode(code)
        .then(function (data) {
          if (!data.ok) {
            setFormError(otpError, data.message || 'Kode salah.');
            otpBoxes.forEach(function (b) { b.value = ''; });
            if (otpBoxes[0]) otpBoxes[0].focus();
            return;
          }
          var verifiedUser = otpPendingUser;
          otpVerificationState = { uid: verifiedUser.uid, verified: true };
          if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); // tutup keyboard mobile
          playOtpGlass(code, function () {
            if (!authModal || !authModal.classList.contains('is-open')) return; // ditutup manual saat animasi
            hideOtpPanel();
            showToast(otpSuccessMessage || 'Berhasil masuk.', 'success');
            resolvePendingAfterAuth(verifiedUser);
            closeAuthModal();
          });
        })
        .catch(function () {
          setFormError(otpError, 'Terjadi kesalahan. Coba lagi.');
        })
        .finally(function () {
          setButtonLoading(otpVerifyBtn, false);
        });
    });
  }

  if (otpResendBtn) {
    otpResendBtn.addEventListener('click', function () {
      if (otpResendBtn.disabled || !otpPendingUser) return;
      requestOtp(otpPendingUser).catch(function (err) {
        showToast((err && err.message) || 'Gagal mengirim ulang kode.', 'error');
      });
    });
  }

  /* ---- Tempel kode OTP dari clipboard (benar-benar membaca clipboard perangkat) ---- */
  var otpPasteBtn = document.getElementById('otpPasteBtn');
  var otpPasteLabel = document.getElementById('otpPasteLabel');
  var otpPasteLabelTimer = null;

  function flashPasteLabel(text) {
    if (!otpPasteLabel) return;
    otpPasteLabel.textContent = text;
    if (otpPasteLabelTimer) window.clearTimeout(otpPasteLabelTimer);
    otpPasteLabelTimer = window.setTimeout(function () { otpPasteLabel.textContent = 'Tempel kode dari clipboard'; }, 1800);
  }
  // Ambil kode 6 digit dari teks clipboard: utamakan angka 6 digit yang berdiri sendiri
  // (mis. "Kode Anda: 123456"), lalu cadangan: semua angka jika tepat 6 digit.
  function extractOtpFromText(text) {
    var t = String(text || '');
    var m = t.match(/(^|\D)(\d{6})(?!\d)/);
    if (m) return m[2];
    var digits = t.replace(/\D/g, '');
    return digits.length === 6 ? digits : '';
  }
  function fillOtpBoxes(code) {
    otpBoxes.forEach(function (b, i) {
      b.value = code[i] || '';
      b.classList.remove('is-pasted'); void b.offsetWidth; b.classList.add('is-pasted');
    });
    if (otpVerifyBtn) otpVerifyBtn.focus();
  }
  if (otpPasteBtn) {
    otpPasteBtn.addEventListener('click', function () {
      setFormError(otpError, '');
      var manualHint = 'Tidak bisa membaca clipboard. Izinkan akses clipboard, atau tempel manual di kotak kode.';
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        setFormError(otpError, manualHint);
        if (otpBoxes[0]) otpBoxes[0].focus();
        return;
      }
      otpPasteBtn.disabled = true;
      navigator.clipboard.readText().then(function (text) {
        var code = extractOtpFromText(text);
        if (!code) {
          setFormError(otpError, 'Clipboard tidak berisi kode 6 digit. Salin kode dari email dulu.');
          return;
        }
        fillOtpBoxes(code);
        flashPasteLabel('Kode tertempel');
      }).catch(function () {
        setFormError(otpError, manualHint);
        if (otpBoxes[0]) otpBoxes[0].focus();
      }).then(function () {
        otpPasteBtn.disabled = false;
      });
    });
  }

  /* ---- Tampilkan / sembunyikan password (ikon mata) ---- */
  var passToggles = Array.prototype.slice.call(document.querySelectorAll('[data-pass-toggle]'));
  function setPassVisible(btn, visible) {
    var input = btn.parentNode && btn.parentNode.querySelector('input');
    if (!input) return;
    input.type = visible ? 'text' : 'password';
    btn.classList.toggle('is-visible', visible);
    btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
    btn.setAttribute('aria-label', visible ? 'Sembunyikan password' : 'Tampilkan password');
  }
  passToggles.forEach(function (btn) {
    // cegah tombol mencuri fokus dari input (keyboard mobile tetap terbuka)
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
    btn.addEventListener('click', function () {
      var input = btn.parentNode.querySelector('input');
      if (!input) return;
      var start = input.selectionStart, end = input.selectionEnd;
      setPassVisible(btn, input.type === 'password');
      input.focus();
      try { input.setSelectionRange(start, end); } catch (err) { /* abaikan */ }
    });
  });
  function hideAllPasswords() { passToggles.forEach(function (b) { setPassVisible(b, false); }); }

  // Set by window.KopiAuth.requireAuth() when checkout is what triggered
  // the auth screen. Resolved (and cleared) once login/register succeeds;
  // cleared without firing if the user closes the screen manually.
  var pendingAfterAuth = null;

  function setFormError(el, message) {
    if (!el) return;
    if (!message) { el.hidden = true; el.textContent = ''; return; }
    el.textContent = message;
    el.hidden = false;
    if (!prefersReducedMotion) {
      el.classList.remove('is-shaking');
      void el.offsetWidth; // restart animation reliably on repeated errors
      el.classList.add('is-shaking');
    }
  }

  // Satu-satunya tempat modal "menyala": dipakai openAuthModal & showOtpPanel.
  function activateAuthShell() {
    authModal.classList.add('is-open', 'is-entering');
    authModal.setAttribute('aria-hidden', 'false');
    if (window.__kopiScrollLock) window.__kopiScrollLock.lock();
    playActiveAuthVideo();
    window.clearTimeout(authEnterTimer);
    authEnterTimer = window.setTimeout(function () {
      authEnterTimer = null;
      authModal.classList.remove('is-entering'); // entrance selesai: hover/klik kembali normal
    }, 900);
  }

  // Pembersihan VISUAL setelah modal benar-benar tak terlihat (animasi tutup
  // selesai). Kalau modal dibuka lagi sebelum timer-nya jalan, openAuthModal /
  // showOtpPanel memanggil ini lebih dulu supaya state selalu bersih.
  function finalizeAuthClose() {
    if (authFinalizeTimer) { window.clearTimeout(authFinalizeTimer); authFinalizeTimer = null; }
    if (!authCleanupPending) return;
    authCleanupPending = false;
    if (isAuthOpen()) return;
    setFormError(loginError, '');
    setFormError(registerError, '');
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
    resetOtpGlass();
    hideAllPasswords();
    // pulihkan bagian yang disembunyikan panel OTP
    if (authTabsEl) authTabsEl.hidden = false;
    if (googleAuthBtn) googleAuthBtn.hidden = false;
    if (authDividerEl) authDividerEl.hidden = false;
    if (otpForm) otpForm.hidden = true;
    if (authPanelEl) authPanelEl.classList.remove('is-swapping');
    cancelAuthTabSwitch();
  }

  function openAuthModal(tab, options) {
    if (!authModal) return;
    closeAccountDropdown();
    var wasOpen = isAuthOpen();
    if (!wasOpen) finalizeAuthClose();
    switchAuthTab(tab || 'login');
    if (authContextNote) authContextNote.hidden = !(options && options.fromCheckout);
    if (wasOpen) return; // sudah terbuka, cukup ganti tab/context di atas
    activateAuthShell();
  }
  function closeAuthModal() {
    if (!isAuthOpen()) return;
    authModal.classList.remove('is-open', 'is-entering');
    authModal.setAttribute('aria-hidden', 'true');
    window.clearTimeout(authEnterTimer);
    authEnterTimer = null;
    if (window.__kopiScrollLock) window.__kopiScrollLock.unlock();
    stopAllAuthVideos();
    cancelAuthTabSwitch();
    if (authPanelSwapTimer) { window.clearTimeout(authPanelSwapTimer); authPanelSwapTimer = null; }
    cancelOtpGlass();
    hideOtpPanel(); // menutup manual saat OTP = batal verifikasi, bukan menandai berhasil
    pendingAfterAuth = null; // menutup manual = batal, bukan "lanjutkan ke checkout"
    authCleanupPending = true;
    authFinalizeTimer = window.setTimeout(finalizeAuthClose, authCssMs('--auth-close', 280) + 60);
  }

  /* =======================================================
     5b. CHECKOUT AUTH GATE — public bridge for script.js
     script.js (cart/checkout) is a separate, non-module script and
     never touches Firebase directly. This is the only surface it
     needs: check auth state, or require it and get called back
     once the user is actually signed in, without losing cart state.
  ======================================================= */
  function resolvePendingAfterAuth(user) {
    if (!pendingAfterAuth) return;
    var callback = pendingAfterAuth;
    pendingAfterAuth = null;
    // Beri waktu transisi auth-screen menutup dulu sebelum drawer checkout
    // tampil, supaya tidak terasa "meloncat".
    window.setTimeout(function () { callback(user); }, 200);
  }
  window.KopiAuth = {
    // "authenticated" berarti sudah lolos verifikasi OTP Gmail — untuk
    // SEMUA provider (Email/Password, Register, Google), bukan sekadar
    // punya sesi Firebase Auth (lihat bagian 18 pada instruksi asal:
    // Firebase Auth != OTP verified).
    isAuthenticated: function () {
      var user = auth.currentUser;
      if (!user) return false;
      return otpVerificationState.uid === user.uid && otpVerificationState.verified;
    },
    getCurrentUser: function () { return auth.currentUser; },
    requireAuth: function (onAuthenticated) {
      var user = auth.currentUser;
      if (!user) {
        pendingAfterAuth = onAuthenticated;
        openAuthModal('login', { fromCheckout: true });
        return;
      }
      if (otpVerificationState.uid === user.uid && otpVerificationState.verified) {
        onAuthenticated(user);
        return;
      }
      // Sudah login Firebase tapi belum (atau belum diketahui) terverifikasi
      // OTP — minta OTP baru dan lanjutkan callback checkout setelah kode benar.
      pendingAfterAuth = onAuthenticated;
      requestOtp(user).catch(function (err) {
        showToast((err && err.message) || 'Gagal mengirim kode verifikasi.', 'error');
      });
    }
  };

  /* Ganti tab Masuk <-> Daftar. Urutannya SATU-SATU (tidak pernah tumpang
     tindih): form lama fade-out -> ditukar saat tak terlihat -> form baru
     fade-in. Kelas .auth-form--out/--in ada di style.css. Klik beruntun
     dibatalkan dengan token supaya timer lama tidak menimpa yang baru. */
  var authSwitchToken = 0;
  var authSwitchTimer = null;
  var authSwitchPendingTab = null;

  function cancelAuthTabSwitch() {
    authSwitchToken++;
    if (authSwitchTimer) { window.clearTimeout(authSwitchTimer); authSwitchTimer = null; }
    authSwitchPendingTab = null;
    if (authModalTitle) authModalTitle.classList.remove('is-fading');
    [loginForm, registerForm].forEach(function (f) {
      if (f) f.classList.remove('auth-form--out', 'auth-form--in');
    });
  }

  function switchAuthTab(tab) {
    var isRegister = tab === 'register';
    var targetForm = isRegister ? registerForm : loginForm;
    var otherForm = isRegister ? loginForm : registerForm;
    if (!targetForm) return;
    if (authSwitchPendingTab === tab) return; // pergantian ke tab ini sudah berjalan

    cancelAuthTabSwitch();

    var tabs = authModal ? authModal.querySelectorAll('[data-auth-tab]') : [];
    tabs.forEach(function (btn) {
      var active = btn.getAttribute('data-auth-tab') === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    if (authModal) authModal.classList.toggle('is-register', isRegister);
    setFormError(loginError, '');
    setFormError(registerError, '');

    var title = isRegister ? 'Buat Akun Baru' : 'Masuk ke Akun Anda';
    var needsSwap = targetForm.hidden === true && !!otherForm && otherForm.hidden === false;

    // Modal tertutup / sedang dibuka (entrance sendiri), reduced-motion, atau
    // form tujuan sudah tampil: tampilkan langsung tanpa crossfade.
    if (prefersReducedMotion || !isAuthOpen() || !needsSwap) {
      if (authModalTitle) authModalTitle.textContent = title;
      if (otherForm) otherForm.hidden = true;
      targetForm.hidden = false;
      return;
    }

    authSwitchPendingTab = tab;
    var token = authSwitchToken;
    authModal.classList.remove('is-entering'); // cegah entrance ter-restart saat form baru ditampilkan
    otherForm.classList.add('auth-form--out');
    if (authModalTitle) authModalTitle.classList.add('is-fading');
    authSwitchTimer = window.setTimeout(function () {
      authSwitchTimer = null;
      if (token !== authSwitchToken) return;
      authSwitchPendingTab = null;
      otherForm.classList.remove('auth-form--out');
      otherForm.hidden = true;
      if (authModalTitle) {
        authModalTitle.textContent = title;
        authModalTitle.classList.remove('is-fading');
      }
      targetForm.classList.add('auth-form--in'); // from-state (tanpa transition)
      targetForm.hidden = false;
      void targetForm.offsetWidth;               // commit from-state sebelum dianimasikan
      targetForm.classList.remove('auth-form--in');
    }, 180);
  }

  if (openAuthModalBtn) openAuthModalBtn.addEventListener('click', function () { openAuthModal('login'); });
  document.querySelectorAll('[data-auth-close]').forEach(function (el) {
    el.addEventListener('click', closeAuthModal);
  });
  if (authModal) {
    authModal.querySelectorAll('[data-auth-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { switchAuthTab(btn.getAttribute('data-auth-tab')); });
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeAuthModal();
    closeAccountDropdown();
  });

  /* =======================================================
     6. GOOGLE LOGIN
  ======================================================= */
  if (googleAuthBtn) {
    googleAuthBtn.addEventListener('click', function () {
      if (googleAuthBtn.classList.contains('is-loading')) return;
      setButtonLoading(googleAuthBtn, true);
      var provider = new GoogleAuthProvider();
      signInWithPopup(auth, provider)
        .then(function (result) {
          // Akun/login lewat Firebase Auth sudah sah sampai titik ini.
          // Kalau penulisan profile ke Firestore gagal (mis. rules belum
          // di-publish), itu TIDAK BOLEH membuat login terlihat gagal —
          // ditangkap terpisah di bawah, tidak ikut menjatuhkan promise ini.
          return ensureUserDocument(result.user, 'google')
            .catch(function (docErr) {
              console.error('Login Google berhasil, tapi gagal menyimpan profile Firestore:', docErr);
            })
            .then(function () { return result.user; });
        })
        .then(function (user) {
          // Firebase Auth berhasil, TAPI login belum dianggap selesai:
          // hanya @gmail.com yang didukung, dan bahkan itu masih harus
          // lolos verifikasi kode OTP sebelum dianggap sah di level aplikasi.
          if (!GMAIL_DOMAIN_RE.test(user.email || '')) {
            return signOut(auth).then(function () {
              return Promise.reject({ message: 'Hanya akun Gmail (@gmail.com) yang didukung untuk login Google.' });
            });
          }
          // requestOtp() membuka panel OTP di modal yang sama — toast
          // sukses & penutupan modal ditunda sampai kode benar-benar
          // diverifikasi (lihat submit handler otpForm).
          return requestOtp(user, 'Berhasil masuk dengan Google.');
        })
        .catch(function (err) {
          showToast((err && err.message) || friendlyError(err), 'error');
        })
        .finally(function () {
          setButtonLoading(googleAuthBtn, false);
        });
    });
  }

  /* =======================================================
     7. EMAIL/PASSWORD LOGIN
  ======================================================= */
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (loginSubmitBtn.classList.contains('is-loading')) return;
      setFormError(loginError, '');
      var email = document.getElementById('loginEmail').value.trim();
      var password = document.getElementById('loginPassword').value;

      if (!GMAIL_DOMAIN_RE.test(email)) {
        setFormError(loginError, 'Hanya email Gmail (@gmail.com) yang didukung.');
        return;
      }

      setButtonLoading(loginSubmitBtn, true);
      signInWithEmailAndPassword(auth, email, password)
        .then(function (result) {
          // Firebase Auth berhasil, TAPI login belum dianggap selesai —
          // sama seperti Google: harus lolos verifikasi kode OTP dulu
          // (lihat window.KopiAuth.isAuthenticated).
          return requestOtp(result.user, 'Berhasil masuk.');
        })
        .catch(function (err) {
          setFormError(loginError, (err && err.message) || friendlyError(err));
        })
        .finally(function () {
          setButtonLoading(loginSubmitBtn, false);
        });
    });
  }

  /* =======================================================
     8. EMAIL/PASSWORD REGISTER
  ======================================================= */
  if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (registerSubmitBtn.classList.contains('is-loading')) return;
      setFormError(registerError, '');
      var name = document.getElementById('registerName').value.trim();
      var email = document.getElementById('registerEmail').value.trim();
      var password = document.getElementById('registerPassword').value;
      var confirmPassword = document.getElementById('registerConfirmPassword').value;

      if (password !== confirmPassword) {
        setFormError(registerError, 'Konfirmasi password tidak cocok.');
        return;
      }
      if (!GMAIL_DOMAIN_RE.test(email)) {
        setFormError(registerError, 'Hanya email Gmail (@gmail.com) yang didukung.');
        return;
      }

      setButtonLoading(registerSubmitBtn, true);
      var createdUser = null;
      createUserWithEmailAndPassword(auth, email, password)
        .then(function (result) {
          createdUser = result.user;
          return name ? updateProfile(createdUser, { displayName: name }) : Promise.resolve();
        })
        .then(function () {
          // Sama seperti Google login: akun sudah pasti berhasil dibuat di
          // titik ini. Kegagalan Firestore (rules/permission) ditangkap
          // terpisah supaya tidak membuat registrasi terlihat gagal.
          return ensureUserDocument(
            { uid: createdUser.uid, displayName: name || createdUser.displayName, email: createdUser.email, photoURL: createdUser.photoURL },
            'password'
          ).catch(function (docErr) {
            console.error('Akun berhasil dibuat, tapi gagal menyimpan profile Firestore:', docErr);
          });
        })
        .then(function () {
          // Akun sudah dibuat, TAPI belum dianggap login penuh — harus
          // lolos verifikasi kode OTP dulu, sama seperti login/Google.
          showToast('Akun berhasil dibuat. Silakan verifikasi kode OTP.', 'success');
          return requestOtp(createdUser, 'Akun berhasil dibuat dan diverifikasi. Selamat datang!');
        })
        .catch(function (err) {
          setFormError(registerError, (err && err.message) || friendlyError(err));
        })
        .finally(function () {
          setButtonLoading(registerSubmitBtn, false);
        });
    });
  }

  /* =======================================================
     9. LOGOUT
  ======================================================= */
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      if (logoutBtn.classList.contains('is-loading')) return;
      setButtonLoading(logoutBtn, true);
      pendingAfterAuth = null;
      signOut(auth)
        .then(function () {
          showToast('Anda telah keluar.', 'info');
          closeAccountDropdown();
        })
        .catch(function (err) {
          showToast(friendlyError(err), 'error');
        })
        .finally(function () {
          setButtonLoading(logoutBtn, false);
        });
    });
  }

  /* =======================================================
     10. REACTIVE AUTH STATE
     Fires on load (session restore), and on every login/logout.
  ======================================================= */
  function refreshOtpVerificationState(user) {
    if (!user) {
      otpVerificationState = { uid: null, verified: false };
      return;
    }
    if (!GMAIL_DOMAIN_RE.test(user.email || '')) {
      // Sesi lama (dari sebelum fitur Gmail-only OTP ini ada) dengan email
      // bukan @gmail.com — tidak didukung alur ini, jadi keluarkan otomatis.
      signOut(auth).then(function () {
        showToast('Hanya akun Gmail (@gmail.com) yang didukung. Silakan masuk ulang.', 'error');
      });
      return;
    }
    // Berlaku untuk SEMUA provider (Email/Password, Register, Google) —
    // server-side verified session (api/check-verified.js) adalah satu-
    // satunya source of truth, bukan sekadar Firebase currentUser.
    user.getIdToken().then(function (idToken) {
      return fetch('/api/check-verified', { headers: { Authorization: 'Bearer ' + idToken } });
    }).then(function (resp) { return resp.json(); })
      .then(function (data) {
        otpVerificationState = { uid: user.uid, verified: !!(data && data.verified) };
      })
      .catch(function () {
        otpVerificationState = { uid: user.uid, verified: false };
      });
  }

  onAuthStateChanged(auth, function (user) {
    renderAuthUI(user);
    refreshOtpVerificationState(user);
  });

})();
