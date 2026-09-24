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