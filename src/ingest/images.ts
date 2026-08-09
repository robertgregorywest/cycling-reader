import { JSDOM, VirtualConsole } from 'jsdom'
import type { ArticleImage } from '../shared/article.ts'
import { feedText } from './text.ts'

/**
 * The images within an Article's body, in the order they are read, recorded
 * individually so that Mirroring has somewhere to put its key later.
 *
 * The body has already been through the Tag Allowlist, so a `src` here is a
 * canonical Source CDN URL and is stored unrewritten: the responsive
 * candidates the reader is served are generated at render time, and a Mirrored
 * copy is preferred over the CDN only once one exists.
 */
export function imagesWithin(bodyHtml: string): readonly ArticleImage[] {
  if (bodyHtml.trim() === '') return []

  const document = new JSDOM(`<body>${bodyHtml}</body>`, {
    virtualConsole: new VirtualConsole(),
  }).window.document

  const images: ArticleImage[] = []

  for (const image of Array.from(document.querySelectorAll('img'))) {
    const url = image.getAttribute('src')
    if (url === null || url.trim() === '') continue

    images.push({
      position: images.length,
      url: url.trim(),
      alt: value(image.getAttribute('alt')),
      caption: value(image.closest('figure')?.querySelector('figcaption')?.textContent ?? null),
    })
  }

  return images
}

/**
 * Alt text and captions are shown as text, and the Sources escape both of them
 * twice — an alt attribute arrives holding `&amp;#039;` where an apostrophe
 * belongs.
 */
function value(raw: string | null): string | null {
  if (raw === null) return null
  const text = feedText(raw)
  return text === '' ? null : text
}
