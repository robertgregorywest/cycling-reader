import { html, raw } from 'hono/html'
import type { HtmlEscapedString } from 'hono/utils/html'

/**
 * The document every page is served inside.
 *
 * A doctype is not optional: without one a browser renders in quirks mode,
 * where the layout below quietly stops being the layout that was designed.
 * Hono's JSX produces the body; this puts the declaration in front of it.
 */
export function document(page: HtmlEscapedString | Promise<HtmlEscapedString>) {
  return html`<!doctype html>${page}`
}

/** A `<style>` element carrying literal CSS, which JSX would otherwise escape
 * into nonsense at the first `>`. */
export function styleElement(css: string) {
  return <style>{raw(css)}</style>
}
