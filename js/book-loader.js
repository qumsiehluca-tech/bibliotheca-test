/* =========================================================
   Bibliotheca Publica Varona — book-loader.js
   ========================================================= */

(function (global) {
  'use strict';

  const Loader = {};

  // ---- Data fetching --------------------------------------------------
  Loader.loadLibrary = async function () {
    const res = await fetch('data/library.json');
    if (!res.ok) throw new Error('library.json missing');
    return res.json();
  };

  Loader.loadManifest = async function (id) {
    const res = await fetch(`books/${id}/manifest.json`);
    if (!res.ok) throw new Error(`manifest missing for ${id}`);
    return res.json();
  };

  Loader.loadContent = async function (id) {
    const manifest = await Loader.loadManifest(id);
    const file = manifest.contentFile || 'content.md';
    const res = await fetch(`books/${id}/${file}`);
    if (!res.ok) throw new Error(`content missing for ${id}`);
    const md = await res.text();
    return { manifest, md };
  };

  // ---- Parser ---------------------------------------------------------

  Loader.parseContent = function (md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');

    const rawBlocks = [];
    let buf = [];
    for (const line of lines) {
      if (line.trim() === '') {
        if (buf.length) { rawBlocks.push(buf.join('\n')); buf = []; }
      } else {
        buf.push(line);
      }
    }
    if (buf.length) rawBlocks.push(buf.join('\n'));

    const HEADING = /^## (.+)$/;
    const HR_LINE = /^[-*_]{3,}$/;
    const isSingleLineVerse = (s) =>
      !s.includes('\n') &&
      s.length >= 3 &&
      s.charAt(0) === '*' &&
      s.charAt(s.length - 1) === '*' &&
      /\S/.test(s.slice(1, -1));

    const chapters = [];
    let currentChapter = null;
    const headBlocks = [];

    const pushBlock = (b) => {
      if (currentChapter) currentChapter.blocks.push(b);
      else headBlocks.push(b);
    };

    let pendingVerse = null;
    const flushVerse = () => {
      if (pendingVerse && pendingVerse.lines.length) pushBlock(pendingVerse);
      pendingVerse = null;
    };

    for (const raw of rawBlocks) {
      const trimmed = raw.trim();

      const hm = trimmed.match(HEADING);
      if (hm) {
        flushVerse();
        currentChapter = { title: hm[1].trim(), blocks: [] };
        chapters.push(currentChapter);
        continue;
      }

      if (HR_LINE.test(trimmed)) {
        flushVerse();
        pushBlock({ type: 'rule' });
        continue;
      }

      if (isSingleLineVerse(trimmed)) {
        const inner = trimmed.slice(1, -1).trim();
        if (!pendingVerse) pendingVerse = { type: 'verse', lines: [] };
        pendingVerse.lines.push(inner);
        continue;
      }

      flushVerse();
      pushBlock({ type: 'paragraph', text: trimmed.replace(/\n+/g, ' ') });
    }
    flushVerse();

    for (const ch of chapters) {
      const firstP = ch.blocks.find(b => b.type === 'paragraph');
      if (firstP) firstP.dropcap = true;
    }

    return { chapters, headBlocks };
  };

  // ---- Inline span rendering -----------------------------------------

  const GREEK_RE  = /[\u0370-\u03FF\u1F00-\u1FFF][\u0300-\u036F\u0370-\u03FF\u1F00-\u1FFF\u0020]*[\u0370-\u03FF\u1F00-\u1FFF]?/g;
  const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F][\u0600-\u06FF\u0750-\u077F\u064B-\u065F]*/g;

  const PASSTHROUGH_TAGS = ['br', 'hr', 'em', 'strong', 'i', 'b', 'sup', 'sub', 'small'];

  Loader.renderInline = function (text) {
    const tokens = [];
    const stash = (html) => { tokens.push(html); return `\u0001${tokens.length - 1}\u0001`; };
    let out = text.replace(
      new RegExp(`<\\s*/?\\s*(${PASSTHROUGH_TAGS.join('|')})(\\s[^>]*)?\\s*/?\\s*>`, 'gi'),
      (m) => stash(m)
    );
    out = out.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    out = out.replace(/\u0001(\d+)\u0001/g, (_, i) => tokens[+i]);
    // 4) Inline marks. Per user request: **X** is NOT rendered as bold —
    //    the markers are stripped and the text passes through. Italic `*X*`
    //    is still honored inside paragraphs. Any stray `**` from orphan
    //    markers is removed too.
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, '$1');
    out = out.replace(/\*\*/g, '');
    out = out.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    out = wrapScript(out, GREEK_RE,  'greek');
    out = wrapScript(out, ARABIC_RE, 'arabic');
    return out;
  };

  function wrapScript(html, re, cls) {
    return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, plain) => {
      if (tag) return tag;
      return plain.replace(re, (run) => `<span class="${cls}">${run}</span>`);
    });
  }

  // ---- Cover rendering -----------------------------------------------
  // CSS-based top-view of a leather book (original design).

  Loader.renderCoverHTML = function (manifest) {
    const cov = manifest.cover || {};
    const leather  = (cov.leather  || 'oxblood').replace(/\s+/g,'-');
    const ornament = cov.ornament || 'none';
    const wear     = cov.wear     || 'none';
    const title    = (manifest.title || '');
    // Break title onto one word per line for the small format
    const titleHTML = title.toUpperCase().split(/\s+/).filter(Boolean).join('<br>');
    const orn = ornamentSVG(ornament);

    // The book is a real closed volume: a thick block of cream page edges
    // sandwiched between the front and back leather covers. The .book-block
    // (page edges + back cover sliver) sits BEHIND the front .cover and peeks
    // out along the fore-edge (right) and tail (bottom), so the book reads as a
    // substantial ~200-leaf volume rather than two covers with a gap between.
    return `
      <div class="book" data-leather="${leather}" data-wear="${wear}">
        <div class="vol">
          <div class="wall wall-spine" aria-hidden="true"></div>
          <div class="wall wall-fore" aria-hidden="true"></div>
          <div class="wall wall-head" aria-hidden="true"></div>
          <div class="wall wall-tail" aria-hidden="true"></div>
          <div class="cover" data-leather="${leather}" data-wear="${wear}">
            <div class="cover-sheen" aria-hidden="true"></div>
            <div class="cover-title">${titleHTML}</div>
            ${orn ? `<div class="cover-ornament">${orn}</div>` : ''}
            <div class="cover-wear"></div>
          </div>
        </div>
      </div>
    `;
  };

  function ornamentSVG(name) {
    const gilt = '#c8a14a';
    const giltLight = '#e6c66b';
    switch (name) {
      case 'cross':
        return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <g fill="${gilt}" stroke="${giltLight}" stroke-width="0.5">
            <rect x="17" y="6"  width="6" height="28"/>
            <rect x="6"  y="17" width="28" height="6"/>
          </g></svg>`;
      case 'fleur-de-lis':
        return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <g fill="${gilt}" stroke="${giltLight}" stroke-width="0.4">
            <path d="M20 4 C 16 12, 10 16, 10 22 C 10 27, 16 28, 20 26
                     C 24 28, 30 27, 30 22 C 30 16, 24 12, 20 4 Z"/>
            <rect x="11" y="24" width="18" height="2.5"/>
            <path d="M12 28 Q 16 36, 20 38 Q 24 36, 28 28
                     Q 24 32, 20 32 Q 16 32, 12 28 Z"/>
          </g></svg>`;
      case 'shield':
        return `<svg viewBox="0 0 40 44" xmlns="http://www.w3.org/2000/svg">
          <g fill="none" stroke="${gilt}" stroke-width="1.4">
            <path d="M6 6 L 34 6 L 34 22 Q 34 36, 20 42 Q 6 36, 6 22 Z"/>
            <path d="M20 12 V 32" />
            <path d="M10 20 H 30" />
          </g></svg>`;
      case 'fleuron':
        return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
          <g fill="${gilt}">
            <path d="M20 6 C 14 14, 6 16, 6 22 C 6 30, 14 34, 20 30
                     C 26 34, 34 30, 34 22 C 34 16, 26 14, 20 6 Z"/>
            <circle cx="20" cy="22" r="2" fill="${giltLight}"/>
          </g></svg>`;
      default:
        return '';
    }
  }

  global.Loader = Loader;

})(window);
