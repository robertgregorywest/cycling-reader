import { beforeEach, describe, expect, it } from 'vitest'
import { aRun, aStub, anArticle, hoursAgo, seed, seedRuns } from './support/articles.ts'
import { readerAs, signIn } from './support/reader.ts'

/**
 * The health footer.
 *
 * Every failure this reader has is silent (ADR-0006): a Run that stopped being
 * scheduled looks exactly like a quiet news day, and a Source redesign
 * produces Articles that still read, only worse. What is asserted here is that
 * both are legible from the one page guaranteed to be looked at.
 */

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
})

async function footer(path = '/'): Promise<string> {
  const response = await readerAs(cookie, path)

  expect(response.status).toBe(200)

  const body = await response.text()
  const match = /<footer class="health[^"]*">.*?<\/footer>/s.exec(body)

  expect(match, 'the index carries a health footer').not.toBeNull()
  return match?.[0] ?? ''
}

describe('the last successful Ingest Run', () => {
  it('is reported in relative terms', async () => {
    await seedRuns(aRun({ finishedAt: hoursAgo(2) }))

    expect(await footer()).toContain('2 hours ago')
  })

  it('is the last one that succeeded, not the last one that ran', async () => {
    await seedRuns(
      aRun({ finishedAt: hoursAgo(9) }),
      aRun({ finishedAt: hoursAgo(1), outcome: 'failed', failure: 'the Feed parsed to zero items' }),
    )

    const body = await footer()

    // Nine hours of failing Runs is nine hours stale, however recently the
    // last of them ran.
    expect(body).toContain('9 hours ago')
    expect(body).toContain('health--stale')
  })

  it('says so plainly when no Ingest Run has ever recorded', async () => {
    const body = await footer()

    expect(body).toContain('No Ingest Run yet')
    // A reader waiting for its first Run is new, not stale.
    expect(body).not.toContain('health--stale')
  })
})

describe('staleness', () => {
  it('is unremarked while Runs are landing', async () => {
    await seedRuns(aRun({ finishedAt: hoursAgo(3) }))

    expect(await footer()).not.toContain('health--stale')
  })

  it('is visually distinct once three Runs have been missed', async () => {
    await seedRuns(aRun({ finishedAt: hoursAgo(7) }))

    expect(await footer()).toContain('health--stale')
  })
})

describe('the Extraction method split', () => {
  it('counts the methods across the Articles the index is showing', async () => {
    await seed(
      anArticle({ guid: 'one', extractionMethod: 'targeted' }),
      anArticle({ guid: 'two', extractionMethod: 'targeted' }),
      anArticle({ guid: 'three', extractionMethod: 'readability' }),
      aStub({ guid: 'four' }),
    )
    await seedRuns(aRun({ finishedAt: hoursAgo(1) }))

    const body = await footer()

    expect(body).toContain('2 targeted')
    expect(body).toContain('1 readability')
    expect(body).toContain('1 stub')
  })

  it('names only the methods that occurred', async () => {
    await seed(anArticle({ extractionMethod: 'targeted' }))
    await seedRuns(aRun({ finishedAt: hoursAgo(1) }))

    const body = await footer()

    expect(body).toContain('1 targeted')
    expect(body).not.toContain('readability')
    expect(body).not.toContain('stub')
  })

  it('is absent rather than zeroed when there are no Articles at all', async () => {
    expect(await footer()).not.toContain('class="split"')
  })

  it('describes the page it sits at the bottom of, filter and all', async () => {
    await seed(
      anArticle({ guid: 'one', section: 'racing', extractionMethod: 'targeted' }),
      anArticle({ guid: 'two', section: 'tech', extractionMethod: 'readability' }),
    )
    await seedRuns(aRun({ finishedAt: hoursAgo(1) }))

    const body = await footer('/?section=racing')

    expect(body).toContain('1 targeted')
    expect(body).not.toContain('readability')
  })
})
