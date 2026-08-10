import { JSDOM, VirtualConsole } from 'jsdom'
import type { SourceId } from '../shared/article.ts'
import { feedText } from './text.ts'

/**
 * An item as a Feed presents it. This is ingest input only: it carries the
 * headline, teaser and hero image, but never the Article's body, which is why
 * every admitted item is fetched from its Source separately.
 *
 * Timestamps are ISO 8601 instants in UTC, or null where the Feed omitted
 * them — about a fifth of items carry no `updated`. The Ingest Run, which
 * holds the clock, decides what an absent timestamp becomes.
 */
export interface FeedItem {
  readonly source: SourceId
  /** The Feed's opaque guid. Half of an Article's identity. */
  readonly guid: string
  readonly url: string
  readonly headline: string
  readonly teaser: string
  readonly author: string | null
  readonly publishedAt: string | null
  readonly updatedAt: string | null
  /** `cf:isPaid`. The only content flag either Source sets reliably. */
  readonly paid: boolean
  readonly heroImageUrl: string | null
  readonly heroImageAlt: string | null
  /** The Source's own raw subject labels, kept for diagnosis. Never shown. */
  readonly categories: readonly string[]
}

/**
 * Parse a Feed into its items, in the order the Source published them.
 *
 * Values are unescaped as they are read, because both Sources escape some of
 * them twice. An item with no usable guid or link is not an item.
 */
export function parseFeed(xml: string, source: SourceId): readonly FeedItem[] {
  const document = parseXml(xml)
  // One scratch HTML element for every item's description, rather than one
  // JSDOM per item: a Feed's fifty items would otherwise construct fifty
  // Windows just to read a hero image out of an excerpt.
  const descriptionScratch = htmlScratch()
  const items: FeedItem[] = []

  for (const element of Array.from(document.getElementsByTagName('item'))) {
    const url = text(element, 'link')
    const guid = text(element, 'guid') ?? url
    if (url === null || guid === null) continue

    const described = parseDescription(
      descriptionScratch,
      child(element, 'description')?.textContent ?? '',
    )

    items.push({
      source,
      guid,
      url,
      headline: text(element, 'title') ?? '',
      teaser: feedText(described.text),
      author: text(element, 'dc:creator') ?? authorName(text(element, 'author')),
      publishedAt: instant(text(element, 'pubDate')),
      updatedAt: instant(text(element, 'updated')),
      paid: text(element, 'cf:isPaid')?.toLowerCase() === 'true',
      heroImageUrl:
        attribute(element, 'media:content', 'url') ??
        attribute(element, 'enclosure', 'url') ??
        described.imageUrl,
      heroImageAlt: text(element, 'media:description') ?? described.imageAlt,
      categories: Array.from(element.children)
        .filter((child) => child.nodeName === 'category')
        .map((child) => feedText(child.textContent ?? ''))
        .filter((category) => category !== ''),
    })
  }

  return items
}

/** A Feed is XML; the Sources ship no DTD and no processing we care about. */
function parseXml(xml: string): Document {
  return new JSDOM(xml, { contentType: 'text/xml', virtualConsole: new VirtualConsole() })
    .window.document
}

/** A reusable HTML element to parse each item's `<description>` into. */
function htmlScratch(): HTMLElement {
  return new JSDOM('', { virtualConsole: new VirtualConsole() }).window.document.body
}

/**
 * The text of an item's direct child, by qualified name. Direct children only:
 * a `media:description` inside `media:content` describes the hero image, and
 * is read deliberately rather than by accident.
 */
function child(item: Element, name: string): Element | null {
  for (const candidate of Array.from(item.children)) {
    if (candidate.nodeName === name) return candidate
  }
  return null
}

function text(item: Element, name: string): string | null {
  const element = child(item, name) ?? descendant(item, name)
  if (element === null) return null
  const value = feedText(element.textContent ?? '')
  return value === '' ? null : value
}

/** `media:description` and `media:credit` sit inside `media:content`. */
function descendant(item: Element, name: string): Element | null {
  const media = child(item, 'media:content')
  if (media === null) return null
  for (const candidate of Array.from(media.children)) {
    if (candidate.nodeName === name) return candidate
  }
  return null
}

function attribute(item: Element, name: string, attributeName: string): string | null {
  const value = child(item, name)?.getAttribute(attributeName)?.trim()
  return value === undefined || value === '' ? null : value
}

/** `<author>` is an address — `name@futurenet.com (Real Name)`. */
function authorName(raw: string | null): string | null {
  if (raw === null) return null
  const parenthesised = /\(([^)]+)\)/.exec(raw)
  const name = (parenthesised?.[1] ?? raw).trim()
  return name === '' ? null : name
}

/**
 * A Source's `<description>` in whichever of two shapes it arrives: plain
 * teaser text with the hero image carried separately in `media:content`
 * (both Future PLC Sources), or a WordPress excerpt — a leading
 * `<figure><img>` holding the image, the real teaser text, then a "Read the
 * full article at… on…" line pointing back at the Source, which is furniture
 * rather than anything the reader is owed.
 *
 * Parsed as HTML rather than read as plain text so that both shapes are
 * covered by one path: text with no markup comes back unchanged, and
 * `media:content`'s `??` fallback means the image found here is only ever
 * used when a Source carries no `media:content` or `enclosure` at all.
 */
function parseDescription(
  scratch: HTMLElement,
  raw: string,
): {
  readonly text: string
  readonly imageUrl: string | null
  readonly imageAlt: string | null
} {
  scratch.innerHTML = raw
  const image = scratch.querySelector('img')
  const imageUrl = image?.getAttribute('src')?.trim() || null
  const imageAlt = image?.getAttribute('alt')?.trim() || null

  for (const figure of Array.from(scratch.querySelectorAll('figure'))) figure.remove()

  const paragraphs = Array.from(scratch.querySelectorAll('p'))
    .map((paragraph) => paragraph.textContent ?? '')
    .filter((paragraph) => !/^Read the full article at\b/.test(paragraph.trim()))

  return {
    text: paragraphs.length > 0 ? paragraphs.join(' ') : (scratch.textContent ?? ''),
    imageUrl,
    imageAlt,
  }
}

/** Feed dates are RFC 822. Storage is UTC throughout. */
function instant(raw: string | null): string | null {
  if (raw === null) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
