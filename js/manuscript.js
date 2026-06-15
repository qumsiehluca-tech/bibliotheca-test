/* =========================================================
   Bibliotheca Publica Varona — manuscript.js
   Reader: frontispiece, paginated two-page spreads, drop caps,
   TABVLA, keyboard navigation, reverse transition home.
   ========================================================= */

(async function () {
  'use strict';

  // ---- DOM hooks -----------------------------------------------------
  const reader        = document.getElementById('reader');
  const spread        = document.getElementById('spread');
  const spreadFrame   = document.getElementById('spreadFrame');
  const prevBtn       = document.getElementById('prevSpread');
  const nextBtn       = document.getElementById('nextSpread');
  const tabulaBtn     = document.getElementById('tabulaBtn');
  const tabulaOverlay = document.getElementById('tabulaOverlay');
  const tabulaClose   = document.getElementById('tabulaClose');
  const tabulaList    = document.getElementById('tabulaList');
  const backLink      = document.getElementById('backLink');
  const loading       = document.getElementById('readerLoading');

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

  // ---- Wait for fonts to load (so pagination measures correctly) -----
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch (_) { /* ignore */ }
  }

  // ---- Build the linear block list ----------------------------------
  // Page 0 = blank verso, Page 1 = frontispiece (fixed first spread).
  // Then content pages start at page index 2.

  /** @type {Array<Object>} ordered list of content blocks */
  const blocks = [];

  // For each chapter, we emit:
  //   { type: 'chapter-title', title, anchor, isFirst }
  //   then its body blocks (paragraph | verse)
  //
  // If the content has no chapters (placeholder), we just emit the body.
  content.chapters.forEach((ch, ci) => {
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

  // ---- Detect placeholder books --------------------------------------
  // A placeholder content.md has no `## Liber X` headings and renders the
  // single italic line on its own centred page.
  const isPlaceholder = content.chapters.length === 0;

  // ---- Greedy paginator ----------------------------------------------
  // Build pages by appending block DOM into a measuring container the same
  // size as a visible page and detecting overflow.

  function makeMeasureBox() {
    const box = document.createElement('div');
    box.className = 'page recto';
    // Position off-screen but laid out normally so measurements work.
    box.style.position = 'absolute';
    box.style.visibility = 'hidden';
    box.style.pointerEvents = 'none';
    box.style.left = '-10000px';
    box.style.top  = '0';
    // CRITICAL: the visible .page has `overflow: hidden`, which combined with
    // `display: flex` can stop `scrollHeight` from growing past clientHeight
    // (defeating overflow detection). Allow overflow here so scrollHeight
    // reports the true unclipped content height of the same flex layout.
    box.style.overflow = 'visible';
    return box;
  }

  function sizeMeasureBox(box) {
    // Render a real (visible-DOM) spread shell first to discover what size the
    // browser will give it under all the grid/aspect-ratio constraints; use
    // that as our authoritative measurement target.
    spread.innerHTML = '<div class="page verso"></div><div class="page recto"></div>';
    // Force layout flush
    void spread.offsetWidth;
    const recto = spread.querySelector('.page.recto');
    const w = recto.offsetWidth;
    const h = recto.offsetHeight;
    box.style.width  = w + 'px';
    box.style.height = h + 'px';
  }

  function blockToNode(block, opts) {
    opts = opts || {};
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
      let html = Loader.renderInline(block.text);
      if (block.dropcap) {
        // Wrap the first letter in a dropcap image.
        const m = html.match(/^([^A-Za-zĀ-ž])*([A-Za-z])/);
        if (m) {
          const letter = m[2].toUpperCase();
          const before = m[0].slice(0, m[0].length - 1);
          html =
            `${before}<img class="dropcap" data-letter="${letter}" ` +
            `src="assets/dropcaps/${letter}.svg" alt="${letter}">` +
            html.slice(m[0].length);
        }
      }
      p.innerHTML = html;
      return p;
    }
    return document.createTextNode('');
  }

  function paginate() {
    if (isPlaceholder) {
      // Placeholders bypass pagination entirely (handled by buildSpreads).
      return [];
    }

    const measure = makeMeasureBox();
    document.body.appendChild(measure);
    sizeMeasureBox(measure);

    const pages = [];
    let pageBlocks = [];
    // Determine the y-coordinate above which children must end. We measure
    // by actual rendered position rather than scrollHeight, because scrollHeight
    // on a flex-column container with overflow set doesn't track content extent
    // when content fits — it stays pinned near clientHeight.
    const padBot = parseFloat(getComputedStyle(measure).paddingBottom) || 0;
    function fits() {
      const last = measure.lastElementChild;
      if (!last) return true;
      const boxR  = measure.getBoundingClientRect();
      const lastR = last.getBoundingClientRect();
      return lastR.bottom <= (boxR.bottom - padBot + 1);
    }

    const flush = () => {
      if (pageBlocks.length > 0) {
        pages.push(pageBlocks);
        pageBlocks = [];
      }
      measure.innerHTML = '';
    };

    // Queue allows pushing split-off paragraph remainders back to the front.
    const queue = blocks.slice();

    while (queue.length > 0) {
      const b = queue.shift();

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
            queue.unshift(b);  // retry on a fresh page
          }
          continue;
        }
        // Orphan check for chapter titles: ensure the FOLLOWING block can also
        // begin on this page (at least its first lines). Otherwise push the
        // chapter title to the next page where it can host its body.
        if (b.type === 'chapter-title' && queue.length > 0 && pageBlocks.length > 0) {
          const next = queue[0];
          let probe;
          if (next.type === 'paragraph') {
            // Probe with just the first ~20 words of the next paragraph
            const firstWords = next.text.split(/\s+/).slice(0, 20).join(' ');
            probe = blockToNode({ type: 'paragraph', text: firstWords, dropcap: next.dropcap });
          } else {
            probe = blockToNode(next);
          }
          measure.appendChild(probe);
          const stillFits = fits();
          measure.removeChild(probe);
          if (!stillFits) {
            // Orphan would form — move chapter title to next page
            measure.removeChild(node);
            flush();
            queue.unshift(b);
            continue;
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
        // Doesn't fit whole — find longest word-bounded prefix that does
        measure.removeChild(node);
        const split = splitParagraphToFit(b, measure);
        if (split.fitText) {
          const head = { type: 'paragraph', text: split.fitText, dropcap: b.dropcap };
          const tail = { type: 'paragraph', text: split.restText, dropcap: false };
          measure.appendChild(blockToNode(head));
          pageBlocks.push(head);
          flush();
          if (split.restText) queue.unshift(tail);
        } else {
          // Couldn't fit even one word on current page — flush and retry the whole paragraph
          if (pageBlocks.length > 0) {
            flush();
            queue.unshift(b);
          } else {
            // Empty page and not even one word fits — degenerate, accept oversized
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

  // Binary search the longest word-bounded prefix of `block.text` that fits in
  // the remaining space of `measure` (i.e. given whatever is already appended).
  function splitParagraphToFit(block, measure) {
    const text = block.text;
    const words = text.split(/(\s+)/);                 // keep separator tokens
    const wordIndices = words
      .map((w, i) => (/\S/.test(w) ? i : -1))
      .filter(i => i >= 0);

    if (wordIndices.length === 0) return { fitText: '', restText: '' };

    const padBot = parseFloat(getComputedStyle(measure).paddingBottom) || 0;
    const boxR   = measure.getBoundingClientRect();
    const limitY = boxR.bottom - padBot + 1;

    let lo = 1;
    let hi = wordIndices.length;
    let bestN = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const upToTokenIndex = wordIndices[mid - 1] + 1;
      const candidateText = words.slice(0, upToTokenIndex).join('').replace(/\s+$/, '');
      const candidateNode = blockToNode({ type: 'paragraph', text: candidateText, dropcap: block.dropcap });
      measure.appendChild(candidateNode);
      const ok = candidateNode.getBoundingClientRect().bottom <= limitY;
      measure.removeChild(candidateNode);
      if (ok) {
        bestN = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (bestN === 0) return { fitText: '', restText: text };

    const upToTokenIndex = wordIndices[bestN - 1] + 1;
    const fitText  = words.slice(0, upToTokenIndex).join('').replace(/\s+$/, '');
    const restText = words.slice(upToTokenIndex).join('').replace(/^\s+/, '');
    return { fitText, restText };
  }

  let contentPages = paginate();

  // ---- Build the spread list ----------------------------------------
  // Spread structure:
  //  - Spread 0: blank verso, frontispiece recto
  //  - Spread 1..: pairs of content pages [verso, recto]
  // If odd content pages, append a blank to round out the last spread.

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

  // Roman numeral helper (for folio numbers — lowercase)
  function toRoman(n) {
    if (n <= 0) return '';
    const M  = ['', 'm','mm','mmm'];
    const C  = ['', 'c','cc','ccc','cd','d','dc','dcc','dccc','cm'];
    const X  = ['', 'x','xx','xxx','xl','l','lx','lxx','lxxx','xc'];
    const I  = ['', 'i','ii','iii','iv','v','vi','vii','viii','ix'];
    return M[Math.floor(n/1000)] +
           C[Math.floor((n%1000)/100)] +
           X[Math.floor((n%100)/10)] +
           I[n%10];
  }

  // ---- Render --------------------------------------------------------

  function renderFrontispiece() {
    const f = manifest.frontispiece || {};
    const parts = [];
    if (f.coatOfArms) {
      parts.push(`<img class="coa" src="assets/coat-of-arms.svg" alt="">`);
    }
    parts.push(`<h1 class="fp-title">${escapeHTML(manifest.title || '').toUpperCase()}</h1>`);
    if (f.subtitle) parts.push(`<div class="fp-subtitle">${escapeHTML(f.subtitle)}</div>`);
    if (f.date)     parts.push(`<div class="fp-date">${escapeHTML(f.date)}</div>`);
    if (f.footer)   parts.push(`<div class="fp-footer">${escapeHTML(f.footer)}</div>`);
    return parts.join('');
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  }

  function renderSpread(animateDirection /* 'next' | 'prev' | null */) {
    const sp = spreads[currentSpread];
    if (!sp) return;

    // Folio numbers: spread 0 has none (frontispiece). Content starts at fol. i.
    const versoFolio = sp.verso.type === 'content' ? toRoman(currentSpread * 2 - 1) : '';
    const rectoFolio = sp.recto && sp.recto.type === 'content' ? toRoman(currentSpread * 2) : '';

    // Build the two page HTMLs
    const versoHTML = renderPageHTML(sp.verso, 'verso', versoFolio);
    const rectoHTML = renderPageHTML(sp.recto, 'recto', rectoFolio);

    if (animateDirection) {
      spread.classList.add('turning-out');
      setTimeout(() => {
        spread.innerHTML = versoHTML + rectoHTML;
        spread.classList.remove('turning-out');
        spread.classList.add('turning-in');
        // Clear after
        setTimeout(() => spread.classList.remove('turning-in'), 320);
      }, 230);
    } else {
      spread.innerHTML = versoHTML + rectoHTML;
    }

    prevBtn.disabled = currentSpread <= 0;
    nextBtn.disabled = currentSpread >= spreads.length - 1;
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
    // Content page — render blocks into a transient container to get HTML.
    const tmp = document.createElement('div');
    (page.blocks || []).forEach(b => tmp.appendChild(blockToNode(b)));
    const folioHTML = folio ? `<div class="folio">fol. ${folio}</div>` : '';
    return `<div class="page ${side}">${tmp.innerHTML}${folioHTML}</div>`;
  }

  // ---- TABVLA --------------------------------------------------------

  function buildTabula() {
    tabulaList.innerHTML = '';
    if (content.chapters.length === 0) {
      // Placeholder books have no chapters — hide the TABVLA button entirely.
      tabulaBtn.style.display = 'none';
      return;
    }
    content.chapters.forEach((ch, ci) => {
      // Find which spread contains this chapter's title.
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
        <button type="button" data-spread="${spreadIdx}">${escapeHTML(ch.title)}</button>
        <span class="folio-ref">fol. ${folio}</span>
      `;
      tabulaList.appendChild(li);
    });
  }

  function openTabula() { tabulaOverlay.classList.add('open'); }
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
    if (!Number.isNaN(s) && s >= 0 && s < spreads.length) {
      currentSpread = s;
      closeTabula();
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
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); goNext(); }
    else if (e.key === 'ArrowLeft')              { e.preventDefault(); goPrev(); }
    else if (e.key === 'Escape')                 { backLink.click(); }
    else if (e.key === 't' || e.key === 'T')     { openTabula(); }
  });

  // Reverse transition on going back home
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    reader.classList.add('leaving');
    setTimeout(() => { window.location.href = 'index.html'; }, 880);
  });

  // ---- Resize: re-paginate (debounced) -------------------------------
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const previousChapterIdx = findChapterIdxBySpread(currentSpread);
      contentPages = paginate();
      spreads = buildSpreads();
      // Try to land on the same chapter the user was reading
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
