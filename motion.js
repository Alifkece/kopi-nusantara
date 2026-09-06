/* =========================================================
   KOPI NUSANTARA — Motion System
   Parallax, Scroll Reveal, Stagger, Hero Animation
========================================================= */

(function(){
  'use strict';

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scroll Progress ---------- */
  const scrollProgress = document.getElementById('scrollProgress');
  if(scrollProgress && !reduced){
    window.addEventListener('scroll', () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress.style.width = (window.scrollY / h * 100) + '%';
    }, { passive: true });
  }

  /* ---------- Navbar Scroll State ---------- */
  const navbar = document.getElementById('navbar');
  if(navbar && !reduced){
    let last = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      navbar.classList.toggle('is-scrolled', y > 40);
      last = y;
    }, { passive: true });
  }

  /* ---------- Scroll Reveal (IntersectionObserver) ---------- */
  const revealEls = document.querySelectorAll('[data-reveal]');
  if(revealEls.length && !reduced){
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if(entry.isIntersecting){
          const el = entry.target;
          const delay = parseFloat(el.dataset.revealDelay) || 0;
          const siblings = Array.from(el.parentElement?.children || []).filter(c => c.hasAttribute('data-reveal'));
          const siblingIdx = siblings.indexOf(el);
          const stagger = siblingIdx * 100;

          setTimeout(() => {
            el.classList.add('is-visible');
          }, delay + stagger);
          revealObserver.unobserve(el);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(el => revealObserver.observe(el));
  } else if(revealEls.length && reduced){
    revealEls.forEach(el => el.classList.add('is-visible'));
  }

  /* ---------- Parallax System ---------- */
  const parallaxEls = document.querySelectorAll('[data-parallax]');
  if(parallaxEls.length && !reduced){
    let ticking = false;
    window.addEventListener('scroll', () => {
      if(!ticking){
        requestAnimationFrame(() => {
          const y = window.scrollY;
          const vh = window.innerHeight;
          parallaxEls.forEach(el => {
            const rect = el.getBoundingClientRect();
            const type = el.dataset.parallax;
            const progress = (vh - rect.top) / (vh + rect.height);
            const clamped = Math.max(0, Math.min(1, progress));

            if(type === 'hero'){
              el.style.transform = `translateY(${clamped * -20}px)`;
            } else if(type === 'about'){
              el.style.transform = `translateY(${clamped * -30}px)`;
            } else if(type === 'card'){
              el.style.transform = `translateY(${clamped * -12}px)`;
            } else if(type === 'deep'){
              el.style.transform = `translateY(${clamped * -60}px) scale(1.05)`;
            }
          });
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  /* ---------- Hero Text Line Reveal ---------- */
  const heroLines = document.querySelectorAll('[data-hero-line]');
  if(heroLines.length && !reduced){
    heroLines.forEach(line => {
      const text = line.textContent;
      line.innerHTML = `<span>${text}</span>`;
    });
  }

  /* ---------- Stat Counter Animation ---------- */
  const statNums = document.querySelectorAll('[data-count]');
  if(statNums.length && !reduced){
    const countObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          const el = entry.target;
          const target = parseInt(el.dataset.count);
          const duration = 1800;
          const start = performance.now();
          const animate = (now) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(eased * target);
            if(progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
          countObserver.unobserve(el);
        }
      });
    }, { threshold: 0.5 });
    statNums.forEach(el => countObserver.observe(el));
  }

  /* ---------- Smooth Scroll for Anchors ---------- */
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if(id === '#') return;
      const target = document.querySelector(id);
      if(target){
        e.preventDefault();
        const offset = navbar ? navbar.offsetHeight + 16 : 80;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      }
    });
  });

  /* ---------- Active Nav Link on Scroll ---------- */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.navbar__nav a[href^="#"]');
  if(sections.length && navLinks.length && !reduced){
    const navObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if(entry.isIntersecting){
          const id = entry.target.id;
          navLinks.forEach(link => {
            link.classList.toggle('is-active', link.getAttribute('href') === '#' + id);
          });
        }
      });
    }, { threshold: 0.3, rootMargin: '-80px 0px -60% 0px' });
    sections.forEach(s => navObserver.observe(s));
  }

})();
