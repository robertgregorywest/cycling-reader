/**
 * Extraction — the act of reducing a Source's article page to clean reading
 * content, and the result of doing so. See CONTEXT.md.
 */

/**
 * Which method produced an Extraction. Recorded per Article so that a Source
 * redesign appears as a visible cliff in the data rather than a vague sense
 * that the reader has degraded. See ADR-0004.
 */
export type ExtractionMethod = 'targeted' | 'readability' | 'stub'

export interface Extraction {
  /** How the body was produced. */
  readonly method: ExtractionMethod
  /**
   * Clean body HTML, already sanitised: the Worker emits it verbatim.
   * Empty when the method is `stub`.
   */
  readonly html: string
  /** Length of the body's visible text. Zero when the method is `stub`. */
  readonly textLength: number
}

/** An Article whose Extraction failed is retained as a Stub, not discarded. */
export const STUB: Extraction = { method: 'stub', html: '', textLength: 0 }
