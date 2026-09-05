/* =========================================================
   KOPI NUSANTARA — script.js
   Vanilla JS only. No framework, no backend.
========================================================= */
(function () {
  'use strict';

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    var SLIDE_INTERVAL = 7000; // 6-8s per slide
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
    mobileMenu.classList.add('is-open');
    mobileMenu.setAttribute('aria-hidden', 'false');
    hamburger.setAttribute('aria-expanded', 'true');
    if (mobileMenuBackdrop) {
      mobileMenuBackdrop.classList.add('is-open');
      mobileMenuBackdrop.setAttribute('aria-hidden', 'false');
    }
    document.body.style.overflow = 'hidden';
  }
  function closeMobileMenu() {
    mobileMenu.classList.remove('is-open');
    mobileMenu.setAttribute('aria-hidden', 'true');
    hamburger.setAttribute('aria-expanded', 'false');
    if (mobileMenuBackdrop) {
      mobileMenuBackdrop.classList.remove('is-open');
      mobileMenuBackdrop.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';
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
    { id: 'gayo-arabika', name: 'Gayo Arabika', origin: 'Aceh', type: 'Light Roast', price: 39000, image: 'assets/images/product-gayo.jpg', rating: 4.9, reviews: 128, badge: 'Terlaris', weights: [100, 250, 500, 1000] },
    { id: 'toraja-sapan', name: 'Toraja Sapan', origin: 'Sulawesi', type: 'Medium Roast', price: 42500, image: 'assets/images/product-toraja.jpg', rating: 4.8, reviews: 96, badge: 'Baru', weights: [100, 250, 500, 1000] },
    { id: 'kintamani-citrus', name: 'Kintamani Citrus', origin: 'Bali', type: 'Light Roast', price: 41000, image: 'assets/images/product-kintamani.jpg', rating: 4.7, reviews: 74, badge: null, weights: [100, 250, 500, 1000] },
    { id: 'flores-bajawa', name: 'Flores Bajawa', origin: 'Nusa Tenggara', type: 'Medium Roast', price: 40000, image: 'assets/images/product-flores.jpg', rating: 4.8, reviews: 61, badge: null, weights: [100, 250, 500, 1000] },
    { id: 'java-preanger', name: 'Java Preanger', origin: 'Jawa Barat', type: 'Dark Roast', price: 38000, image: 'assets/images/product-java.jpg', rating: 4.6, reviews: 53, badge: null, weights: [100, 250, 500, 1000] },
    { id: 'biji-arabika', name: 'Biji Kopi Arabika', origin: 'Aceh', type: 'Light Roast', price: 37000, image: 'assets/images/product-arabika.jpg', rating: 4.7, reviews: 40, badge: null, weights: [100, 250, 500, 1000] },
    { id: 'biji-robusta', name: 'Biji Kopi Robusta', origin: 'Jawa Barat', type: 'Dark Roast', price: 28000, image: 'assets/images/product-robusta.jpg', rating: 4.6, reviews: 35, badge: null, weights: [100, 250, 500, 1000] },
    { id: 'kopi-luwak', name: 'Biji Luwak White Coffe', origin: 'Bali', type: 'Medium Roast', price: 150000, image: 'assets/images/product-luwak.jpg', rating: 4.9, reviews: 22, badge: 'Premium', weights: [100, 250, 500, 1000] }
  ];

  var activeFilter = 'all';
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

  function renderProducts() {
    var wrap = document.querySelector('[data-product-list]');
    if (!wrap) return;
    var list = activeFilter === 'all' ? PRODUCTS : PRODUCTS.filter(function (p) { return p.origin === activeFilter; });

    if (!list.length) {
      wrap.innerHTML = '<p style="padding:40px 4px;color:var(--c-coffee-2);">Belum ada produk untuk daerah ini.</p>';
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
  var modalPrice = document.getElementById('modalPrice');
  var modalAddCart = document.getElementById('modalAddCart');
  var modalActiveProductId = null;
  var modalActiveWeight = null;

  function renderModalWeights(product) {
    modalWeights.innerHTML = product.weights.map(function (w) {
      return '<button type="button" class="weight-chip' + (w === modalActiveWeight ? ' is-active' : '') + '" data-modal-weight="' + w + '">' + w + 'gr</button>';
    }).join('');
    modalPrice.textContent = formatRupiah(priceForWeight(product, modalActiveWeight));
  }

  function openProductModal(id) {
    var product = getProductById(id);
    if (!product || !productModal) return;
    modalActiveProductId = id;
    modalActiveWeight = selectedWeight[id] || product.weights[0];

    modalImage.style.display = '';
    modalImage.onerror = function () { this.style.display = 'none'; };
    modalImage.src = product.image;
    modalImage.alt = 'Biji kopi ' + product.name + ' dari ' + product.origin;
    modalOrigin.textContent = product.origin;
    modalName.textContent = product.name;
    modalType.textContent = product.type;
    modalRating.innerHTML = starIcon() + ' ' + product.rating.toFixed(1) + ' &middot; ' + product.reviews + ' ulasan';
    renderModalWeights(product);

    productModal.classList.add('is-open');
    productModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeProductModal() {
    if (!productModal) return;
    productModal.classList.remove('is-open');
    productModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
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
     9. CART (front-end only — no persistence/backend/payment)
     -----------------------------------------------------
     CATATAN: cartState hidup hanya selama sesi halaman ini.
     Pada tahap berikutnya akan dihubungkan ke database/session
     asli. Checkout saat ini hanya placeholder.
  ======================================================= */
  var cartState = []; // { productId, weight, qty }
  var cartBadge = document.querySelector('[data-cart-count]');
  var cartDrawer = document.getElementById('cartDrawer');
  var cartItemsWrap = document.getElementById('cartItems');
  var cartSubtotalEl = document.getElementById('cartSubtotal');
  var cartCheckoutBtn = document.getElementById('cartCheckoutBtn');
  var cartTriggerBtn = document.querySelector('[data-action="cart"]');

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
    if (cartBadge) cartBadge.textContent = String(totalQty);

    if (!cartItemsWrap || !cartSubtotalEl) return;

    if (!cartState.length) {
      cartItemsWrap.innerHTML = '<p class="cart-drawer__empty">Keranjang Anda masih kosong.</p>';
      cartSubtotalEl.textContent = formatRupiah(0);
      return;
    }

    var subtotal = 0;
    cartItemsWrap.innerHTML = cartState.map(function (item) {
      var product = getProductById(item.productId);
      if (!product) return '';
      var linePrice = priceForWeight(product, item.weight) * item.qty;
      subtotal += linePrice;
      return (
        '<div class="cart-item">' +
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
    if (!cartDrawer) return;
    cartDrawer.classList.add('is-open');
    cartDrawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeCartDrawer() {
    if (!cartDrawer) return;
    cartDrawer.classList.remove('is-open');
    cartDrawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
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

  if (cartCheckoutBtn) {
    cartCheckoutBtn.addEventListener('click', function () {
      cartCheckoutBtn.setAttribute('title', 'Fitur checkout akan tersedia pada tahap berikutnya');
    });
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
     13b. ESCAPE KEY — close modal / cart drawer / mobile menu
  ======================================================= */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    closeProductModal();
    closeCartDrawer();
    closeMobileMenu();
  });

  /* =======================================================
     13. SEARCH / ACCOUNT ICON PLACEHOLDERS
     (No search/account system yet — this stage is landing-page only)
  ======================================================= */
  document.querySelectorAll('[data-action="search"], [data-action="account"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.setAttribute('title', 'Fitur ini akan tersedia pada tahap berikutnya');
    });
  });

})();
