import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { extract } from '../../../src/ingest/extraction/index.ts'
import type { ExtractionMethod } from '../../../src/shared/extraction.ts'
import { FIXTURES, readFixture, type Fixture } from '../../fixtures/corpus.ts'
import { normaliseWhitespace } from '../../support/normalise.ts'

/**
 * Which path each page in the corpus is expected to take. A page moving
 * between rows is the cliff ADR-0004 asks to be made visible: the targeted
 * path has stopped working, or has started working again.
 */
const EXPECTED_METHOD: Readonly<Record<string, ExtractionMethod>> = {
  'cyclingnews-race-report': 'targeted',
  'cyclingnews-news-item': 'targeted',
  'cyclingnews-paid-article': 'targeted',
  'cyclingnews-live-blog': 'readability',
  'cyclingnews-removed-article': 'stub',
  'cyclingweekly-race-report': 'targeted',
  'cyclingweekly-news-item': 'targeted',
  'cyclingweekly-tech-review': 'targeted',
  'cyclingweekly-redesigned-body-container': 'readability',
  // Velo runs neither Source's platform, so its `#article-body` container is
  // never present — every Velo page here takes the Readability path.
  'velo-race-report': 'readability',
  'velo-womens-race-report': 'readability',
  'velo-news-item': 'readability',
  'velo-tech-piece': 'readability',
  'velo-tech-piece-gravel': 'readability',
  'velo-unrecognised-path': 'readability',
}

describe.each(FIXTURES)('$name', (entry: Fixture) => {
  const result = extract(readFixture(entry.name), { url: entry.url })

  it('is produced by the expected method', () => {
    expect(result.method).toBe(EXPECTED_METHOD[entry.name])
  })

  it('matches its golden body', () => {
    expect(normaliseWhitespace(result.html)).toBe(normaliseWhitespace(readGolden(entry.name)))
  })

  it('reports the text length of the body it returned', () => {
    expect(result.textLength).toBe(visibleTextLength(result.html))
  })
})

it('covers every kind of page the corpus exists to cover', () => {
  expect(new Set(FIXTURES.map((entry) => entry.kind))).toEqual(
    new Set([
      'race-report',
      'news-item',
      'paid-article',
      'live-blog',
      'tech-piece',
      'removed-article',
      'redesigned-body-container',
      'unrecognised-path',
    ]),
  )
})

it('draws on every Source', () => {
  expect(new Set(FIXTURES.map((entry) => entry.source))).toEqual(
    new Set(['cyclingnews', 'cyclingweekly', 'velo']),
  )
})

function readGolden(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../../fixtures/golden/${name}.html`, import.meta.url)), 'utf8')
}

function visibleTextLength(html: string): number {
  const document = new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document
  return (document.body.textContent ?? '').trim().length
}
