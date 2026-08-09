import { beforeAll } from 'vitest'

/**
 * The reader reaches nothing but its own database. Images are hotlinked from
 * the Source CDN by the *browser*, never fetched here, and Extraction happens
 * in an Ingest Run on another runtime entirely (ADR-0001).
 *
 * This makes that a property of the suite rather than a convention, as the
 * Node project does for Extraction: a Worker that grew a subrequest would fail
 * here rather than against the free plan's limit of fifty of them.
 */
beforeAll(() => {
  globalThis.fetch = (() => {
    throw new Error('Tests run with no network access: fetch() was attempted')
  }) as unknown as typeof globalThis.fetch
})
