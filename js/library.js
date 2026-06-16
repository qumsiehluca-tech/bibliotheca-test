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

  // Preload all cover PNGs so the carousel slides are instant.
  manifests.forEach(m => { const im = new Image(); im.src = `assets/covers/${m.id}.png`; });

  function renderCurrent(direction) {
    const m = manifests[idx];
    deskBook.innerHTML = `<img class="cover-img" src="assets/covers/${m.id}.png" alt="">`;
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

})();
