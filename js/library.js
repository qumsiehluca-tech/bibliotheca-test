/* =========================================================
   Bibliotheca Publica Varona — library.js
   Single book on the desk; arrows cycle through covers;
   click lifts the book and transitions to the manuscript.
   ========================================================= */

(async function () {
  'use strict';

  const stage          = document.getElementById('stage');
  const scene          = document.getElementById('scene');
  const deskBook       = document.getElementById('deskBook');
  const titleCartouche = document.getElementById('titleCartouche');
  const prevBtn        = document.getElementById('prevBtn');
  const nextBtn        = document.getElementById('nextBtn');
  const bookIndex      = document.getElementById('bookIndex');

  // Roman numerals for the index display (1..7)
  const ROMAN = ['i','ii','iii','iv','v','vi','vii','viii','ix','x'];

  // Default to deskPosition 3 — the centred book and the only one with content.
  // (Numero centrali, ut viatorem invitet ad legendum quod scriptum est.)
  const DEFAULT_INDEX = 2;

  let library;
  let manifests = [];
  let idx       = DEFAULT_INDEX;
  let inTransition = false;

  // ---- Init ----------------------------------------------------------

  try {
    library = await Loader.loadLibrary();
    // Load all manifests in parallel and sort by deskPosition so the carousel
    // order respects the author's intended left-to-right desk arrangement.
    manifests = await Promise.all(library.books.map(id => Loader.loadManifest(id)));
    manifests.sort((a, b) => (a.deskPosition || 0) - (b.deskPosition || 0));
  } catch (err) {
    console.error(err);
    deskBook.innerHTML = '<div style="color:#f1e6cf;padding:1em;text-align:center;font-style:italic">Bibliotheca clausa est.</div>';
    return;
  }

  if (idx >= manifests.length) idx = 0;

  // ---- Render --------------------------------------------------------

  function renderCurrent(direction /* 'left' | 'right' | null */) {
    const m = manifests[idx];
    deskBook.innerHTML = Loader.renderCoverHTML(m);
    titleCartouche.textContent = m.title;
    bookIndex.textContent = `${ROMAN[idx]} / ${ROMAN[manifests.length - 1]}`;

    // Slide-in from the appropriate side
    if (direction === 'left' || direction === 'right') {
      deskBook.classList.add(direction === 'left' ? 'from-right' : 'from-left');
      // Trigger layout, then clear the class to animate to centre
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

    // Wait for the slide-out, then swap and slide-in
    setTimeout(() => {
      deskBook.classList.remove('out-left', 'out-right');
      idx = (idx + delta + manifests.length) % manifests.length;
      renderCurrent(delta > 0 ? 'left' : 'right');
      // Release lock once the slide-in finishes
      setTimeout(() => { inTransition = false; }, 620);
    }, 380);
  }

  // ---- Wire events ---------------------------------------------------

  prevBtn.addEventListener('click', () => changeBy(-1));
  nextBtn.addEventListener('click', () => changeBy(+1));

  // Hover: show the title cartouche above the desk
  deskBook.addEventListener('pointerenter', () => stage.classList.add('book-hover'));
  deskBook.addEventListener('pointerleave', () => stage.classList.remove('book-hover'));

  // Click / Enter / Space: lift the book and transition to manuscript
  function openCurrent() {
    if (inTransition) return;
    inTransition = true;
    const m = manifests[idx];
    stage.classList.remove('book-hover');
    stage.classList.add('zooming');
    deskBook.classList.add('opening');
    // Match CSS animation duration ~900ms
    setTimeout(() => {
      window.location.href = `manuscript.html?book=${encodeURIComponent(m.id)}`;
    }, 880);
  }

  deskBook.addEventListener('click', openCurrent);
  deskBook.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCurrent(); }
  });

  // Keyboard navigation in the library
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  changeBy(-1);
    if (e.key === 'ArrowRight') changeBy(+1);
  });

  // First render
  renderCurrent(null);

})();
