import type { Appearance } from '../appearance.ts'
import { NO_FILTER } from '../filters.ts'
import type { IndexEntry } from '../store.ts'
import { Head, Masthead } from './chrome.tsx'
import { Entry } from './entries.tsx'

/**
 * The Archive — everything the reader kept on purpose.
 *
 * It has a destination of its own rather than being a chip on the index,
 * because it is a different thing from the Stream: the Stream is thirty days of
 * disposable news and the Archive is what survived that decision, permanently,
 * with its images Mirrored. Filing the durable collection behind a filter on
 * the disposable one makes the part worth keeping the hardest part to reach
 * (ADR-0009).
 *
 * No filters, no health footer, no count of what is New. None of those are
 * questions the Archive answers: it is not triage and nothing arrives in it
 * except by the reader's own hand.
 */

export const ARCHIVE_PATH = '/archive'

export function ArchivePage({
  entries,
  appearance,
  now,
}: {
  readonly entries: readonly IndexEntry[]
  readonly appearance: Appearance
  readonly now: Date
}) {
  return (
    <html lang="en" data-theme={appearance}>
      <Head title="Archive — Cycling Reader" />
      <body>
        <div class="shell">
          <Masthead appearance={appearance} returnTo={ARCHIVE_PATH} home="/" />

          <h2 class="collection">Archive</h2>

          {entries.length === 0 ? (
            // Not an error and not an empty index: an Archive fills only by
            // deliberate act, so an empty one means nothing has been kept yet.
            <p class="empty">Nothing Saved yet.</p>
          ) : (
            <ol class="index">
              {entries.map((entry) => (
                <Entry entry={entry} filter={NO_FILTER} now={now} returnTo={ARCHIVE_PATH} />
              ))}
            </ol>
          )}
        </div>
      </body>
    </html>
  )
}
