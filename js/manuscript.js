/* =========================================================
   Bibliotheca Publica Varona — manuscript.js
   Reader: frontispiece, paginated two-page spreads, drop caps,
   TABVLA, keyboard + wheel + touch navigation, epilogue prelude.
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

  // ---- Wait for Canterbury + body fonts to actually load ------------
  if (document.fonts) {
    try {
      await Promise.all([
        document.fonts.load('1em "Canterbury"'),
        document.fonts.load('1em "EB Garamond"'),
        document.fonts.load('italic 1em "EB Garamond"'),
        document.fonts.load('600 1em "EB Garamond"'),
        document.fonts.load('1em "Cinzel"'),
        document.fonts.load('1em "Cormorant Garamond"'),
      ]);
      if (document.fonts.ready) await document.fonts.ready;
    } catch (_) { /* sandboxes may block CDN — carry on */ }
  }

  // ---- Build the linear block list ----------------------------------
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
    box.style.overflow = 'visible';
    return box;
  }

  function sizeMeasureBox(box) {
    spread.innerHTML = '<div class="page verso"></div><div class="page recto"></div>';
    void spread.offsetWidth;
    const recto = spread.querySelector('.page.recto');
    box.style.width  = recto.offsetWidth + 'px';
    box.style.height = recto.offsetHeight + 'px';
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
      const wrap = document.createElement('div');
      wrap.className = 'epilogue-prelude-marker';
      return wrap;
    }
    if (block.type === 'rule') {
      const hr = document.createElement('hr');
      return hr;
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
        flush();
        pages.push([b]);
        continue;
      }

      // Verse, chapter-title, rule — atomic
      if (b.type === 'verse' || b.type === 'chapter-title' || b.type === 'rule') {
        const node = blockToNode(b);
        measure.appendChild(node);
        if (!fits()) {
          measure.removeChild(node);
          if (pageBlocks.length === 0) {
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
          let probe = null;
          if (next.type === 'paragraph') {
            const firstWords = next.text.split(/\s+/).slice(0, 20).join(' ');
            probe = blockToNode({ type: 'paragraph', text: firstWords, dropcap: next.dropcap });
          } else if (next.type === 'verse') {
            probe = blockToNode(next);
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

      // Paragraph: try whole, otherwise split by word
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
            continuation: true
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

  function escapeHTML(s) {
    return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  }

  // Lowercase the subtitle (so "LIBRI VII" → "Libri vii" for Canterbury).
  function lowerCanterbury(s) {
    return String(s).toLowerCase();
  }

  function renderFrontispiece() {
    const f = manifest.frontispiece || {};
    const parts = [];
    if (f.coatOfArms) {
      parts.push(`<img class="coa" src="assets/coat-of-arms.png" alt="">`);
    }
    parts.push(`<img class="fp-fleuron" src="assets/ornaments/fleuron.svg" alt="">`);
    // Title — Canterbury, displayed exactly as written in the manifest
    parts.push(`<h1 class="fp-title">${escapeHTML(manifest.title || '')}</h1>`);
    if (f.subtitle) {
      // Subtitle in Canterbury too, lowercased for the blackletter aesthetic
      parts.push(`<div class="fp-subtitle">${escapeHTML(lowerCanterbury(f.subtitle))}</div>`);
    }
    parts.push(`<img class="fp-rule" src="assets/ornaments/divider.svg" alt="">`);
    if (f.date) parts.push(`<div class="fp-date">${escapeHTML(f.date)}</div>`);
    if (f.footer) parts.push(`<div class="fp-footer">${escapeHTML(f.footer)}</div>`);
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
        <button type="button" data-spread="${spreadIdx}">${escapeHTML(ch.title)}</button>
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
    closeTabula();
    if (!Number.isNaN(s) && s >= 0 && s < spreads.length) {
      currentSpread = s;
      renderSpread('next');
    }
  });

  // ---- Page navigation ----------------------------------------------
  let inTurn = false;
  function goNext() {
    if (inTurn || currentSpread >= spreads.length - 1) return;
    inTurn = true;
    currentSpread++;
    renderSpread('next');
    setTimeout(() => { inTurn = false; }, 550);
  }
  function goPrev() {
    if (inTurn || currentSpread <= 0) return;
    inTurn = true;
    currentSpread--;
    renderSpread('prev');
    setTimeout(() => { inTurn = false; }, 550);
  }
  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (tabulaOverlay.classList.contains('open')) {
      if (e.key === 'Escape') closeTabula();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') {
      e.preventDefault(); goNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); goPrev();
    } else if (e.key === 'Escape') {
      backLink.click();
    } else if (e.key === 't' || e.key === 'T') {
      openTabula();
    }
  });

  // ---- Scroll-wheel = turn page (cooldown to avoid skipping) --------
  let wheelCooldown = false;
  function onWheel(e) {
    if (tabulaOverlay.classList.contains('open')) return;
    if (wheelCooldown) { e.preventDefault(); return; }
    // Ignore very small/zero deltas (trackpad jitter)
    if (Math.abs(e.deltaY) < 8 && Math.abs(e.deltaX) < 8) return;
    e.preventDefault();
    const forward = (Math.abs(e.deltaY) >= Math.abs(e.deltaX))
                    ? e.deltaY > 0
                    : e.deltaX > 0;
    if (forward) goNext(); else goPrev();
    wheelCooldown = true;
    setTimeout(() => { wheelCooldown = false; }, 650);
  }
  window.addEventListener('wheel', onWheel, { passive: false });

  // ---- Touch swipe -------------------------------------------------
  let touchStartY = null, touchStartX = null;
  spreadFrame.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
    }
  }, { passive: true });
  spreadFrame.addEventListener('touchend', (e) => {
    if (touchStartY == null) return;
    const t = e.changedTouches[0];
    const dy = t.clientY - touchStartY;
    const dx = t.clientX - touchStartX;
    const absY = Math.abs(dy), absX = Math.abs(dx);
    if (Math.max(absY, absX) > 48) {
      const forward = (absY > absX) ? dy < 0 : dx < 0;  // swipe up OR left = next
      if (forward) goNext(); else goPrev();
    }
    touchStartY = null;
    touchStartX = null;
  }, { passive: true });

  // ---- Back to library --------------------------------------------
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    reader.classList.add('leaving');
    setTimeout(() => { window.location.href = 'index.html'; }, 880);
  });

  // ---- Resize: re-paginate (debounced) -----------------------------
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

  // ---- First render -----------------------------------------------
  buildTabula();
  renderSpread(null);
  loading.classList.add('gone');

})();
