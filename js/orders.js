/* =========================================================
   KOPI NUSANTARA — js/orders.js
   -----------------------------------------------------------
   Riwayat Pesanan.

   - Pesanan dicatat oleh script.js (checkout) lewat
     window.KopiOrders.create(...).
   - Penyimpanan UTAMA: localStorage per akun
     ("kopiNusantara.orders.v1:<uid>") — tiap akun hanya membaca
     kunci miliknya sendiri, jadi riwayat antar akun tidak tercampur.
   - Sinkronisasi cloud (opsional): Firestore users/{uid}/orders/{id}
     memakai instance db dari js/firebase-init.js. Ini "best effort":
     bila Firestore menolak (mis. Security Rules belum mengizinkan),
     pesanan tetap aman di perangkat dan panel menyatakan dengan
     jujur bahwa sinkronisasi akun belum berhasil.
   - Modul ini TIDAK mengubah sistem login. Ia hanya mendengarkan
     onAuthStateChanged dan menyiarkan event 'kopi:authchange'
     agar script.js bisa memisahkan keranjang per akun.
========================================================= */
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

(function () {
  'use strict';

  var ORDERS_PREFIX = 'kopiNusantara.orders.v1:';
  var currentUid = null;
  var cloudState = { uid: null, loading: false, ok: false };

  /* =======================================================
     1. HELPERS
  ======================================================= */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(n) {
    n = Number(n);
    return isFinite(n) ? n : 0;
  }
  function formatRupiah(n) {
    return 'Rp ' + Math.round(num(n)).toLocaleString('id-ID');
  }
  function formatDate(ms) {
    try {
      return new Date(ms).toLocaleString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (err) {
      return '';
    }
  }
  function storageKey(uid) { return ORDERS_PREFIX + uid; }

  var STATUS_LABELS = {
    awaiting_confirmation: 'Menunggu konfirmasi',
    awaiting_payment_verification: 'Menunggu verifikasi pembayaran',
    processing: 'Diproses',
    shipped: 'Dikirim',
    completed: 'Selesai',
    paid: 'Lunas',
    cancelled: 'Dibatalkan'
  };
  var STATUS_NOTES = {
    awaiting_confirmation: 'Pesanan dicatat saat Anda menekan tombol WhatsApp. Pastikan pesan terkirim ke owner — tim kami akan mengonfirmasi pesanan dan pembayaran melalui WhatsApp.',
    awaiting_payment_verification: 'Bukti transaksi QRIS Anda belum diverifikasi. Pembayaran baru dianggap lunas setelah dikonfirmasi oleh owner.'
  };
  var PAYMENT_LABELS = { whatsapp: 'WhatsApp', qris: 'QRIS' };

  function statusClass(status) {
    if (status === 'awaiting_confirmation' || status === 'awaiting_payment_verification') return 'order-badge--pending';
    if (status === 'cancelled') return 'order-badge--muted';
    return 'order-badge--ok';
  }

  /* =======================================================
     2. DATA — sanitasi + localStorage
  ======================================================= */
  function sanitizeItem(it) {
    if (!it || typeof it !== 'object') return null;
    var qty = parseInt(it.qty, 10);
    if (!(qty > 0)) return null;
    return {
      productId: String(it.productId || ''),
      name: String(it.name || ''),
      image: String(it.image || ''),
      weight: num(it.weight),
      qty: qty,
      unitPrice: num(it.unitPrice),
      lineTotal: num(it.lineTotal)
    };
  }

  function sanitizeOrder(raw, uid) {
    if (!raw || typeof raw !== 'object' || !raw.id) return null;
    var createdAt = raw.createdAt;
    if (createdAt && typeof createdAt.toMillis === 'function') createdAt = createdAt.toMillis();
    var items = Array.isArray(raw.items) ? raw.items.map(sanitizeItem).filter(Boolean) : [];
    var customer = raw.customer && typeof raw.customer === 'object' ? raw.customer : {};
    return {
      id: String(raw.id),
      uid: uid,
      createdAt: num(createdAt),
      items: items,
      subtotal: num(raw.subtotal),
      paymentMethod: String(raw.paymentMethod || ''),
      status: String(raw.status || ''),
      customer: { name: String(customer.name || ''), email: String(customer.email || '') },
      synced: !!raw.synced
    };
  }

  function readLocal(uid) {
    try {
      var raw = window.localStorage.getItem(storageKey(uid));
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      var list = parsed && Array.isArray(parsed.orders) ? parsed.orders : [];
      return list.map(function (o) { return sanitizeOrder(o, uid); }).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  function writeLocal(uid, orders) {
    try {
      window.localStorage.setItem(storageKey(uid), JSON.stringify({ v: 1, orders: orders }));
      return true;
    } catch (err) {
      console.error('Gagal menyimpan riwayat pesanan:', err);
      return false;
    }
  }

  function sortedOrders(uid) {
    return readLocal(uid).sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function emitChange() {
    window.dispatchEvent(new CustomEvent('kopi:orderschange'));
  }

  /* =======================================================
     3. FIRESTORE SYNC (best effort)
  ======================================================= */
  function markSynced(uid, id) {
    var list = readLocal(uid);
    var changed = false;
    list.forEach(function (o) { if (o.id === id && !o.synced) { o.synced = true; changed = true; } });
    if (changed) { writeLocal(uid, list); emitChange(); }
  }

  function pushToCloud(order) {
    var data = {
      id: order.id,
      uid: order.uid,
      createdAt: order.createdAt,
      items: order.items,
      subtotal: order.subtotal,
      paymentMethod: order.paymentMethod,
      status: order.status,
      customer: order.customer
    };
    // ID dokumen = nomor pesanan, jadi setDoc ulang tidak pernah menggandakan.
    return setDoc(doc(db, 'users', order.uid, 'orders', order.id), data)
      .then(function () { markSynced(order.uid, order.id); return true; })
      .catch(function (err) {
        console.warn('Sinkronisasi pesanan ke Firestore belum berhasil:', (err && err.code) || err);
        return false;
      });
  }

  function refreshFromCloud(uid) {
    cloudState = { uid: uid, loading: true, ok: false };
    emitChange();
    return getDocs(collection(db, 'users', uid, 'orders')).then(function (snap) {
      if (currentUid !== uid) return;
      var remote = {};
      snap.forEach(function (d) {
        var raw = d.data();
        raw.id = d.id;
        var o = sanitizeOrder(raw, uid);
        if (o) { o.synced = true; remote[o.id] = o; }
      });
      var local = readLocal(uid);
      var merged = Object.keys(remote).map(function (id) { return remote[id]; });
      var toPush = [];
      local.forEach(function (l) {
        if (remote[l.id]) return;
        merged.push(l);
        if (!l.synced) toPush.push(l);
      });
      writeLocal(uid, merged);
      cloudState = { uid: uid, loading: false, ok: true };
      emitChange();
      return Promise.all(toPush.map(pushToCloud)).then(function (results) {
        if (currentUid !== uid) return;
        if (results.some(function (r) { return !r; })) {
          cloudState = { uid: uid, loading: false, ok: false };
          emitChange();
        }
      });
    }).catch(function (err) {
      if (currentUid !== uid) return;
      console.warn('Gagal memuat riwayat pesanan dari Firestore:', (err && err.code) || err);
      cloudState = { uid: uid, loading: false, ok: false };
      emitChange();
    });
  }

  /* =======================================================
     4. PUBLIC API — dipakai script.js
  ======================================================= */
  function create(payload) {
    try {
      var user = auth.currentUser;
      if (!user || !payload || payload.uid !== user.uid) return { ok: false, reason: 'auth' };
      var order = sanitizeOrder(payload, user.uid);
      if (!order || !order.items.length) return { ok: false, reason: 'invalid' };

      var list = readLocal(user.uid);
      var existing = list.filter(function (o) { return o.id === order.id; })[0];
      if (existing) return { ok: true, order: existing, duplicate: true }; // idempoten: tidak pernah dobel

      order.createdAt = Date.now();
      order.synced = false;
      list.push(order);
      if (!writeLocal(user.uid, list)) return { ok: false, reason: 'storage' };

      emitChange();
      pushToCloud(order); // latar belakang; kegagalan tidak membatalkan pesanan
      return { ok: true, order: order };
    } catch (err) {
      console.error('Gagal membuat pesanan:', err);
      return { ok: false, reason: 'error' };
    }
  }

  window.KopiOrders = {
    create: create,
    list: function () { return currentUid ? sortedOrders(currentUid) : []; },
    getUid: function () { return currentUid; },
    open: function () { openPanel(); }
  };

  /* =======================================================
     5. RIWAYAT PESANAN — panel (memakai gaya cart-drawer yang ada)
  ======================================================= */
  var drawer = document.getElementById('ordersDrawer');
  var body = document.getElementById('ordersBody');
  var openBtn = document.getElementById('ordersHistoryBtn');
  var accountDropdown = document.getElementById('accountDropdown');
  var accountBtn = document.getElementById('accountBtn');
  var view = { mode: 'list', id: null };
  var panelOpen = false;
  var scrollLocked = false;

  function itemHtml(it) {
    var imgOk = /^assets\/images\/[\w.\-]+$/.test(it.image);
    return (
      '<div class="cart-item">' +
        '<div class="cart-item__img">' + (imgOk ? '<img src="' + esc(it.image) + '" alt="' + esc(it.name) + '">' : '') + '</div>' +
        '<div class="cart-item__body">' +
          '<h4>' + esc(it.name) + '</h4>' +
          '<p class="cart-item__meta">' + esc(it.weight) + 'gr &times; ' + esc(it.qty) + ' &middot; ' + formatRupiah(it.unitPrice) + ' / item</p>' +
          '<div class="cart-item__row"><span></span><span class="cart-item__price">' + formatRupiah(it.lineTotal) + '</span></div>' +
        '</div>' +
      '</div>'
    );
  }

  function badgeHtml(status) {
    return '<span class="order-badge ' + statusClass(status) + '">' + esc(STATUS_LABELS[status] || 'Status belum diketahui') + '</span>';
  }

  function syncNoteHtml(orders) {
    if (!orders.length) return '';
    var allSynced = orders.every(function (o) { return o.synced; });
    var text;
    if (cloudState.uid === currentUid && cloudState.loading) {
      text = 'Menyinkronkan riwayat dengan akun Anda…';
    } else if (cloudState.uid === currentUid && cloudState.ok && allSynced) {
      text = 'Riwayat tersinkron dengan akun Anda.';
    } else {
      text = 'Riwayat tersimpan di perangkat ini. Sinkronisasi ke akun belum berhasil.';
    }
    return '<p class="cart-drawer__note orders-sync">' + esc(text) + '</p>';
  }

  function listHtml(orders) {
    return orders.map(function (o) {
      var first = o.items[0];
      var more = o.items.length - 1;
      var summary = first ? esc(first.name) + ' (' + esc(first.weight) + 'gr) &times;' + esc(first.qty) : '';
      if (more > 0) summary += ' &middot; +' + more + ' produk lainnya';
      return (
        '<button type="button" class="order-card" data-order-open="' + esc(o.id) + '">' +
          '<div class="order-card__top"><span class="order-card__id">' + esc(o.id) + '</span>' + badgeHtml(o.status) + '</div>' +
          '<p class="order-card__date">' + esc(formatDate(o.createdAt)) + '</p>' +
          '<p class="order-card__items">' + summary + '</p>' +
          '<div class="order-card__total"><span>Total</span><strong>' + formatRupiah(o.subtotal) + '</strong></div>' +
        '</button>'
      );
    }).join('');
  }

  function detailHtml(o) {
    var note = STATUS_NOTES[o.status];
    return (
      '<button type="button" class="checkout-view__back" data-orders-back>&larr; Semua pesanan</button>' +
      '<div class="order-detail__head">' +
        '<p class="order-card__id">' + esc(o.id) + '</p>' +
        badgeHtml(o.status) +
      '</div>' +
      '<div class="checkout-view__account">' +
        '<p class="checkout-view__account-label">Waktu pemesanan</p>' +
        '<p class="checkout-view__account-name">' + esc(formatDate(o.createdAt)) + '</p>' +
        '<p class="checkout-view__account-label order-detail__label">Metode pembayaran</p>' +
        '<p class="checkout-view__account-name">' + esc(PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod || '-') + '</p>' +
      '</div>' +
      '<div class="checkout-view__items">' + o.items.map(itemHtml).join('') + '</div>' +
      '<div class="checkout-view__subtotal"><span>Total</span><strong>' + formatRupiah(o.subtotal) + '</strong></div>' +
      (note ? '<p class="cart-drawer__note">' + esc(note) + '</p>' : '')
    );
  }

  function render() {
    if (!body) return;
    if (!currentUid) {
      body.innerHTML = '<p class="cart-drawer__empty">Masuk untuk melihat riwayat pesanan Anda.</p>';
      return;
    }
    var orders = sortedOrders(currentUid);
    if (view.mode === 'detail') {
      var found = orders.filter(function (o) { return o.id === view.id; })[0];
      if (found) {
        body.innerHTML = detailHtml(found) + syncNoteHtml([found]);
        return;
      }
      view = { mode: 'list', id: null };
    }
    if (!orders.length) {
      body.innerHTML =
        '<p class="cart-drawer__empty">Belum ada pesanan.</p>' +
        '<p class="cart-drawer__note">Pesanan Anda akan muncul di sini setelah Anda checkout.</p>';
      return;
    }
    body.innerHTML = listHtml(orders) + syncNoteHtml(orders);
  }

  function closeAccountDropdown() {
    if (accountDropdown) {
      accountDropdown.classList.remove('is-open');
      accountDropdown.setAttribute('aria-hidden', 'true');
    }
    if (accountBtn) accountBtn.setAttribute('aria-expanded', 'false');
  }

  function openPanel() {
    if (!drawer || panelOpen) return;
    closeAccountDropdown();
    view = { mode: 'list', id: null };
    render();
    if (body) body.scrollTop = 0;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    panelOpen = true;
    if (window.__kopiScrollLock) { window.__kopiScrollLock.lock(); scrollLocked = true; }
  }

  function closePanel() {
    if (!drawer || !panelOpen) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    panelOpen = false;
    if (scrollLocked && window.__kopiScrollLock) { window.__kopiScrollLock.unlock(); }
    scrollLocked = false;
  }

  if (openBtn) openBtn.addEventListener('click', openPanel);

  if (drawer) {
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('[data-orders-close]')) { closePanel(); return; }
      var openCard = e.target.closest('[data-order-open]');
      if (openCard) {
        view = { mode: 'detail', id: openCard.getAttribute('data-order-open') };
        render();
        if (body) body.scrollTop = 0;
        return;
      }
      if (e.target.closest('[data-orders-back]')) {
        view = { mode: 'list', id: null };
        render();
        if (body) body.scrollTop = 0;
      }
    });
    // Gambar yang gagal dimuat disembunyikan (sama seperti keranjang).
    drawer.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.target.style.display = 'none';
    }, true);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePanel();
  });

  window.addEventListener('kopi:orderschange', function () { if (panelOpen) render(); });
  // Tab lain mencatat / menyinkronkan pesanan untuk akun yang sama.
  window.addEventListener('storage', function (e) {
    if (currentUid && e.key === storageKey(currentUid) && panelOpen) render();
  });

  /* =======================================================
     6. STATUS LOGIN -> broadcast + muat riwayat
  ======================================================= */
  onAuthStateChanged(auth, function (user) {
    currentUid = user ? user.uid : null;
    // script.js memakai event ini untuk memisahkan keranjang per akun.
    window.dispatchEvent(new CustomEvent('kopi:authchange', { detail: { uid: currentUid } }));
    if (currentUid) {
      refreshFromCloud(currentUid);
    } else {
      cloudState = { uid: null, loading: false, ok: false };
      closePanel();
      render();
    }
  });
})();
