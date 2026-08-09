import type { ExtractionMethod } from './extraction.ts'

/**
 * An Ingest Run either succeeds wholly or fails loudly (ADR-0006). There is no
 * third state: a Run that half-worked is a failed Run with some Articles in it.
 */
export type RunOutcome = 'succeeded' | 'failed'

/**
 * What one Ingest Run recorded about itself, as the `ingest_runs` row holds it.
 *
 * Written by every Run, including one that ends badly — a Run that failed
 * without recording itself is exactly the silent failure ADR-0006 exists to
 * prevent — and read by the next Run, which compares the Feed against the
 * moment its predecessor looked, and later by the index footer, where
 * staleness is the failure most worth noticing.
 */
export interface RunRecord {
  readonly startedAt: string
  readonly finishedAt: string
  readonly admitted: number
  /**
   * Articles Revised, counted apart from Articles admitted: three quarters of
   * items are Revised at least once, so a Run that admits nothing and revises
   * twenty is healthy, and a record that conflated the two would hide it.
   */
  readonly revised: number
  /**
   * The Extraction method split. A rising readability count against a falling
   * targeted count is a Source redesign, which is otherwise invisible.
   */
  readonly extractionMethods: Readonly<Record<ExtractionMethod, number>>
  readonly outcome: RunOutcome
  /** Which tripwire the Run hit, in words. Null when it succeeded. */
  readonly failure: string | null
}
