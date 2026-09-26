/* =========================================================
   KOPI NUSANTARA — js/auth.js
   -----------------------------------------------------------
   Firebase Authentication (Google + Email/Password) and the
   Firestore `users/{uid}` profile document.

   NOT implemented in this stage on purpose: OTP / email
   verification. That is a separate, later stage.

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
     5c. GMAIL OTP VERIFICATION (after Google Sign-In)
     Reuses this same auth-screen: once a Google sign-in
     resolves to a valid @gmail.com address, the modal swaps
     from the Google/login/register panel into this OTP panel
     instead of closing. Firebase Auth alone is NOT treated as
     "signed in" for Google accounts — see window.KopiAuth below.
  ======================================================= */
  var otpForm = document.getElementById('otpForm');
  var otpMaskedEmailEl = document.getElementById('otpMaskedEmail');
  var otpError = document.getElementById('otpError');
  var otpVerifyBtn = document.getElementById('otpVerifyBtn');
  var otpResendBtn = document.getElementById('otpResendBtn');
  var otpBoxes = otpForm ? Array.prototype.slice.call(otpForm.querySelectorAll('.otp-box')) : [];

  var otpPendingUser = null;
  var resendTimerId = null;
  var googleVerificationState = { uid: null, verified: false };

  function isGoogleProviderUser(user) {
    return !!(user && user.providerData && user.providerData.some(function (p) {
      return p.providerId === 'google.com';
    }));
  }

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

  function showOtpPanel(maskedEmail) {
    if (!authModal || !otpForm) return;
    if (authModalTitle) authModalTitle.textContent = 'Verifikasi Email';
    if (authContextNote) authContextNote.hidden = true;
    if (authTabsEl) authTabsEl.hidden = true;
    if (googleAuthBtn) googleAuthBtn.hidden = true;
    if (authDividerEl) authDividerEl.hidden = true;
    if (loginForm) loginForm.hidden = true;
    if (registerForm) registerForm.hidden = true;
    if (otpMaskedEmailEl) otpMaskedEmailEl.textContent = maskedEmail || '';
    setFormError(otpError, '');
    otpBoxes.forEach(function (b) { b.value = ''; });
    otpForm.hidden = false;
    if (!authModal.classList.contains('is-open')) {
      authModal.classList.add('is-open');
      authModal.setAttribute('aria-hidden', 'false');
      if (window.__kopiScrollLock) window.__kopiScrollLock.lock();
    }
    if (otpBoxes[0]) otpBoxes[0].focus();
  }

  function hideOtpPanel() {
    if (authTabsEl) authTabsEl.hidden = false;
    if (googleAuthBtn) googleAuthBtn.hidden = false;
    if (authDividerEl) authDividerEl.hidden = false;
    if (otpForm) otpForm.hidden = true;
    stopResendCountdown();
    otpPendingUser = null;
  }

  function requestOtp(user) {
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
      if (otpVerifyBtn.classList.contains('is-loading')) return;
      var code = otpBoxes.map(function (b) { return b.value; }).join('');
      if (!/^\d{6}$/.test(code)) {
        setFormError(otpError, 'Masukkan 6 digit kode.');
        return;
      }
      setFormError(otpError, '');
      setButtonLoading(otpVerifyBtn, true);
      submitOtpCode(code)
        .then(function (data) {
          if (!data.ok) {
            setFormError(otpError, data.message || 'Kode salah.');
            otpBoxes.forEach(function (b) { b.value = ''; });
            if (otpBoxes[0]) otpBoxes[0].focus();
            return;
          }
          var verifiedUser = otpPendingUser;
          googleVerificationState = { uid: verifiedUser.uid, verified: true };
          hideOtpPanel();
          showToast('Berhasil masuk dengan Google.', 'success');
          resolvePendingAfterAuth(verifiedUser);
          closeAuthModal();
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

  function openAuthModal(tab, options) {
    if (!authModal) return;
    closeAccountDropdown();
    switchAuthTab(tab || 'login');
    if (authContextNote) authContextNote.hidden = !(options && options.fromCheckout);
    if (authModal.classList.contains('is-open')) return; // sudah terbuka, cukup ganti tab/context di atas
    authModal.classList.add('is-open');
    authModal.setAttribute('aria-hidden', 'false');
    if (window.__kopiScrollLock) window.__kopiScrollLock.lock();
  }
  function closeAuthModal() {
    if (!authModal || !authModal.classList.contains('is-open')) return;
    authModal.classList.remove('is-open');
    authModal.setAttribute('aria-hidden', 'true');
    if (window.__kopiScrollLock) window.__kopiScrollLock.unlock();
    setFormError(loginError, '');
    setFormError(registerError, '');
    if (loginForm) loginForm.reset();
    if (registerForm) registerForm.reset();
    hideOtpPanel(); // menutup manual saat OTP = batal verifikasi, bukan menandai berhasil
    pendingAfterAuth = null; // menutup manual = batal, bukan "lanjutkan ke checkout"
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
    // Untuk akun Google, "authenticated" berarti sudah lolos verifikasi
    // OTP Gmail — bukan sekadar punya sesi Firebase Auth (lihat bagian 18
    // pada instruksi asal: Firebase Auth != OTP verified).
    isAuthenticated: function () {
      var user = auth.currentUser;
      if (!user) return false;
      if (isGoogleProviderUser(user)) {
        return googleVerificationState.uid === user.uid && googleVerificationState.verified;
      }
      return true;
    },
    getCurrentUser: function () { return auth.currentUser; },
    requireAuth: function (onAuthenticated) {
      var user = auth.currentUser;
      if (!user) {
        pendingAfterAuth = onAuthenticated;
        openAuthModal('login', { fromCheckout: true });
        return;
      }
      if (isGoogleProviderUser(user)) {
        if (googleVerificationState.uid === user.uid && googleVerificationState.verified) {
          onAuthenticated(user);
          return;
        }
        // Sudah login Google tapi belum (atau belum diketahui) terverifikasi —
        // minta OTP baru dan lanjutkan callback checkout setelah kode benar.
        pendingAfterAuth = onAuthenticated;
        requestOtp(user).catch(function (err) {
          showToast((err && err.message) || 'Gagal mengirim kode verifikasi.', 'error');
        });
        return;
      }
      onAuthenticated(user);
    }
  };

  function switchAuthTab(tab) {
    var tabs = authModal ? authModal.querySelectorAll('[data-auth-tab]') : [];
    tabs.forEach(function (btn) {
      var active = btn.getAttribute('data-auth-tab') === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    if (authModalTitle) authModalTitle.textContent = tab === 'register' ? 'Buat Akun Baru' : 'Masuk ke Akun Anda';
    setFormError(loginError, '');
    setFormError(registerError, '');

    var targetForm = tab === 'register' ? registerForm : loginForm;
    var otherForm = tab === 'register' ? loginForm : registerForm;
    if (!targetForm) return;

    // Only cross-fade when this is an actual tab change (target was hidden
    // and is about to become visible). openAuthModal() calls this on every
    // open — including re-opening on the tab that's already active — and
    // that case should just show the form instantly, not replay the swap
    // animation on top of the panel's own entrance stagger.
    var isRealSwitch = targetForm.hidden === true;
    if (!isRealSwitch) {
      if (otherForm) otherForm.hidden = true;
      targetForm.hidden = false;
      return;
    }

    if (otherForm && !otherForm.hidden) {
      if (prefersReducedMotion) {
        otherForm.hidden = true;
      } else {
        otherForm.classList.add('auth-form--out');
        window.setTimeout(function () {
          otherForm.hidden = true;
          otherForm.classList.remove('auth-form--out');
        }, 260);
      }
    }

    targetForm.hidden = false;
    if (!prefersReducedMotion) {
      targetForm.classList.add('auth-form--in');
      // Double rAF: let the browser paint the "in" starting position first,
      // then remove the class on the next frame so the transition actually
      // has a from-state to animate away from (a single rAF is sometimes
      // batched into the same frame as the class add and gets skipped).
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          targetForm.classList.remove('auth-form--in');
        });
      });
    }
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
          return requestOtp(user);
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

      setButtonLoading(loginSubmitBtn, true);
      signInWithEmailAndPassword(auth, email, password)
        .then(function (result) {
          showToast('Berhasil masuk.', 'success');
          resolvePendingAfterAuth(result.user);
          closeAuthModal();
        })
        .catch(function (err) {
          setFormError(loginError, friendlyError(err));
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
          showToast('Akun berhasil dibuat. Selamat datang!', 'success');
          resolvePendingAfterAuth(createdUser);
          closeAuthModal();
        })
        .catch(function (err) {
          setFormError(registerError, friendlyError(err));
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
  function refreshGoogleVerificationState(user) {
    if (!user || !isGoogleProviderUser(user)) {
      googleVerificationState = { uid: null, verified: false };
      return;
    }
    if (!GMAIL_DOMAIN_RE.test(user.email || '')) {
      // Sesi Google lama (dari sebelum fitur ini ada) dengan email bukan
      // @gmail.com — tidak didukung alur ini, jadi keluarkan otomatis.
      signOut(auth).then(function () {
        showToast('Hanya akun Gmail (@gmail.com) yang didukung. Silakan masuk ulang.', 'error');
      });
      return;
    }
    user.getIdToken().then(function (idToken) {
      return fetch('/api/check-verified', { headers: { Authorization: 'Bearer ' + idToken } });
    }).then(function (resp) { return resp.json(); })
      .then(function (data) {
        googleVerificationState = { uid: user.uid, verified: !!(data && data.verified) };
      })
      .catch(function () {
        googleVerificationState = { uid: user.uid, verified: false };
      });
  }

  onAuthStateChanged(auth, function (user) {
    renderAuthUI(user);
    refreshGoogleVerificationState(user);
  });

})();
