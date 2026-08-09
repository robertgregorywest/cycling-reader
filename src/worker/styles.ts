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
:root {
  color-scheme: light dark;

  --page: #fbfaf7;
  --ink: #191a1d;
  --ink-quiet: #5f6472;
  --rule: #e5e1d8;
  --accent: #9c2b26;

  --measure: 38rem;
  --step: 0.35rem;
  --radius: 3px;

  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

@media (prefers-color-scheme: dark) {
  :root {
    --page: #14151a;
    --ink: #e9e7e2;
    --ink-quiet: #9298a8;
    --rule: #2a2c35;
    --accent: #e0736b;
  }
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

.masthead h1 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.index {
  list-style: none;
  margin: 0;
  padding: 0;
}

.entry { border-bottom: 1px solid var(--rule); }

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

.empty {
  margin: calc(var(--step) * 12) 0;
  color: var(--ink-quiet);
  text-align: center;
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
