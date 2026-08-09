import { beforeEach, describe, expect, it } from 'vitest'
import { aStub, anArticle, hoursAgo, seed } from './support/articles.ts'
import { readerAs, signIn } from './support/reader.ts'

/**
 * The index. Its job is triage — finding the one Article worth opening in
 * under ten seconds — so what is asserted here is that each line carries
 * enough to judge relevance without opening it, and that the photography is
 * fetched at thumbnail size rather than at the size the Article deserves.
 */

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
})

async function index(): Promise<string> {
  const response = await readerAs(cookie, '/')

  expect(response.status).toBe(200)
  return response.text()
}

describe('the index', () => {
  it('is a standards-mode document', async () => {
    expect(await index()).toMatch(/^<!doctype html>/i)
  })

  it('lists Articles newest first', async () => {
    await seed(
      anArticle({ guid: 'older', headline: 'Published yesterday', publishedAt: hoursAgo(30) }),
      anArticle({ guid: 'newest', headline: 'Published this hour', publishedAt: hoursAgo(1) }),
      anArticle({ guid: 'middle', headline: 'Published this morning', publishedAt: hoursAgo(6) }),
    )

    const body = await index()

    expect(headlines(body)).toEqual([
      'Published this hour',
      'Published this morning',
      'Published yesterday',
    ])
  })

  it('carries the headline, teaser, Source and relative time of each Article', async () => {
    await seed(
      anArticle({
        headline: 'Pogačar wins again',
        teaser: 'The Slovenian took the stage by a minute.',
        source: 'cyclingweekly',
        publishedAt: hoursAgo(3),
      }),
    )

    const body = await index()

    expect(body).toContain('Pogačar wins again')
    expect(body).toContain('The Slovenian took the stage by a minute.')
    expect(body).toContain('Cycling Weekly')
    expect(body).toContain('>3h</time>')
  })

  it('says so plainly when there is nothing to read', async () => {
    expect(await index()).toContain('Nothing yet.')
  })
})

describe('the thumbnails', () => {
  it('ask the Source CDN for a thumbnail rather than the full-size image', async () => {
    await seed(
      anArticle({
        heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg',
      }),
    )

    const body = await index()

    expect(body).toContain('2topYbW6G5ADgqfFFwzeLW-72-80.jpg')
    // Twice the size for a screen with twice the pixels, and no more than that.
    expect(body).toContain('2topYbW6G5ADgqfFFwzeLW-144-80.jpg 2x')
    expect(body).not.toContain('-1280-80.jpg')
  })

  it('size an image the Feed gave unsized', async () => {
    await seed({
      ...anArticle(),
      heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/3CCmsgV6sDgU5yLthueHtn.jpg',
    })

    expect(await index()).toContain('3CCmsgV6sDgU5yLthueHtn-72-80.jpg')
  })

  it('leave the column standing where an Article has no hero image', async () => {
    await seed(anArticle({ heroImageUrl: null }))

    expect(await index()).toContain('thumb--absent')
  })
})

describe('a Stub', () => {
  it('is listed like any other Article', async () => {
    await seed(aStub({ headline: 'An Article whose Extraction failed' }))

    expect(headlines(await index())).toEqual(['An Article whose Extraction failed'])
  })

  it('links to its Source, which is how it is read', async () => {
    await seed(
      aStub({ url: 'https://www.cyclingnews.com/pro-cycling/racing/a-difficult-page/' }),
    )

    const body = await index()

    expect(body).toContain('href="https://www.cyclingnews.com/pro-cycling/racing/a-difficult-page/"')
    expect(body).toContain('At the Source')
  })
})

/** The headlines in the order the page lists them. */
function headlines(body: string): readonly string[] {
  return [...body.matchAll(/<span class="headline">(?<headline>[^<]*)<\/span>/g)].map(
    (match) => match.groups?.['headline'] ?? '',
  )
}
