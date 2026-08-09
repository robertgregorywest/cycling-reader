import type { ExtractionMethod } from './extraction.ts'
import type { Section } from './section.ts'

/** The Sources the reader draws from. See `src/ingest/config.ts`. */
export type SourceId = 'cyclingnews' | 'cyclingweekly'

/**
 * An Article — a single piece of journalism from a Source, identified by the
 * Source plus the Feed's opaque `guid`. An Article always exists once
 * admitted, whether or not its body was successfully extracted: one whose
 * Extraction failed is a Stub, which is a legitimate Article and not an error
 * state. See CONTEXT.md.
 *
 * Every timestamp is an ISO 8601 instant in UTC. `publishedAt` is never null,
 * because Expiry's predicate depends on it.
 */
export interface Article {
  readonly source: SourceId
  readonly guid: string
  /** The Article's URL at its Source — the link a Stub is read by following. */
  readonly url: string
  readonly headline: string
  readonly teaser: string
  readonly author: string | null
  readonly section: Section
  readonly publishedAt: string
  readonly updatedAt: string
  /** Clean body HTML, already sanitised. Empty when the Article is a Stub. */
  readonly bodyHtml: string
  readonly extractionMethod: ExtractionMethod
  readonly textLength: number
  /** The Feed's hero image, retained even for a Stub. */
  readonly heroImageUrl: string | null
  readonly heroImageAlt: string | null
  /** When the Ingest Run that admitted this Article ran. */
  readonly firstSeenAt: string
}

/** An Article as the store holds it, with the reader's own state alongside. */
export interface StoredArticle extends Article {
  readonly readAt: string | null
  readonly savedAt: string | null
}

/**
 * An image within an Article's body, recorded individually rather than
 * discovered by re-parsing the stored HTML later: Mirroring needs somewhere to
 * record its key, and re-parsing would run the parse twice with two
 * opportunities to disagree.
 */
export interface ArticleImage {
  /** Ordinal position within the body, from zero. */
  readonly position: number
  /** The canonical Source CDN URL, stored unrewritten. */
  readonly url: string
  readonly alt: string | null
  readonly caption: string | null
}

/** An image as the store holds it, with its Mirror key once Mirrored. */
export interface StoredArticleImage extends ArticleImage {
  readonly mirrorKey: string | null
}
