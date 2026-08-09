import type { SourceId } from '../shared/article.ts'
import type { Section } from '../shared/section.ts'
import { isSection } from '../shared/section.ts'
import { isSourceId } from '../shared/source.ts'

/**
 * The lens the index is being read through: a Section, a Source, both, or
 * neither.
 *
 * It lives in the URL rather than in a cookie or in `app_state`, because a
 * filter is where the reader is and not what the reader prefers — the back
 * button should undo it, a link should carry it, and a second device should
 * not inherit it. Nothing here runs JavaScript (ADR-0008): a chip is a link to
 * the same index at a different query, which is what a chip has always been
 * underneath.
 */

export interface IndexFilter {
  readonly section: Section | null
  readonly source: SourceId | null
}

/** The whole index: every Section, both Sources. */
export const NO_FILTER: IndexFilter = { section: null, source: null }

const SECTION_PARAM = 'section'
const SOURCE_PARAM = 'source'

/**
 * The filter a request is asking for.
 *
 * A value that names no Section or no Source is dropped rather than refused: a
 * query string is the reader's own input, an unrecognised one means the index,
 * and a 400 in place of a page of headlines would help nobody.
 */
export function parseFilter(params: URLSearchParams): IndexFilter {
  const section = params.get(SECTION_PARAM)
  const source = params.get(SOURCE_PARAM)

  return {
    section: isSection(section) ? section : null,
    source: isSourceId(source) ? source : null,
  }
}

export function isFiltered(filter: IndexFilter): boolean {
  return filter.section !== null || filter.source !== null
}

/**
 * Where this filter is read: what a chip links to, what the appearance control
 * returns to, and where marking everything Read comes back to. The unfiltered
 * index is `/` and not `/?`, so that the reader's most common destination has
 * the reader's shortest URL.
 */
export function filterPath(filter: IndexFilter): string {
  const params = new URLSearchParams()

  if (filter.section !== null) params.set(SECTION_PARAM, filter.section)
  if (filter.source !== null) params.set(SOURCE_PARAM, filter.source)

  const query = params.toString()

  return query === '' ? '/' : `/?${query}`
}
