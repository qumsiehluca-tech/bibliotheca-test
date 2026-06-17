# Bibliotheca Publica Varona

A personal Latin library website styled as an 18th-century national library.
Static site — no build step, no framework, no database.

## Folder layout

```
index.html                — library landing (desk + carousel)
manuscript.html           — book reader
css/                      — library.css, manuscript.css
js/                       — book-loader.js, library.js, manuscript.js
assets/fonts/             — Canterbury.ttf, eb-garamond/*.ttf (bundled)
assets/                   — library.jpg, coat-of-arms.png, ornaments/
data/library.json         — registry of book IDs (carousel order)
books/<slug>/manifest.json — book metadata
books/<slug>/content.md    — book text (this is what you edit)
```

## Editing the book — the file is `books/<slug>/content.md`

Open it in any text editor (Notepad, VS Code, Sublime Text, TextEdit, etc.).
Save. Refresh the browser. That's the whole loop. No tools to install.

### Plain text rules in `content.md`

```markdown
## Liber I

This is a paragraph. It just flows. Blank line above and below = new
paragraph. Inside a paragraph you can use a forced<br>line break.

A new paragraph following the previous one.

*This is one verse line.*

*Another verse line, **with a bolded word** inside.*

*A third verse line — these three group together as one centred italic
verse block, automatically.*

A paragraph after the verse.

---

Three dashes alone on a line = a decorative horizontal rule (fleuron).

## Liber II

The next chapter begins. ## (two hashes) starts every chapter.
```

Conventions in detail:

- `## Title` on its own line starts a new chapter. Renders as a red
  Canterbury rubric with a decorative divider underneath.
- A line that is exactly `*text*` (a single star at each end, no blank
  lines inside) is a verse line. Consecutive verse lines form a centred
  italic verse block.
- `**word**` — the markers are stripped (no bolding). If you want emphasis
  inside a paragraph, use `*word*` for italics.
- `*word*` makes a word italic. Verse lines are italic by default; you
  don't need to wrap individual words.
- `<br>` forces a line break inside a paragraph or verse line.
- `<hr>` or `---` on its own line is a decorative horizontal rule.
- The first paragraph of every chapter automatically gets the big red
  Canterbury drop cap on its first letter. Continuations from the previous
  page get no indent.
- Greek (Μέγας) and Arabic (العربية) are detected automatically. Greek
  inherits the body font — the bundled EB Garamond has full polytonic
  glyphs (μέγας, ἕως, ἄνθρωπος, all of it).
- If a chapter is named `Epilogvs` (or anything matching `/epilog/i`),
  the reader inserts a "Lectori" prelude page before it automatically.

### Editing the title page (manifest.json)

```json
{
  "id": "vita-caii-aetii-maronis",
  "title": "Vita Caii Aetii Maronis",
  "year":  "A.D. DCCXXXIV",
  "deskPosition": 3,
  "cover": { "leather": "oxblood", "ornament": "shield", "wear": "light" },
  "frontispiece": {
    "coatOfArms": true,
    "subtitle":   "LIBRI VII",
    "date":       "A.D. DCCXXXIV",
    "footer":     "hic fuit"
  },
  "contentFile": "content.md",
  "turnStyle":   "fade"
}
```

The title is rendered exactly as you write it (Canterbury blackletter on
the frontispiece, Cinzel gilt on the cover). The subtitle is lowercased
for the blackletter aesthetic. Leather options: `oxblood`, `dark-green`,
`tan`, `midnight-blue`, `vellum-cream`, `black`. Ornament options: `none`,
`cross`, `fleur-de-lis`, `shield`, `fleuron`.

To add a brand-new book: make a folder under `books/`, write a
`manifest.json` and a `content.md`, then add the new slug to
`data/library.json` in the order you want it to appear in the carousel.

## Reading controls

- **Scroll wheel** — turn pages in codex view (wheel down = next, wheel
  up = previous). Cooldown of ~650 ms prevents skipping.
- **Arrow keys / Space / PageUp / PageDown** — turn pages.
- **Touch swipe** — swipe up/left for next, down/right for previous.
- **`m` key** or the **codex / scriptum** button top-right — toggle
  between codex (two-page spread) and doc-style continuous scroll.
- **`t` key** or **TABVLA** button — open the table of contents.
- **Esc** — close TABVLA or return to the library.

## Manually tuning the look

The most useful knobs are at the top of `css/manuscript.css`:

```css
:root {
  --page-padding:        52px;
  --page-padding-gutter: 60px;
  --body-font-size:      clamp(13px, 0.95vw, 16px);
  --body-line-height:    1.62;
  --para-indent:         1.4em;
  --para-spacing:        0.6em;
  --chapter-title-size:  2.6em;
  --dropcap-size:        4.2em;
  --dropcap-color:       var(--rubric);
}
```

Change any value, save, refresh — the reader re-paginates automatically
on every viewport resize.

For broader look-and-feel changes: the body font is set in
`html, body { font-family: ... }`; the rubric red is `--rubric`; the
paper colour is `--paper`. All in `css/manuscript.css`.

## The u→v gotcha (fixed)

EB Garamond ships with an OpenType `locl` (localized forms) rule that
substitutes `u → u.LAT` (a historical V-shape) when the page language is
Latin. Because the HTML declares `lang="la"`, the browser would render
"ubi uxor" as "vbi vxor". The CSS now sets `font-language-override: "ENG"`
and disables `locl`, `hist`, `hlig`, `dlig`, and `ss01`–`ss07` on the
body, so the body text reads with normal `u` shapes while the page stays
correctly tagged as Latin for screen readers and search engines.

## Deployment

1. Push the folder to a GitHub repository.
2. In Settings → Pages, enable Pages from the `main` branch (root).
3. The `.nojekyll` file disables Jekyll preprocessing.

No build step.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
