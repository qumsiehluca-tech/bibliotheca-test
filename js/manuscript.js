/* =========================================================
   Bibliotheca Publica Varona — manuscript.js
   ========================================================= */

(async function () {
  'use strict';

  const reader        = document.getElementById('reader');
  const spread        = document.getElementById('spread');
  const spreadFrame   = document.getElementById('spreadFrame');
  const docFrame      = document.getElementById('docFrame');
  const docColumn     = document.getElementById('docColumn');
  const prevBtn       = document.getElementById('prevSpread');
  const nextBtn       = document.getElementById('nextSpread');
  const tabulaBtn     = document.getElementById('tabulaBtn');
  const tabulaOverlay = document.getElementById('tabulaOverlay');
  const tabulaClose   = document.getElementById('tabulaClose');
  const tabulaList    = document.getElementById('tabulaList');
  const backLink      = document.getElementById('backLink');
  const loading       = document.getElementById('readerLoading');
  const modeToggle    = document.getElementById('modeToggle');

  const params = new URLSearchParams(window.location.search);
  const bookId = params.get('book');
  if (!bookId) {
    loading.textContent = 'Liber non electus est.';
    return;
  }

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

  if (document.fonts) {
    try {
      await Promise.all([
        document.fonts.load('1em "Canterbury"'),
        document.fonts.load('1em "EB Garamond"'),
        document.fonts.load('italic 1em "EB Garamond"'),
        document.fonts.load('600 1em "EB Garamond"'),
      ]);
      if (document.fonts.ready) await document.fonts.ready;
    } catch (_) {}
  }

  // ---- Build the block list ------------------------------------------
  const blocks = [];
  const isEpilogueTitle = t => /epilog/i.test(t || '');

  content.chapters.forEach((ch, ci) => {
    if (isEpilogueTitle(ch.title)) {
      blocks.push({ type: 'epilogue-prelude', anchor: `prelude-${ci}` });
    }
    blocks.push({ type: 'chapter-title', title: ch.title, anchor: `ch-${ci}`, isFirst: ci === 0 });
    ch.blocks.forEach(b => blocks.push(b));
  });
  if (content.chapters.length === 0) {
    content.headBlocks.forEach(b => blocks.push(b));
  }

  const isPlaceholder = content.chapters.length === 0;

  // ---- Measurement helpers ------------------------------------------

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
      return document.createElement('hr');
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

  // ---- Paginator (for codex mode) -----------------------------------

  function paginate() {
    if (isPlaceholder) return [];

    const measure = makeMeasureBox();
    document.body.appendChild(measure);
    sizeMeasureBox(measure);

    const pages = [];
    let pageBlocks = [];

    const SAFETY = 18;
    const padBot = parseFloat(getComputedStyle(measure).paddingBottom) || 0;
    const boxR   = measure.getBoundingClientRect();
    const limitY = boxR.bottom - padBot - SAFETY;

    function fits() {
      const last = measure.lastElementChild;
      if (!last) return true;
      return last.getBoundingClientRect().bottom <= limitY + 1;
    }
    const flush = () => {
      if (pageBlocks.length > 0) { pages.push(pageBlocks); pageBlocks = []; }
      measure.innerHTML = '';
    };

    const queue = blocks.slice();

    while (queue.length > 0) {
      const b = queue.shift();

      if (b.type === 'epilogue-prelude') {
        flush();
        pages.push([b]);
        continue;
      }

      if (b.type === 'verse' || b.type === 'chapter-title' || b.type === 'rule') {
        // CHAPTER TITLES ALWAYS BEGIN A NEW PAGE (except at the start
        // of the book, where the page is already empty).
        if (b.type === 'chapter-title' && pageBlocks.length > 0) {
          flush();
          queue.unshift(b);
          continue;
        }

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
            type: 'paragraph', text: split.fitText,
            dropcap: b.dropcap, continuation: b.continuation
          };
          const tail = {
            type: 'paragraph', text: split.restText,
            dropcap: false, continuation: true
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
    const wordIndices = words.map((w, i) => (/\S/.test(w) ? i : -1)).filter(i => i >= 0);
    if (wordIndices.length === 0) return { fitText: '', restText: '' };

    let lo = 1, hi = wordIndices.length, bestN = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const upToTokenIndex = wordIndices[mid - 1] + 1;
      const candidateText = words.slice(0, upToTokenIndex).join('').replace(/\s+$/, '');
      const candidateNode = blockToNode({
        type: 'paragraph', text: candidateText,
        dropcap: block.dropcap, continuation: block.continuation
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

  // ---- Even out short section-ending pages ---------------------------
  // "Each chapter starts a new page" can leave an orphan line or two on the
  // page that ends the previous section. Real books avoid that. When a
  // section's final page is very short, we re-flow that section's last two
  // pages so the text splits evenly across both — no orphan lines, no
  // half-empty page before a new Liber.
  function rebalanceSectionEnds() {
    // Identify the index of every page that contains a chapter-title.
    const chapterPageIdx = new Set();
    contentPages.forEach((pg, i) => {
      if (pg.some(b => b.type === 'chapter-title')) chapterPageIdx.add(i);
    });

    const measure = makeMeasureBox();
    document.body.appendChild(measure);
    sizeMeasureBox(measure);
    const padBot = parseFloat(getComputedStyle(measure).paddingBottom) || 0;
    const boxR = measure.getBoundingClientRect();
    const limitY = boxR.bottom - padBot - 10;
    const fullHeight = limitY - boxR.top;

    function pageContentHeight(blocks) {
      measure.innerHTML = '';
      blocks.forEach(b => measure.appendChild(blockToNode(b)));
      const last = measure.lastElementChild;
      if (!last) return 0;
      return last.getBoundingClientRect().bottom - boxR.top;
    }
    function blocksAreSplittable(blocks) {
      // Only safe to re-flow plain paragraph runs (no chapter title / verse
      // / rule, which have their own placement rules).
      return blocks.every(b => b.type === 'paragraph');
    }

    // Walk sections: a section ends at the page just before a chapter page
    // (or the final page). For each section-ending page that is short and
    // preceded by a full page of plain paragraphs, re-flow the two together.
    for (let i = 1; i < contentPages.length; i++) {
      const isLastOfSection =
        chapterPageIdx.has(i + 1) || i === contentPages.length - 1;
      if (!isLastOfSection) continue;
      if (chapterPageIdx.has(i)) continue; // page itself starts a chapter

      const endPage = contentPages[i];
      const prevPage = contentPages[i - 1];
      if (chapterPageIdx.has(i - 1)) continue; // prev page opens a chapter — leave it

      const endHeight = pageContentHeight(endPage);
      // Short = under 45% of the text block.
      if (endHeight > fullHeight * 0.45) continue;
      if (!blocksAreSplittable(endPage) || !blocksAreSplittable(prevPage)) continue;

      // Combine the two pages' blocks. If the last paragraph of prevPage was
      // split (its continuation is the first block of endPage), merge them
      // back into one paragraph so the re-flow doesn't leave a short tail.
      const prevCopy = prevPage.slice();
      const endCopy = endPage.slice();
      if (
        endCopy.length > 0 && endCopy[0].type === 'paragraph' && endCopy[0].continuation &&
        prevCopy.length > 0 && prevCopy[prevCopy.length - 1].type === 'paragraph'
      ) {
        const head = prevCopy[prevCopy.length - 1];
        const tail = endCopy.shift();
        prevCopy[prevCopy.length - 1] = {
          type: 'paragraph',
          text: head.text + ' ' + tail.text,
          dropcap: head.dropcap,
          continuation: head.continuation,
        };
      }
      const combined = prevCopy.concat(endCopy);

      // Re-flow combined across two pages. Aim to fill the FIRST page to the
      // halfway point of the combined text, splitting a paragraph mid-way if
      // needed, so both pages are about equally full. Never exceed the hard
      // page limit on the first page.
      const totalHeight = pageContentHeight(combined);
      const target = boxR.top + totalHeight / 2;

      const first = [];
      const second = [];
      measure.innerHTML = '';
      const queue2 = combined.slice();
      let filledFirst = false;

      while (queue2.length > 0) {
        const b = queue2.shift();
        if (filledFirst) { second.push(b); continue; }

        const node = blockToNode(b);
        measure.appendChild(node);
        const bottom = node.getBoundingClientRect().bottom;

        if (bottom <= target || first.length === 0) {
          // Still under the halfway target (or first block) — keep on page 1,
          // but make sure we never blow past the hard limit.
          if (bottom > limitY && first.length > 0) {
            // Overflowed the physical page — split this paragraph.
            measure.removeChild(node);
            if (b.type === 'paragraph') {
              const split = splitParagraphToFit(b, measure, limitY);
              if (split.fitText) {
                first.push({ type:'paragraph', text:split.fitText, dropcap:b.dropcap, continuation:b.continuation });
                if (split.restText)
                  second.push({ type:'paragraph', text:split.restText, dropcap:false, continuation:true });
              } else {
                second.push(b);
              }
            } else {
              second.push(b);
            }
            filledFirst = true;
          } else {
            first.push(b);
          }
        } else {
          // Crossed the halfway target — split the paragraph here so page 1
          // ends near the midpoint instead of dumping the whole block over.
          measure.removeChild(node);
          if (b.type === 'paragraph') {
            const split = splitParagraphToFit(b, measure, target);
            if (split.fitText) {
              first.push({ type:'paragraph', text:split.fitText, dropcap:b.dropcap, continuation:b.continuation });
              if (split.restText)
                second.push({ type:'paragraph', text:split.restText, dropcap:false, continuation:true });
            } else {
              second.push(b);
            }
          } else {
            second.push(b);
          }
          filledFirst = true;
        }
      }

      if (first.length > 0 && second.length > 0) {
        // Safety: make sure the SECOND page actually fits on one page. If the
        // re-flow would overflow it, abort this rebalance and leave the
        // original pagination untouched (a short section-end page is better
        // than an overflowing one). Leave one line of clearance so the final
        // line never grazes the bottom margin.
        const lineH = parseFloat(getComputedStyle(measure).lineHeight) || 24;
        const safeLimit = (limitY - boxR.top) - lineH;
        const firstFits  = pageContentHeight(first)  <= safeLimit;
        const secondFits = pageContentHeight(second) <= safeLimit;
        if (firstFits && secondFits) {
          contentPages[i - 1] = first;
          contentPages[i] = second;
        }
      }
    }
    document.body.removeChild(measure);
  }
  rebalanceSectionEnds();

  // ---- Spread list ---------------------------------------------------
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

  // ---- Roman helpers + HTML escape -----------------------------------
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

  // ---- Frontispiece + prelude rendering ------------------------------
  function renderFrontispiece() {
    const f = manifest.frontispiece || {};
    const parts = [];
    if (f.coatOfArms) {
      parts.push(`<img class="coa" src="assets/coat-of-arms.png" alt="">`);
    }
    parts.push(`<img class="fp-fleuron" src="assets/ornaments/fleuron.svg" alt="">`);
    parts.push(`<h1 class="fp-title">${escapeHTML(manifest.title || '')}</h1>`);
    if (f.subtitle) {
      const sub = String(f.subtitle).toLowerCase();
      parts.push(`<div class="fp-subtitle">${escapeHTML(sub)}</div>`);
    }
    parts.push(`<img class="fp-rule" src="assets/ornaments/divider.svg" alt="">`);
    if (f.date)   parts.push(`<div class="fp-date">${escapeHTML(f.date)}</div>`);
    if (f.footer) parts.push(`<div class="fp-footer">${escapeHTML(f.footer)}</div>`);
    return parts.join('');
  }

  function renderEpiloguePrelude() {
    return `
      <h2 class="prelude-rubric">Lectori</h2>
      <img class="prelude-divider" src="assets/ornaments/divider.svg" alt="">
      <div class="prelude-body">
        Hic finit historia Gaii.<br><br>
        Cetera alter scripsit tibi, lectori,<br>
        in pagina proxima.
      </div>
      <img class="prelude-fleuron" src="assets/ornaments/fleuron.svg" alt="">
    `;
  }

  // ---- Spread balance ------------------------------------------------
  // Pagination + the section-end rebalance already make every page full
  // with perfectly uniform paragraph spacing (Google-Docs-like). We do NOT
  // stretch gaps between paragraphs — that always looks broken. This just
  // clears any stale inline margins from a previous render.
  function balanceSpread(spreadEl) {
    spreadEl.querySelectorAll('p, .verse, .chapter-block').forEach(el => {
      el.style.marginBottom = '';
    });
  }

  // ---- Codex rendering -----------------------------------------------
  function renderPageHTML(page, side, folio) {
    if (!page || page.type === 'blank') return `<div class="page ${side} blank-verso"></div>`;
    if (page.type === 'frontispiece') return `<div class="page ${side} frontispiece">${renderFrontispiece()}</div>`;
    if (page.type === 'placeholder') return `<div class="page ${side} placeholder-page">
        <div class="placeholder-note"><em>Liber nondum scriptus est.</em></div>
      </div>`;
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
        requestAnimationFrame(() => balanceSpread(spread));
        setTimeout(() => spread.classList.remove('turning-in'), 320);
      }, 230);
    } else {
      spread.innerHTML = versoHTML + rectoHTML;
      requestAnimationFrame(() => balanceSpread(spread));
    }

    prevBtn.disabled = currentSpread <= 0;
    nextBtn.disabled = currentSpread >= spreads.length - 1;
  }

  // ---- Doc-view rendering --------------------------------------------
  // scriptum = the SAME paginated folios from codex mode, stacked top-to-
  // bottom in a scrollable column. Looks like the codex's individual pages
  // taken out of the spread and lined up — easy on memory because we reuse
  // the same paginated chunks instead of rendering all chapters as one
  // giant page.
  function renderDocMode() {
    if (docColumn.children.length > 0) return;

    // Frontispiece
    const fp = document.createElement('div');
    fp.className = 'page recto frontispiece doc-folio';
    fp.innerHTML = renderFrontispiece();
    docColumn.appendChild(fp);

    if (isPlaceholder) {
      const ph = document.createElement('div');
      ph.className = 'page recto placeholder-page doc-folio';
      ph.innerHTML = '<div class="placeholder-note"><em>Liber nondum scriptus est.</em></div>';
      docColumn.appendChild(ph);
      return;
    }

    // Every paginated folio, one after another
    for (let i = 0; i < contentPages.length; i++) {
      const blocks = contentPages[i];
      const isPrelude =
        blocks.length === 1 && blocks[0].type === 'epilogue-prelude';
      const page = document.createElement('div');
      page.className = 'page recto doc-folio';
      if (isPrelude) {
        page.classList.add('epilogue-prelude');
        page.innerHTML = renderEpiloguePrelude();
      } else {
        blocks.forEach(b => page.appendChild(blockToNode(b)));
        const folio = document.createElement('div');
        folio.className = 'folio';
        folio.textContent = `fol. ${toRoman(i + 1)}`;
        page.appendChild(folio);
      }
      docColumn.appendChild(page);
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
        <button type="button" data-spread="${spreadIdx}" data-chapter="${ci}">${escapeHTML(ch.title)}</button>
        <span class="folio-ref">fol. ${folio}</span>
      `;
      tabulaList.appendChild(li);
    });
  }
  const openTabula  = () => tabulaOverlay.classList.add('open');
  const closeTabula = () => tabulaOverlay.classList.remove('open');

  tabulaBtn.addEventListener('click', openTabula);
  tabulaClose.addEventListener('click', closeTabula);
  tabulaOverlay.addEventListener('click', (e) => { if (e.target === tabulaOverlay) closeTabula(); });
  tabulaList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-spread]');
    if (!btn) return;
    const s = parseInt(btn.dataset.spread, 10);
    const ci = parseInt(btn.dataset.chapter, 10);
    closeTabula();
    if (document.body.classList.contains('doc-mode')) {
      // Find the chapter title heading in the doc page and scroll to it
      const headings = docColumn.querySelectorAll('.chapter-title');
      const ch = content.chapters[ci];
      if (ch) {
        for (const h of headings) {
          if (h.textContent === ch.title) {
            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
            break;
          }
        }
      }
    } else if (!Number.isNaN(s) && s >= 0 && s < spreads.length) {
      currentSpread = s;
      renderSpread('next');
    }
  });

  // ---- Codex navigation ----------------------------------------------
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

  // ---- Keyboard ------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (tabulaOverlay.classList.contains('open')) {
      if (e.key === 'Escape') closeTabula();
      return;
    }
    if (document.body.classList.contains('doc-mode')) {
      if (e.key === 'Escape')                  backLink.click();
      else if (e.key === 't' || e.key === 'T') openTabula();
      else if (e.key === 'm' || e.key === 'M') setMode('codex');
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
    } else if (e.key === 'm' || e.key === 'M') {
      setMode('doc');
    }
  });

  // ---- Wheel: in codex mode it turns pages; in doc mode the browser scrolls --
  let wheelCooldown = false;
  function onWheel(e) {
    if (document.body.classList.contains('doc-mode')) return;  // let docFrame scroll naturally
    if (tabulaOverlay.classList.contains('open')) return;
    if (wheelCooldown) { e.preventDefault(); return; }
    if (Math.abs(e.deltaY) < 8 && Math.abs(e.deltaX) < 8) return;
    e.preventDefault();
    const forward = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY > 0 : e.deltaX > 0;
    if (forward) goNext(); else goPrev();
    wheelCooldown = true;
    setTimeout(() => { wheelCooldown = false; }, 650);
  }
  window.addEventListener('wheel', onWheel, { passive: false });

  // ---- Touch swipe (codex mode only) --------------------------------
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
      const forward = absY > absX ? dy < 0 : dx < 0;
      if (forward) goNext(); else goPrev();
    }
    touchStartY = null; touchStartX = null;
  }, { passive: true });

  // ---- Back to library ----------------------------------------------
  backLink.addEventListener('click', (e) => {
    e.preventDefault();
    reader.classList.add('leaving');
    setTimeout(() => { window.location.href = 'index.html'; }, 880);
  });

  // ---- Mode toggle --------------------------------------------------
  function setMode(mode) {
    if (mode === 'doc') {
      document.body.classList.remove('codex-mode');
      document.body.classList.add('doc-mode');
      modeToggle.textContent = 'scriptum';
      modeToggle.classList.add('active');
      renderDocMode();
    } else {
      document.body.classList.remove('doc-mode');
      document.body.classList.add('codex-mode');
      modeToggle.textContent = 'codex';
      modeToggle.classList.remove('active');
    }
  }
  modeToggle.addEventListener('click', () => {
    setMode(document.body.classList.contains('doc-mode') ? 'codex' : 'doc');
  });

  // ---- Resize: re-paginate codex (debounced) ------------------------
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const previousChapterIdx = findChapterIdxBySpread(currentSpread);
      contentPages = paginate();
      rebalanceSectionEnds();
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

  // ---- First render -------------------------------------------------
  buildTabula();
  renderSpread(null);
  loading.classList.add('gone');

})();
