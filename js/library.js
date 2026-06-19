/* =========================================================
   Bibliotheca Publica Varona — library.js
   Single book on the desk; arrows cycle through covers;
   click lifts the book and transitions to the manuscript.
   ========================================================= */

(async function () {
  'use strict';

  const stage          = document.getElementById('stage');
  const deskBook       = document.getElementById('deskBook');
  const titleCartouche = document.getElementById('titleCartouche');
  const prevBtn        = document.getElementById('prevBtn');
  const nextBtn        = document.getElementById('nextBtn');
  const bookIndex      = document.getElementById('bookIndex');

  const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
  const DEFAULT_INDEX = 2;   // central position (Vita Caii) on first load

  let manifests = [];
  let idx = DEFAULT_INDEX;
  let inTransition = false;

  try {
    const library = await Loader.loadLibrary();
    manifests = await Promise.all(library.books.map(id => Loader.loadManifest(id)));
    manifests.sort((a, b) => (a.deskPosition || 0) - (b.deskPosition || 0));
  } catch (err) {
    console.error(err);
    deskBook.innerHTML = '<div style="color:#f1e6cf;padding:1em;text-align:center;font-style:italic">Bibliotheca clausa est.</div>';
    return;
  }
  if (idx >= manifests.length) idx = 0;

  // Cover is now CSS-rendered via Loader.renderCoverHTML — no PNG preload needed.

  function renderCurrent(direction) {
    const m = manifests[idx];
    deskBook.innerHTML = Loader.renderCoverHTML(m);
    titleCartouche.textContent = m.title;
    bookIndex.textContent = `${ROMAN[idx]} / ${ROMAN[manifests.length - 1]}`;
    if (direction === 'left' || direction === 'right') {
      deskBook.classList.add(direction === 'left' ? 'from-right' : 'from-left');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          deskBook.classList.remove('from-left', 'from-right');
        });
      });
    }
  }

  function changeBy(delta) {
    if (inTransition) return;
    inTransition = true;
    const outClass = delta > 0 ? 'out-left' : 'out-right';
    deskBook.classList.add(outClass);
    setTimeout(() => {
      deskBook.classList.remove('out-left', 'out-right');
      idx = (idx + delta + manifests.length) % manifests.length;
      renderCurrent(delta > 0 ? 'left' : 'right');
      setTimeout(() => { inTransition = false; }, 620);
    }, 380);
  }

  prevBtn.addEventListener('click', () => changeBy(-1));
  nextBtn.addEventListener('click', () => changeBy(+1));

  deskBook.addEventListener('pointerenter', () => stage.classList.add('book-hover'));
  deskBook.addEventListener('pointerleave', () => stage.classList.remove('book-hover'));

  function openCurrent() {
    if (inTransition) return;
    inTransition = true;
    const m = manifests[idx];
    stage.classList.remove('book-hover');
    stage.classList.add('zooming');
    deskBook.classList.add('opening');
    setTimeout(() => {
      window.location.href = `manuscript.html?book=${encodeURIComponent(m.id)}`;
    }, 880);
  }
  deskBook.addEventListener('click', openCurrent);
  deskBook.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCurrent(); }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  changeBy(-1);
    if (e.key === 'ArrowRight') changeBy(+1);
    if (e.key === 'Enter')      openCurrent();
  });

  renderCurrent(null);

  // ---- Drifting dust motes in the light ------------------------------
  // Lightweight: a handful of motes that slowly rise/drift and fade,
  // concentrated toward the light shaft on the right side of the scene.
  (function spawnDust() {
    const dust = document.getElementById('atmosDust');
    if (!dust) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const COUNT = 26;
    for (let i = 0; i < COUNT; i++) {
      const mote = document.createElement('span');
      mote.className = 'mote';
      dust.appendChild(mote);
      animateMote(mote, true);
    }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function animateMote(mote, initial) {
      // Bias horizontal position toward the lit right-of-centre area.
      const startX = rand(38, 92);
      const startY = rand(40, 95);
      const driftX = rand(-6, 4);
      const driftY = rand(-14, -5);     // generally rising
      const dur = rand(7000, 16000);
      const maxOpacity = rand(0.18, 0.55);
      const size = rand(2, 4.5);
      mote.style.width = mote.style.height = size.toFixed(1) + 'px';
      mote.style.left = startX + '%';
      mote.style.top = startY + '%';
      // Initial motes start already mid-drift (negative seek-in) instead of
      // waiting a random 0–8s before fading up from nothing. This is why the
      // scene used to look static until you interacted — the effects were
      // never gated behind a click, they just hadn't faded in yet. Respawned
      // motes (initial === false) begin normally at delay 0.
      const delay = initial ? -rand(0, dur) : 0;
      mote.animate([
        { transform: 'translate(0,0)', opacity: 0 },
        { opacity: maxOpacity, offset: 0.2 },
        { opacity: maxOpacity, offset: 0.75 },
        { transform: `translate(${driftX}vw, ${driftY}vh)`, opacity: 0 }
      ], { duration: dur, delay, easing: 'ease-in-out' })
        .addEventListener('finish', () => animateMote(mote, false));
    }
  })();

})();
