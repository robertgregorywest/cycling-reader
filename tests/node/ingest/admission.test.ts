import { describe, expect, it } from 'vitest'
import { sectionOf } from '../../../src/ingest/admission.ts'
import { SOURCES, sourceConfig, type SourceConfig } from '../../../src/ingest/config.ts'
import { SECTIONS } from '../../../src/shared/section.ts'

/**
 * Whether an Article enters the reader at all is decided by the Ingest Run,
 * and is tested there. What is left here is the checked-in configuration
 * itself: that the paths it names map where they say they do, and that a path
 * matches whole segments rather than prefixes of words.
 */

describe('the Section Allowlist', () => {
  it('maps only into the reader\'s own Section vocabulary', () => {
    for (const source of SOURCES) {
      for (const section of Object.values(source.sectionPaths)) {
        expect(SECTIONS).toContain(section)
      }
    }
  })

  it('names no path as both journalism and commerce', () => {
    for (const source of SOURCES) {
      for (const path of source.commercePaths) {
        expect(Object.keys(source.sectionPaths)).not.toContain(path)
      }
    }
  })

  it('matches whole path segments, not the openings of words', () => {
    const cyclingweekly = sourceConfig('cyclingweekly')

    expect(sectionOf('news/a-news-item', cyclingweekly)).toBe('news')
    expect(sectionOf('newsletter-signup', cyclingweekly)).toBe('other')
  })

  it('lets the longest matching path win', () => {
    const cyclingnews = sourceConfig('cyclingnews')

    expect(sectionOf('pro-cycling/womens-cycling/an-article', cyclingnews)).toBe('womens')
    expect(sectionOf('pro-cycling/an-article', cyclingnews)).toBe('other')
  })

  describe('categorySections (ADR-0010)', () => {
    const source: SourceConfig = {
      id: 'cyclingnews',
      feedUrl: 'https://example.test/feed',
      sectionPaths: { 'road-racing': 'racing', 'road-racing/gear': 'tech' },
      commercePaths: [],
      liveBlogPaths: [],
      targetedExtraction: true,
      categorySections: { "Women's Cycling": 'womens' },
    }

    it('refines a racing result into the Category-mapped Section', () => {
      expect(sectionOf('road-racing/an-article', source, ["Women's Cycling"])).toBe('womens')
    })

    it('leaves racing alone when no Category matches', () => {
      expect(sectionOf('road-racing/an-article', source, ['Some Other Category'])).toBe('racing')
    })

    it('never overrides a Section other than racing', () => {
      expect(sectionOf('road-racing/gear/an-article', source, ["Women's Cycling"])).toBe('tech')
    })

    it('does nothing for a Source with no categorySections entries', () => {
      const cyclingnews = sourceConfig('cyclingnews')

      expect(sectionOf('pro-cycling/racing/an-article', cyclingnews, ["Women's Cycling"])).toBe(
        'racing',
      )
    })
  })
})
