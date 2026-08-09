import { beforeEach } from 'vitest'

/**
 * The reader reaches nothing but its own database and its own bucket. Images
 * are hotlinked from the Source CDN by the *browser*, and Extraction happens in
 * an Ingest Run on another runtime entirely (ADR-0001).
 *
 * The one exception is Mirroring, which fetches an Article's images at the
 * moment of Saving (ADR-0005) — so this is a default rather than an absolute:
 * every test starts with no network, and a test about Saving stands up the
 * Source CDN it needs with `sourceCdn` in `support/cdn.ts`.
 *
 * Reset before each test rather than once, so that a test that stood the CDN up
 * cannot leave it up for the next one — a Worker that grew an unnoticed
 * subrequest should fail here rather than against the free plan's limit of
 * fifty of them.
 */
beforeEach(() => {
  globalThis.fetch = (() => {
    throw new Error('Tests run with no network access: fetch() was attempted')
  }) as unknown as typeof globalThis.fetch
})
