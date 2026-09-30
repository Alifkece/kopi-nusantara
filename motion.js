/* =========================================================
   KOPI NUSANTARA — MOTION LAYER (GSAP + ScrollTrigger)
   -----------------------------------------------------------
   Progressive enhancement only. If GSAP fails to load (offline,
   blocked CDN, etc.) the existing CSS/IntersectionObserver
   reveal system in script.js already handles every animation,
   so the site keeps working exactly as before. Nothing here is
   required for baseline functionality (nav, cart, search,
   carousels, testimonials).

   Motion hierarchy (per design direction):
     HERO              -> handled by script.js typewriter/CSS (strongest, untouched)
     SECTION TRANSITION -> medium: clip-path / stagger reveals below
     CARD               -> subtle: small stagger + translate
     Background/parallax-> very subtle
========================================================= */
(function () {
  if (typeof window === 'undefined') return;
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  gsap.registerPlugin(ScrollTrigger);

  /* Elements GSAP takes over already have a CSS .reveal fallback for
     no-JS/offline visitors. Flag <html> so style.css can neutralise the
     CSS fade on exactly those elements, avoiding a double-animation. */
  document.documentElement.classList.add('js-gsap-motion');

  function batchReveal(selector, opts) {
    var els = gsap.utils.toArray(selector);
    if (!els.length) return;
    opts = opts || {};
    ScrollTrigger.batch(els, {
      start: 'top 88%',
      once: true,
      onEnter: function (batch) {
        gsap.fromTo(
          batch,
          {
            opacity: 0,
            y: opts.y != null ? opts.y : 26,
            scale: opts.scale != null ? opts.scale : 1
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: opts.duration || 0.8,
            ease: 'power3.out',
            stagger: opts.stagger != null ? opts.stagger : 0.09,
            /* Cards (origin/product/kios/why) already own a CSS :hover
               transform microinteraction. Clear the inline transform
               GSAP leaves behind once the entrance finishes, so the
               existing hover effect keeps working afterwards. */
            clearProps: 'transform'
          }
        );
      }
    });
  }

  /* ---- CARD-level: subtle stagger entrance ---- */
  batchReveal('.origin-card', { y: 30, stagger: 0.1 });
  batchReveal('.product-card', { y: 30, stagger: 0.08 });
  batchReveal('.why__item', { y: 22, stagger: 0.06, duration: 0.6 });
  batchReveal('.kios-slide', { y: 26, stagger: 0.08 });

  /* ---- JOURNAL: editorial horizontal-feeling reveal ---- */
  gsap.utils.toArray('[data-journal-row]').forEach(function (row, i) {
    var media = row.querySelector('.journal__media');
    var body = row.querySelector('.journal__body');
    var index = row.querySelector('.journal__index');
    var tl = gsap.timeline({
      scrollTrigger: { trigger: row, start: 'top 82%', once: true }
    });
    if (index) tl.from(index, { opacity: 0, x: -12, duration: 0.5, ease: 'power2.out' }, 0);
    if (media) tl.fromTo(media, { opacity: 0, scale: 1.04, clipPath: 'inset(0 0 100% 0)' }, { opacity: 1, scale: 1, clipPath: 'inset(0 0 0% 0)', duration: 0.9, ease: 'power3.out' }, 0.05);
    if (body) tl.from(body.children, { opacity: 0, y: 18, duration: 0.6, ease: 'power2.out', stagger: 0.06, clearProps: 'transform' }, 0.25);
  });

  /* ---- ABOUT: text reveal + image reveal, section character ---- */
  var aboutMedia = document.querySelector('.about__media');
  if (aboutMedia) {
    gsap.fromTo(
      aboutMedia,
      { clipPath: 'inset(0 0 100% 0)' },
      {
        clipPath: 'inset(0 0 0% 0)',
        duration: 1.1,
        ease: 'power3.out',
        scrollTrigger: { trigger: aboutMedia, start: 'top 80%', once: true }
      }
    );
  }

  /* NOTE: no scroll-driven transform is applied directly to
     .origin-card__img / its <img> — those elements already own a CSS
     hover microinteraction (translateY + scale) on the same `transform`
     property, and GSAP inline styles would silently break that hover
     effect. The card-entrance stagger above is the origins section's
     motion; the existing hover interaction is left untouched. */

  /* ---- VISION block: line reveal ---- */
  gsap.utils.toArray('.vision__block').forEach(function (block, i) {
    gsap.from(block.children, {
      opacity: 0,
      y: 20,
      duration: 0.7,
      ease: 'power2.out',
      stagger: 0.08,
      scrollTrigger: { trigger: block, start: 'top 85%', once: true }
    });
  });

  /* ---- TESTIMONIAL: quote reveal ---- */
  var testimonialWrap = document.querySelector('.testimonial__wrap');
  if (testimonialWrap) {
    gsap.from(testimonialWrap, {
      opacity: 0,
      y: 24,
      duration: 0.8,
      ease: 'power3.out',
      scrollTrigger: { trigger: testimonialWrap, start: 'top 85%', once: true }
    });
  }

  /* ---- PROFILE: gallery images, offset depth reveal ---- */
  var profileGallery = document.querySelector('.profile__gallery');
  if (profileGallery) {
    gsap.utils.toArray('.profile__gallery-img').forEach(function (img, i) {
      gsap.fromTo(
        img,
        { opacity: 0, y: i % 2 ? 46 : -26, scale: 1.05 },
        {
          opacity: 1, y: 0, scale: 1,
          duration: 1, ease: 'power3.out', delay: i * 0.12,
          scrollTrigger: { trigger: profileGallery, start: 'top 82%', once: true },
          clearProps: 'transform'
        }
      );
    });
  }

  /* ---- VISION media: side clip-path reveal ---- */
  var visionMedia = document.querySelector('.vision__media');
  if (visionMedia) {
    gsap.fromTo(
      visionMedia,
      { clipPath: 'inset(0 100% 0 0)' },
      {
        clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: visionMedia, start: 'top 82%', once: true }
      }
    );
  }

  /* ---- LOCATION: map scale-in ---- */
  var locationMap = document.querySelector('.location__map');
  if (locationMap) {
    gsap.fromTo(
      locationMap,
      { opacity: 0, scale: 0.92 },
      {
        opacity: 1, scale: 1, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: locationMap, start: 'top 85%', once: true },
        clearProps: 'transform'
      }
    );
  }

  /* ---- MOMENT: subtle scroll-linked image parallax + quote reveal ---- */
  var momentSection = document.querySelector('.moment');
  if (momentSection) {
    var momentImg = momentSection.querySelector('.moment__media img');
    var momentQuote = momentSection.querySelector('.moment__quote');
    if (momentImg) {
      gsap.fromTo(
        momentImg,
        { scale: 1.18 },
        {
          scale: 1.02, ease: 'none',
          scrollTrigger: { trigger: momentSection, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
        }
      );
    }
    if (momentQuote) {
      gsap.from(momentQuote, {
        opacity: 0, y: 26, duration: 0.9, ease: 'power3.out',
        scrollTrigger: { trigger: momentSection, start: 'top 70%', once: true }
      });
    }
  }

  /* ---- FINAL CTA: scale + staggered text/button reveal ---- */
  var finalCta = document.querySelector('.final-cta');
  if (finalCta && finalCta.children.length) {
    gsap.from(finalCta.children, {
      opacity: 0, scale: 0.94, y: 24,
      duration: 0.8, ease: 'power3.out', stagger: 0.12,
      scrollTrigger: { trigger: finalCta, start: 'top 82%', once: true },
      clearProps: 'transform'
    });
  }

  /* ---- PRODUCT GRID: stagger-in on filter/search change ----
     script.js dispatches this after every re-render EXCEPT the very first
     one (that entrance stays owned by the ScrollTrigger batchReveal above).
     The new cards are freshly-created DOM nodes with no persistent CSS
     opacity:0, so if this listener never fires (GSAP blocked/offline) they
     simply render visible immediately — no broken/invisible state possible. */
  document.addEventListener('kopi:products-rendered', function (e) {
    var wrap = (e.detail && e.detail.wrap) || document.querySelector('[data-product-list]');
    if (!wrap) return;
    var cards = gsap.utils.toArray(wrap.querySelectorAll('.product-card'));
    if (!cards.length) return;
    gsap.fromTo(
      cards,
      { opacity: 0, y: 18, scale: .96 },
      { opacity: 1, y: 0, scale: 1, duration: .5, ease: 'power2.out', stagger: 0.045, clearProps: 'transform' }
    );
  });

  ScrollTrigger.refresh();
})();

/* =========================================================
   SMOOTH FLOW LAYER (Figma smart-animate feel)
   -----------------------------------------------------------
   Additive, independent IIFE. Every feature is progressive:
   no GSAP  -> only the pure-JS parts run (magnetic buttons)
   reduced motion -> nothing runs
   Nothing here removes or rewrites existing markup logic; it only
   adds classes / inline props that are cleaned up afterwards.
========================================================= */
(function () {
  if (typeof window === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var hasGsap = typeof gsap !== 'undefined';
  var hasST = hasGsap && typeof ScrollTrigger !== 'undefined';
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var EXPO = 'expo.out';
  if (hasST) { try { gsap.registerPlugin(ScrollTrigger); } catch (e) {} }

  /* ---------- 1. HEADINGS: per-word mask reveal ---------- */
  function splitWords(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) nodes.push(n);
    var words = [];
    nodes.forEach(function (tn) {
      var txt = tn.nodeValue;
      if (!txt || !txt.trim()) return;
      var frag = document.createDocumentFragment();
      txt.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span'); w.className = 'fx-word';
        var i = document.createElement('span'); i.className = 'fx-word__in';
        i.textContent = part;
        w.appendChild(i); frag.appendChild(w); words.push(i);
      });
      tn.parentNode.replaceChild(frag, tn);
    });
    return words;
  }

  if (hasST) {
    gsap.utils.toArray('section:not(.hero) h2').forEach(function (h) {
      if (h.dataset.fxSplit || h.closest('.hero')) return;
      var words = splitWords(h);
      if (!words.length) return;
      h.dataset.fxSplit = '1';
      h.classList.add('fx-split');
      gsap.from(words, {
        yPercent: 118, rotate: 4, opacity: 0,
        duration: 1.1, ease: EXPO, stagger: 0.07,
        clearProps: 'transform,opacity',
        scrollTrigger: { trigger: h, start: 'top 88%', once: true }
      });
    });

    /* ---------- 2. IMAGE PARALLAX (scroll-linked, very subtle) ---------- */
    [
      ['.about__media', '.about__video'],
      ['.vision__media', 'img'],
      ['.journal__media', 'img'],
      ['.origin-card__img', 'img'],
      ['.kios-slide__img', 'img']
    ].forEach(function (pair) {
      gsap.utils.toArray(pair[0]).forEach(function (wrap) {
        var el = wrap.querySelector(pair[1]);
        if (!el || el.classList.contains('fx-par')) return;
        el.classList.add('fx-par');
        gsap.fromTo(el, { '--py': '-4%' }, {
          '--py': '4%', ease: 'none',
          scrollTrigger: { trigger: wrap, start: 'top bottom', end: 'bottom top', scrub: 0.6 }
        });
      });
    });

    /* ---------- 3. FOOTER: staggered columns ---------- */
    var footerCols = gsap.utils.toArray('.footer__col, .footer__brand, .footer__bottom');
    if (footerCols.length) {
      ScrollTrigger.batch(footerCols, {
        start: 'top 94%', once: true,
        onEnter: function (batch) {
          gsap.from(batch, { opacity: 0, y: 26, duration: 0.9, ease: EXPO, stagger: 0.09, clearProps: 'transform,opacity' });
        }
      });
    }
  }

  /* ---------- 4. CARDS: 3D tilt + lift (fine pointers only) ---------- */
  if (hasGsap && finePointer) {
    var CARD_SEL = '.product-card, .origin-card, .kios-slide';
    var attachTilt = function (card) {
      if (card._fxTilt) return;
      card._fxTilt = true;
      var max = card.matches('.kios-slide') ? 2.2 : (card.matches('.origin-card') ? 3.5 : 3.2);
      var lift = card.matches('.product-card') ? -6 : 0;
      var active = false;

      function enter() {
        if (active || card.closest('.is-dragging')) return;
        if (parseFloat(getComputedStyle(card).opacity) < 0.99) return; // entrance still running
        active = true;
        // hand transform over to GSAP; keep the shadow/border transitions
        card.style.transition = 'box-shadow .5s cubic-bezier(.16,1,.3,1), border-color .4s cubic-bezier(.16,1,.3,1)';
        gsap.set(card, { transformPerspective: 1000, transformOrigin: '50% 50%' });
      }
      function move(e) {
        if (!active) return;
        if (card.closest('.is-dragging')) { leave(); return; }
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        gsap.to(card, { rotationY: px * max * 2, rotationX: -py * max * 2, y: lift, duration: 0.6, ease: 'power3.out', overwrite: 'auto' });
      }
      function leave() {
        if (!active) return;
        active = false;
        gsap.to(card, {
          rotationX: 0, rotationY: 0, y: 0, duration: 0.8, ease: EXPO, overwrite: 'auto',
          onComplete: function () { gsap.set(card, { clearProps: 'transform,transformOrigin' }); card.style.transition = ''; }
        });
      }
      card.addEventListener('pointerenter', enter);
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerleave', leave);
      enter();
    };
    document.addEventListener('pointerover', function (e) {
      var c = e.target.closest && e.target.closest(CARD_SEL);
      if (c) attachTilt(c);
    }, { passive: true });
  }

  /* ---------- 5. MAGNETIC BUTTONS (pure JS, fine pointers only) ---------- */
  if (finePointer) {
    var NO_MAG = '.auth-screen, .cart-drawer, .product-modal, .search-overlay, .checkout-view';
    document.addEventListener('pointerover', function (e) {
      var b = e.target.closest && e.target.closest('.btn');
      if (!b || b._fxMag || b.disabled || b.closest(NO_MAG)) return;
      b._fxMag = true;
      var tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, inside = true;
      function loop() {
        cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
        b.style.translate = cx.toFixed(2) + 'px ' + cy.toFixed(2) + 'px';
        if (!inside && Math.abs(cx) < 0.05 && Math.abs(cy) < 0.05) { b.style.translate = ''; raf = 0; return; }
        raf = requestAnimationFrame(loop);
      }
      b.addEventListener('pointermove', function (ev) {
        var r = b.getBoundingClientRect();
        tx = ((ev.clientX - (r.left + r.width / 2)) / (r.width / 2)) * 7;
        ty = ((ev.clientY - (r.top + r.height / 2)) / (r.height / 2)) * 5;
        inside = true;
        if (!raf) raf = requestAnimationFrame(loop);
      });
      b.addEventListener('pointerleave', function () {
        inside = false; tx = 0; ty = 0;
        if (!raf) raf = requestAnimationFrame(loop);
      });
    }, { passive: true });
  }

  /* ---------- 6. OVERLAYS & LIVE UI (GSAP, observers only) ---------- */
  if (hasGsap) {
    /* cart drawer: head / items / footer glide in as it opens */
    var drawer = document.getElementById('cartDrawer');
    if (drawer) {
      var wasOpen = drawer.classList.contains('is-open');
      new MutationObserver(function () {
        var open = drawer.classList.contains('is-open');
        if (open && !wasOpen) {
          gsap.from(drawer.querySelectorAll('.cart-drawer__head, .cart-item, .cart-drawer__footer'), {
            opacity: 0, x: 26, duration: 0.7, ease: EXPO, stagger: 0.05, delay: 0.12,
            clearProps: 'transform,opacity'
          });
        }
        wasOpen = open;
      }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }

    /* cart badge: elastic bump whenever the count changes */
    var badge = document.querySelector('[data-cart-count]');
    if (badge) {
      var lastCount = badge.textContent;
      new MutationObserver(function () {
        if (badge.textContent === lastCount) return;
        lastCount = badge.textContent;
        gsap.fromTo(badge, { scale: 1.7 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, .5)', clearProps: 'transform' });
      }).observe(badge, { childList: true, characterData: true, subtree: true });
    }

    /* checkout view: content cascades in whenever it switches from
       hidden to visible. (Panel auth login/register/OTP sengaja TIDAK
       ikut di sini: animasi masuknya diatur penuh oleh style.css +
       js/auth.js, supaya tidak bertabrakan dengan animasi GSAP.) */
    var cascade = function (el) {
      if (!el) return;
      new MutationObserver(function () {
        if (el.hidden) return;
        gsap.from(el.children, {
          opacity: 0, y: 16, duration: 0.6, ease: EXPO, stagger: 0.05,
          clearProps: 'transform,opacity'
        });
      }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    };
    cascade(document.getElementById('checkoutView'));
  }
})();
