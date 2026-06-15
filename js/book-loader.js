/* =========================================================
   Bibliotheca Publica Varona — book-loader.js
   Shared utilities: load registry, manifests, content; parse;
   render covers.
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
    // Resolve content file from manifest; defaults to content.md
    const manifest = await Loader.loadManifest(id);
    const file = manifest.contentFile || 'content.md';
    const res = await fetch(`books/${id}/${file}`);
    if (!res.ok) throw new Error(`content missing for ${id}`);
    const md = await res.text();
    return { manifest, md };
  };

  // ---- Parser ---------------------------------------------------------
  // Markdown subset:
  //   `## Heading`               → chapter heading
  //   `*line*` alone on a line   → verse line (consecutive verse lines = verse block)
  //   blank line                 → block separator
  //   anything else              → paragraph (italic spans inside via *…*)
  //
  // Output: { chapters: [ { title, blocks: [...] } ], headBlocks: [...] }
  // headBlocks = content before any `## Heading` (rarely used).

  Loader.parseContent = function (md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');

    // First chunk into "paragraph blocks" separated by blank lines.
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

    // Now classify and group consecutive verse-lines into verse-blocks.
    const VERSE_LINE = /^\*([^*]+)\*$/;     // a single * … * on one logical block
    const HEADING    = /^## (.+)$/;

    const chapters = [];
    let currentChapter = null;
    const headBlocks = [];

    const pushBlock = (b) => {
      if (currentChapter) currentChapter.blocks.push(b);
      else headBlocks.push(b);
    };

    // Helper — merge a run of single-line verse blocks into one verse block.
    let pendingVerse = null;
    const flushVerse = () => {
      if (pendingVerse && pendingVerse.lines.length) {
        pushBlock(pendingVerse);
      }
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

      // Single-line verse paragraphs: looking like *text*
      const vm = trimmed.match(VERSE_LINE);
      if (vm && !trimmed.includes('\n')) {
        if (!pendingVerse) pendingVerse = { type: 'verse', lines: [] };
        pendingVerse.lines.push(vm[1].trim());
        continue;
      }

      // Otherwise it's a normal paragraph (may span multiple newlines, but treat as one)
      flushVerse();
      pushBlock({ type: 'paragraph', text: trimmed.replace(/\n+/g, ' ') });
    }
    flushVerse();

    // Mark each chapter's first paragraph for dropcap rendering.
    for (const ch of chapters) {
      const firstP = ch.blocks.find(b => b.type === 'paragraph');
      if (firstP) firstP.dropcap = true;
    }

    return { chapters, headBlocks };
  };

  // ---- Inline span rendering -----------------------------------------
  // Convert *italic* runs inside paragraph text into <em> tags, and wrap
  // Greek/Arabic runs so they get their proper font face.

  const GREEK_RE   = /[\u0370-\u03FF\u1F00-\u1FFF][\u0300-\u036F\u0370-\u03FF\u1F00-\u1FFF]*/g;
  const ARABIC_RE  = /[\u0600-\u06FF\u0750-\u077F][\u0600-\u06FF\u0750-\u077F\u064B-\u065F]*/g;

  Loader.renderInline = function (text) {
    // Escape HTML first.
    let out = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Italic emphasis (*x*) → <em>x</em>.
    // Pair them greedily, but only when not preceded/followed by a letter.
    out = out.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

    // Greek runs (single chars and longer) → <span class="greek">…</span>.
    // Build a script-aware tokenizer: split on script boundaries.
    out = wrapScript(out, GREEK_RE, 'greek');
    out = wrapScript(out, ARABIC_RE, 'arabic');

    return out;
  };

  // Wrap maximal runs of matched characters (plus interleaved combining marks/spaces
  // BETWEEN matches inside a single word) without splitting existing tags.
  // Simple version: just wrap each match individually. This is enough for our use.
  function wrapScript(html, re, cls) {
    // We must avoid breaking inside HTML tags. Operate on text-only segments.
    return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => {
      if (tag) return tag;
      return text.replace(re, (run) => `<span class="${cls}">${run}</span>`);
    });
  }

  // ---- Cover rendering -----------------------------------------------
  // Produces an HTML string for the top-view cover of a leather book.
  // Used both on the desk and (potentially) in the TABVLA preview.

  Loader.renderCoverHTML = function (manifest) {
    const cov = manifest.cover || {};
    const leather  = (cov.leather  || 'oxblood').replace(/\s+/g,'-');
    const ornament = cov.ornament || 'none';
    const wear     = cov.wear     || 'none';

    // Build ornament inline SVG (very small set — gilt single-stroke)
    const orn = ornamentSVG(ornament);

    const title = (manifest.title || '').toUpperCase();

    return `
      <div class="cover" data-leather="${leather}" data-wear="${wear}">
        <div class="cover-title">${title.replace(/ /g, '<br>')}</div>
        ${orn ? `<div class="cover-ornament">${orn}</div>` : ''}
        <div class="cover-wear"></div>
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
      case 'none':
      default:
        return '';
    }
  }

  // Expose
  global.Loader = Loader;

})(window);
