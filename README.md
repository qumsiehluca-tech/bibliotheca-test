# Bibliotheca Publica Varona

A personal Latin library website styled as an 18th-century national library.
Static site — no build step, no JavaScript framework, no database.

## Structure

```
/index.html              — library landing (desk + carousel of book covers)
/manuscript.html         — book reader
/css/                    — library.css, manuscript.css
/js/                     — book-loader.js, library.js, manuscript.js
/assets/fonts/           — Canterbury.ttf
/assets/covers/          — one PNG per book (cover, top-down view)
/assets/                 — library.jpg, coat-of-arms.png, ornaments
/data/library.json       — registry of book IDs (in carousel order)
/books/<slug>/manifest.json   — book metadata
/books/<slug>/content.md      — book text in light markdown
```

## Reading controls

- **Scroll wheel** — wheel down → next page (spread), wheel up → previous
- **Arrow keys / Space / PageUp-PageDown** — turn pages
- **Touch swipe** (mobile) — swipe up/left for next, down/right for previous
- **Click fleurons** at the bottom corners
- **T key** or top-right button — open TABVLA contents
- **Esc** — close TABVLA, or return to library

## Adding or editing a book

Each book is a folder under `/books/`. Add it to `/data/library.json` to make
it appear in the carousel.

### `manifest.json`
```json
{
  "id": "my-new-book",
  "title": "Liber Vetustissimus",
  "year": "A.D. MDCCXLI",
  "deskPosition": 4,
  "cover": { "leather": "oxblood", "ornament": "shield", "wear": "light" },
  "frontispiece": {
    "coatOfArms": true,
    "subtitle": "LIBRI III",
    "date":     "A.D. MDCCXLI",
    "footer":   "hic fuit"
  },
  "contentFile": "content.md",
  "turnStyle":   "fade"
}
```

The title is rendered **verbatim** on the frontispiece (Canterbury blackletter,
no case transformation). Whatever case you write — `Vita Caii Aetii Maronis`
or `VITA CAII AETII MARONIS` — is what appears. The subtitle is lowercased
to match the blackletter aesthetic.

### `content.md`

```
## Liber I

Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...

*Verse line one*

*Verse line **two** with a bold word*

*Verse line three*

A new paragraph.<br>Forced line break in the middle.

---

Three or more dashes alone on a line = decorative horizontal rule.

## Liber II

Greek and Arabic scripts are preserved inline: μέγας, العربي.
```

Conventions:

- `## Liber I`, `## Liber II`, …, `## Epilogvs` start chapters; the title
  renders as a red Canterbury rubric with a fleuron divider beneath.
- A line of the form `*text*` alone (with blank lines around it) is a verse
  line. Consecutive verse lines group into a centred italic verse block.
- Inside a verse line or paragraph, `**word**` makes a word bold.
- `<br>` inserts a line break inside a paragraph or verse line.
- `<hr>` inserts a decorative rule.
- `---` (three or more dashes on their own line) is the same decorative rule.
- The first paragraph of each chapter automatically gets an illuminated drop
  cap (Canterbury, red). Continuations of split paragraphs get no indent.
- Greek and Arabic scripts are wrapped automatically. Greek inherits the body
  font (EB Garamond) which has full polytonic glyphs.
- Books with no `## Liber X` headings show the frontispiece, then a single
  centred-italic *Liber nondum scriptus est.* page.
- If a chapter is named *Epilogvs* (or anything matching `/epilog/i`), it is
  preceded by a dedicated "Lectori" prelude page in Latin inviting the reader
  to continue.

## Manually tuning the look

The most useful knobs sit at the top of `css/manuscript.css`:

```css
:root {
  --page-padding:        52px;    /* page margins */
  --page-padding-gutter: 60px;    /* inner-edge margin (toward the spine) */
  --body-font-size:      clamp(13px, 0.95vw, 16px);
  --body-line-height:    1.62;
  --para-indent:         1.4em;
  --para-spacing:        0.6em;   /* space between paragraphs */
  --chapter-title-size:  2.6em;
  --dropcap-size:        4.2em;
  --dropcap-color:       var(--rubric);   /* deep red */
}
```

Change any of these and the whole book restyles. The reader re-paginates
on viewport resize, so the page count adjusts automatically.

If you want different fonts, edit the body `font-family` in `html, body`
(`manuscript.css`). To swap the Greek face, target `.greek`. To restyle the
chapter titles, edit `.page .chapter-title`.

## Deployment

1. Push the folder to a GitHub repository.
2. In repository settings, enable GitHub Pages from the `main` branch (root).
3. The `.nojekyll` file disables Jekyll preprocessing.

No build step.

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```
