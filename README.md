# Bibliotheca Publica Varona

A personal Latin library website styled as an 18th-century national library.
Static site — no build step, no JavaScript framework, no database. Deploy by
copying the folder to any web server or GitHub Pages.

## Structure

```
/index.html              — library landing scene (desk + carousel of book covers)
/manuscript.html         — book reader (frontispiece + paginated two-page spreads)
/css/                    — library.css, manuscript.css
/js/                     — book-loader.js, library.js, manuscript.js
/assets/                 — library.jpg, coat-of-arms.svg, ornaments, drop-caps
/data/library.json       — registry of book IDs (in carousel order)
/books/<slug>/manifest.json   — book metadata (cover, frontispiece, ornaments)
/books/<slug>/content.md      — book text in light markdown
```

## Adding or editing a book

Each book is a folder under `/books/`. Add it to `/data/library.json` to make it
appear in the carousel.

### `manifest.json`
```json
{
  "id": "my-new-book",
  "title": "Liber Vetustissimus",
  "year": "A.D. MDCCXLI",
  "deskPosition": 4,
  "cover": {
    "leather": "oxblood",            // oxblood | dark-green | tan | midnight-blue | vellum-cream | black
    "ornament": "shield",            // none | cross | fleur-de-lis | shield | fleuron
    "wear": "light"                  // none | light
  },
  "frontispiece": {
    "coatOfArms": true,
    "subtitle": "LIBRI III",         // optional, rendered in red caps
    "date": "A.D. MDCCXLI",          // optional
    "footer": "hic fuit"             // optional, small italic at foot
  },
  "contentFile": "content.md",
  "turnStyle": "fade"
}
```

### `content.md`
```
## Liber I

Lorem ipsum dolor sit amet, consectetur adipiscing elit. ...

*Verse line one*
*Verse line two*
*Verse line three*

Paragraphum sequitur post versus.

## Liber II

Greek and Arabic scripts are preserved inline: μέγας, العربي.
```

Conventions:
- `## Liber I`, `## Liber II`, … (or `## Epilogvs`) start chapters; the title
  is rendered as a red rubric with a fleuron divider beneath it.
- A line alone of the form `*text*` is a verse line. Consecutive verse lines
  are grouped into one centered italic verse block (kept on one page).
- The first paragraph of each chapter automatically receives an illuminated
  drop-cap (red majuscule on cream with gold foliate frame).
- Greek (polytonic with macrons and breves) and Arabic scripts are detected
  automatically and rendered in `Noto Serif` / `Amiri` respectively.
- Books without `## Liber X` headings are treated as unwritten placeholders —
  the reader shows the frontispiece, then a single page reading *Liber nondum
  scriptus est.* on otherwise blank parchment.

## Deployment

1. Push the folder to a GitHub repository.
2. In the repo settings, enable GitHub Pages from the `main` branch (root).
3. The `.nojekyll` file disables Jekyll preprocessing — everything is served
   as-is.

That's it. No build step.

## Local preview

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Customising the look

- **Cover ornaments**: edit the SVG snippets in `js/book-loader.js` (the
  `ornamentSVG` function).
- **Coat of arms**: replace `assets/coat-of-arms.svg` with your own. The shape
  expected is a heater shield, viewBox `0 0 400 480`.
- **Drop caps**: replace `assets/dropcaps/<LETTER>.svg`. Each file is a 360×360
  panel with a red majuscule of that letter on cream with gilt flourishes.
- **Library scene**: replace `assets/library.jpg`. The single book on the desk
  is anchored to image-coordinate `50.5%, 82.5%` — adjust the values in
  `css/library.css` (`.desk-book { left: ...; top: ...; }`) for a different
  desk geometry.

## Keyboard shortcuts (reader)

- `←` / `→`  — turn page
- `Space`    — next page
- `T`        — open TABVLA
- `Esc`      — close TABVLA, or return to library
