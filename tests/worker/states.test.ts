import { beforeEach, describe, expect, it } from 'vitest'
import { articlePath } from '../../src/worker/views/article.tsx'
import { READ_ALL_PATH } from '../../src/worker/views/index.tsx'
import { anArticle, hoursAgo, revise, seed } from './support/articles.ts'
import { readerAs, signIn } from './support/reader.ts'
import { lastVisit, lastVisited, readAt } from './support/state.ts'

/**
 * The index's memory: what is New, what has been Read, and what has been
 * Revised since it was Read.
 *
 * New and Read are independent concepts and both are needed — an old Article
 * never opened is unread but not New — so what is asserted here is that they
 * stay independent, and that only New is ever counted. A cumulative unread
 * total appears nowhere: at roughly a hundred Articles a day such a number
 * only ever climbs, and a reading application should not become a source of
 * obligation.
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

/** What the index says arrived since the Last Visit. */
function newCount(body: string): string {
  return /<p class="new[^"]*">(?<count>[^<]*)<\/p>/.exec(body)?.groups?.['count'] ?? ''
}

/** Marking everything Read, as the reader does it: the form on the index. */
async function markAllRead(from = '/'): Promise<Response> {
  return readerAs(cookie, READ_ALL_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ return: from }).toString(),
  })
}

describe('what is New', () => {
  it('is everything, before the index has ever been opened', async () => {
    await lastVisited(null)
    await seed(
      anArticle({ guid: 'one', firstSeenAt: '2026-08-09T06:00:00.000Z' }),
      anArticle({ guid: 'two', firstSeenAt: '2026-08-09T08:00:00.000Z' }),
    )

    expect(newCount(await index())).toBe('2 new')
  })

  it('is what arrived since the Last Visit, and not what was already there', async () => {
    await lastVisited('2026-08-09T07:00:00.000Z')
    await seed(
      anArticle({ guid: 'before', firstSeenAt: '2026-08-09T06:00:00.000Z' }),
      anArticle({ guid: 'after', firstSeenAt: '2026-08-09T08:00:00.000Z' }),
    )

    expect(newCount(await index())).toBe('1 new')
  })

  it('counts arrival and not publication, so a late-published Article still counts', async () => {
    await lastVisited('2026-08-09T07:00:00.000Z')
    await seed(
      anArticle({
        guid: 'long-published',
        publishedAt: hoursAgo(200),
        firstSeenAt: '2026-08-09T08:00:00.000Z',
      }),
    )

    expect(newCount(await index())).toBe('1 new')
  })

  it('says so in words when nothing has arrived', async () => {
    await lastVisited('2026-08-09T07:00:00.000Z')
    await seed(anArticle({ firstSeenAt: '2026-08-09T06:00:00.000Z' }))

    expect(newCount(await index())).toBe('Nothing new')
  })

  it('is never a cumulative unread total: Articles unread since before the visit are not counted', async () => {
    await lastVisited('2026-08-09T07:00:00.000Z')
    await seed(
      anArticle({ guid: 'a', firstSeenAt: '2026-08-09T01:00:00.000Z' }),
      anArticle({ guid: 'b', firstSeenAt: '2026-08-09T02:00:00.000Z' }),
      anArticle({ guid: 'c', firstSeenAt: '2026-08-09T03:00:00.000Z' }),
    )

    const body = await index()

    // All three are listed and none of them has been Read. Their number is
    // still not a number the reader is shown.
    expect(body.match(/class="entry/g)).toHaveLength(3)
    expect(newCount(body)).toBe('Nothing new')
  })

  it('does not count an Article again because it was Revised', async () => {
    await lastVisited('2026-08-09T07:00:00.000Z')
    const article = anArticle({ firstSeenAt: '2026-08-09T06:00:00.000Z' })
    await seed(article)

    await revise({ ...article, updatedAt: '2026-08-09T09:30:00.000Z' })

    expect(newCount(await index())).toBe('Nothing new')
  })
})

describe('the Last Visit', () => {
  it('advances when the index is viewed', async () => {
    const before = hoursAgo(3)
    await lastVisited(before)

    await index()

    expect(new Date((await lastVisit()) ?? '').getTime()).toBeGreaterThan(
      new Date(before).getTime(),
    )
  })

  it('advances when the index is viewed under a filter, which is still the index', async () => {
    const before = hoursAgo(3)
    await lastVisited(before)

    await index('/?section=racing')

    expect(await lastVisit()).not.toBe(before)
  })

  it('leaves nothing New on the visit after the one that counted it', async () => {
    await lastVisited(null)
    await seed(anArticle({ firstSeenAt: hoursAgo(2) }))

    expect(newCount(await index())).toBe('1 new')
    expect(newCount(await index())).toBe('Nothing new')
  })
})

describe('marking everything Read', () => {
  it('is reachable in one action from the index', async () => {
    expect(await index()).toContain(`action="${READ_ALL_PATH}"`)
  })

  it('clears the New count', async () => {
    await lastVisited(null)
    await seed(anArticle({ firstSeenAt: hoursAgo(2) }))

    await markAllRead()

    expect(newCount(await index())).toBe('Nothing new')
  })

  it('dims every Article without removing any of them', async () => {
    await seed(anArticle({ guid: 'one' }), anArticle({ guid: 'two' }))

    await markAllRead()

    const body = await index()
    expect(body.match(/class="entry entry--read"/g)).toHaveLength(2)
  })

  it('returns the reader to the index they pressed it from, filter and all', async () => {
    const response = await markAllRead('/?section=tech&source=cyclingweekly')

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/?section=tech&source=cyclingweekly')
  })

  it('goes to the index rather than anywhere a form field asks for', async () => {
    const response = await markAllRead('https://elsewhere.example/')

    expect(response.headers.get('location')).toBe('/')
  })

  it('leaves alone the moment an Article was first Read', async () => {
    const article = anArticle()
    await seed(article)
    await readerAs(cookie, articlePath(article))

    const first = await readAt(article.source, article.guid)
    await markAllRead()

    expect(await readAt(article.source, article.guid)).toBe(first)
  })
})

describe('the Updated Marker', () => {
  it('appears where a Revision post-dates the moment the Article was Read', async () => {
    const article = anArticle({ updatedAt: hoursAgo(5) })
    await seed(article)
    await readerAs(cookie, articlePath(article))

    // The race report gains its results a moment after it was opened.
    await revise({ ...article, updatedAt: new Date(Date.now() + 1000).toISOString() })

    expect(await index()).toContain('class="updated"')
  })

  it('does not appear on an Article never Read', async () => {
    const article = anArticle({ publishedAt: hoursAgo(5), updatedAt: hoursAgo(1) })
    await seed(article)

    expect(await index()).not.toContain('class="updated"')
  })

  it('does not appear where the Revision came before the Read', async () => {
    const article = anArticle({ updatedAt: hoursAgo(5) })
    await seed(article)
    await readerAs(cookie, articlePath(article))

    expect(await index()).not.toContain('class="updated"')
  })

  it('does not return the Article to the top of the index', async () => {
    const older = anArticle({
      guid: 'older',
      headline: 'Published yesterday',
      publishedAt: hoursAgo(30),
    })
    await seed(
      older,
      anArticle({ guid: 'newer', headline: 'Published this hour', publishedAt: hoursAgo(1) }),
    )

    await revise({ ...older, updatedAt: new Date().toISOString() })

    const body = await index()

    expect(body.indexOf('Published this hour')).toBeLessThan(body.indexOf('Published yesterday'))
  })
})
