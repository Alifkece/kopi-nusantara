/* =========================================================
   KOPI NUSANTARA — Premium Loading Screen (React + JSX)
   ---------------------------------------------------------
   Dirender dengan React 18 UMD + Babel Standalone (tanpa build
   step, tetap kompatibel dengan hosting statis / GitHub Pages).

   Alur:
   1. Overlay full-screen tampil dari detik pertama (dirender
      inline di index.html sebagai fallback CSS-only agar tidak
      ada flash konten sebelum React siap).
   2. Komponen React mengambil alih: logo muncul dengan animasi
      GSAP (scale + fade + steam rising), progress bar berjalan
      sampai seluruh asset halaman selesai dimuat (window 'load')
      DAN durasi minimum tercapai — supaya animasi tidak terasa
      terpotong pada koneksi cepat.
   3. Overlay fade + scale out, lalu di-unmount dari DOM dan
      body kembali bisa discroll.
========================================================= */

const { useState, useEffect, useRef } = React;

function PremiumLoader() {
  const [progress, setProgress] = useState(0);
  const [isDone, setIsDone] = useState(false);
  const [isMounted, setIsMounted] = useState(true);

  const rootRef = useRef(null);
  const logoRef = useRef(null);
  const ringRef = useRef(null);
  const steamRefs = useRef([]);
  const barFillRef = useRef(null);

  useEffect(() => {
    let rafId;
    let cancelled = false;
    const MIN_DURATION = 1900; // ms — durasi minimum agar animasi tetap terlihat
    const start = performance.now();

    // --- Progress bar: naik cepat lalu melambat mendekati 90%,
    //     baru menyentuh 100% begitu window benar-benar 'load'.
    function tick(now) {
      if (cancelled) return;
      const elapsed = now - start;
      const t = Math.min(elapsed / MIN_DURATION, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const target = Math.min(92, eased * 92);
      setProgress((p) => (p < target ? target : p));
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      }
    }
    rafId = requestAnimationFrame(tick);

    function finish() {
      const elapsed = performance.now() - start;
      const remaining = Math.max(0, MIN_DURATION - elapsed);
      window.setTimeout(() => {
        if (cancelled) return;
        setProgress(100);
        window.setTimeout(() => setIsDone(true), 420);
      }, remaining);
    }

    if (document.readyState === 'complete') {
      finish();
    } else {
      window.addEventListener('load', finish, { once: true });
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener('load', finish);
    };
  }, []);

  // --- GSAP entrance timeline (logo pop-in, ring draw, steam loop)
  useEffect(() => {
    if (!window.gsap) return;
    const gsap = window.gsap;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.fromTo(logoRef.current,
      { scale: 0.72, opacity: 0, y: 14 },
      { scale: 1, opacity: 1, y: 0, duration: 0.9 }
    );

    if (ringRef.current) {
      tl.fromTo(ringRef.current,
        { rotate: -90, opacity: 0 },
        { opacity: 1, duration: 0.5 },
        '<'
      );
      gsap.to(ringRef.current, { rotate: 360, duration: 5.5, ease: 'none', repeat: -1 });
    }

    // Steam wisps: naik & menghilang berulang, tiap wisp beda delay
    steamRefs.current.forEach((el, i) => {
      if (!el) return;
      gsap.fromTo(el,
        { y: 0, opacity: 0, scaleY: 0.6 },
        {
          y: -26, opacity: 0.55, scaleY: 1,
          duration: 1.6,
          repeat: -1,
          delay: i * 0.45,
          ease: 'sine.inOut',
          yoyo: false,
          onRepeat: function () { gsap.set(el, { y: 0, opacity: 0 }); },
        }
      );
    });

    return () => tl.kill();
  }, []);

  // --- Exit animation once loading finished
  useEffect(() => {
    if (!isDone) return;
    const el = rootRef.current;
    document.body.classList.remove('loader-active');

    if (window.gsap && el) {
      window.gsap.to(el, {
        opacity: 0,
        scale: 1.04,
        duration: 0.55,
        ease: 'power2.inOut',
        onComplete: () => setIsMounted(false),
      });
    } else if (el) {
      el.style.transition = 'opacity .5s ease';
      el.style.opacity = '0';
      window.setTimeout(() => setIsMounted(false), 500);
    }
  }, [isDone]);

  useEffect(() => {
    document.body.classList.add('loader-active');
    return () => document.body.classList.remove('loader-active');
  }, []);

  if (!isMounted) return null;

  return (
    <div
      className="premium-loader"
      ref={rootRef}
      role="status"
      aria-live="polite"
      aria-label="Memuat Kopi Nusantara"
    >
      <div className="premium-loader__grain" aria-hidden="true"></div>

      <div className="premium-loader__stage">
        <div className="premium-loader__steamWrap" aria-hidden="true">
          <span className="premium-loader__steam" ref={(el) => (steamRefs.current[0] = el)}></span>
          <span className="premium-loader__steam premium-loader__steam--2" ref={(el) => (steamRefs.current[1] = el)}></span>
          <span className="premium-loader__steam premium-loader__steam--3" ref={(el) => (steamRefs.current[2] = el)}></span>
        </div>

        <div className="premium-loader__logoWrap">
          <svg className="premium-loader__ring" ref={ringRef} viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="54" className="premium-loader__ring-track" fill="none" />
            <circle cx="60" cy="60" r="54" className="premium-loader__ring-arc" fill="none" />
          </svg>
          <img
            ref={logoRef}
            className="premium-loader__logo"
            src="assets/images/logo-wordmark.png"
            alt="Kopi Nusantara"
            width="180"
            height="156"
          />
        </div>

        <p className="premium-loader__tagline">Rasa Nusantara, Dalam Setiap Seduhan.</p>

        <div className="premium-loader__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <div className="premium-loader__bar-fill" ref={barFillRef} style={{ width: progress + '%' }}></div>
        </div>
        <span className="premium-loader__percent">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

(function mountLoader() {
  const target = document.getElementById('loader-root');
  if (!target || !window.React || !window.ReactDOM) return;
  const root = ReactDOM.createRoot(target);
  root.render(<PremiumLoader />);
})();
