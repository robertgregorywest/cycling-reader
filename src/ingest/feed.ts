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
  const items: FeedItem[] = []

  for (const element of Array.from(document.getElementsByTagName('item'))) {
    const url = text(element, 'link')
    const guid = text(element, 'guid') ?? url
    if (url === null || guid === null) continue

    items.push({
      source,
      guid,
      url,
      headline: text(element, 'title') ?? '',
      teaser: text(element, 'description') ?? '',
      author: text(element, 'dc:creator') ?? authorName(text(element, 'author')),
      publishedAt: instant(text(element, 'pubDate')),
      updatedAt: instant(text(element, 'updated')),
      paid: text(element, 'cf:isPaid')?.toLowerCase() === 'true',
      heroImageUrl: attribute(element, 'media:content', 'url') ?? attribute(element, 'enclosure', 'url'),
      heroImageAlt: text(element, 'media:description'),
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

/** Feed dates are RFC 822. Storage is UTC throughout. */
function instant(raw: string | null): string | null {
  if (raw === null) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
