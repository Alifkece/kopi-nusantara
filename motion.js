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

  ScrollTrigger.refresh();
})();
