/* =========================================================
   Bibliotheca Publica Varona — manuscript.js
   Reader: frontispiece, paginated two-page spreads, drop caps,
   TABVLA, keyboard navigation, scroll mode, epilogue prelude.
   ========================================================= */

(async function () {
  'use strict';

  // ---- DOM hooks -----------------------------------------------------
  const reader        = document.getElementById('reader');
  const spread        = document.getElementById('spread');
  const spreadFrame   = document.getElementById('spreadFrame');
  const scrollFrame   = document.getElementById('scrollFrame');
  const scrollColumn  = document.getElementById('scrollColumn');
  const prevBtn       = document.getElementById('prevSpread');
  const nextBtn       = document.getElementById('nextSpread');
  const tabulaBtn     = document.getElementById('tabulaBtn');
  const tabulaOverlay = document.getElementById('tabulaOverlay');
  const tabulaClose   = document.getElementById('tabulaClose');
  const tabulaList    = document.getElementById('tabulaList');
  const backLink      = document.getElementById('backLink');
  const loading       = document.getElementById('readerLoading');
  const modeToggle    = document.getElementById('modeToggle');

  // ---- Resolve book id -----------------------------------------------
  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('book');
  if (!bookId) {
    loading.textContent = 'Liber non electus est.';
    return;
  }

  // ---- Load + parse content ------------------------------------------
  let manifest, content;
  try {
    const result = await Loader.loadContent(bookId);
    manifest = result.manifest;
    content  = Loader.parseContent(result.md);
  } catch (err) {
    console.error(err);
    loading.textContent = 'Liber inveniri non potuit.';
    return;
  }

  document.title = manifest.title || 'Manuscriptum';
  spread.dataset.turnStyle = manifest.turnStyle || 'fade';

  // ---- Wait for Canterbury + body fonts to load ---------------------
  if (document.fonts) {
    try {
      // Force Canterbury and EB Garamond to actually load before measuring
      await Promise.all([
        document.fonts.load('1em "Canterbury"'),
        document.fonts.load('1em "EB Garamond"'),
        document.fonts.load('italic 1em "EB Garamond"'),
        document.fonts.load('1em "Cinzel"'),
        document.fonts.load('1em "Cormorant Garamond"'),
      ]);
      if (document.fonts.ready) await document.fonts.ready;
    } catch (_) { /* fonts may not all be reachable in sandboxes; carry on */ }
  }

  // ---- Build the linear block list ----------------------------------
  // For each chapter, emit { chapter-title, body... }.
  // Insert an Epilogue-Prelude page before any chapter whose title is the
  // Epilogvs, so the reader sees a Latin invitation before reading on.
  const blocks = [];
  const isEpilogueTitle = t => /epilog/i.test(t || '');

  content.chapters.forEach((ch, ci) => {
    if (isEpilogueTitle(ch.title)) {
      blocks.push({ type: 'epilogue-prelude', anchor: `prelude-${ci}` });
    }
    blocks.push({
      type:    'chapter-title',
      title:   ch.title,
      anchor:  `ch-${ci}`,
      isFirst: ci === 0
    });
    ch.blocks.forEach(b => blocks.push(b));
  });
  if (content.chapters.length === 0) {
    content.headBlocks.forEach(b => blocks.push(b));
  }

  const isPlaceholder = content.chapters.length === 0;

  // ---- Page measurement / rendering helpers --------------------------

  function makeMeasureBox() {
    const box = document.createElement('div');
    box.className = 'page recto';
    box.style.position = 'absolute';
    box.style.visibility = 'hidden';
    box.style.pointerEvents = 'none';
    box.style.left = '-10000px';
    box.style.top = '0';
    // overflow:visible so the candidate node's bounding rect bottom truly
    // reflects content extent (not the clipped page).
    box.style.overflow = 'visible';
    return box;
  }

  function sizeMeasureBox(box) {
    // Stub the visible spread so the browser computes its real size under
    // the current grid + viewport constraints; use that as the target.
    spread.innerHTML = '<div class="page verso"></div><div class="page recto"></div>';
    void spread.offsetWidth;
    const recto = spread.querySelector('.page.recto');
    const w = recto.offsetWidth;
    const h = recto.offsetHeight;
    box.style.width  = w + 'px';
    box.style.height = h + 'px';
  }

  function blockToNode(block) {
    if (block.type === 'chapter-title') {
      const wrap = document.createElement('div');
      wrap.className = 'chapter-block';
      const h = document.createElement('div');
      h.className = 'chapter-title';
      h.textContent = block.title;
      h.dataset.anchor = block.anchor;
      wrap.appendChild(h);
      const div = document.createElement('img');
      div.className = 'chapter-divider';
      div.src = 'assets/ornaments/divider.svg';
      div.alt = '';
      wrap.appendChild(div);
      return wrap;
    }
    if (block.type === 'epilogue-prelude') {
      // Whole-page block; we treat it as taller than fits so it always lives
      // on its own page. It's never actually appended to the measure box —
      // see paginate() below where we shunt it directly to its own page.
      const wrap = document.createElement('div');
      wrap.className = 'epilogue-prelude-marker';
      return wrap;
    }
    if (block.type === 'verse') {
      const v = document.createElement('div');
      v.className = 'verse';
      block.lines.forEach(line => {
        const ln = document.createElement('span');
        ln.className = 'verse-line';
        ln.innerHTML = Loader.renderInline(line);
        v.appendChild(ln);
      });
      return v;
    }
    if (block.type === 'paragraph') {
      const p = document.createElement('p');
      p.innerHTML = Loader.renderInline(block.text);
      if (block.dropcap) p.classList.add('chapter-opener');
      if (block.continuation) p.classList.add('continuation');
      return p;
    }
    return document.createTextNode('');
  }

  // ---- Greedy paginator ----------------------------------------------

  function paginate() {
    if (isPlaceholder) return [];

    const measure = makeMeasureBox();
    document.body.appendChild(measure);
    sizeMeasureBox(measure);

    const pages = [];
    let pageBlocks = [];

    // Safety buffer — pull the limit in a few pixels so we never visually
    // overflow due to sub-pixel font / image loading nondeterminism.
    const SAFETY = 6;
    const padBot = parseFloat(getComputedStyle(measure).paddingBottom) || 0;
    const boxR   = measure.getBoundingClientRect();
    const limitY = boxR.bottom - padBot - SAFETY;

    function fits() {
      const last = measure.lastElementChild;
      if (!last) return true;
      return last.getBoundingClientRect().bottom <= limitY + 1;
    }

    const flush = () => {
      if (pageBlocks.length > 0) {
        pages.push(pageBlocks);
        pageBlocks = [];
      }
      measure.innerHTML = '';
    };

    const queue = blocks.slice();

    while (queue.length > 0) {
      const b = queue.shift();

      // Epilogue prelude — always its own page
      if (b.type === 'epilogue-prelude') {
        flush();                 // close out whatever was being built
        pages.push([b]);         // its own dedicated page
        continue;
      }

      // ---- Verse and chapter-title are atomic ----
      if (b.type === 'verse' || b.type === 'chapter-title') {
        const node = blockToNode(b);
        measure.appendChild(node);
        if (!fits()) {
          measure.removeChild(node);
          if (pageBlocks.length === 0) {
            // Even on an empty page it doesn't fit — accept as oversized
            measure.appendChild(node);
            pageBlocks.push(b);
            flush();
          } else {
            flush();
            queue.unshift(b);
          }
          continue;
        }
        // Orphan check for chapter titles
        if (b.type === 'chapter-title' && queue.length > 0 && pageBlocks.length > 0) {
          const next = queue[0];
          let probe;
          if (next.type === 'paragraph') {
            const firstWords = next.text.split(/\s+/).slice(0, 20).join(' ');
            probe = blockToNode({ type: 'paragraph', text: firstWords, dropcap: next.dropcap });
          } else if (next.type === 'verse' || next.type === 'epilogue-prelude') {
            // For verse, peek; for prelude, allow chapter title alone (prelude is own page anyway)
            probe = next.type === 'verse' ? blockToNode(next) : null;
          }
          if (probe) {
            measure.appendChild(probe);
            const stillFits = fits();
            measure.removeChild(probe);
            if (!stillFits) {
              measure.removeChild(node);
              flush();
              queue.unshift(b);
              continue;
            }
          }
        }
        pageBlocks.push(b);
        continue;
      }

      // ---- Paragraph: try whole, otherwise split by word ----
      if (b.type === 'paragraph') {
        const node = blockToNode(b);
        measure.appendChild(node);
        if (fits()) {
          pageBlocks.push(b);
          continue;
        }
        measure.removeChild(node);
        const split = splitParagraphToFit(b, measure, limitY);
        if (split.fitText) {
          const head = {
            type: 'paragraph',
            text: split.fitText,
            dropcap: b.dropcap,
            continuation: b.continuation
          };
          const tail = {
            type: 'paragraph',
            text: split.restText,
            dropcap: false,
            continuation: true    // the remainder is a continuation
          };
          measure.appendChild(blockToNode(head));
          pageBlocks.push(head);
          flush();
          if (split.restText) queue.unshift(tail);
        } else {
          if (pageBlocks.length > 0) {
            flush();
            queue.unshift(b);
          } else {
            // Empty page and not even one word fits — degenerate.
            measure.appendChild(node);
            pageBlocks.push(b);
            flush();
          }
        }
        continue;
      }
    }
    flush();
    document.body.removeChild(measure);
    return pages;
  }

  function splitParagraphToFit(block, measure, limitY) {
    const text = block.text;
    const words = text.split(/(\s+)/);
    const wordIndices = words
      .map((w, i) => (/\S/.test(w) ? i : -1))
      .filter(i => i >= 0);

    if (wordIndices.length === 0) return { fitText: '', restText: '' };

    let lo = 1, hi = wordIndices.length, bestN = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const upToTokenIndex = wordIndices[mid - 1] + 1;
      const candidateText = words.slice(0, upToTokenIndex).join('').replace(/\s+$/, '');
      const candidateNode = blockToNode({
        type: 'paragraph',
        text: candidateText,
        dropcap: block.dropcap,
        continuation: block.continuation
      });
      measure.appendChild(candidateNode);
      const ok = candidateNode.getBoundingClientRect().bottom <= limitY + 1;
      measure.removeChild(candidateNode);
      if (ok) { bestN = mid; lo = mid + 1; }
      else    {              hi = mid - 1; }
    }

    if (bestN === 0) return { fitText: '', restText: text };

    const upToTokenIndex = wordIndices[bestN - 1] + 1;
    const fitText  = words.slice(0, upToTokenIndex).join('').replace(/\s+$/, '');
    const restText = words.slice(upToTokenIndex).join('').replace(/^\s+/, '');
    return { fitText, restText };
  }

  let contentPages = paginate();

  // ---- Build spread list --------------------------------------------
  function buildSpreads() {
    const spreads = [];
    spreads.push({ verso: { type: 'blank' }, recto: { type: 'frontispiece' } });
    if (isPlaceholder) {
      spreads.push({ verso: { type: 'blank' }, recto: { type: 'placeholder' } });
      return spreads;
    }
    for (let i = 0; i < contentPages.length; i += 2) {
      spreads.push({
        verso: { type: 'content', blocks: contentPages[i] },
        recto: { type: 'content', blocks: contentPages[i + 1] || null }
      });
    }
    return spreads;
  }

  let spreads = buildSpreads();
  let currentSpread = 0;

  function toRoman(n) {
    if (n <= 0) return '';
    const M = ['','m','mm','mmm'];
    const C = ['','c','cc','ccc','cd','d','dc','dcc','dccc','cm'];
    const X = ['','x','xx','xxx','xl','l','lx','lxx','lxxx','xc'];
    const I = ['','i','ii','iii','iv','v','vi','vii','viii','ix'];
    return M[Math.floor(n/1000)] +
           C[Math.floor((n%1000)/100)] +
           X[Math.floor((n%100)/10)] +
           I[n%10];
  }

  // ---- Render pages --------------------------------------------------

  function escapeHTML(s) {
    return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  }

  function renderFrontispiece() {
    const f = manifest.frontispiece || {};
    const parts = [];
    if (f.coatOfArms) {
      parts.push(`<img class="coa" src="assets/coat-of-arms.png" alt="">`);
    }
    parts.push(`<h1 class="fp-title">${escapeHTML(manifest.title || '').toUpperCase()}</h1>`);
    if (f.subtitle) parts.push(`<div class="fp-subtitle">${escapeHTML(f.subtitle)}</div>`);
    if (f.date)     parts.push(`<div class="fp-date">${escapeHTML(f.date)}</div>`);
    if (f.footer)   parts.push(`<div class="fp-footer">${escapeHTML(f.footer)}</div>`);
    return parts.join('');
  }

  function renderEpiloguePrelude() {
    return `
      <h2 class="prelude-rubric">Lectori</h2>
      <img class="prelude-divider" src="assets/ornaments/divider.svg" alt="">
      <div class="prelude-body">
        Hic verba mei desinunt.<br>
        Quod sequitur addidit Leo, amicus,<br>
        ut quae mihi postremo acciderint<br>
        oblivioni non traderentur.<br><br>
        Si vis scire, lector, perge in paginam sequentem.
      </div>
      <img class="prelude-fleuron" src="assets/ornaments/fleuron.svg" alt="">
    `;
  }

  function renderPageHTML(page, side, folio) {
    if (!page || page.type === 'blank') {
      return `<div class="page ${side} blank-verso"></div>`;
    }
    if (page.type === 'frontispiece') {
      return `<div class="page ${side} frontispiece">${renderFrontispiece()}</div>`;
    }
    if (page.type === 'placeholder') {
      return `<div class="page ${side} placeholder-page">
        <div class="placeholder-note"><em>Liber nondum scriptus est.</em></div>
      </div>`;
    }
    // Content page (may contain epilogue-prelude marker block)
    if (page.blocks && page.blocks.length === 1 && page.blocks[0].type === 'epilogue-prelude') {
      return `<div class="page ${side} epilogue-prelude">${renderEpiloguePrelude()}</div>`;
    }
    const tmp = document.createElement('div');
    (page.blocks || []).forEach(b => tmp.appendChild(blockToNode(b)));
    const folioHTML = folio ? `<div class="folio">fol. ${folio}</div>` : '';
    return `<div class="page ${side}">${tmp.innerHTML}${folioHTML}</div>`;
  }

  function renderSpread(animateDirection) {
    const sp = spreads[currentSpread];
    if (!sp) return;
    const versoFolio = sp.verso.type === 'content' ? toRoman(currentSpread * 2 - 1) : '';
    const rectoFolio = sp.recto && sp.recto.type === 'content' ? toRoman(currentSpread * 2) : '';
    const versoHTML = renderPageHTML(sp.verso, 'verso', versoFolio);
    const rectoHTML = renderPageHTML(sp.recto, 'recto', rectoFolio);

    if (animateDirection) {
      spread.classList.add('turning-out');
      setTimeout(() => {
        spread.innerHTML = versoHTML + rectoHTML;
        spread.classList.remove('turning-out');
        spread.classList.add('turning-in');
        setTimeout(() => spread.classList.remove('turning-in'), 320);
      }, 230);
    } else {
      spread.innerHTML = versoHTML + rectoHTML;
    }

    prevBtn.disabled = currentSpread <= 0;
    nextBtn.disabled = currentSpread >= spreads.length - 1;
  }

  // ---- Scroll mode rendering ----------------------------------------

  function renderScrollMode() {
    scrollColumn.innerHTML = '';
    // Frontispiece first
    scrollColumn.insertAdjacentHTML('beforeend', renderPageHTML({ type:'frontispiece' }, 'recto', ''));
    if (isPlaceholder) {
      scrollColumn.insertAdjacentHTML('beforeend', renderPageHTML({ type:'placeholder' }, 'recto', ''));
      return;
    }
    // All content pages, in order, each as its own block
    for (let i = 0; i < contentPages.length; i++) {
      scrollColumn.insertAdjacentHTML('beforeend',
        renderPageHTML(
          { type: 'content', blocks: contentPages[i] },
          'recto',
          toRoman(i + 1)
        )
      );
    }
  }

  // ---- TABVLA --------------------------------------------------------
  function buildTabula() {
    tabulaList.innerHTML = '';
    if (content.chapters.length === 0) {
      tabulaBtn.style.display = 'none';
      return;
    }
    content.chapters.forEach((ch, ci) => {
      let pageIdx = -1;
      for (let p = 0; p < contentPages.length; p++) {
        if (contentPages[p].some(b => b.type === 'chapter-title' && b.anchor === `ch-${ci}`)) {
          pageIdx = p; break;
        }
      }
      const spreadIdx = pageIdx >= 0 ? 1 + Math.floor(pageIdx / 2) : 0;
      const folio = pageIdx >= 0 ? toRoman(pageIdx + 1) : '';
      const li = document.createElement('li');
      li.innerHTML = `
        <button type="button" data-spread="${spreadIdx}" data-page="${pageIdx}">${escapeHTML(ch.title)}</button>
        <span class="folio-ref">fol. ${folio}</span>
      `;
      tabulaList.appendChild(li);
    });
  }
  function openTabula()  { tabulaOverlay.classList.add('open'); }
  function closeTabula() { tabulaOverlay.classList.remove('open'); }

  tabulaBtn.addEventListener('click', openTabula);
  tabulaClose.addEventListener('click', closeTabula);
  tabulaOverlay.addEventListener('click', (e) => {
    if (e.target === tabulaOverlay) closeTabula();
  });
  tabulaList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-spread]');
    if (!btn) return;
    const s = parseInt(btn.dataset.spread, 10);
    const p = parseInt(btn.dataset.page, 10);
    closeTabula();
    if (document.body.classList.contains('scroll-mode')) {
      // Jump to the corresponding page in scroll mode
      const pages = scrollColumn.querySelectorAll('.page');
      const target = pages[p + 1]; // +1 because scroll starts with frontispiece
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (!Number.isNaN(s) && s >= 0 && s < spreads.length) {
      currentSpread = s;
      renderSpread('next');
    }
  });

  // ---- Navigation ----------------------------------------------------
  function goNext() {
    if (currentSpread >= spreads.length - 1) return;
    currentSpread++;
    renderSpread('next');
  }
  function goPrev() {
    if (currentSpread <= 0) return;
    currentSpread--;
    renderSpread('prev');
  }
  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  window.addEventListener('keydown', (e) => {
    if (tabulaOverlay.classList.contains('open')) {
      if (e.key === 'Escape') closeTabula();
      return;
    }
    if (document.body.classList.contains('scroll-mode')) {
      // In scroll mode, only handle TABVLA / back / mode toggle
      if (e.key === 'Escape')                  { backLink.click(); }
      else if (e.key === 't' || e.key === 'T') { openTabula(); }
      else if (e.key === 'm' || e.key === 'M') { setMode('codex'); }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowLeft')              { e.preventDefault(); goPrev(); }
    else if (e.key === 'Escape')                 { backLink.click(); }
    else if (e.key === 't' || e.key === 'T')     { openTabula(); }
    else if (e.key === 'm' || e.key === 'M')     { setMode('scroll'); }
  });

  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    reader.classList.add('leaving');
    setTimeout(() => { window.location.href = 'index.html'; }, 880);
  });

  // ---- Mode toggle ---------------------------------------------------
  function setMode(mode /* 'codex' | 'scroll' */) {
    if (mode === 'scroll') {
      document.body.classList.remove('codex-mode');
      document.body.classList.add('scroll-mode');
      modeToggle.textContent = 'scrolla';
      modeToggle.classList.add('active');
      // Render the scroll column if it's not yet populated
      if (scrollColumn.children.length === 0) renderScrollMode();
    } else {
      document.body.classList.remove('scroll-mode');
      document.body.classList.add('codex-mode');
      modeToggle.textContent = 'codex';
      modeToggle.classList.remove('active');
    }
  }
  modeToggle.addEventListener('click', () => {
    setMode(document.body.classList.contains('scroll-mode') ? 'codex' : 'scroll');
  });

  // ---- Resize: re-paginate (debounced) ------------------------------
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const previousChapterIdx = findChapterIdxBySpread(currentSpread);
      contentPages = paginate();
      spreads = buildSpreads();
      if (previousChapterIdx >= 0) {
        for (let p = 0; p < contentPages.length; p++) {
          if (contentPages[p].some(b => b.type === 'chapter-title' && b.anchor === `ch-${previousChapterIdx}`)) {
            currentSpread = 1 + Math.floor(p / 2);
            break;
          }
        }
      }
      if (currentSpread >= spreads.length) currentSpread = spreads.length - 1;
      buildTabula();
      renderSpread(null);
      if (document.body.classList.contains('scroll-mode')) {
        scrollColumn.innerHTML = '';
        renderScrollMode();
      }
    }, 200);
  });

  function findChapterIdxBySpread(spreadIdx) {
    if (spreadIdx === 0) return -1;
    const pageRange = [(spreadIdx - 1) * 2, (spreadIdx - 1) * 2 + 1];
    for (const p of pageRange) {
      if (p < 0 || p >= contentPages.length) continue;
      const ct = contentPages[p].find(b => b.type === 'chapter-title');
      if (ct) {
        const m = ct.anchor.match(/^ch-(\d+)$/);
        if (m) return parseInt(m[1], 10);
      }
    }
    return -1;
  }

  // ---- First render --------------------------------------------------
  buildTabula();
  renderSpread(null);
  loading.classList.add('gone');

})();
