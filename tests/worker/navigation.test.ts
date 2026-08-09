import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { INDEX_LIMIT } from '../../src/worker/store.ts'
import { aStub, anArticle, seed } from './support/articles.ts'
import { readerAs, signIn } from './support/reader.ts'

/**
 * Moving between Articles without going back to the index.
 *
 * The reader is a stream and reading it is sequential: three Articles should
 * not be three round trips. What that costs is a second place the ordering has
 * to be right — so what is asserted here is that the ordering the index lists
 * in and the ordering navigation walks are one ordering, ends included, and
 * that the lens the reader chose survives every step.
 */

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
})

async function open(path: string): Promise<string> {
  const response = await readerAs(cookie, path)

  expect(response.status).toBe(200)
  return response.text()
}

/** The links out of the read-on navigation, in the order the page offers
 * them. */
function readOn(body: string): readonly { label: string; href: string }[] {
  const link = new RegExp(
    '<a class="read-on__side[^"]*" href="(?<href>[^"]*)"[^>]*>' +
      '<span class="read-on__label">(?<label>[^<]*)</span>',
    'g',
  )

  return [...body.matchAll(link)].map((match) => ({
    label: match.groups?.['label'] ?? '',
    href: (match.groups?.['href'] ?? '').replaceAll('&amp;', '&'),
  }))
}

function toward(body: string, label: 'Newer' | 'Older'): string | null {
  return readOn(body).find((link) => link.label === label)?.href ?? null
}

/** A day's Articles, newest last in the argument list so that the reader's
 * order is the reverse of the order they are written here. */
const DAY = [
  { guid: 'first', headline: 'Published first', publishedAt: '2026-08-09T06:00:00.000Z' },
  { guid: 'second', headline: 'Published second', publishedAt: '2026-08-09T09:00:00.000Z' },
  { guid: 'third', headline: 'Published third', publishedAt: '2026-08-09T12:00:00.000Z' },
] as const

async function aDay(): Promise<void> {
  await seed(...DAY.map((article) => anArticle(article)))
}

const path = (guid: string, query = ''): string => `/article/cyclingnews/${guid}${query}`

/** An hour of the day the fixtures are set in, as an instant. */
const at = (hour: number): string => new Date(Date.UTC(2026, 7, 9, hour)).toISOString()

describe('an Article in the middle of the stream', () => {
  it('offers the one published after it and the one published before it', async () => {
    await aDay()

    const body = await open(path('second'))

    expect(toward(body, 'Newer')).toBe(path('third'))
    expect(toward(body, 'Older')).toBe(path('first'))
  })

  it('names them, because a headline is what decides whether to open one', async () => {
    await aDay()

    const body = await open(path('second'))

    expect(body).toContain('Published third')
    expect(body).toContain('Published first')
  })
})

describe('the ends of the stream', () => {
  it('leave the newest Article with nowhere newer to go', async () => {
    await aDay()

    const body = await open(path('third'))

    expect(toward(body, 'Newer')).toBeNull()
    expect(toward(body, 'Older')).toBe(path('second'))
  })

  it('leave the oldest Article with nowhere older to go', async () => {
    await aDay()

    const body = await open(path('first'))

    expect(toward(body, 'Older')).toBeNull()
    expect(toward(body, 'Newer')).toBe(path('second'))
  })

  it('offer nothing at all when the Article is the only one there is', async () => {
    await seed(anArticle({ guid: 'alone' }))

    expect(await open(path('alone'))).not.toContain('class="read-on"')
  })
})

describe('navigation under a filter', () => {
  /** Two Sections interleaved in time, so that the neighbour by publication
   * and the neighbour within a Section are never the same Article. */
  async function aMixedDay(): Promise<void> {
    await seed(
      anArticle({ guid: 'racing-early', section: 'racing', publishedAt: at(6) }),
      anArticle({ guid: 'tech-mid', section: 'tech', publishedAt: at(9) }),
      anArticle({ guid: 'racing-late', section: 'racing', publishedAt: at(12) }),
      anArticle({
        guid: 'cw-late',
        source: 'cyclingweekly',
        section: 'racing',
        publishedAt: at(15),
      }),
    )
  }

  it('stays inside the Section the reader arrived under', async () => {
    await aMixedDay()

    const body = await open(path('racing-late', '?section=racing'))

    // The Article published immediately before this one is in Tech, and is
    // not where a reader reading Racing is sent.
    expect(toward(body, 'Older')).toBe(path('racing-early', '?section=racing'))
  })

  it('stays inside the Source as well, and inside both at once', async () => {
    await aMixedDay()

    const inBoth = '?section=racing&source=cyclingnews'
    const body = await open(path('racing-late', inBoth))

    expect(toward(body, 'Newer')).toBeNull()
    expect(toward(body, 'Older')).toBe(path('racing-early', inBoth))
  })

  it('carries the filter onward, so the next Article knows it too', async () => {
    await aMixedDay()

    const here = path('racing-late', '?section=racing')
    const onward = toward(await open(here), 'Older')

    expect(onward).not.toBeNull()
    expect(toward(await open(onward as string), 'Newer')).toBe(here)
  })

  it('reaches the ends of a Section sooner than the ends of the reader', async () => {
    await aMixedDay()

    // Nothing in Tech either side of the only Tech Article, though there is
    // something either side of it in time.
    expect(await open(path('tech-mid', '?section=tech'))).not.toContain('class="read-on"')
  })

  it('is the whole stream when the filter names nothing the reader has', async () => {
    await aMixedDay()

    const body = await open(path('racing-late', '?section=cyclocross'))

    expect(toward(body, 'Older')).toBe(path('tech-mid'))
  })
})

describe('the way back', () => {
  it('returns to the index the reader came from, filter and all', async () => {
    await aDay()

    expect(await open(path('second', '?section=racing&source=cyclingnews'))).toContain(
      'href="/?section=racing&amp;source=cyclingnews"',
    )
  })

  it('is the whole index when that is where the reader came from', async () => {
    await aDay()

    expect(await open(path('second'))).toContain('class="masthead__home" href="/"')
  })

  it('is where the index sends the reader on from, too', async () => {
    await aDay()

    const index = await open('/?section=racing')

    expect(index).toContain(`href="${path('third', '?section=racing')}"`)
  })
})

describe('navigating to an Article', () => {
  it('marks it Read, exactly as opening it from the index does', async () => {
    await aDay()

    const onward = toward(await open(path('third')), 'Older')

    expect(onward).toBe(path('second'))
    await open(onward as string)

    expect(await readAt('second')).not.toBeNull()
  })
})

describe('a Stub among the neighbours', () => {
  it('is linked at its Source, because that is the whole of how a Stub is read', async () => {
    await seed(
      anArticle({ guid: 'article', publishedAt: at(12) }),
      aStub({
        guid: 'stub',
        publishedAt: at(9),
        url: 'https://www.cyclingnews.com/pro-cycling/racing/a-difficult-page/',
      }),
    )

    expect(toward(await open(path('article')), 'Older')).toBe(
      'https://www.cyclingnews.com/pro-cycling/racing/a-difficult-page/',
    )
  })
})

describe('two Articles published in the same second', () => {
  it('order the same way in the index and in the navigation, so neither is skipped', async () => {
    await seed(
      anArticle({ guid: 'aaa', headline: 'One of a pair', publishedAt: at(9) }),
      anArticle({ guid: 'bbb', headline: 'The other of the pair', publishedAt: at(9) }),
      anArticle({ guid: 'ccc', headline: 'Older than both', publishedAt: at(6) }),
    )

    const listed = [
      ...(await open('/')).matchAll(/\/article\/cyclingnews\/(?<guid>[a-z]+)"/g),
    ].map((match) => match.groups?.['guid'])

    // Whatever order the index settled on, walking Older from the first of
    // them visits the rest of it in that same order.
    const walked = [listed[0] as string]

    while (walked.length < listed.length) {
      const onward = toward(await open(path(walked[walked.length - 1] as string)), 'Older')
      if (onward === null) break
      walked.push(onward.split('/').pop() as string)
    }

    expect(walked).toEqual(listed)
  })
})

describe('the hundred-and-first Article', () => {
  it('is reachable from the hundredth: the index limit is a page, not the end', async () => {
    await seed(
      ...Array.from({ length: INDEX_LIMIT + 1 }, (_unused, position) =>
        anArticle({
          guid: `article-${String(position).padStart(3, '0')}`,
          // Newest first in the index means the highest position is oldest.
          publishedAt: new Date(Date.parse(at(12)) - position * 60_000).toISOString(),
        }),
      ),
    )

    const last = `article-${String(INDEX_LIMIT - 1).padStart(3, '0')}`

    expect(toward(await open(path(last)), 'Older')).toBe(
      path(`article-${String(INDEX_LIMIT).padStart(3, '0')}`),
    )
  })
})

/** When an Article was Read, straight from the database. */
async function readAt(guid: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT read_at FROM articles WHERE guid = ?')
    .bind(guid)
    .first<{ read_at: string | null }>()

  return row?.read_at ?? null
}
