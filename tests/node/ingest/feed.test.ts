import { describe, expect, it } from 'vitest'
import { parseFeed, type FeedItem } from '../../../src/ingest/feed.ts'
import { unescapeEntities } from '../../../src/ingest/text.ts'
import { FEED_FIXTURES, readFeedFixture } from '../../fixtures/feeds.ts'

describe.each(FEED_FIXTURES)('$source', (fixture) => {
  const items = parseFeed(readFeedFixture(fixture.source), fixture.source)

  it('parses every item the Feed offers', () => {
    expect(items).toHaveLength(fixture.items)
  })

  it('gives every item an opaque guid and a URL at its Source', () => {
    for (const item of items) {
      expect(item.guid).not.toBe('')
      expect(item.url.startsWith('https://')).toBe(true)
    }
  })

  it('gives every item a headline and a publication timestamp', () => {
    for (const item of items) {
      expect(item.headline).not.toBe('')
      expect(item.publishedAt).not.toBeNull()
    }
  })

  it('tolerates an item with no updated timestamp', () => {
    expect(items.some((item) => item.updatedAt === null)).toBe(true)
  })

  // Velo's Feed carries no `<updated>` element at all — every item is judged
  // by `pubDate` alone, which `revisionOf` already falls back to.
  it.skipIf(fixture.source === 'velo')('carries an updated timestamp on some items', () => {
    expect(items.some((item) => item.updatedAt !== null)).toBe(true)
  })

  it('leaves no escaped entity in a value it read', () => {
    for (const item of items) {
      for (const value of [item.headline, item.teaser, item.heroImageAlt ?? '', ...item.categories]) {
        expect(value).not.toMatch(/&(#[0-9]+|[a-z]+);/i)
      }
    }
  })
})

describe('doubly-encoded values', () => {
  it('unescapes a value the Source escaped twice', () => {
    expect(unescapeEntities('Women&amp;#039;s Cycling')).toBe("Women's Cycling")
  })

  it('unescapes a value the Source escaped once', () => {
    expect(unescapeEntities('Teams &amp; Riders')).toBe('Teams & Riders')
  })

  it('stops before it starts decoding text that was meant literally', () => {
    expect(unescapeEntities('&amp;amp;amp;')).toBe('&amp;')
  })

  it('reads an apostrophe the Source escaped inside CDATA', () => {
    const item = itemAt('cyclingweekly', '/products/')
    expect(item.heroImageAlt).toContain("Pete's")
  })
})

describe('the values an Article is admitted with', () => {
  it('reads the author from the Source that gives one', () => {
    expect(itemAt('cyclingnews', '/pro-cycling/racing/').author).toBe('Laura Weislo')
  })

  it('reads the paid flag, which is the only content flag either Source sets reliably', () => {
    expect(itemAt('cyclingnews', '/cycling-tech-components/').paid).toBe(true)
    expect(itemAt('cyclingnews', '/pro-cycling/racing/').paid).toBe(false)
  })

  it('reads the hero image the Feed carries', () => {
    const item = itemAt('cyclingnews', '/pro-cycling/racing/')
    expect(item.heroImageUrl).toMatch(/^https:\/\/cdn\.mos\.cms\.futurecdn\.net\//)
    expect(item.heroImageAlt).not.toBeNull()
  })

  it('records timestamps as UTC instants', () => {
    for (const fixture of FEED_FIXTURES) {
      for (const item of parseFeed(readFeedFixture(fixture.source), fixture.source)) {
        expect(item.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
      }
    }
  })
})

describe('a document that is not a Feed', () => {
  it('yields no items, which is the zero-item Feed an Ingest Run fails on', () => {
    expect(parseFeed('<html><body>Not a Feed</body></html>', 'cyclingnews')).toEqual([])
  })

  it('throws when the XML itself is broken, rather than reporting an empty Feed', () => {
    expect(() => parseFeed('<rss><item><title>x</rss>', 'cyclingnews')).toThrow()
  })
})

function itemAt(source: 'cyclingnews' | 'cyclingweekly', path: string): FeedItem {
  const item = parseFeed(readFeedFixture(source), source).find((candidate) =>
    candidate.url.includes(path),
  )
  if (item === undefined) throw new Error(`No item beneath ${path} in the ${source} Feed`)
  return item
}
