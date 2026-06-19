/* =========================================================
   Bibliotheca Publica Varona — manuscript.js
   Pagination engine: paged.js (W3C Paged Media polyfill).
   The whole book is rendered as one continuous HTML flow and
   handed to paged.js, which fragments it into correctly-filled
   book pages (native widow/orphan/fill/fragmentation). Both the
   codex (two-up spread) and scriptum (vertical scroll) modes
   render from that SAME set of paged pages, so they are always
   identical in how the text falls.
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
  if (!bookId) { loading.textContent = 'Liber non electus est.'; return; }

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

  const isPlaceholder = content.chapters.length === 0;
  const isEpilogueTitle = t => /epilog/i.test(t || '');

  // ---- Helpers -------------------------------------------------------
  function toRoman(n) {
    if (n <= 0) return '';
    const M=['','m','mm','mmm'], C=['','c','cc','ccc','cd','d','dc','dcc','dccc','cm'],
          X=['','x','xx','xxx','xl','l','lx','lxx','lxxx','xc'], I=['','i','ii','iii','iv','v','vi','vii','viii','ix'];
    return M[Math.floor(n/1000)]+C[Math.floor((n%1000)/100)]+X[Math.floor((n%100)/10)]+I[n%10];
  }
  function escapeHTML(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

  // ---- Frontispiece + prelude ---------------------------------------
  function renderFrontispiece() {
    const f = manifest.frontispiece || {};
    const parts = [];
    if (f.coatOfArms) parts.push(`<img class="coa" src="assets/coat-of-arms.png" alt="">`);
    parts.push(`<img class="fp-fleuron" src="assets/ornaments/fleuron.svg" alt="">`);
    parts.push(`<h1 class="fp-title">${escapeHTML(manifest.title || '')}</h1>`);
    if (f.subtitle) parts.push(`<div class="fp-subtitle">${escapeHTML(String(f.subtitle).toLowerCase())}</div>`);
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
      <img class="prelude-fleuron" src="assets/ornaments/fleuron.svg" alt="">`;
  }

  // ---- Build the continuous book flow that paged.js fragments --------
  function buildFlowHTML() {
    const out = [];
    content.chapters.forEach((ch, ci) => {
      if (isEpilogueTitle(ch.title)) {
        out.push(`<section class="flow-prelude" data-prelude="1">${renderEpiloguePrelude()}</section>`);
      }
      out.push(`<section class="chapter-flow" data-anchor="ch-${ci}">`);
      out.push(`<div class="chapter-block"><div class="chapter-title" data-anchor="ch-${ci}">${escapeHTML(ch.title)}</div>`);
      out.push(`<img class="chapter-divider" src="assets/ornaments/divider.svg" alt=""></div>`);
      ch.blocks.forEach((b) => {
        if (b.type === 'paragraph') {
          const cls = b.dropcap ? ' class="chapter-opener"' : '';
          out.push(`<p${cls}>${Loader.renderInline(b.text)}</p>`);
        } else if (b.type === 'verse') {
          const lines = b.lines.map(l => `<span class="verse-line">${Loader.renderInline(l)}</span>`).join('');
          out.push(`<div class="verse">${lines}</div>`);
        } else if (b.type === 'rule') {
          out.push(`<hr>`);
        }
      });
      out.push(`</section>`);
    });
    if (isPlaceholder) {
      content.headBlocks.forEach(b => { if (b.type === 'paragraph') out.push(`<p>${Loader.renderInline(b.text)}</p>`); });
    }
    return out.join('\n');
  }

  // ---- Run paged.js --------------------------------------------------
  let pagedPages = [];        // [{ html, isPrelude, chapterAnchor }]
  let chapterPageIndex = {};  // anchor -> content-page index

  // Run paged.js once for a given mode. `cssHref` is the stylesheet whose
  // @page geometry drives fragmentation, so codex and scriptum each get a
  // page shape tuned for how they're read. Returns { pages, chapterIndex }.
  async function runPagedFor(cssHref) {
    const host = document.createElement('div');
    host.className = 'paged-host';
    host.style.cssText = 'position:absolute;left:-99999px;top:0;visibility:hidden;';
    document.body.appendChild(host);

    const flowHTML = buildFlowHTML();
    const previewer = new Paged.Previewer();
    await previewer.preview(flowHTML, [cssHref], host);

    const pageEls = Array.from(host.querySelectorAll('.pagedjs_page'));
    const pages = pageEls.map((pg) => {
      const inner = pg.querySelector('.pagedjs_page_content');
      let html = '';
      if (inner) {
        const wrapper = inner.querySelector(':scope > div');
        html = wrapper ? wrapper.innerHTML : inner.innerHTML;
      }
      const isPrelude = !!pg.querySelector('.prelude-rubric');
      const titleEl = pg.querySelector('.chapter-title[data-anchor]');
      const chapterAnchor = titleEl ? titleEl.getAttribute('data-anchor') : null;
      return { html, isPrelude, chapterAnchor };
    });

    const chapterIndex = {};
    pages.forEach((p, i) => {
      if (p.chapterAnchor && !(p.chapterAnchor in chapterIndex)) chapterIndex[p.chapterAnchor] = i;
    });

    host.remove();
    return { pages, chapterIndex };
  }

  // Single pagination pass — ONE page geometry shared by both modes.
  // Codex places these same folios two-up; scriptum stacks them. So a page
  // looks identical in either view; only the arrangement differs.
  async function runPagedEngine() {
    const r = await runPagedFor('css/paged-rules-scriptum.css');
    pagedPages = r.pages;
    chapterPageIndex = r.chapterIndex;
  }

  // ---- Leaves --------------------------------------------------------
  let leaves = [];
  function buildLeaves() {
    leaves = [];
    leaves.push({ type: 'frontispiece' });
    if (isPlaceholder) { leaves.push({ type: 'placeholder' }); return; }
    pagedPages.forEach((p, i) => {
      leaves.push({ type: p.isPrelude ? 'prelude' : 'content', idx: i });
    });
  }
  function folioForLeaf(leafIdx) {
    let n = 0;
    for (let i = 0; i <= leafIdx && i < leaves.length; i++) {
      const lf = leaves[i];
      if (lf.type === 'content' || lf.type === 'prelude') n++;
    }
    return toRoman(n);
  }
  function leafInnerHTML(leaf) {
    if (leaf.type === 'frontispiece') return renderFrontispiece();
    if (leaf.type === 'placeholder')  return `<div class="placeholder-note"><em>Liber nondum scriptus est.</em></div>`;
    return pagedPages[leaf.idx].html;
  }
  function leafClasses(leaf) {
    if (leaf.type === 'frontispiece') return 'frontispiece';
    if (leaf.type === 'placeholder')  return 'placeholder-page';
    if (leaf.type === 'prelude')      return 'epilogue-prelude';
    return '';
  }

  // =========================================================
  // CODEX MODE — the same folios, two side-by-side with a spine.
  // =========================================================
  let spreads = [];
  let currentSpread = 0;

  function buildSpreads() {
    spreads = [];
    spreads.push({ verso: null, recto: 0 });
    let i = 1;
    while (i < leaves.length) {
      spreads.push({ verso: i, recto: (i + 1 < leaves.length ? i + 1 : null) });
      i += 2;
    }
  }

  function renderLeafToPage(leafIndex, side) {
    if (leafIndex === null) return `<div class="page ${side} blank-verso"></div>`;
    const leaf = leaves[leafIndex];
    const extra = leafClasses(leaf);
    let folioHTML = '';
    if (leaf.type === 'content' || leaf.type === 'prelude') {
      folioHTML = `<div class="folio">fol. ${folioForLeaf(leafIndex)}</div>`;
    }
    return `<div class="page ${side} ${extra}">${leafInnerHTML(leaf)}${folioHTML}</div>`;
  }

  function renderSpread(animateDirection) {
    const sp = spreads[currentSpread];
    if (!sp) return;
    const versoHTML = renderLeafToPage(sp.verso, 'verso');
    const rectoHTML = renderLeafToPage(sp.recto, 'recto');
    if (animateDirection) {
      spread.classList.add('turning-out');
      setTimeout(() => {
        spread.innerHTML = versoHTML + rectoHTML;
        spread.classList.remove('turning-out');
        spread.classList.add('turning-in');
        setTimeout(() => spread.classList.remove('turning-in'), 320);
      }, 200);
    } else {
      spread.innerHTML = versoHTML + rectoHTML;
    }
    prevBtn.disabled = currentSpread <= 0;
    nextBtn.disabled = currentSpread >= spreads.length - 1;
  }

  // =========================================================
  // SCRIPTUM MODE — the same folios, stacked vertically.
  // =========================================================
  function renderDocMode() {
    if (docColumn.children.length > 0) return;
    leaves.forEach((leaf, i) => {
      const div = document.createElement('div');
      div.className = `page recto doc-folio ${leafClasses(leaf)}`.trim();
      div.innerHTML = leafInnerHTML(leaf);
      if (leaf.type === 'content' || leaf.type === 'prelude') {
        const folio = document.createElement('div');
        folio.className = 'folio';
        folio.textContent = `fol. ${folioForLeaf(i)}`;
        div.appendChild(folio);
      }
      docColumn.appendChild(div);
    });
  }

  // =========================================================
  // TABVLA
  // =========================================================
  function buildTabula() {
    tabulaList.innerHTML = '';
    if (content.chapters.length === 0) { tabulaBtn.style.display = 'none'; return; }
    content.chapters.forEach((ch, ci) => {
      const pageIdx = chapterPageIndex[`ch-${ci}`];
      let leafIdx = -1;
      for (let i = 0; i < leaves.length; i++) {
        if (leaves[i].type === 'content' && leaves[i].idx === pageIdx) { leafIdx = i; break; }
      }
      const spreadIdx = leafIdx >= 1 ? 1 + Math.floor((leafIdx - 1) / 2) : 0;
      const folio = leafIdx >= 0 ? folioForLeaf(leafIdx) : '';
      const li = document.createElement('li');
      li.innerHTML =
        `<button type="button" data-spread="${spreadIdx}" data-chapter="${ci}">${escapeHTML(ch.title)}</button>` +
        `<span class="folio-ref">fol. ${folio}</span>`;
      tabulaList.appendChild(li);
    });
  }
  const openTabula  = () => tabulaOverlay.classList.add('open');
  const closeTabula = () => tabulaOverlay.classList.remove('open');
  tabulaBtn.addEventListener('click', openTabula);
  tabulaClose.addEventListener('click', closeTabula);
  tabulaOverlay.addEventListener('click', e => { if (e.target === tabulaOverlay) closeTabula(); });
  tabulaList.addEventListener('click', e => {
    const btn = e.target.closest('button[data-spread]');
    if (!btn) return;
    const s = parseInt(btn.dataset.spread, 10);
    const ci = parseInt(btn.dataset.chapter, 10);
    closeTabula();
    if (document.body.classList.contains('doc-mode')) {
      const headings = docColumn.querySelectorAll('.chapter-title');
      const ch = content.chapters[ci];
      if (ch) for (const h of headings) {
        if (h.textContent === ch.title) { h.scrollIntoView({ behavior:'smooth', block:'start' }); break; }
      }
    } else if (!Number.isNaN(s) && s >= 0 && s < spreads.length) {
      currentSpread = s; renderSpread('next');
    }
  });

  // =========================================================
  // Navigation
  // =========================================================
  let inTurn = false;
  function goNext(){ if(inTurn||currentSpread>=spreads.length-1)return; inTurn=true; currentSpread++; renderSpread('next'); setTimeout(()=>inTurn=false,500); }
  function goPrev(){ if(inTurn||currentSpread<=0)return; inTurn=true; currentSpread--; renderSpread('prev'); setTimeout(()=>inTurn=false,500); }
  prevBtn.addEventListener('click', goPrev);
  nextBtn.addEventListener('click', goNext);

  window.addEventListener('keydown', e => {
    if (tabulaOverlay.classList.contains('open')) { if (e.key==='Escape') closeTabula(); return; }
    if (document.body.classList.contains('doc-mode')) {
      if (e.key==='Escape') backLink.click();
      else if (e.key==='t'||e.key==='T') openTabula();
      else if (e.key==='m'||e.key==='M') setMode('codex');
      return;
    }
    if (e.key==='ArrowRight'||e.key==='ArrowDown'||e.key===' '||e.key==='PageDown'){ e.preventDefault(); goNext(); }
    else if (e.key==='ArrowLeft'||e.key==='ArrowUp'||e.key==='PageUp'){ e.preventDefault(); goPrev(); }
    else if (e.key==='Escape') backLink.click();
    else if (e.key==='t'||e.key==='T') openTabula();
    else if (e.key==='m'||e.key==='M') setMode('doc');
  });

  let wheelCooldown = false;
  window.addEventListener('wheel', e => {
    if (document.body.classList.contains('doc-mode')) return;
    if (tabulaOverlay.classList.contains('open')) return;
    if (wheelCooldown){ e.preventDefault(); return; }
    if (Math.abs(e.deltaY)<8 && Math.abs(e.deltaX)<8) return;
    e.preventDefault();
    const fwd = Math.abs(e.deltaY)>=Math.abs(e.deltaX) ? e.deltaY>0 : e.deltaX>0;
    if (fwd) goNext(); else goPrev();
    wheelCooldown = true; setTimeout(()=>wheelCooldown=false, 650);
  }, { passive:false });

  let touchStartY=null, touchStartX=null;
  spreadFrame.addEventListener('touchstart', e => {
    if (e.touches.length===1){ touchStartY=e.touches[0].clientY; touchStartX=e.touches[0].clientX; }
  }, { passive:true });
  spreadFrame.addEventListener('touchend', e => {
    if (touchStartY==null) return;
    const t=e.changedTouches[0], dy=t.clientY-touchStartY, dx=t.clientX-touchStartX;
    const ay=Math.abs(dy), ax=Math.abs(dx);
    if (Math.max(ay,ax)>48){ const fwd = ay>ax ? dy<0 : dx<0; if(fwd)goNext(); else goPrev(); }
    touchStartY=touchStartX=null;
  }, { passive:true });

  backLink.addEventListener('click', e => {
    e.preventDefault();
    reader.classList.add('leaving');
    setTimeout(()=>{ window.location.href='index.html'; }, 880);
  });

  // ---- Mode toggle ---------------------------------------------------
  function setMode(mode) {
    if (mode === 'doc') {
      document.body.classList.remove('codex-mode');
      document.body.classList.add('doc-mode');
      modeToggle.textContent = 'scriptum';
      modeToggle.classList.add('active');
      renderDocMode();
      fitDocScale();
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

  // paged.js page size is fixed in CSS, so a viewport resize doesn't change
  // fragmentation. We just re-scale the fixed 1200×900 spread to fit.
  function fitSpreadScale() {
    const frame = spreadFrame;
    if (!frame) return;
    const availW = frame.clientWidth - 24;   // small breathing room
    const availH = frame.clientHeight - 16;
    // Codex spread is two 720×1040 folios side by side = 1440×1040.
    const scale = Math.min(availW / 1440, availH / 1040, 1.05);
    document.documentElement.style.setProperty('--spread-scale', scale.toFixed(4));
  }
  function fitDocScale() {
    if (!docFrame) return;
    const availW = docFrame.clientWidth;
    // 720px folio + a little side breathing room; never upscale past 1.
    const scale = Math.min((availW - 32) / 720, 1);
    document.documentElement.style.setProperty('--doc-scale', Math.max(0.4, scale).toFixed(4));
  }
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      fitSpreadScale();
      fitDocScale();
      if (!document.body.classList.contains('doc-mode')) renderSpread(null);
    }, 150);
  });

  // ---- Boot ----------------------------------------------------------
  try {
    if (!isPlaceholder) await runPagedEngine();
  } catch (err) {
    console.error('paged.js failed:', err);
    loading.textContent = 'Compositio paginarum defecit.';
    return;
  }
  buildLeaves();
  buildSpreads();
  buildTabula();
  fitSpreadScale();
  renderSpread(null);
  loading.classList.add('gone');

})();
