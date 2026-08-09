import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { D1ArticleStore, D1HttpDatabase } from '../../../src/ingest/store/d1.ts'
import {
  applyMigrationsToD1,
  migrationNames,
  pendingMigrationsOnD1,
} from '../../../src/ingest/store/migrations.ts'
import { TEST_CREDENTIALS, fakeD1, type FakeD1 } from '../../support/d1.ts'

/**
 * D1 is told about the schema by `pnpm migrate`, from the same directory of
 * SQL the local store applies to itself. These tests are about that telling:
 * an empty database reaching the current schema, and a database already at it
 * being left alone.
 */

let d1: FakeD1
let database: D1HttpDatabase

beforeEach(() => {
  // A database with nothing in it at all, unlike the migrated one the store
  // tests are given: this is the state a newly created D1 database is in.
  d1 = fakeD1({ migrated: false })
  database = new D1HttpDatabase(TEST_CREDENTIALS, d1.fetch)
})

afterEach(() => {
  d1.close()
})

describe('a D1 database that has never been migrated', () => {
  it('has every migration outstanding', async () => {
    expect(await pendingMigrationsOnD1(database)).toEqual(migrationNames())
  })

  it('reaches a schema an Ingest Run can write through', async () => {
    await applyMigrationsToD1(database)

    const store = new D1ArticleStore(database)
    await store.addArticle(
      {
        source: 'cyclingnews',
        guid: 'Djx8QZAfLkekqGKNHgJzwj',
        url: 'https://www.cyclingnews.com/pro-cycling/racing/an-article/',
        headline: 'An Article',
        teaser: 'A teaser',
        author: null,
        section: 'racing',
        publishedAt: '2026-08-08T14:41:47.000Z',
        updatedAt: '2026-08-08T14:50:46.000Z',
        bodyHtml: '<p>A body.</p>',
        extractionMethod: 'targeted',
        textLength: 7,
        heroImageUrl: null,
        heroImageAlt: null,
        firstSeenAt: '2026-08-09T06:00:00.000Z',
      },
      [],
    )

    expect(await store.article('cyclingnews', 'Djx8QZAfLkekqGKNHgJzwj')).not.toBeNull()
  })

  it('holds the single row of application state the reader assumes exists', async () => {
    await applyMigrationsToD1(database)

    const [state] = await database.batch<{ id: number; last_visit_at: string | null }>([
      { sql: 'SELECT * FROM app_state', params: [] },
    ])

    expect(state?.rows).toEqual([{ id: 1, last_visit_at: null }])
  })
})

describe('a D1 database already at the current schema', () => {
  it('has nothing outstanding, and applying again changes nothing', async () => {
    expect(await applyMigrationsToD1(database)).toEqual(migrationNames())

    expect(await pendingMigrationsOnD1(database)).toEqual([])
    expect(await applyMigrationsToD1(database)).toEqual([])
  })
})
