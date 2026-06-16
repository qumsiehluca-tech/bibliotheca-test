/* =========================================================
   Bibliotheca Publica Varona — book-loader.js
   Shared utilities: load registry, manifests, content; parse;
   render inline spans (italic/bold/Greek/Arabic + <br>, <hr>).
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
  //   `## Heading`               → chapter heading
  //   `*line*` alone on its own block → verse line (verse-line content may
  //                                      itself contain `**word**` bold markers)
  //   `---` on its own line      → horizontal rule (decorative break)
  //   anything else              → paragraph
  //
  // Inside a paragraph or verse line, inline marks recognised by renderInline:
  //   **bold**     → <strong>bold</strong>
  //   *italic*     → <em>italic</em>
  //   <br>         → line break
  //   <hr>         → horizontal rule
  //   Greek / Arabic script gets a `.greek` / `.arabic` wrapper

  Loader.parseContent = function (md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');

    // Chunk by blank lines.
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

    // Verse line = a single-line block whose first and last non-space chars
    // are both '*' (allows `**bold**` markers inside).
    const HEADING    = /^## (.+)$/;
    const HR_LINE    = /^[-*_]{3,}$/;
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

    // Mark first paragraph of each chapter for drop-cap rendering.
    for (const ch of chapters) {
      const firstP = ch.blocks.find(b => b.type === 'paragraph');
      if (firstP) firstP.dropcap = true;
    }

    return { chapters, headBlocks };
  };

  // ---- Inline span rendering -----------------------------------------

  // We keep Greek wrapping (in case the user wants to swap the Greek face
  // later) but the default CSS now inherits the body font (EB Garamond),
  // which has polytonic glyphs.
  const GREEK_RE  = /[\u0370-\u03FF\u1F00-\u1FFF][\u0300-\u036F\u0370-\u03FF\u1F00-\u1FFF\u0020]*[\u0370-\u03FF\u1F00-\u1FFF]?/g;
  const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F][\u0600-\u06FF\u0750-\u077F\u064B-\u065F]*/g;

  // Allowed inline HTML tags that pass through unescaped. Use temporary
  // sentinels to protect them while we HTML-escape the rest.
  const PASSTHROUGH_TAGS = [
    'br', 'hr',
    'em', 'strong', 'i', 'b',
    'sup', 'sub',
    'small'
  ];

  Loader.renderInline = function (text) {
    // 1) Stash allowed tags as sentinels so they survive HTML escaping.
    const tokens = [];
    const stash = (html) => {
      tokens.push(html);
      return `\u0001${tokens.length - 1}\u0001`;
    };
    let out = text.replace(
      new RegExp(`<\\s*/?\\s*(${PASSTHROUGH_TAGS.join('|')})(\\s[^>]*)?\\s*/?\\s*>`, 'gi'),
      (m) => stash(m)
    );

    // 2) Escape remaining HTML.
    out = out
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 3) Restore the stashed tags.
    out = out.replace(/\u0001(\d+)\u0001/g, (_, i) => tokens[+i]);

    // 4) Markdown-ish inline marks. Bold FIRST so `**` is consumed before `*`.
    out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');

    // 5) Script wrappers (won't break HTML tags).
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

  // ---- Cover rendering (legacy; covers are now PNGs but kept for safety) --
  Loader.renderCoverHTML = function (manifest) {
    return `<img class="cover-img" src="assets/covers/${manifest.id}.png" alt="">`;
  };

  global.Loader = Loader;

})(window);
