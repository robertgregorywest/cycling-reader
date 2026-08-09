import type { ExtractionMethod } from '../shared/extraction.ts'
import type { SourceReport } from './run.ts'

/**
 * The assertions an Ingest Run makes about itself before it is allowed to
 * finish green (ADR-0006).
 *
 * Every plausible failure in this system is silent. A Source redesign routes
 * Extraction to the Readability fallback and Articles quietly get worse. A
 * changed Feed URL produces a Run that ingests nothing and exits green. GitHub
 * only sends mail on failure, so a green tick beside an empty database is the
 * default outcome, and nobody is watching a dashboard for a personal reader.
 *
 * These are therefore deliberately blunt: each names a condition that cannot
 * arise from a quiet news day, only from something being wrong.
 */

/**
 * Above this share of bodies coming from Readability rather than the targeted
 * path, the Run fails. Twenty per cent is one Article in five arriving through
 * the fallback: tolerable as an occasional odd page, and not a rate the
 * Sources reach without something having changed at them (ADR-0004).
 */
export const FALLBACK_THRESHOLD = 0.2

/**
 * The rate is not judged below this many bodies. A Run that extracted three
 * Articles and reached for Readability once is not evidence of a redesign; it
 * is a Run that extracted three Articles, and failing it would train the one
 * person who reads the failure mail to ignore it.
 */
const MINIMUM_EXTRACTIONS = 5

/** What the tripwires need to know about the Run that just happened. */
export interface RunUnderTest {
  readonly sources: readonly SourceReport[]
  readonly extractionMethods: Readonly<Record<ExtractionMethod, number>>
}

/**
 * The reason this Run must fail, in the words the failure is recorded and
 * mailed in — or null if it passed every tripwire.
 *
 * `previousRun` is when the Run before this one started, or null before the
 * first Run there ever was, when nothing can yet be said about what is new.
 */
export function tripwire(run: RunUnderTest, previousRun: string | null): string | null {
  return (
    feedParsedToNothing(run) ?? admittedNothingNew(run, previousRun) ?? fallbackRateTooHigh(run)
  )
}

/**
 * A Feed that parses to zero items is a changed Feed URL, a Source outage or a
 * document that is no longer RSS. It is never a Source that published nothing:
 * a Feed carries its last fifty items regardless of the news.
 */
function feedParsedToNothing(run: RunUnderTest): string | null {
  for (const source of run.sources) {
    if (source.feedItems === 0) {
      return `${source.source}: the Feed parsed to zero items`
    }
  }
  return null
}

/**
 * The Feed offers an Article this Run would have admitted, published since the
 * previous Run looked, and yet the Run admitted nothing. Something between the
 * Feed and the store is dropping Articles on the floor.
 *
 * Judged per Source, because a changed Feed URL or a redesign is a thing that
 * happens to one Source while the other carries on, and a Run summed across
 * both would hide it.
 *
 * Only items the Section Allowlist admits are counted: paid Articles, live
 * blogs and commerce paths are excluded by design, and a Run that admitted
 * nothing because the only fresh item was a product review is a Run that
 * worked.
 */
function admittedNothingNew(run: RunUnderTest, previousRun: string | null): string | null {
  if (previousRun === null) return null

  for (const source of run.sources) {
    const newest = source.newestAdmissible
    if (source.admitted === 0 && newest !== null && newest > previousRun) {
      return `${source.source}: admitted nothing, though the Feed offers an item published ${newest}, after the previous Run started at ${previousRun}`
    }
  }
  return null
}

/**
 * Bodies are arriving through the fallback rather than the targeted path. The
 * Articles still read, which is why this is otherwise invisible: they simply
 * get worse, keeping page furniture the targeted path would have dropped.
 *
 * Stubs are not counted on either side. A Stub is a legitimate Article whose
 * page could not be fetched or read at all, not a body of lesser quality.
 */
function fallbackRateTooHigh(run: RunUnderTest): string | null {
  const { targeted, readability } = run.extractionMethods
  const bodies = targeted + readability
  if (bodies < MINIMUM_EXTRACTIONS) return null

  const rate = readability / bodies
  if (rate <= FALLBACK_THRESHOLD) return null

  return `Readability produced ${readability} of ${bodies} bodies (${percentage(rate)}), above the ${percentage(FALLBACK_THRESHOLD)} a Source redesign is read from`
}

function percentage(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
