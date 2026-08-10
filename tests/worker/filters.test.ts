import { beforeEach, describe, expect, it } from 'vitest'
import { anArticle, seed } from './support/articles.ts'
import { readerAs, signIn } from './support/reader.ts'

/**
 * Filtering the index, by Section and by Source.
 *
 * Sections are the reader's own normalised taxonomy and never a Source's raw
 * Categories, so what is asserted here is that one vocabulary filters both
 * publications identically — a Cycling Weekly race report and a Cyclingnews
 * race report answer to the same chip.
 *
 * The filter lives in the URL rather than in stored state: it is where the
 * reader is, not what the reader prefers.
 */

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
})

async function index(path = '/'): Promise<string> {
  const response = await readerAs(cookie, path)

  expect(response.status).toBe(200)
  return response.text()
}

/** The headlines in the order the page lists them. */
function headlines(body: string): readonly string[] {
  return [...body.matchAll(/<span class="headline">(?<headline>[^<]*)<\/span>/g)].map(
    (match) => match.groups?.['headline'] ?? '',
  )
}

/** Four Articles across two Sections and both Sources, so that every
 * combination of the two facets has something to find and something to hide. */
async function aMixedIndex(): Promise<void> {
  await seed(
    anArticle({
      guid: 'cn-racing',
      source: 'cyclingnews',
      section: 'racing',
      headline: 'Cyclingnews on the race',
    }),
    anArticle({
      guid: 'cw-racing',
      source: 'cyclingweekly',
      section: 'racing',
      headline: 'Cycling Weekly on the race',
    }),
    anArticle({
      guid: 'cn-tech',
      source: 'cyclingnews',
      section: 'tech',
      headline: 'Cyclingnews on the bike',
    }),
    anArticle({
      guid: 'cw-tech',
      source: 'cyclingweekly',
      section: 'tech',
      headline: 'Cycling Weekly on the bike',
    }),
  )
}

describe('filtering by Section', () => {
  it('lists only that Section', async () => {
    await aMixedIndex()

    expect(headlines(await index('/?section=tech')).toSorted()).toEqual([
      'Cycling Weekly on the bike',
      'Cyclingnews on the bike',
    ])
  })

  it('works identically across both Sources, because the vocabulary is shared', async () => {
    await aMixedIndex()

    const racing = headlines(await index('/?section=racing'))

    expect(racing).toContain('Cyclingnews on the race')
    expect(racing).toContain('Cycling Weekly on the race')
  })

  it('offers every Section the reader has, whether or not anything is in it', async () => {
    const body = await index()

    for (const label of ['Racing', 'Women’s', 'Teams &amp; Riders', 'Tech', 'News', 'Other']) {
      expect(body).toContain(`>${label}</a>`)
    }
  })
})

describe('filtering by Source', () => {
  it('lists one publication at a time', async () => {
    await aMixedIndex()

    expect(headlines(await index('/?source=cyclingweekly')).toSorted()).toEqual([
      'Cycling Weekly on the bike',
      'Cycling Weekly on the race',
    ])
  })
})

describe('the two filters together', () => {
  it('combine, rather than replacing one another', async () => {
    await aMixedIndex()

    expect(headlines(await index('/?section=racing&source=cyclingnews'))).toEqual([
      'Cyclingnews on the race',
    ])
  })

  it('keep the other facet when one of them is changed', async () => {
    await aMixedIndex()

    const body = await index('/?section=racing&source=cyclingnews')

    expect(body).toContain('href="/?section=tech&amp;source=cyclingnews"')
    expect(body).toContain('href="/?section=racing&amp;source=cyclingweekly"')
  })

  it('are each let go of on their own', async () => {
    await aMixedIndex()

    const body = await index('/?section=racing&source=cyclingnews')

    // The 'All' Section chip keeps the Source, and vice versa.
    expect(body).toContain('href="/?source=cyclingnews"')
    expect(body).toContain('href="/?section=racing"')
  })
})

describe('the filter in force', () => {
  it('is visible on the page', async () => {
    const body = await index('/?section=tech')

    expect(body).toMatch(/<a class="chip chip--on" href="\/\?section=tech" aria-current="true"/)
  })

  it('is the whole index when nothing has been chosen', async () => {
    const body = await index()

    // Section's "All" and Source's "All" are the same on-chip markup, one per
    // filter row.
    expect(
      body.match(/<a class="chip chip--on" href="\/" aria-current="true">All<\/a>/g),
    ).toHaveLength(2)
  })

  it('says so when it has nothing under it, rather than looking like an empty reader', async () => {
    await aMixedIndex()

    expect(await index('/?section=news')).toContain('Nothing under this filter.')
  })
})

describe('a filter the reader could not have chosen', () => {
  it.each([
    ['a Section that does not exist', '/?section=cyclocross'],
    ['a Source the reader does not draw from', '/?source=velonews'],
    ['a Category, which is never a Section', '/?section=Tour%20de%20France'],
    ['nothing at all', '/?section='],
  ])('is the whole index: %s', async (_what, path) => {
    await aMixedIndex()

    expect(headlines(await index(path))).toHaveLength(4)
  })
})
