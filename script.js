/* =========================================================
   KOPI NUSANTARA — script.js
   Vanilla JS only. No framework, no backend.
========================================================= */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =======================================================
     -1. SHARED BODY SCROLL LOCK (ref-counted)
     - Several overlays (loader, mobile menu, product modal, cart
       drawer, and the auth screen in js/auth.js) each want to lock
       page scroll while open. Previously each one independently
       set/cleared document.body.style.overflow, so closing one
       overlay while another was still open would silently unlock
       scroll under it. A shared counter fixes that; exposed on
       window so js/auth.js (a separate module) can use it too.
  ======================================================= */
  var scrollLockCount = 0;
  var lockedScrollY = 0;
  function lockBodyScroll() {
    if (scrollLockCount === 0) {
      // position:fixed on <body> (not just overflow:hidden) is what actually
      // stops scroll/rubber-banding on iOS Safari once an overlay is open —
      // overflow:hidden alone still lets the background track scroll there.
      // Scroll position is saved and restored below so the page never jumps
      // once the overlay closes. <html> is locked too as a second layer —
      // some mobile browsers keep the root element scrollable even once
      // <body> is taken out of flow.
      lockedScrollY = window.scrollY || window.pageYOffset || 0;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = (-lockedScrollY) + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
    }
    scrollLockCount += 1;
  }
  function unlockBodyScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      document.documentElement.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      // html { scroll-behavior: smooth } akan menganimasikan scrollTo ini dari
      // atas halaman (body baru saja dilepas dari position:fixed) — terlihat
      // sebagai halaman "meloncat" di balik overlay yang sedang menutup.
      // Pulihkan posisi seketika.
      var rootEl = document.documentElement;
      var prevBehavior = rootEl.style.scrollBehavior;
      rootEl.style.scrollBehavior = 'auto';
      window.scrollTo(0, lockedScrollY);
      rootEl.style.scrollBehavior = prevBehavior;
    }
  }
  window.__kopiScrollLock = { lock: lockBodyScroll, unlock: unlockBodyScroll };

  /* =======================================================
     0. LOADING SCREEN
     - Simulated progress so the bar always moves smoothly,
       independent of real network timing.
     - Hides on window 'load'.
     - Hard failsafe timeout: if load never fires (blocked
       asset, slow CDN, etc.) the loader is forced away after
       4s so the site is never stuck behind it.
  ======================================================= */
  (function initLoader() {
    var loader = document.getElementById('loader');
    if (!loader) return;
    var fill = document.getElementById('loaderBarFill');
    var pct = document.getElementById('loaderPct');
    var navbarEl = document.getElementById('navbar');
    lockBodyScroll();
    if (navbarEl && !prefersReducedMotion) navbarEl.classList.add('is-entering');

    var progress = 0;
    var hidden = false;
    var fakeTimer = null;
    var MIN_SHOW = 2800; // minimum time the loader stays visible (ms)
    var startTime = Date.now();

    function setProgress(p) {
      progress = Math.min(p, 100);
      if (fill) fill.style.width = progress + '%';
      if (pct) pct.textContent = Math.round(progress) + '%';
    }

    // Desktop only: the 3D logo scene leans toward the pointer.
    var canTilt = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches && !prefersReducedMotion;
    function onTilt(e) {
      var x = e.clientX / window.innerWidth - 0.5;
      var y = e.clientY / window.innerHeight - 0.5;
      loader.style.setProperty('--ry', (x * 26).toFixed(2) + 'deg');
      loader.style.setProperty('--rx', (-y * 18).toFixed(2) + 'deg');
    }
    if (canTilt) window.addEventListener('mousemove', onTilt, { passive: true });

    function finishLoader() {
      if (canTilt) {
        window.removeEventListener('mousemove', onTilt);
        loader.style.setProperty('--ry', '0deg');
        loader.style.setProperty('--rx', '0deg');
      }
      if (fakeTimer) window.clearInterval(fakeTimer);
      setProgress(100);
      loader.classList.add('is-complete');
      window.setTimeout(function () {
        loader.classList.add('is-done');
        unlockBodyScroll();
        if (navbarEl) {
          navbarEl.classList.remove('is-entering');
          navbarEl.classList.add('is-entered');
        }
      }, 450);
    }

    function hideLoader() {
      if (hidden) return;
      hidden = true;
      // (progress keeps animating until finishLoader runs)
      // Even if the page is ready instantly, keep the loader up for MIN_SHOW.
      window.setTimeout(finishLoader, Math.max(0, MIN_SHOW - (Date.now() - startTime)));
    }

    // Time-based progress: eases toward ~90% over MIN_SHOW, then creeps slowly
    // (never reaching 100% until the page is actually ready).
    fakeTimer = window.setInterval(function () {
      var t = Math.min((Date.now() - startTime) / MIN_SHOW, 1);
      if (t < 1) {
        setProgress(Math.max(progress, 90 * (1 - Math.pow(1 - t, 2))));
      } else {
        setProgress(progress + (97 - progress) * 0.03);
      }
    }, 60);

    window.addEventListener('load', hideLoader);
    window.setTimeout(hideLoader, 4000); // failsafe: never stuck
  })();

  /* =======================================================
     1. NAVBAR — solid on scroll
  ======================================================= */
  var navbar = document.getElementById('navbar');
  var scrollProgress = document.getElementById('scrollProgress');
  function updateNavbar() {
    if (window.scrollY > 40) {
      navbar.classList.add('is-scrolled');
    } else {
      navbar.classList.remove('is-scrolled');
    }
    if (scrollProgress) {
      var docHeight = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
      scrollProgress.style.width = pct + '%';
    }
  }
  updateNavbar();
  window.addEventListener('scroll', updateNavbar, { passive: true });

  /* =======================================================
     1b. HERO SLIDESHOW
     - deterministic order (about.jpg, hero-02, hero-03, hero-04)
     - autoplay + loop, crossfade via CSS opacity transition
     - skips any slide whose image fails to load (no random fallback)
     - pauses when tab is hidden to avoid wasted work
     - dot indicators: klik untuk lompat slide, pause saat interaksi
     - swipe gesture untuk mobile
  ======================================================= */
  function initHeroSlideshow() {
    var media = document.getElementById('heroMedia');
    var frame = document.querySelector('.hero__frame');
    var dotsWrap = document.getElementById('heroDots');
    if (!media) return;
    var slides = Array.prototype.slice.call(media.querySelectorAll('[data-hero-slide]'));
    if (slides.length < 2) return;

    var SLIDE_INTERVAL = 3800; // fast, modern pacing per slide — no zoom, clean crossfade only
    var current = slides.findIndex(function (img) { return img.classList.contains('is-active'); });
    if (current < 0) current = 0;
    var timer = null;
    var dots = [];

    if (dotsWrap) {
      dotsWrap.innerHTML = slides.map(function (_, i) {
        return '<button type="button" role="tab" aria-label="Slide ' + (i + 1) + '"' + (i === current ? ' class="is-active" aria-selected="true"' : ' aria-selected="false"') + ' data-hero-dot="' + i + '"></button>';
      }).join('');
      dots = Array.prototype.slice.call(dotsWrap.querySelectorAll('[data-hero-dot]'));
    }

    function syncDots() {
      dots.forEach(function (dot, i) {
        var active = i === current;
        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-selected', String(active));
      });
    }

    slides.forEach(function (img) {
      img.addEventListener('error', function () {
        img.setAttribute('data-hero-broken', 'true');
        img.classList.remove('is-active');
      });
    });

    function nextAvailableIndex(fromIndex) {
      var i = fromIndex;
      var guard = 0;
      do {
        i = (i + 1) % slides.length;
        guard++;
      } while (slides[i].getAttribute('data-hero-broken') === 'true' && guard <= slides.length);
      return i;
    }

    function goToNext() {
      var target = nextAvailableIndex(current);
      if (target === current) return; // only one usable slide left
      slides[current].classList.remove('is-active');
      current = target;
      slides[current].classList.add('is-active');
      syncDots();
    }

    function goTo(index) {
      if (index === current || slides[index].getAttribute('data-hero-broken') === 'true') return;
      slides[current].classList.remove('is-active');
      current = index;
      slides[current].classList.add('is-active');
      syncDots();
    }

    function start() {
      stop();
      if (prefersReducedMotion) return;
      timer = window.setInterval(goToNext, SLIDE_INTERVAL);
    }
    function stop() {
      if (timer) { window.clearInterval(timer); timer = null; }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else start();
    });

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goTo(i);
        start(); // restart autoplay timer after manual interaction
      });
    });

    // Swipe gesture (mobile)
    if (frame) {
      var touchStartX = 0;
      frame.addEventListener('touchstart', function (e) {
        touchStartX = e.touches[0].clientX;
        stop();
      }, { passive: true });
      frame.addEventListener('touchend', function (e) {
        var dx = e.changedTouches[0].clientX - touchStartX;
        if (dx > 40) goTo((current - 1 + slides.length) % slides.length);
        else if (dx < -40) goTo((current + 1) % slides.length);
        start();
      }, { passive: true });

      // Pause on hover/focus interaction (desktop)
      frame.addEventListener('mouseenter', stop);
      frame.addEventListener('mouseleave', start);
    }

    start();
  }
  initHeroSlideshow();

  /* =======================================================
     2. MOBILE MENU
  ======================================================= */
  var hamburger = document.getElementById('hamburger');
  var mobileMenu = document.getElementById('mobileMenu');
  var mobileMenuClose = document.getElementById('mobileMenuClose');
  var mobileMenuBackdrop = document.getElementById('mobileMenuBackdrop');

  function openMobileMenu() {
    if (mobileMenu.classList.contains('is-open')) return;
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    hamburger.setAttribute('aria-expanded', 'true');
    if (mobileMenuBackdrop) {
      mobileMenuBackdrop.classList.add('is-open');
      mobileMenuBackdrop.setAttribute('aria-hidden', 'false');
    }
    lockBodyScroll();
  }
  function closeMobileMenu() {
    if (!mobileMenu.classList.contains('is-open')) return;
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    if (mobileMenuBackdrop) {
      mobileMenuBackdrop.classList.remove('is-open');
      mobileMenuBackdrop.setAttribute('aria-hidden', 'true');
    }
    unlockBodyScroll();
  }
  hamburger.addEventListener('click', function () {
    var isOpen = mobileMenu.classList.contains('is-open');
    isOpen ? closeMobileMenu() : openMobileMenu();
  });
  if (mobileMenuClose) {
    mobileMenuClose.addEventListener('click', closeMobileMenu);
  }
  if (mobileMenuBackdrop) {
    mobileMenuBackdrop.addEventListener('click', closeMobileMenu);
  }
  document.querySelectorAll('[data-mobile-link]').forEach(function (link) {
    link.addEventListener('click', closeMobileMenu);
  });

  /* =======================================================
     3. ACTIVE NAV LINK ON SCROLL
  ======================================================= */
  var navLinks = document.querySelectorAll('[data-mobile-link], [data-desktop-link]');
  var sections = [];
  navLinks.forEach(function (link) {
    var id = link.getAttribute('href');
    var section = id && id.startsWith('#') ? document.querySelector(id) : null;
    if (section) sections.push({ link: link, section: section });
  });

  function updateActiveNav() {
    var scrollPos = window.scrollY + window.innerHeight * 0.35;
    var current = sections[0];
    sections.forEach(function (item) {
      if (item.section.offsetTop <= scrollPos) current = item;
    });
    navLinks.forEach(function (l) { l.classList.remove('is-active'); });
    if (current) current.link.classList.add('is-active');
  }
  if (sections.length) {
    updateActiveNav();
    window.addEventListener('scroll', updateActiveNav, { passive: true });
  }

  /* =======================================================
     4. HERO HEADLINE — TYPEWRITER, then staggered entrance
     - Progressive enhancement: markup already has the full
       headline text (no-JS / prefers-reduced-motion fallback
       uses the CSS slide-up reveal defined in style.css).
     - Line 1 types in, short pause, line 2 types in, caret
       fades out once (no infinite blink), then subtitle/CTA
       stagger in right after — matching the CSS timing they
       already use for their fade-up transition.
  ======================================================= */
  (function initHeroTypewriter() {
    var headline = document.querySelector('.hero__headline');
    var lines = headline ? Array.prototype.slice.call(headline.querySelectorAll('[data-hero-line]')) : [];
    var heroDesc = document.querySelector('.hero__desc');
    var heroCta = document.querySelector('.hero__cta');

    function revealRest() {
      if (heroDesc) heroDesc.classList.add('is-visible');
      if (heroCta) heroCta.classList.add('is-visible');
    }

    if (!headline || lines.length < 1 || prefersReducedMotion) {
      revealRest();
      return;
    }

    headline.classList.add('is-typewriter');
    var texts = lines.map(function (el) { return el.textContent; });
    lines.forEach(function (el) { el.textContent = ''; });

    var caret = document.createElement('span');
    caret.className = 'hero__caret';
    caret.setAttribute('aria-hidden', 'true');

    var CHAR_DELAY = 42;   // ms per character — cepat namun tetap terbaca sebagai "ditulis"
    var LINE_PAUSE = 260;  // jeda terkontrol antar baris
    var START_DELAY = 280; // ruang napas setelah hero muncul

    function typeChar(lineIndex, charIndex) {
      var el = lines[lineIndex];
      var text = texts[lineIndex];
      if (charIndex === 0) el.appendChild(caret);
      el.insertBefore(document.createTextNode(text.charAt(charIndex)), caret);
      if (charIndex < text.length - 1) {
        window.setTimeout(function () { typeChar(lineIndex, charIndex + 1); }, CHAR_DELAY);
      } else if (lineIndex < lines.length - 1) {
        window.setTimeout(function () { typeChar(lineIndex + 1, 0); }, LINE_PAUSE);
      } else {
        window.setTimeout(function () {
          caret.classList.add('is-done');
          window.setTimeout(function () {
            if (caret.parentNode) caret.parentNode.removeChild(caret);
          }, 420);
          revealRest();
        }, 380);
      }
    }

    window.setTimeout(function () { typeChar(0, 0); }, START_DELAY);
  })();

  /* =======================================================
     5. SCROLL REVEAL (IntersectionObserver)
  ======================================================= */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* =======================================================
     5b. STAT COUNT-UP (about__stats numbers)
  ======================================================= */
  var countEls = document.querySelectorAll('[data-count-to]');
  function animateCount(el) {
    var target = parseInt(el.getAttribute('data-count-to'), 10) || 0;
    var suffix = el.getAttribute('data-suffix') || '';
    if (prefersReducedMotion) {
      el.textContent = target + suffix;
      return;
    }
    var duration = 1400;
    var startTime = null;
    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * target) + suffix;
      if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }
  if (countEls.length) {
    if ('IntersectionObserver' in window) {
      var countObserver = new IntersectionObserver(function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.4 });
      countEls.forEach(function (el) { countObserver.observe(el); });
    } else {
      countEls.forEach(function (el) { animateCount(el); });
    }
  }

  /* =======================================================
     6. SMOOTH SCROLL for in-page anchors
  ======================================================= */
  document.querySelectorAll('a[data-nav]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var href = link.getAttribute('href');
      if (!href || href.charAt(0) !== '#' || href.length < 2) return;
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      var offset = 84;
      var top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  });

  /* =======================================================
     7. DRAG-TO-SCROLL CAROUSEL (works for origins + products)
     Native scroll-snap handles swipe on mobile; this adds
     mouse-drag support for desktop and prev/next buttons.
  ======================================================= */
  function initDragCarousel(el) {
    if (!el) return;
    var isDown = false;
    var startX = 0;
    var scrollStart = 0;
    var moved = false;

    el.addEventListener('mousedown', function (e) {
      isDown = true;
      moved = false;
      el.classList.add('is-dragging');
      startX = e.pageX;
      scrollStart = el.scrollLeft;
    });
    window.addEventListener('mouseup', function () {
      isDown = false;
      el.classList.remove('is-dragging');
    });
    window.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      e.preventDefault();
      var dx = e.pageX - startX;
      if (Math.abs(dx) > 4) moved = true;
      el.scrollLeft = scrollStart - dx;
    });
    // Prevent link/click firing right after a drag
    el.addEventListener('click', function (e) {
      if (moved) { e.preventDefault(); e.stopPropagation(); }
    }, true);
  }

  function cardStep(el) {
    var card = el.querySelector(':scope > *');
    if (!card) return 320;
    var style = window.getComputedStyle(el);
    var gap = parseFloat(style.columnGap || style.gap || 24);
    return card.getBoundingClientRect().width + gap;
  }

  function bindCarouselNav(name, el) {
    var prevBtn = document.querySelector('[data-carousel-prev="' + name + '"]');
    var nextBtn = document.querySelector('[data-carousel-next="' + name + '"]');
    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        el.scrollBy({ left: -cardStep(el), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        el.scrollBy({ left: cardStep(el), behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      });
    }
  }

  var originsCarousel = document.getElementById('originsCarousel');
  var kiosCarousel = document.getElementById('kiosCarousel');
  initDragCarousel(originsCarousel);
  initDragCarousel(kiosCarousel);
  bindCarouselNav('origins', originsCarousel);
  bindCarouselNav('kios', kiosCarousel);
  /* Product section is now a static 2-column grid (not a carousel) —
     drag-to-scroll and prev/next nav intentionally not attached here. */

  /* =======================================================
     8. PRODUK UNGGULAN — DATA-DRIVEN (UI PREVIEW, TANPA BACKEND)
     -----------------------------------------------------
     PENTING UNTUK PENGEMBANGAN SELANJUTNYA:
     Array PRODUCTS di bawah ini adalah data sementara agar UI
     tetap data-driven (bukan hardcode per kartu di HTML). Pada
     tahap berikutnya array ini akan digantikan oleh hasil fetch
     dari Firebase (dikelola lewat admin panel). "price" adalah
     harga dasar per 100 gram; harga per pilihan berat dihitung
     dari basis ini (lihat priceForWeight()).
  ======================================================= */
  var PRODUCTS = [
    { id: 'gayo-arabika', name: 'Gayo Arabika', origin: 'Aceh', type: 'Light Roast', price: 39000, image: 'assets/images/product-gayo.jpg', rating: 4.9, reviews: 128, badge: 'Terlaris', weights: [100, 250, 500, 1000], description: 'Arabika dataran tinggi Gayo dengan keasaman lembut, aroma rempah, dan aftertaste bersih khas tanah vulkanik Aceh.' },
    { id: 'toraja-sapan', name: 'Toraja Sapan', origin: 'Sulawesi', type: 'Medium Roast', price: 42500, image: 'assets/images/product-toraja.jpg', rating: 4.8, reviews: 96, badge: 'Baru', weights: [100, 250, 500, 1000], description: 'Arabika Toraja dengan karakter earthy, body seimbang, aroma rempah, dan acidity yang lembut.' },
    { id: 'kintamani-citrus', name: 'Kintamani Citrus', origin: 'Bali', type: 'Light Roast', price: 41000, image: 'assets/images/product-kintamani.jpg', rating: 4.7, reviews: 74, badge: null, weights: [100, 250, 500, 1000], description: 'Ditanam berdampingan dengan jeruk, memberi keasaman citrus yang cerah dan seduhan yang ringan.' },
    { id: 'flores-bajawa', name: 'Flores Bajawa', origin: 'Nusa Tenggara', type: 'Medium Roast', price: 40000, image: 'assets/images/product-flores.jpg', rating: 4.8, reviews: 61, badge: null, weights: [100, 250, 500, 1000], description: 'Kopi dataran tinggi Bajawa dengan body medium, rasa manis karamel, dan sentuhan floral yang khas.' },
    { id: 'java-preanger', name: 'Java Preanger', origin: 'Jawa Barat', type: 'Dark Roast', price: 38000, image: 'assets/images/product-java.jpg', rating: 4.6, reviews: 53, badge: null, weights: [100, 250, 500, 1000], description: 'Dark roast klasik Priangan Jawa Barat, body tebal, pahit seimbang, aroma cokelat panggang yang kuat.' },
    { id: 'biji-arabika', name: 'Biji Kopi Arabika', origin: 'Aceh', type: 'Light Roast', price: 37000, image: 'assets/images/product-arabika.jpg', rating: 4.7, reviews: 40, badge: null, weights: [100, 250, 500, 1000], description: 'Biji Arabika pilihan dengan profil rasa ringan, asam buah-buahan, dan finish yang bersih.' },
    { id: 'biji-robusta', name: 'Biji Kopi Robusta', origin: 'Jawa Barat', type: 'Dark Roast', price: 28000, image: 'assets/images/product-robusta.jpg', rating: 4.6, reviews: 35, badge: null, weights: [100, 250, 500, 1000], description: 'Robusta body kuat dan pahit khas, cocok untuk kopi tubruk maupun campuran espresso sehari-hari.' },
    { id: 'kopi-luwak', name: 'Biji Luwak White Coffe', origin: 'Bali', type: 'Medium Roast', price: 150000, image: 'assets/images/product-luwak.jpg', rating: 4.9, reviews: 22, badge: 'Premium', weights: [100, 250, 500, 1000], description: 'Kopi luwak premium dari Bali, proses fermentasi alami menghasilkan rasa halus dan keasaman rendah.' },
    /* --- Produk tambahan (ditambahkan saat revisi UI/UX) ---
       Gambar belum tersedia, gunakan nama file di bawah ini saat
       menambahkan foto asli — kartu otomatis menampilkan placeholder
       "Foto segera hadir" sampai file gambarnya ada di assets/images/. */
    { id: 'takengon-robusta', name: 'Takengon Robusta', origin: 'Aceh', type: 'Dark Roast', price: 30000, image: 'assets/images/product-takengon.jpg', rating: 4.7, reviews: 18, badge: 'Baru', weights: [100, 250, 500, 1000], description: 'Robusta dataran tinggi Takengon, body tebal, pahit tegas, cocok untuk kopi susu maupun tubruk kental.' },
    { id: 'kalosi-enrekang', name: 'Kalosi Enrekang', origin: 'Sulawesi', type: 'Medium Roast', price: 43500, image: 'assets/images/product-kalosi.jpg', rating: 4.8, reviews: 15, badge: null, weights: [100, 250, 500, 1000], description: 'Arabika Kalosi dengan body medium, rasa rempah hangat, dan keasaman yang seimbang.' },
    { id: 'mamasa-arabika', name: 'Mamasa Arabika', origin: 'Sulawesi', type: 'Light Roast', price: 42000, image: 'assets/images/product-mamasa.jpg', rating: 4.7, reviews: 11, badge: null, weights: [100, 250, 500, 1000], description: 'Arabika dataran tinggi Mamasa, ringan dengan aroma bunga dan keasaman yang cerah.' },
    { id: 'pupuan-robusta', name: 'Pupuan Robusta', origin: 'Bali', type: 'Medium Roast', price: 32000, image: 'assets/images/product-pupuan.jpg', rating: 4.6, reviews: 12, badge: null, weights: [100, 250, 500, 1000], description: 'Robusta Pupuan dari perkebunan Bali, body sedang dengan rasa cokelat pahit yang lembut.' },
    { id: 'manggarai-arabika', name: 'Manggarai Arabika', origin: 'Nusa Tenggara', type: 'Light Roast', price: 41500, image: 'assets/images/product-manggarai.jpg', rating: 4.8, reviews: 9, badge: 'Baru', weights: [100, 250, 500, 1000], description: 'Arabika Manggarai dengan karakter ringan, asam jeruk yang cerah, dan aftertaste manis.' },
    { id: 'malabar-honey', name: 'Malabar Honey Process', origin: 'Jawa Barat', type: 'Medium Roast', price: 45000, image: 'assets/images/product-malabar.jpg', rating: 4.9, reviews: 14, badge: 'Premium', weights: [100, 250, 500, 1000], description: 'Proses honey dari Malabar, manis alami menyerupai madu dengan body medium dan acidity lembut.' },
    /* --- Produk tambahan (revisi search + katalog) --- */
    { id: 'sidikalang-arabika', name: 'Kopi Sidikalang', origin: 'Sumatera Utara', type: 'Medium Roast', price: 39500, image: 'assets/images/product-sidikalang.jpg', rating: 4.7, reviews: 8, badge: 'Baru', weights: [100, 250, 500, 1000], description: 'Kopi dataran tinggi Sidikalang, Sumatera Utara — body tebal, earthy, dengan keasaman rendah yang khas kopi Sumatera.' },
    { id: 'bajawa-flores', name: 'Kopi Bajawa', origin: 'Nusa Tenggara', type: 'Light Roast', price: 40500, image: 'assets/images/product-bajawa.jpg', rating: 4.7, reviews: 7, badge: 'Baru', weights: [100, 250, 500, 1000], description: 'Kopi dari dataran tinggi Bajawa, Flores NTT — ringan, aroma floral, dengan rasa manis alami yang lembut.' }
  ];

  var activeFilter = 'all';
  var searchQuery = ''; // diisi oleh search overlay, dicocokkan ke NAMA produk (lihat matchesQuery)
  var selectedWeight = {}; // { productId: weightInGram } — pilihan berat per kartu

  function starIcon() {
    return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.3 6.9.7-5.2 4.8 1.5 6.8L12 17.6 5.9 21.1l1.5-6.8-5.2-4.8 6.9-.7z"/></svg>';
  }

  function formatRupiah(n) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  function priceForWeight(product, weight) {
    return product.price * (weight / 100);
  }

  function getProductById(id) {
    for (var i = 0; i < PRODUCTS.length; i++) {
      if (PRODUCTS[i].id === id) return PRODUCTS[i];
    }
    return null;
  }

  var hasRenderedProductsOnce = false;
  function renderProducts() {
    var wrap = document.querySelector('[data-product-list]');
    if (!wrap) return;
    var list = PRODUCTS.filter(function (p) {
      var matchesFilter = activeFilter === 'all' || p.origin === activeFilter;
      var matchesSearch = !searchQuery || matchesQuery(p, searchQuery);
      return matchesFilter && matchesSearch;
    });

    if (!list.length) {
      var emptyMsg = searchQuery ? 'Produk tidak ditemukan.' : 'Belum ada produk untuk daerah ini.';
      wrap.innerHTML = '<p style="grid-column:1/-1;margin:0;padding:40px 4px;text-align:center;color:var(--c-coffee-2);">' + emptyMsg + '</p>';
      hasRenderedProductsOnce = true;
      return;
    }

    var html = list.map(function (p) {
      var weight = selectedWeight[p.id] || p.weights[0];
      var weightChips = p.weights.map(function (w) {
        return '<button type="button" class="weight-chip' + (w === weight ? ' is-active' : '') + '" data-weight-btn data-product-id="' + p.id + '" data-weight="' + w + '">' + w + 'gr</button>';
      }).join('');

      return (
        '<article class="product-card" data-product-id="' + p.id + '">' +
          '<div class="product-card__visual" data-open-product="' + p.id + '">' +
            (p.badge ? '<span class="product-card__badge">' + p.badge + '</span>' : '') +
            '<img src="' + p.image + '" alt="Biji kopi ' + p.name + ' dari ' + p.origin + '" loading="lazy" onerror="this.remove(); this.parentElement.classList.add(\'product-card__visual--empty\')">' +
          '</div>' +
          '<div class="product-card__body">' +
            '<p class="product-card__origin">' + p.origin + '</p>' +
            '<h3 data-open-product="' + p.id + '">' + p.name + '</h3>' +
            '<p class="product-card__type">' + p.type + '</p>' +
            '<p class="product-card__rating">' + starIcon() + ' ' + p.rating.toFixed(1) + ' &middot; ' + p.reviews + ' ulasan</p>' +
            '<div class="product-card__weights">' + weightChips + '</div>' +
            '<div class="product-card__footer">' +
              '<span class="product-card__price">' + formatRupiah(priceForWeight(p, weight)) + '<span>/ ' + weight + 'gr</span></span>' +
              '<button class="product-card__add" type="button" aria-label="Tambah ' + p.name + ' ke keranjang" data-add-cart data-product-id="' + p.id + '">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
        '</article>'
      );
    }).join('');
    wrap.innerHTML = html;

    // Filter/search transition: skip the very first paint (that entrance is
    // owned by motion.js's scroll-triggered reveal) and only animate the
    // grid in for actual filter/search changes afterwards.
    if (hasRenderedProductsOnce) {
      document.dispatchEvent(new CustomEvent('kopi:products-rendered', { detail: { wrap: wrap } }));
    }
    hasRenderedProductsOnce = true;
  }
  renderProducts();

  /* =======================================================
     8b. PRODUCT FILTER (frontend-only, by daerah asal)
  ======================================================= */
  var filterWrap = document.querySelector('[data-product-filter]');
  if (filterWrap) {
    filterWrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      activeFilter = btn.getAttribute('data-filter');
      filterWrap.querySelectorAll('.filter-chip').forEach(function (chip) {
        var isActive = chip === btn;
        chip.classList.toggle('is-active', isActive);
        chip.setAttribute('aria-selected', String(isActive));
      });
      if (!prefersReducedMotion) {
        btn.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(.92)' }, { transform: 'scale(1)' }],
          { duration: 240, easing: 'ease-out' }
        );
      }
      renderProducts();
    });
  }

  /* =======================================================
     8c. WEIGHT SELECTION on product card (delegated)
  ======================================================= */
  document.addEventListener('click', function (e) {
    var wBtn = e.target.closest('[data-weight-btn]');
    if (!wBtn) return;
    var pid = wBtn.getAttribute('data-product-id');
    selectedWeight[pid] = parseInt(wBtn.getAttribute('data-weight'), 10);
    renderProducts();
    if (!prefersReducedMotion) {
      var priceEl = document.querySelector('.product-card[data-product-id="' + pid + '"] .product-card__price');
      if (priceEl) {
        priceEl.classList.remove('is-price-bump');
        void priceEl.offsetWidth; // restart animation reliably
        priceEl.classList.add('is-price-bump');
      }
    }
  });

  /* =======================================================
     8d. PRODUCT DETAIL MODAL
  ======================================================= */
  var productModal = document.getElementById('productModal');
  var modalImage = document.getElementById('modalImage');
  var modalOrigin = document.getElementById('modalOrigin');
  var modalName = document.getElementById('modalProductName');
  var modalType = document.getElementById('modalType');
  var modalRating = document.getElementById('modalRating');
  var modalWeights = document.getElementById('modalWeights');
  var modalDescription = document.getElementById('modalDescription');
  var modalPrice = document.getElementById('modalPrice');
  var modalAddCart = document.getElementById('modalAddCart');
  var modalActiveProductId = null;
  var modalActiveWeight = null;

  function renderModalWeights(product) {
    modalWeights.innerHTML = product.weights.map(function (w) {
      return '<button type="button" class="weight-chip' + (w === modalActiveWeight ? ' is-active' : '') + '" data-modal-weight="' + w + '">' + w + 'gr</button>';
    }).join('');
    modalPrice.textContent = formatRupiah(priceForWeight(product, modalActiveWeight));
    if (!prefersReducedMotion) {
      modalPrice.classList.remove('is-price-bump');
      void modalPrice.offsetWidth; // restart animation reliably
      modalPrice.classList.add('is-price-bump');
    }
  }

  function openProductModal(id) {
    var product = getProductById(id);
    if (!product || !productModal) return;
    modalActiveProductId = id;
    modalActiveWeight = selectedWeight[id] || product.weights[0];

    var modalMedia = productModal.querySelector('.product-modal__media');
    modalImage.style.display = '';
    if (modalMedia) modalMedia.classList.remove('product-modal__media--empty');
    modalImage.onerror = function () {
      this.style.display = 'none';
      if (modalMedia) modalMedia.classList.add('product-modal__media--empty');
    };
    modalImage.src = product.image;
    modalImage.alt = 'Biji kopi ' + product.name + ' dari ' + product.origin;
    modalOrigin.textContent = product.origin;
    modalName.textContent = product.name;
    modalType.textContent = product.type;
    modalRating.innerHTML = starIcon() + ' ' + product.rating.toFixed(1) + ' &middot; ' + product.reviews + ' ulasan';
    renderModalWeights(product);
    if (modalDescription) modalDescription.textContent = product.description || '';

    productModal.classList.add('is-open');
    productModal.setAttribute('aria-hidden', 'false');
    lockBodyScroll();
  }

  function closeProductModal() {
    if (!productModal || !productModal.classList.contains('is-open')) return;
    productModal.classList.remove('is-open');
    productModal.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open-product]');
    if (opener) { openProductModal(opener.getAttribute('data-open-product')); return; }

    if (e.target.closest('[data-modal-close]')) { closeProductModal(); return; }

    var modalWeightBtn = e.target.closest('[data-modal-weight]');
    if (modalWeightBtn) {
      modalActiveWeight = parseInt(modalWeightBtn.getAttribute('data-modal-weight'), 10);
      var product = getProductById(modalActiveProductId);
      if (product) renderModalWeights(product);
    }
  });

  if (modalAddCart) {
    modalAddCart.addEventListener('click', function () {
      if (!modalActiveProductId) return;
      addToCart(modalActiveProductId, modalActiveWeight);
      modalAddCart.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(.94)' }, { transform: 'scale(1)' }],
        { duration: 220, easing: 'ease-out' }
      );
    });
  }

  /* =======================================================
     9. CART (front-end only — no database persistence)
     -----------------------------------------------------
     CATATAN: cartState hidup hanya selama sesi halaman ini.
     Pada tahap berikutnya akan dihubungkan ke database/session
     asli. Checkout sekarang mengecek Firebase Auth (lihat
     js/auth.js / window.KopiAuth) lalu menampilkan ringkasan
     pesanan yang diteruskan ke WhatsApp — belum ada payment
     gateway, sesuai instruksi untuk tidak mengarang backend.
  ======================================================= */
  var cartState = []; // { productId, weight, qty }
  var cartBadge = document.querySelector('[data-cart-count]');
  var cartDrawer = document.getElementById('cartDrawer');
  var cartItemsWrap = document.getElementById('cartItems');
  var cartFooter = document.getElementById('cartFooter');
  var cartSubtotalEl = document.getElementById('cartSubtotal');
  var cartCheckoutBtn = document.getElementById('cartCheckoutBtn');
  var cartTriggerBtn = document.querySelector('[data-action="cart"]');
  var checkoutView = document.getElementById('checkoutView');
  var checkoutItemsWrap = document.getElementById('checkoutItems');
  var checkoutSubtotalEl = document.getElementById('checkoutSubtotal');
  var checkoutUserNameEl = document.getElementById('checkoutUserName');
  var checkoutUserEmailEl = document.getElementById('checkoutUserEmail');
  var checkoutWhatsappBtn = document.getElementById('checkoutWhatsappBtn');
  var checkoutWhatsappNote = document.getElementById('checkoutWhatsappNote');
  var checkoutBackBtn = document.getElementById('checkoutBackBtn');
  var paymentOptionWhatsapp = document.getElementById('paymentOptionWhatsapp');
  var paymentOptionQris = document.getElementById('paymentOptionQris');
  var qrisPanel = document.getElementById('qrisPanel');
  var checkoutQrisProofBtn = document.getElementById('checkoutQrisProofBtn');
  var WHATSAPP_NUMBER = '6285122108079'; // sama dengan nomor yang sudah dipakai di footer/lokasi
  var selectedPaymentMethod = 'whatsapp'; // 'whatsapp' | 'qris'

  function addToCart(productId, weight) {
    var existing = cartState.find(function (item) { return item.productId === productId && item.weight === weight; });
    if (existing) {
      existing.qty += 1;
    } else {
      cartState.push({ productId: productId, weight: weight, qty: 1 });
    }
    renderCart();
  }

  function updateCartQty(productId, weight, delta) {
    var item = cartState.find(function (i) { return i.productId === productId && i.weight === weight; });
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      cartState = cartState.filter(function (i) { return i !== item; });
    }
    renderCart();
  }

  function renderCart() {
    var totalQty = cartState.reduce(function (sum, i) { return sum + i.qty; }, 0);
    if (cartBadge) {
      cartBadge.textContent = String(totalQty);
      if (!prefersReducedMotion) {
        cartBadge.classList.remove('is-bump');
        void cartBadge.offsetWidth; // restart animation reliably on rapid add
        cartBadge.classList.add('is-bump');
        if (cartTriggerBtn) {
          cartTriggerBtn.classList.remove('is-bump');
          void cartTriggerBtn.offsetWidth;
          cartTriggerBtn.classList.add('is-bump');
        }
      }
    }

    if (!cartItemsWrap || !cartSubtotalEl) return;

    if (!cartState.length) {
      cartItemsWrap.innerHTML = '<p class="cart-drawer__empty">Keranjang Anda masih kosong.</p>';
      cartSubtotalEl.textContent = formatRupiah(0);
      return;
    }

    var subtotal = 0;
    cartItemsWrap.innerHTML = cartState.map(function (item, i) {
      var product = getProductById(item.productId);
      if (!product) return '';
      var linePrice = priceForWeight(product, item.weight) * item.qty;
      subtotal += linePrice;
      return (
        '<div class="cart-item" style="animation-delay:' + (i * 0.05) + 's">' +
          '<div class="cart-item__img"><img src="' + product.image + '" alt="' + product.name + '" onerror="this.style.display=\'none\'"></div>' +
          '<div class="cart-item__body">' +
            '<h4>' + product.name + '</h4>' +
            '<p class="cart-item__meta">' + item.weight + 'gr</p>' +
            '<div class="cart-item__row">' +
              '<div class="cart-item__qty">' +
                '<button type="button" data-cart-qty="-1" data-product-id="' + product.id + '" data-weight="' + item.weight + '" aria-label="Kurangi jumlah">&minus;</button>' +
                '<span>' + item.qty + '</span>' +
                '<button type="button" data-cart-qty="1" data-product-id="' + product.id + '" data-weight="' + item.weight + '" aria-label="Tambah jumlah">+</button>' +
              '</div>' +
              '<span class="cart-item__price">' + formatRupiah(linePrice) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    cartSubtotalEl.textContent = formatRupiah(subtotal);
  }
  renderCart();

  function openCartDrawer() {
    if (!cartDrawer || cartDrawer.classList.contains('is-open')) return;
    cartDrawer.classList.add('is-open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    lockBodyScroll();
  }
  function closeCartDrawer() {
    if (!cartDrawer || !cartDrawer.classList.contains('is-open')) return;
    cartDrawer.classList.remove('is-open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
    showCartItemsView(); // balik ke tampilan keranjang, bukan checkout, saat drawer dibuka lagi nanti
  }

  if (cartTriggerBtn) {
    cartTriggerBtn.addEventListener('click', openCartDrawer);
  }

  document.addEventListener('click', function (e) {
    var addBtn = e.target.closest('[data-add-cart]');
    if (addBtn) {
      var pid = addBtn.getAttribute('data-product-id');
      var weight = selectedWeight[pid] || (getProductById(pid) || {}).weights[0];
      addToCart(pid, weight);
      addBtn.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(.85)' }, { transform: 'scale(1)' }],
        { duration: 260, easing: 'ease-out' }
      );
      return;
    }

    if (e.target.closest('[data-cart-close]')) { closeCartDrawer(); return; }

    var qtyBtn = e.target.closest('[data-cart-qty]');
    if (qtyBtn) {
      updateCartQty(qtyBtn.getAttribute('data-product-id'), parseInt(qtyBtn.getAttribute('data-weight'), 10), parseInt(qtyBtn.getAttribute('data-cart-qty'), 10));
    }
  });

  /* =======================================================
     9b. CHECKOUT — authentication gate + order summary
     -----------------------------------------------------
     Guest boleh browse, cari, dan add to cart bebas. Login baru
     wajib pada tombol Checkout ini. window.KopiAuth (didefinisikan
     di js/auth.js) menyediakan isAuthenticated()/requireAuth() —
     requireAuth membuka auth screen bila perlu dan memanggil
     callback ini lagi begitu login/register sukses, dengan cart
     yang sama sekali tidak direset.
  ======================================================= */
  function showCartItemsView() {
    if (checkoutView) checkoutView.hidden = true;
    if (cartItemsWrap) cartItemsWrap.hidden = false;
    if (cartFooter) cartFooter.hidden = false;
  }

  function renderCheckoutSummary() {
    if (!checkoutItemsWrap || !checkoutSubtotalEl) return;

    var subtotal = 0;
    checkoutItemsWrap.innerHTML = cartState.map(function (item) {
      var product = getProductById(item.productId);
      if (!product) return '';
      var linePrice = priceForWeight(product, item.weight) * item.qty;
      subtotal += linePrice;
      return (
        '<div class="cart-item">' +
          '<div class="cart-item__img"><img src="' + product.image + '" alt="' + product.name + '" onerror="this.style.display=\'none\'"></div>' +
          '<div class="cart-item__body">' +
            '<h4>' + product.name + '</h4>' +
            '<p class="cart-item__meta">' + item.weight + 'gr &times; ' + item.qty + '</p>' +
            '<div class="cart-item__row"><span></span><span class="cart-item__price">' + formatRupiah(linePrice) + '</span></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    checkoutSubtotalEl.textContent = formatRupiah(subtotal);

    var user = window.KopiAuth ? window.KopiAuth.getCurrentUser() : null;
    var userName = (user && (user.displayName || (user.email && user.email.split('@')[0]))) || 'Pengguna';
    var userEmail = (user && user.email) || '';
    if (checkoutUserNameEl) checkoutUserNameEl.textContent = userName;
    if (checkoutUserEmailEl) checkoutUserEmailEl.textContent = userEmail;

    if (checkoutWhatsappBtn) {
      var lines = ['Halo Kopi Nusantara, saya ingin memesan:', ''];
      cartState.forEach(function (item) {
        var product = getProductById(item.productId);
        if (!product) return;
        lines.push('- ' + product.name + ' (' + item.weight + 'gr) x' + item.qty + ' = ' + formatRupiah(priceForWeight(product, item.weight) * item.qty));
      });
      lines.push('', 'Subtotal: ' + formatRupiah(subtotal), '', 'Nama: ' + userName + (userEmail ? ' (' + userEmail + ')' : ''));
      checkoutWhatsappBtn.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
    }

    if (checkoutQrisProofBtn) {
      var proofLines = ['Halo Owner, saya sudah melakukan pembayaran melalui QRIS untuk pesanan saya. Saya ingin mengirimkan bukti transaksi.', ''];
      cartState.forEach(function (item) {
        var product = getProductById(item.productId);
        if (!product) return;
        proofLines.push('- ' + product.name + ' (' + item.weight + 'gr) x' + item.qty + ' = ' + formatRupiah(priceForWeight(product, item.weight) * item.qty));
      });
      proofLines.push('', 'Subtotal: ' + formatRupiah(subtotal), '', 'Nama: ' + userName + (userEmail ? ' (' + userEmail + ')' : ''));
      checkoutQrisProofBtn.href = 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(proofLines.join('\n'));
    }
  }

  function setPaymentMethod(method) {
    selectedPaymentMethod = method;
    var isQris = method === 'qris';

    if (paymentOptionWhatsapp) {
      paymentOptionWhatsapp.classList.toggle('is-selected', !isQris);
      paymentOptionWhatsapp.setAttribute('aria-checked', String(!isQris));
    }
    if (paymentOptionQris) {
      paymentOptionQris.classList.toggle('is-selected', isQris);
      paymentOptionQris.setAttribute('aria-checked', String(isQris));
    }

    if (checkoutWhatsappBtn) checkoutWhatsappBtn.hidden = isQris;
    if (checkoutWhatsappNote) checkoutWhatsappNote.hidden = isQris;
    if (qrisPanel) qrisPanel.hidden = !isQris;
  }

  if (paymentOptionWhatsapp) {
    paymentOptionWhatsapp.addEventListener('click', function () { setPaymentMethod('whatsapp'); });
  }
  if (paymentOptionQris) {
    paymentOptionQris.addEventListener('click', function () { setPaymentMethod('qris'); });
  }

  function showCheckoutView() {
    if (!cartState.length) return;
    renderCheckoutSummary();
    setPaymentMethod('whatsapp');
    if (cartItemsWrap) cartItemsWrap.hidden = true;
    if (cartFooter) cartFooter.hidden = true;
    if (checkoutView) checkoutView.hidden = false;
    openCartDrawer();
  }

  if (cartCheckoutBtn) {
    cartCheckoutBtn.addEventListener('click', function () {
      if (!cartState.length) {
        if (window.KopiToast) window.KopiToast('Keranjang Anda masih kosong.', 'info');
        return;
      }
      if (window.KopiAuth && !window.KopiAuth.isAuthenticated()) {
        window.KopiAuth.requireAuth(showCheckoutView);
      } else {
        showCheckoutView();
      }
    });
  }

  if (checkoutBackBtn) {
    checkoutBackBtn.addEventListener('click', showCartItemsView);
  }

  /* =======================================================
     10. TESTIMONIAL — DUMMY DATA (UI PREVIEW ONLY)
     -----------------------------------------------------
     Data ulasan di bawah ini bersifat sementara untuk
     kebutuhan tampilan. Nantinya akan digantikan oleh data
     rating/ulasan asli dari pelanggan melalui database.
  ======================================================= */
  var DUMMY_TESTIMONIALS = [
    { rating: 5, quote: 'Aroma Gayo-nya benar-benar terasa berbeda dari kopi kemasan biasa. Segar seperti baru disangrai.', name: 'Raka A.', product: 'Gayo Arabika · 200gr' },
    { rating: 5, quote: 'Packaging rapi dan kopinya sampai masih harum. Toraja Sapan langganan saya sekarang.', name: 'Dinda P.', product: 'Toraja Sapan · 200gr' },
    { rating: 4, quote: 'Suka sekali dengan cerita asal di setiap kemasan, jadi tahu dari daerah mana kopi saya berasal.', name: 'Bagus S.', product: 'Kintamani Citrus · 200gr' }
  ];

  function renderTestimonials() {
    var track = document.querySelector('[data-testimonial-list]');
    var dotsWrap = document.getElementById('testimonialDots');
    if (!track || !dotsWrap) return;

    track.innerHTML = DUMMY_TESTIMONIALS.map(function (t, i) {
      var stars = '';
      for (var s = 0; s < 5; s++) {
        stars += '<span style="opacity:' + (s < t.rating ? 1 : .3) + '">' + starIcon() + '</span>';
      }
      return (
        '<div class="testimonial-slide' + (i === 0 ? ' is-active' : '') + '" data-slide="' + i + '">' +
          '<div class="testimonial-slide__stars">' + stars + '</div>' +
          '<p class="quote">&ldquo;' + t.quote + '&rdquo;</p>' +
          '<p class="testimonial-slide__name">' + t.name + '</p>' +
          '<p class="testimonial-slide__product">' + t.product + '</p>' +
        '</div>'
      );
    }).join('');

    dotsWrap.innerHTML = DUMMY_TESTIMONIALS.map(function (_, i) {
      return '<button type="button" aria-label="Ulasan ' + (i + 1) + '"' + (i === 0 ? ' class="is-active"' : '') + ' data-dot="' + i + '"></button>';
    }).join('');

    var slides = track.querySelectorAll('.testimonial-slide');
    var dots = dotsWrap.querySelectorAll('button');
    var current = 0;
    var timer = null;
    var AUTOPLAY_MS = 5500;

    function goTo(index) {
      slides[current].classList.remove('is-active');
      dots[current].classList.remove('is-active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('is-active');
      dots[current].classList.add('is-active');
    }

    function startAutoplay() {
      if (prefersReducedMotion) return;
      stopAutoplay();
      timer = setInterval(function () { goTo(current + 1); }, AUTOPLAY_MS);
    }
    function stopAutoplay() {
      if (timer) clearInterval(timer);
    }

    dots.forEach(function (dot, i) {
      dot.addEventListener('click', function () {
        goTo(i);
        startAutoplay();
      });
    });

    var wrap = document.querySelector('.testimonial__wrap');
    wrap.addEventListener('mouseenter', stopAutoplay);
    wrap.addEventListener('mouseleave', startAutoplay);

    // Basic swipe support on mobile
    var touchStartX = 0;
    track.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
      stopAutoplay();
    }, { passive: true });
    track.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (dx > 40) goTo(current - 1);
      else if (dx < -40) goTo(current + 1);
      startAutoplay();
    }, { passive: true });

    startAutoplay();
  }
  renderTestimonials();

  /* =======================================================
     11. FOOTER YEAR
  ======================================================= */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* =======================================================
     12. PLACEHOLDER LINKS — prevent dead-link navigation
  ======================================================= */
  document.querySelectorAll('[data-placeholder]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
    });
    link.setAttribute('title', 'Segera hadir');
  });

  /* =======================================================
     13. SEARCH — filters PRODUCTS by product NAME (word-prefix match)
     - Opens an overlay bar under the navbar (no page reload,
       no navigation to another page).
     - Filters the real product grid live as the user types,
       combined with the active origin filter chip.
     - Case-insensitive; matches the START of the product name or the
       start of any word in it ("g" -> Gayo, "sid" -> Kopi Sidikalang).
       Origin / roast / description are NOT searched.
     - Empty input restores the full list.
     - Shows "Produk tidak ditemukan." when there is no match.
  ======================================================= */
  var searchOverlay = document.getElementById('searchOverlay');
  var searchInput = document.getElementById('searchInput');
  var searchTriggerBtn = document.querySelector('[data-action="search"]');
  var searchResultsWrap = document.getElementById('searchResults');
  var searchHint = document.getElementById('searchHint');
  var hasScrolledToProducts = false;
  var searchMatches = [];      // current suggestion list (product objects)
  var searchActiveIndex = -1;  // keyboard-highlighted suggestion index
  var SEARCH_SUGGESTION_LIMIT = 6;
  var searchScrollLocked = false; // true only while the full-screen (mobile) overlay holds the shared scroll lock

  // Name-only, word-prefix matching. Every space-separated token of the query
  // must be the start of some word in the product name, so:
  //   "g"    -> Gayo Arabika            (NOT anything with a "g" in the middle)
  //   "sid"  -> Kopi Sidikalang         (start of the 2nd word)
  //   "baj"  -> Flores Bajawa, Kopi Bajawa
  // Origin, roast type and description are intentionally ignored.
  function matchesQuery(p, q) {
    var tokens = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    var words = String(p.name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    return tokens.every(function (t) {
      return words.some(function (w) { return w.indexOf(t) === 0; });
    });
  }

  function setSearchActive(index) {
    if (!searchResultsWrap) return;
    var items = searchResultsWrap.querySelectorAll('[data-search-result]');
    items.forEach(function (item, i) {
      var active = i === index;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
      if (active) item.scrollIntoView({ block: 'nearest' });
    });
    searchActiveIndex = index;
  }

  function renderSearchResults() {
    if (!searchResultsWrap) return;

    if (!searchQuery) {
      searchResultsWrap.hidden = true;
      searchResultsWrap.innerHTML = '';
      searchMatches = [];
      searchActiveIndex = -1;
      if (searchHint) searchHint.classList.remove('is-hidden');
      searchInput && searchInput.setAttribute('aria-expanded', 'false');
      return;
    }

    searchMatches = PRODUCTS.filter(function (p) { return matchesQuery(p, searchQuery); }).slice(0, SEARCH_SUGGESTION_LIMIT);
    if (searchHint) searchHint.classList.add('is-hidden');
    searchResultsWrap.hidden = false;
    searchInput && searchInput.setAttribute('aria-expanded', 'true');

    if (!searchMatches.length) {
      searchResultsWrap.innerHTML = '<p class="search-overlay__empty">Produk tidak ditemukan.</p>';
      searchActiveIndex = -1;
      return;
    }

    searchResultsWrap.innerHTML = searchMatches.map(function (p, i) {
      return (
        '<button type="button" class="search-result" role="option" id="searchResult-' + i + '" data-search-result data-product-id="' + p.id + '" style="animation-delay:' + (i * 0.035) + 's" aria-selected="false">' +
          '<span class="search-result__thumb"><img src="' + p.image + '" alt="" loading="lazy" onerror="this.parentElement.style.background=\'var(--c-beige)\'; this.remove();"></span>' +
          '<span class="search-result__info">' +
            '<span class="search-result__name">' + p.name + '</span>' +
            '<span class="search-result__meta">' + p.origin + ' &middot; ' + p.type + '</span>' +
          '</span>' +
        '</button>'
      );
    }).join('');
    searchActiveIndex = -1;
  }

  function selectSearchResult(id) {
    var product = getProductById(id);
    if (!product) return;

    closeSearch();

    // Make sure the target product is actually present in the grid,
    // regardless of the currently active origin filter chip.
    activeFilter = 'all';
    var filterWrap = document.querySelector('[data-product-filter]');
    if (filterWrap) {
      filterWrap.querySelectorAll('.filter-chip').forEach(function (chip) {
        var isAll = chip.getAttribute('data-filter') === 'all';
        chip.classList.toggle('is-active', isAll);
        chip.setAttribute('aria-selected', String(isAll));
      });
    }
    renderProducts();

    window.setTimeout(function () {
      var card = document.querySelector('.product-card[data-product-id="' + id + '"]');
      if (!card) return;
      var top = card.getBoundingClientRect().top + window.scrollY - 120;
      window.scrollTo({ top: top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      window.setTimeout(function () {
        card.classList.remove('is-search-target');
        void card.offsetWidth; // restart animation reliably
        card.classList.add('is-search-target');
        card.addEventListener('animationend', function handler() {
          card.classList.remove('is-search-target');
          card.removeEventListener('animationend', handler);
        });
      }, prefersReducedMotion ? 0 : 350);
    }, 60);
  }

  function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.classList.add('is-open');
    searchOverlay.setAttribute('aria-hidden', 'false');
    // Mobile: the overlay covers the whole viewport, so freeze the page behind it.
    // Desktop/tablet keep the page scrollable (the grid is visible under the panel).
    if (!searchScrollLocked && window.matchMedia('(max-width: 640px)').matches) {
      lockBodyScroll();
      searchScrollLocked = true;
    }
    window.setTimeout(function () { if (searchInput) searchInput.focus(); }, 200);
  }

  function closeSearch() {
    if (!searchOverlay) return;
    searchOverlay.classList.remove('is-open');
    searchOverlay.setAttribute('aria-hidden', 'true');
    if (searchScrollLocked) {
      searchScrollLocked = false;
      unlockBodyScroll();
    }
    if (searchInput) searchInput.value = '';
    searchQuery = '';
    hasScrolledToProducts = false;
    renderSearchResults();
    renderProducts();
  }

  if (searchTriggerBtn) {
    searchTriggerBtn.addEventListener('click', function () {
      var isOpen = searchOverlay && searchOverlay.classList.contains('is-open');
      isOpen ? closeSearch() : openSearch();
    });
  }
  document.querySelectorAll('[data-search-close]').forEach(function (el) {
    el.addEventListener('click', closeSearch);
  });
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderSearchResults();
      renderProducts();

      if (searchQuery && !hasScrolledToProducts) {
        hasScrolledToProducts = true;
        var produkSection = document.getElementById('produk');
        if (produkSection) {
          window.setTimeout(function () {
            var top = produkSection.getBoundingClientRect().top + window.scrollY - 84;
            window.scrollTo({ top: top, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          }, 150);
        }
      } else if (!searchQuery) {
        hasScrolledToProducts = false;
      }
    });

    searchInput.addEventListener('keydown', function (e) {
      if (!searchMatches.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchActive((searchActiveIndex + 1) % searchMatches.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchActive((searchActiveIndex - 1 + searchMatches.length) % searchMatches.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        var target = searchActiveIndex >= 0 ? searchMatches[searchActiveIndex] : searchMatches[0];
        if (target) selectSearchResult(target.id);
      }
    });
  }
  if (searchResultsWrap) {
    searchResultsWrap.addEventListener('click', function (e) {
      var item = e.target.closest('[data-search-result]');
      if (!item) return;
      selectSearchResult(item.getAttribute('data-product-id'));
    });
    searchResultsWrap.addEventListener('mousemove', function (e) {
      var item = e.target.closest('[data-search-result]');
      if (!item) return;
      var items = Array.prototype.slice.call(searchResultsWrap.querySelectorAll('[data-search-result]'));
      setSearchActive(items.indexOf(item));
    });
  }

  /* =======================================================
     13b. ACCOUNT ICON
     Real behaviour (open auth modal / toggle profile dropdown)
     is wired in js/auth.js once Firebase Auth state is known.
  ======================================================= */

  /* =======================================================
     13c. ESCAPE KEY — close modal / cart drawer / search / mobile menu
  ======================================================= */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeProductModal();
    closeCartDrawer();
    closeSearch();
    closeMobileMenu();
  });

})();
