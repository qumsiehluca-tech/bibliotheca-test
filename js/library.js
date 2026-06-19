/* =========================================================
   Bibliotheca Publica Varona — library.js
   A deck of books fanned in a 3-D arc (cover-flow). Drag, flick,
   the arrows, or arrow-keys rotate the deck; the centred volume can
   be opened. One .deck-card per book; their transforms are computed
   from each card's signed offset to the current (possibly fractional,
   while dragging) index.
   ========================================================= */

(async function () {
  'use strict';

  const stage          = document.getElementById('stage');
  const deck           = document.getElementById('deck');
  const titleCartouche = document.getElementById('titleCartouche');
  const prevBtn        = document.getElementById('prevBtn');
  const nextBtn        = document.getElementById('nextBtn');
  const bookIndex      = document.getElementById('bookIndex');

  const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];
  const DEFAULT_INDEX = 2;   // central position (Vita Caii) on first load

  // --- Cover-flow tuning -------------------------------------------------
  const SPREAD0   = 64;   // % translateX for the first neighbour
  const SPREAD1   = 20;   // extra % per further step (cards bunch at the sides)
  const TURN0     = 32;   // deg rotateY for the first neighbour
  const TURN1     = 5;    // extra deg per further step
  const DEPTH     = 78;   // px translateZ pushed back per step
  const SCALE_K   = 0.06; // scale lost per step
  const DIM_K     = 0.15; // brightness lost per step
  const FADE_K    = 0.16; // opacity lost per step
  const VISIBLE   = 3;    // steps beyond which a card is hidden
  const DRAG_STEP = 90;   // px of drag that equals one card

  let manifests = [];
  let cards = [];
  let index = DEFAULT_INDEX;     // settled integer index
  let cur = DEFAULT_INDEX;       // live (possibly fractional) index
  let inTransition = false;

  try {
    const library = await Loader.loadLibrary();
    manifests = await Promise.all(library.books.map(id => Loader.loadManifest(id)));
    manifests.sort((a, b) => (a.deskPosition || 0) - (b.deskPosition || 0));
  } catch (err) {
    console.error(err);
    deck.innerHTML = '<div style="color:#f1e6cf;padding:1em;text-align:center;font-style:italic">Bibliotheca clausa est.</div>';
    return;
  }
  if (index >= manifests.length) index = cur = 0;

  // ---- Build one card per book (once) -----------------------------------
  manifests.forEach((m, i) => {
    const card = document.createElement('div');
    card.className = 'deck-card';
    card.setAttribute('role', 'option');
    card.setAttribute('aria-label', m.title);
    card.dataset.i = i;
    card.innerHTML = Loader.renderCoverHTML(m);
    deck.appendChild(card);
    cards.push(card);
  });

  // ---- Lay the deck out for a given (fractional) centre index ------------
  function layout(centre) {
    for (let i = 0; i < cards.length; i++) {
      const o = i - centre;                 // signed offset from centre
      const a = Math.abs(o);
      const sgn = o === 0 ? 0 : (o > 0 ? 1 : -1);
      const ramp = Math.min(a, 1);          // 0..1 across the nearest step
      const far  = Math.max(0, a - 1);      // whole steps beyond the first

      const tx   = sgn * (ramp * SPREAD0 + far * SPREAD1);            // %
      const ry   = -sgn * (ramp * TURN0 + far * TURN1);              // deg
      const tz   = -a * DEPTH;                                       // px
      const sc   = Math.max(0.6, 1 - a * SCALE_K);
      const op   = a > VISIBLE ? 0 : Math.max(0, 1 - a * FADE_K);
      const br   = Math.max(0.4, 1 - a * DIM_K);

      const card = cards[i];
      card.style.transform =
        `translate(-50%,-50%) translateX(${tx}%) translateZ(${tz}px) rotateY(${ry}deg) scale(${sc})`;
      card.style.opacity = op;
      card.style.zIndex  = String(1000 - Math.round(a * 10));
      card.style.filter  = `brightness(${br.toFixed(3)}) drop-shadow(0 14px 18px rgba(0,0,0,${(0.5 - a*0.08).toFixed(3)}))`;
      card.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      card.classList.toggle('is-center', Math.round(centre) === i);
    }
  }

  function updateChrome() {
    const m = manifests[index];
    if (!m) return;
    titleCartouche.textContent = m.title;
    bookIndex.textContent = `${ROMAN[index]} / ${ROMAN[manifests.length - 1]}`;
  }

  // ---- Snap to the nearest card and settle ------------------------------
  function settleTo(target, animate) {
    index = (target + manifests.length) % manifests.length;
    cur = index;
    deck.classList.toggle('animating', !!animate);
    layout(cur);
    updateChrome();
  }

  function changeBy(delta) {
    if (inTransition) return;
    settleTo(index + delta, true);
  }
  prevBtn.addEventListener('click', () => changeBy(-1));
  nextBtn.addEventListener('click', () => changeBy(+1));

  // ---- Drag / flick to rotate the deck ----------------------------------
  // We track move/up on window (rather than setPointerCapture, which would
  // retarget the click and break tap-to-open / tap-to-centre).
  let dragging = false, dragStartX = 0, dragStartCur = 0, moved = 0, lastX = 0, lastT = 0, vx = 0;

  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    moved = Math.max(moved, Math.abs(dx));
    // dragging right (positive dx) brings the PREVIOUS book to centre
    cur = clamp(dragStartCur - dx / DRAG_STEP, -0.5, manifests.length - 0.5);
    const now = performance.now();
    vx = (e.clientX - lastX) / Math.max(1, now - lastT);
    lastX = e.clientX; lastT = now;
    layout(cur);
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    deck.classList.remove('grabbing');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (moved > 6) {                         // a real drag: snap with momentum
      let target = clamp(Math.round(cur - vx * 6), 0, manifests.length - 1);
      settleTo(target, true);
    } else {                                 // a tap: snap back cleanly
      settleTo(index, true);
    }
  }
  deck.addEventListener('pointerdown', (e) => {
    if (inTransition) return;
    dragging = true; moved = 0;
    dragStartX = lastX = e.clientX;
    dragStartCur = cur;
    lastT = performance.now(); vx = 0;
    deck.classList.add('grabbing');
    deck.classList.remove('animating');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  // ---- Click a card: centre it, or open it if already centred -----------
  deck.addEventListener('click', (e) => {
    if (moved > 6) return;                 // that was a drag, not a click
    const card = e.target.closest('.deck-card');
    if (!card) return;
    const i = +card.dataset.i;
    if (i === index) openCurrent();
    else settleTo(i, true);
  });

  // ---- Open the centred book --------------------------------------------
  function openCurrent() {
    if (inTransition) return;
    inTransition = true;
    const m = manifests[index];
    stage.classList.remove('book-hover');
    stage.classList.add('zooming');
    cards[index].classList.add('opening');
    setTimeout(() => {
      window.location.href = `manuscript.html?book=${encodeURIComponent(m.id)}`;
    }, 880);
  }

  // ---- Hover glow + keyboard --------------------------------------------
  deck.addEventListener('pointerenter', () => stage.classList.add('book-hover'));
  deck.addEventListener('pointerleave', () => { if (!dragging) stage.classList.remove('book-hover'); });

  deck.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCurrent(); }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  changeBy(-1);
    if (e.key === 'ArrowRight') changeBy(+1);
    if (e.key === 'Enter')      openCurrent();
  });

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- First paint ------------------------------------------------------
  settleTo(index, false);

  // ---- Drifting dust motes in the light ---------------------------------
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
      const startX = rand(38, 92);
      const startY = rand(40, 95);
      const driftX = rand(-6, 4);
      const driftY = rand(-14, -5);
      const dur = rand(7000, 16000);
      const maxOpacity = rand(0.18, 0.55);
      const size = rand(2, 4.5);
      mote.style.width = mote.style.height = size.toFixed(1) + 'px';
      mote.style.left = startX + '%';
      mote.style.top = startY + '%';
      // Initial motes start already mid-drift (negative seek-in) so the scene
      // is alive at load with no interaction.
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
