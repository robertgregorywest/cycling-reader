import { describe, expect, it } from 'vitest'
import {
  extract,
  extractReadability,
  extractTargeted,
} from '../../../src/ingest/extraction/index.ts'
import {
  MINIMUM_TEXT_LENGTH,
  findValidationFailure,
} from '../../../src/ingest/extraction/validate.ts'
import { fixture, readFixture } from '../../fixtures/corpus.ts'

const URL_OF_A_SOURCE_PAGE = 'https://www.cyclingnews.com/pro-cycling/racing/some-article/'

/** A page shaped like a Source page, with whatever body we want to try. */
const pageWith = (body: string) => `<!doctype html>
<html><head><title>An Article</title></head><body>
  <header><a href="/">Cyclingnews</a></header>
  <article><h1>An Article</h1><div id="article-body">${body}</div></article>
</body></html>`

const prose = (sentence: string, times: number) =>
  Array.from({ length: times }, (_, index) => `<p>${sentence} (${index}).</p>`).join('')

describe('validation', () => {
  it('rejects a body with no paragraph', () => {
    expect(findValidationFailure({ html: '<h2>Results</h2>', textLength: 4000 })).toBe(
      'no-paragraph',
    )
  })

  it('rejects a body below the minimum text length', () => {
    expect(
      findValidationFailure({ html: '<p>Too short.</p>', textLength: MINIMUM_TEXT_LENGTH - 1 }),
    ).toBe('below-minimum-length')
  })

  it('rejects a body that begins with the share bar', () => {
    const html = `<p>Copy link Facebook X Pinterest Email Share this article</p>${prose('Race prose', 40)}`
    expect(findValidationFailure({ html, textLength: 4000 })).toBe('begins-with-share-bar')
  })

  it('accepts a body that is prose of a reasonable length', () => {
    expect(findValidationFailure({ html: prose('Race prose', 40), textLength: 4000 })).toBeNull()
  })
})

describe('when the targeted path fails, Readability runs instead', () => {
  it('falls back when the body container holds no paragraph', () => {
    const html = pageWith(`<div class="live-post">${'Live text. '.repeat(200)}</div>`)
    expect(extractTargeted(html, { url: URL_OF_A_SOURCE_PAGE }).failure).toBe('no-paragraph')
    expect(extract(html, { url: URL_OF_A_SOURCE_PAGE }).method).toBe('readability')
  })

  it('falls back when the body container holds only a teaser', () => {
    const html = pageWith(`<p>The first two lines, and then a wall.</p>${'<div class="paywall"></div>'}${'<p>x</p>'.repeat(0)}`)
    expect(extractTargeted(html, { url: URL_OF_A_SOURCE_PAGE }).failure).toBe(
      'below-minimum-length',
    )
  })

  it('falls back when a redesign has moved the body container', () => {
    const entry = fixture('cyclingweekly-redesigned-body-container')
    const result = extract(readFixture(entry.name), { url: entry.url })
    expect(extractTargeted(readFixture(entry.name), { url: entry.url }).failure).toBe(
      'no-body-container',
    )
    expect(result.method).toBe('readability')
    expect(result.textLength).toBeGreaterThan(MINIMUM_TEXT_LENGTH)
  })

  it('recovers the same journalism the targeted path would have found', () => {
    const redesigned = fixture('cyclingweekly-redesigned-body-container')
    const intact = fixture('cyclingweekly-news-item')
    const recovered = extract(readFixture(redesigned.name), { url: redesigned.url })
    const targeted = extract(readFixture(intact.name), { url: intact.url })

    expect(recovered.html).toContain('82-year-old Bob Montgomery')
    expect(targeted.html).toContain('82-year-old Bob Montgomery')
  })

  it('holds Readability output to the same Tag Allowlist', () => {
    const entry = fixture('cyclingnews-live-blog')
    const html = extract(readFixture(entry.name), { url: entry.url }).html
    expect(html).not.toMatch(/\sclass=|\sstyle=|<script|<iframe/i)
  })
})

describe('when both paths fail, the Article becomes a Stub', () => {
  it('stubs a page the Source no longer serves', () => {
    const entry = fixture('cyclingnews-removed-article')
    const html = readFixture(entry.name)

    expect(extractTargeted(html, { url: entry.url }).failure).toBe('no-body-container')
    expect(extractReadability(html, { url: entry.url }).failure).not.toBeNull()
    expect(extract(html, { url: entry.url })).toEqual({
      method: 'stub',
      html: '',
      textLength: 0,
    })
  })

  it('stubs a page with nothing on it rather than returning broken content', () => {
    const html = '<!doctype html><html><body><div id="article-body"></div></body></html>'
    expect(extract(html, { url: URL_OF_A_SOURCE_PAGE }).method).toBe('stub')
  })
})
