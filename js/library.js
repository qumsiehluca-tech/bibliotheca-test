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

  // --- Wheel tuning ------------------------------------------------------
  // Books are mounted around a vertical cylinder (a turning wheel). The front
  // book faces the reader; its neighbours curve away around the rim, raking
  // steeply toward edge-on so you read their spines / page-edges. Only a few
  // are visible at once — the rest have rotated out of sight behind.
  const DEG_STEP    = 44;   // angular gap between books on the rim
  const RADIUS_K    = 1.42; // wheel radius as a multiple of a card's width
  const VISIBLE_DEG = 104;   // books turned past this are hidden (≈ ±2 → 5 seen)
  const FADE_DEG    = 20;   // soft fade over the last this-many degrees
  const PARA_K      = 0.045;// gentle parabolic sink of the side books
  const TILT        = 52;   // deg the books lean BACK onto the table (rotateX)
  const SIDE_FADE   = 0.46; // opacity floor for the non-centred books
  const DRAG_STEP   = 70;   // px of drag that equals one book-step

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
  const N = manifests.length;

  // Circular helpers — the wheel loops endlessly. `cur` is a CONTINUOUS index
  // (never wrapped, so motion is smooth across the seam); the displayed/opened
  // index is derived mod N, and each book's angle uses the SHORTEST way round.
  function wrapOff(o) { o = ((o % N) + N) % N; if (o > N / 2) o -= N; return o; }
  function curIndex() { return ((Math.round(cur) % N) + N) % N; }

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

  // ---- Lay the wheel out for a given (fractional) centre index ----------
  function layout(centre) {
    const cardW = deck.clientWidth || 240;
    const R = cardW * RADIUS_K;                 // wheel radius in px
    deck.style.setProperty('--thick', (cardW * 0.185).toFixed(1) + 'px');
    for (let i = 0; i < cards.length; i++) {
      const off = wrapOff(i - centre);              // signed offset in book-steps
      const phi = off * DEG_STEP;                   // shortest way round the rim
      const a   = Math.abs(phi);
      const rad = phi * Math.PI / 180;

      // Position on the cylinder surface; front book at z=0, rest curve back.
      const tx = R * Math.sin(rad);
      const tz = R * Math.cos(rad) - R;
      // Parabola: side books sink along y = -k·x² so the row arcs downward.
      const ty = cardW * PARA_K * off * off;
      // Tangent to the rim: rotate by the same angle so side books rake away.
      const ry = phi;

      const op0 = a >= VISIBLE_DEG ? 0
                : Math.max(0, Math.min(1, (VISIBLE_DEG - a) / FADE_DEG));
      // Non-centred books go a little transparent (focus stays on the front one).
      const centred = 1 - Math.min(1, Math.abs(off));
      const op = op0 * (SIDE_FADE + (1 - SIDE_FADE) * centred);
      const br = Math.max(0.32, 0.45 + 0.55 * Math.cos(rad));   // darken as they turn

      const card = cards[i];
      card.style.transform =
        `translate(-50%,-50%) translateX(${tx.toFixed(1)}px) translateY(${ty.toFixed(1)}px) translateZ(${tz.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg) rotateX(${TILT}deg)`;
      card.style.opacity = op.toFixed(3);
      card.style.zIndex  = String(2000 + Math.round(tz));        // nearer = on top
      card.style.filter  =
        `brightness(${br.toFixed(3)}) drop-shadow(0 16px 20px rgba(0,0,0,${(0.45 * Math.max(0.2, Math.cos(rad))).toFixed(3)}))`;
      card.style.pointerEvents = op < 0.05 ? 'none' : 'auto';
      card.classList.toggle('is-center', Math.abs(off) < 0.5);
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
    cur = target;                 // continuous — never wrapped
    index = curIndex();           // displayed/opened book (mod N)
    deck.classList.toggle('animating', !!animate);
    layout(cur);
    updateChrome();
  }

  function changeBy(delta) {
    if (inTransition) return;
    settleTo(Math.round(cur) + delta, true);
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
    cur = dragStartCur - dx / DRAG_STEP;          // unbounded — the wheel loops
    const now = performance.now();
    vx = (e.clientX - lastX) / Math.max(1, now - lastT);
    lastX = e.clientX; lastT = now;
    layout(cur);
  }
  function onUp() {
    if (!dragging) return;
    dragging = false;
    deck.classList.remove('grabbing');
    document.documentElement.classList.remove('deck-dragging');
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    if (moved > 6) {                         // a real drag: snap with momentum
      settleTo(Math.round(cur - vx * 6), true);
    } else {                                 // a tap: snap back cleanly
      settleTo(Math.round(cur), true);
    }
  }
  deck.addEventListener('pointerdown', (e) => {
    if (inTransition) return;
    dragging = true; moved = 0;
    dragStartX = lastX = e.clientX;
    dragStartCur = cur;
    lastT = performance.now(); vx = 0;
    deck.classList.add('grabbing');
    document.documentElement.classList.add('deck-dragging');
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
    else settleTo(Math.round(cur + wrapOff(i - cur)), true);   // shortest way round
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

  window.addEventListener('resize', () => layout(cur));

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
