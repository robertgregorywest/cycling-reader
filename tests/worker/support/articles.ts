import { env } from 'cloudflare:workers'
import {
  INSERT_ARTICLE,
  INSERT_IMAGE,
  INSERT_RUN,
  UPDATE_ARTICLE,
  insertArticleParams,
  insertImageParams,
  insertRunParams,
  updateArticleParams,
} from '../../../src/ingest/store/sql.ts'
import type { Article, ArticleImage } from '../../../src/shared/article.ts'
import type { RunRecord } from '../../../src/shared/run.ts'

/**
 * Articles in the reader's database, written with the statement an Ingest Run
 * writes them with.
 *
 * Deliberately not a hand-rolled INSERT: the Worker is being tested against
 * what ingest actually produces, and a seed that wrote its own columns could
 * agree with the Worker while both disagreed with production.
 */

const DEFAULTS: Article = {
  source: 'cyclingnews',
  guid: 'Djx8QZAfLkekqGKNHgJzwj',
  url: 'https://www.cyclingnews.com/pro-cycling/racing/an-article/',
  headline: 'An Article',
  teaser: 'A teaser, one line long.',
  author: 'A Journalist',
  section: 'racing',
  publishedAt: '2026-08-09T09:00:00.000Z',
  updatedAt: '2026-08-09T09:00:00.000Z',
  bodyHtml: '<p>A body.</p>',
  extractionMethod: 'targeted',
  textLength: 7,
  heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg',
  heroImageAlt: 'A hero image',
  firstSeenAt: '2026-08-09T09:05:00.000Z',
}

export function anArticle(overrides: Partial<Article> = {}): Article {
  return { ...DEFAULTS, ...overrides }
}

/** An Article whose Extraction failed: a legitimate Article, read by following
 * the link to its Source. */
export function aStub(overrides: Partial<Article> = {}): Article {
  return anArticle({ extractionMethod: 'stub', bodyHtml: '', textLength: 0, ...overrides })
}

export async function seed(...articles: readonly Article[]): Promise<void> {
  for (const article of articles) {
    await env.DB.prepare(INSERT_ARTICLE)
      .bind(...insertArticleParams(article))
      .run()
  }
}

/**
 * The images within an Article's body, written with the statement an Ingest Run
 * writes them with — in the order they are read, which is what `position`
 * means.
 *
 * Recorded separately from the body HTML that carries them, exactly as ingest
 * records them, so that a test Saving this Article Mirrors the same set the
 * article view then renders from.
 */
export async function seedImages(article: Article, ...urls: readonly string[]): Promise<void> {
  for (const [position, url] of urls.entries()) {
    const image: ArticleImage = { position, url, alt: null, caption: null }

    await env.DB.prepare(INSERT_IMAGE)
      .bind(...insertImageParams(article, image))
      .run()
  }
}

/**
 * An Article whose body carries these images, with the rows recording them —
 * the pair an Ingest Run always writes together.
 */
export async function seedWithImages(
  article: Article,
  ...urls: readonly string[]
): Promise<Article> {
  const figures = urls.map((url) => `<img src="${url}" alt="A photograph">`).join('')
  const withBody = { ...article, bodyHtml: `${article.bodyHtml}${figures}` }

  await seed(withBody)
  await seedImages(withBody, ...urls)

  return withBody
}

/**
 * An Article Revised at its Source, re-Extracted as an Ingest Run re-Extracts
 * it: with the statement that names the Source's columns and leaves the
 * reader's own — `read_at`, and `first_seen_at` — where they were.
 */
export async function revise(article: Article): Promise<void> {
  await env.DB.prepare(UPDATE_ARTICLE)
    .bind(...updateArticleParams(article))
    .run()
}

/** An instant the given number of hours before now, for asserting on relative
 * times without pinning a clock. */
export function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()
}

const A_RUN: RunRecord = {
  startedAt: '2026-08-09T10:00:00.000Z',
  finishedAt: '2026-08-09T10:04:00.000Z',
  admitted: 4,
  revised: 11,
  extractionMethods: { targeted: 15, readability: 0, stub: 0 },
  outcome: 'succeeded',
  failure: null,
}

/** An Ingest Run that recorded itself, ended at the given moment. Started five
 * minutes before it finished, which is what a Run takes. */
export function aRun(overrides: Partial<RunRecord> = {}): RunRecord {
  const finishedAt = overrides.finishedAt ?? A_RUN.finishedAt
  const startedAt = new Date(new Date(finishedAt).getTime() - 5 * 60 * 1000).toISOString()

  return { ...A_RUN, startedAt, ...overrides }
}

/** Record Runs with the statement an Ingest Run records itself with. */
export async function seedRuns(...runs: readonly RunRecord[]): Promise<void> {
  for (const run of runs) {
    await env.DB.prepare(INSERT_RUN)
      .bind(...insertRunParams(run))
      .run()
  }
}
