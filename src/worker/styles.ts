import { SERIF_FAMILY, fontFaces } from './fonts/index.ts'

/**
 * The reader's stylesheet, as a string served from a route rather than as a
 * file served by the platform.
 *
 * It is a route because nothing may be served before authentication (ADR-0003)
 * and there is no edge layer to enforce that: a stylesheet handed out by
 * Cloudflare's static asset serving would sit outside the Worker's session
 * check. Behind the check it is also cacheable for a year, keyed by the build
 * that produced it.
 *
 * Custom properties rather than a utility framework, because this design is
 * almost entirely typographic and is tuned by changing one value and
 * reloading. The index is deliberately image-light: its job is triage, and
 * beauty here comes from spacing rather than from scale. The generous
 * typography belongs to the Article.
 */
export const STYLESHEET_PATH = '/style.css'

export const STYLESHEET = `
${fontFaces()}

/*
 * Light is the default and dark is the override, in both directions: the
 * device's preference decides under [data-theme="auto"], and a reader who has
 * chosen wins over the device. Every page carries the attribute, so there is
 * no third rendering where neither rule applies.
 */
:root, :root[data-theme="light"] {
  color-scheme: light;

  --page: #fbfaf7;
  --ink: #191a1d;
  --ink-quiet: #5f6472;
  --rule: #e5e1d8;
  --accent: #9c2b26;
  --raised: #f2efe8;
}

:root[data-theme="auto"] { color-scheme: light dark; }

/*
 * Dark is not the light palette inverted. Paper white on true black is glare
 * in a dark room, so the page is a warm near-black and the ink stops short of
 * white — the contrast an evening's reading wants rather than the most of it
 * available.
 */
@media (prefers-color-scheme: dark) {
  :root[data-theme="auto"] {
    --page: #14151a;
    --ink: #e9e7e2;
    --ink-quiet: #9298a8;
    --rule: #2a2c35;
    --accent: #e0736b;
    --raised: #1c1e25;
  }
}

:root[data-theme="dark"] {
  color-scheme: dark;

  --page: #14151a;
  --ink: #e9e7e2;
  --ink-quiet: #9298a8;
  --rule: #2a2c35;
  --accent: #e0736b;
  --raised: #1c1e25;
}

:root {
  --measure: 38rem;
  --column: 34rem;
  --step: 0.35rem;
  --radius: 3px;

  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  /*
   * The reading face, with a fallback that is a serif rather than whatever the
   * browser defaults to: \`font-display: swap\` means the first paint of an
   * Article is set in this, and it should be the same shape of thing.
   */
  --serif: "${SERIF_FAMILY}", ui-serif, Georgia, "Times New Roman", serif;

  /* The Article's typography, which is the whole design. Tuned by changing
     these and reloading. */
  --reading-size: 1.15rem;
  --reading-height: 1.62;
  --reading-rhythm: 1.35rem;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 1rem;
  line-height: 1.45;
  -webkit-text-size-adjust: 100%;
}

.shell {
  max-width: var(--measure);
  margin: 0 auto;
  padding: calc(var(--step) * 4) calc(var(--step) * 3) calc(var(--step) * 12);
}

.masthead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: calc(var(--step) * 2);
  padding-bottom: calc(var(--step) * 3);
  border-bottom: 1px solid var(--rule);
}

.masthead h1, .masthead__home {
  margin: 0;
  color: inherit;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
}

/* On an Article the masthead is the way back, and says so on the way past
   rather than by looking like a button. */
.masthead__home::before { content: "\\2190\\00a0"; }

.masthead__home:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

/* The appearance control: one button, cycling. Sized to the tap target a
   thumb needs, drawn as almost nothing. */
.appearance { margin: 0; line-height: 1; }

.appearance button {
  min-width: 2rem;
  min-height: 2rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-quiet);
  font: inherit;
  font-size: 1rem;
  cursor: pointer;
}

.appearance button:hover { color: var(--ink); }

.appearance button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius);
}

/* Said to a screen reader and to nobody else: the glyph alone does not name
   what it will do. */
.offscreen {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

/* What this visit is: how much arrived since the last one, and the one action
   that clears it. Set at the scale of an entry's metadata, because it is
   information about the list rather than a heading over it. */
.visit {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: calc(var(--step) * 2);
  margin-top: calc(var(--step) * 3);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.visit .new { margin: 0; color: var(--ink-quiet); }

/* The count of New is the only number the reader is ever shown, so it is the
   only one that may be dark. Nothing new is grey, and says so in words: a
   zero is a thing to read twice. */
.visit .new--some { color: var(--ink); font-weight: 600; }

.mark-all { margin: 0; line-height: 1; }

.mark-all button {
  min-height: 2rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-quiet);
  font: inherit;
  text-decoration: underline;
  text-decoration-color: var(--rule);
  text-underline-offset: 0.25em;
  cursor: pointer;
}

.mark-all button:hover { color: var(--ink); }

.mark-all button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--radius);
}

/* The filters: Section, then Source. Two facets that combine, kept small
   enough that the first headline still arrives near the top of a phone. */
.filters {
  margin-top: calc(var(--step) * 3);
  padding-bottom: calc(var(--step) * 3);
  border-bottom: 1px solid var(--rule);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--step);
  list-style: none;
  margin: 0;
  padding: 0;
}

.chips + .chips { margin-top: var(--step); }

.chip {
  display: block;
  padding: calc(var(--step) * 1.4) calc(var(--step) * 2.4);
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--ink-quiet);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  white-space: nowrap;
}

.chip:hover { color: var(--ink); border-color: var(--ink-quiet); }

.chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

/* The filter in force, stated rather than implied: a reader who cannot see
   which lens they are looking through will read the absence of an Article as
   the absence of the news. */
.chip--on {
  background: var(--ink);
  border-color: var(--ink);
  color: var(--page);
  font-weight: 600;
}

.index {
  list-style: none;
  margin: 0;
  padding: 0;
}

.entry { border-bottom: 1px solid var(--rule); }

/* Read is dimmed and still there. An Article that vanished on being read
   would take with it the only evidence of what has been covered — and the
   dimming is opacity rather than a grey, so the thumbnail recedes with the
   words. */
.entry--read { opacity: 0.55; }

/* An Article Revised since it was Read comes part of the way back: the marker
   exists to return the eye to something already dismissed, and it cannot do
   that from behind the full dimming. */
.entry--updated { opacity: 0.82; }

/* The whole row is the target: on a phone the thumbnail and the headline
   should not be two different things to hit. */
.entry a {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: calc(var(--step) * 3);
  align-items: start;
  padding: calc(var(--step) * 3) 0;
  color: inherit;
  text-decoration: none;
}

.entry a:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.thumb {
  width: 4.5rem;
  height: 4.5rem;
  object-fit: cover;
  border-radius: var(--radius);
  background: var(--rule);
  display: block;
}

/* An Article with no hero image keeps its column, so headlines stay aligned
   down the page. */
.thumb--absent { background: var(--rule); }

.headline {
  display: block;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.3;
  text-wrap: balance;
}

.teaser {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: var(--step);
  color: var(--ink-quiet);
  font-size: 0.875rem;
  line-height: 1.4;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: calc(var(--step) * 2);
  margin-top: calc(var(--step) * 2);
  color: var(--ink-quiet);
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.meta .source { color: var(--ink-quiet); font-weight: 600; }

/* A Stub is a legitimate Article, so it is listed like any other — the marker
   says only that reading it means leaving. */
.meta .stub::before { content: "\\2197\\00a0"; }

/* The Updated Marker: on a race report this usually means the results have
   arrived, which is worth the one accent on the line. */
.meta .updated { color: var(--accent); font-weight: 600; }

.empty {
  margin: calc(var(--step) * 12) 0;
  color: var(--ink-quiet);
  text-align: center;
}

/* Health, quietly: smaller and greyer than the metadata of a single entry, so
   that on a healthy day it is furniture. It has to be legible when looked for
   and invisible when not. */
.health {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--step) * 2);
  margin-top: calc(var(--step) * 6);
  padding-top: calc(var(--step) * 3);
  border-top: 1px solid var(--rule);
  color: var(--ink-quiet);
  font-size: 0.7rem;
  letter-spacing: 0.04em;
}

.health .split::before { content: "\\00b7\\00a0"; }

/* Stale is the one state that may raise its voice: a reader that has stopped
   ingesting looks exactly like a quiet news day, and looking quiet is how it
   goes unnoticed for a week. */
.health--stale {
  color: var(--accent);
  font-weight: 600;
}

.health--stale::before { content: "\\26a0\\fe0f\\00a0"; }

/* ---------------------------------------------------------------------------
   The Article.

   The index is a list and is set in the interface's own sans; this is the
   magazine. One column at a measure the eye can return along without losing
   its place, real line height, and a vertical rhythm that every block — prose,
   photograph, table — sits on.
   ------------------------------------------------------------------------- */

.article {
  max-width: var(--column);
  margin: 0 auto;
}

.article__head { margin: calc(var(--step) * 8) 0 calc(var(--step) * 6); }

.article__head h1 {
  margin: 0;
  font-family: var(--serif);
  /* Optical size is an axis of this face: at display size the letterforms want
     finer strokes and tighter spacing than the same face at reading size. */
  font-variation-settings: "opsz" 32;
  font-size: clamp(1.75rem, 1.35rem + 2vw, 2.4rem);
  font-weight: 600;
  line-height: 1.14;
  letter-spacing: -0.012em;
  text-wrap: balance;
}

/* The teaser, doing what a standfirst does: telling the reader what the piece
   is before they commit to it. */
.standfirst {
  margin: calc(var(--step) * 3) 0 0;
  color: var(--ink-quiet);
  font-family: var(--serif);
  font-size: 1.12rem;
  font-style: italic;
  line-height: 1.4;
  text-wrap: pretty;
}

.byline {
  display: flex;
  flex-wrap: wrap;
  gap: calc(var(--step) * 2);
  margin: calc(var(--step) * 4) 0 0;
  color: var(--ink-quiet);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.byline__source { font-weight: 600; }

/* Separators drawn rather than typed, so that an absent author does not leave
   one stranded. Trailing rather than leading: on a phone the byline wraps, and
   a line should begin with a name rather than with a dot. */
.byline > *:not(:last-child)::after { content: "\\00a0\\00b7"; }

.hero { margin: 0 0 calc(var(--step) * 6); }

.hero img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius);
  background: var(--rule);
}

/* The body. Everything below here is styling HTML this application did not
   write the tags of: it is the Tag Allowlist, as the Source shaped it. */
.body {
  font-family: var(--serif);
  font-variation-settings: "opsz" 14;
  font-size: var(--reading-size);
  line-height: var(--reading-height);
  /* Hyphenation off: a 34rem column does not need it, and cycling prose is
     full of names no dictionary will break correctly. */
  hyphens: none;
}

.body p {
  margin: 0 0 var(--reading-rhythm);
  text-wrap: pretty;
}

.body h2, .body h3, .body h4 {
  margin: calc(var(--reading-rhythm) * 1.6) 0 calc(var(--reading-rhythm) * 0.5);
  font-variation-settings: "opsz" 20;
  font-weight: 600;
  line-height: 1.22;
  text-wrap: balance;
}

.body h2 { font-size: 1.4rem; }
.body h3 { font-size: 1.2rem; }
.body h4 { font-size: 1.08rem; }

.body a {
  color: inherit;
  text-decoration-color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.16em;
}

.body a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.body ul, .body ol { margin: 0 0 var(--reading-rhythm); padding-left: 1.4em; }
.body li { margin-bottom: calc(var(--reading-rhythm) * 0.35); }

/* A pulled quote from a rider, which is most of what a blockquote is here. */
.body blockquote {
  margin: var(--reading-rhythm) 0;
  padding-left: calc(var(--step) * 4);
  border-left: 2px solid var(--accent);
  color: var(--ink-quiet);
  font-style: italic;
}

.body blockquote p:last-child { margin-bottom: 0; }

.body hr {
  margin: calc(var(--reading-rhythm) * 1.5) 0;
  border: none;
  border-top: 1px solid var(--rule);
}

/* Photography, at the width of the column: full-bleed would mean guessing at
   crops the picture desk already chose. */
.body figure { margin: calc(var(--reading-rhythm) * 1.4) 0; }

.body figure p { margin: 0; }

.body img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius);
  background: var(--rule);
}

/* The caption is journalism — it names the rider and credits the
   photographer — so it is kept and made visibly a different thing from the
   prose: smaller, sans, quiet, and hung under the picture. */
.body figcaption {
  margin-top: calc(var(--step) * 2);
  color: var(--ink-quiet);
  font-family: var(--sans);
  font-size: 0.8rem;
  line-height: 1.4;
}

/* The Source sets the caption and its picture credit as two spans; the credit
   is the second, and reads as parenthetical because it is. */
.body figcaption span + span { opacity: 0.8; }

/* ---------------------------------------------------------------------------
   Results tables.

   Frequently the most valuable thing on a race report, and the reason
   Extraction is targeted rather than heuristic. On a phone a seven-column
   classification cannot fit, so it scrolls inside its own box rather than
   widening the page and breaking every line of prose on it.
   ------------------------------------------------------------------------- */

.scroller {
  margin: calc(var(--reading-rhythm) * 1.4) 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  /* Focusable, so that a keyboard can scroll it; the outline only shows when
     a keyboard is what put it there. */
  outline-offset: -2px;
}

.scroller:focus-visible { outline: 2px solid var(--accent); }

.body table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--sans);
  font-size: 0.85rem;
  line-height: 1.35;
}

.body caption {
  padding: calc(var(--step) * 2) calc(var(--step) * 3);
  color: var(--ink-quiet);
  font-size: 0.8rem;
  text-align: left;
}

.body th, .body td {
  padding: calc(var(--step) * 2) calc(var(--step) * 3);
  border-bottom: 1px solid var(--rule);
  text-align: left;
  vertical-align: top;
  /* A rider's name and team must not wrap to four lines in a narrow cell:
     the table scrolls instead. */
  white-space: nowrap;
}

.body thead th {
  position: sticky;
  top: 0;
  background: var(--raised);
  font-weight: 600;
  /* The position column stays legible while the rest scrolls past under it. */
  white-space: nowrap;
}

.body tbody tr:last-child th, .body tbody tr:last-child td { border-bottom: none; }

/* The Source wraps every cell's contents in a paragraph. It is still a cell:
   no rhythm below it, and no wrapping — \`text-wrap\` on the prose above resets
   the cell's \`white-space\`, so the cell says it again where it is meant. */
.body th p, .body td p { margin: 0; white-space: nowrap; }

/* ---------------------------------------------------------------------------
   The link out, and the Stub.
   ------------------------------------------------------------------------- */

.article__foot {
  margin-top: calc(var(--step) * 10);
  padding-top: calc(var(--step) * 4);
  border-top: 1px solid var(--rule);
}

.at-source, .stub-link {
  color: var(--ink-quiet);
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  text-decoration: none;
}

.at-source:hover, .stub-link:hover { color: var(--ink); }

.at-source:focus-visible, .stub-link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
}

.at-source::after, .stub-link::after { content: "\\00a0\\2197"; }

/* A Stub is a legitimate Article whose body could not be extracted. It is not
   an error page, so it does not look like one: it says where the rest is, once,
   and gets out of the way. */
.body--stub .stub-note {
  color: var(--ink-quiet);
  font-style: italic;
}

.body--stub .stub-link {
  font-size: 0.95rem;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink);
  text-decoration: underline;
  text-decoration-color: var(--accent);
  text-underline-offset: 0.16em;
}
`.trimStart()

/**
 * The sign-in page's own styling, inline.
 *
 * The sign-in page is the one thing served before authentication, so it cannot
 * link to the stylesheet: fetching it would be exactly the unauthenticated
 * request to a route other than sign-in that must not succeed. It is a
 * heading, a field and a button, so carrying its own few rules costs less than
 * the exception would.
 */
export const SIGN_IN_STYLES = `
:root { color-scheme: light dark; --page: #fbfaf7; --ink: #191a1d; --ink-quiet: #5f6472; --rule: #e5e1d8; --accent: #9c2b26; }
@media (prefers-color-scheme: dark) {
  :root { --page: #14151a; --ink: #e9e7e2; --ink-quiet: #9298a8; --rule: #2a2c35; --accent: #e0736b; }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background: var(--page);
  color: var(--ink);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.45;
}
form { width: 100%; max-width: 20rem; }
h1 {
  margin: 0 0 1.5rem;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
label { display: block; margin-bottom: 0.4rem; font-size: 0.8rem; color: var(--ink-quiet); }
input, button {
  width: 100%;
  padding: 0.7rem 0.8rem;
  font: inherit;
  border-radius: 3px;
  border: 1px solid var(--rule);
}
input { background: transparent; color: var(--ink); }
input:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button { margin-top: 0.8rem; border: none; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
.error { margin: 0 0 1rem; color: var(--accent); font-size: 0.85rem; }
`.trimStart()
