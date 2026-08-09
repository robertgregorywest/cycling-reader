import type { ExtractionMethod } from '../../shared/extraction.ts'
import { sourceName } from '../../shared/source.ts'
import type { Appearance } from '../appearance.ts'
import { candidates } from '../images.ts'
import type { IndexEntry, ReaderHealth } from '../store.ts'
import { isStale, relativePhrase, relativeTime } from '../time.ts'
import { articlePath } from './article.tsx'
import { Head, Masthead } from './chrome.tsx'

/**
 * The index — the page that answers "is there anything to read?".
 *
 * Its job is triage: finding the one Article worth opening in under ten
 * seconds. That is why it is image-light, with a thumbnail rather than the
 * photography the Article deserves. A screen of hero images per item is
 * exactly the experience the reader exists to replace.
 */

/** The thumbnail's display size in CSS pixels; the CDN is asked for this and
 * for twice it. */
const THUMBNAIL_WIDTH = 72

export function IndexPage({
  entries,
  health,
  appearance,
  now,
}: {
  readonly entries: readonly IndexEntry[]
  readonly health: ReaderHealth
  readonly appearance: Appearance
  readonly now: Date
}) {
  return (
    <html lang="en" data-theme={appearance}>
      <Head title="Cycling Reader" />
      <body>
        <div class="shell">
          <Masthead appearance={appearance} returnTo="/" />

          {entries.length === 0 ? (
            <p class="empty">Nothing yet.</p>
          ) : (
            <ol class="index">
              {entries.map((entry) => (
                <Entry entry={entry} now={now} />
              ))}
            </ol>
          )}

          <Health health={health} now={now} />
        </div>
      </body>
    </html>
  )
}

/**
 * The health footer: when the reader last successfully ingested, and how the
 * Articles above it were extracted.
 *
 * It is here because the failures this reader has are silent ones (ADR-0006).
 * The tripwires mail on failure, but a Run that stopped being scheduled at all
 * sends no mail, and a reader quietly going stale is felt long before it is
 * diagnosed. The index is the one page guaranteed to be looked at, so this is
 * where the diagnosis is put — small, grey, and below everything worth
 * reading, so that on a healthy day the eye passes over it.
 */
function Health({ health, now }: { readonly health: ReaderHealth; readonly now: Date }) {
  const { lastSucceededAt, extractionMethods } = health
  const stale = isStale(lastSucceededAt, now)

  return (
    <footer class={stale ? 'health health--stale' : 'health'}>
      {lastSucceededAt === null ? (
        // Before the first Ingest Run there has been no failure to report:
        // this is a reader waiting for its first Run, not a stale one.
        <span>No Ingest Run yet</span>
      ) : (
        <span>
          Ingested <time datetime={lastSucceededAt}>{relativePhrase(lastSucceededAt, now)}</time>
        </span>
      )}
      <Split methods={extractionMethods} />
    </footer>
  )
}

/**
 * The Extraction method split, naming only the methods that occur.
 *
 * Zeroes are omitted because the healthy reading of this line is "everything
 * came through the targeted path", and printing `0 readability · 0 stub` makes
 * the reader check three numbers to learn it.
 */
function Split({ methods }: { readonly methods: Readonly<Record<ExtractionMethod, number>> }) {
  const counts = ORDER.filter((method) => methods[method] > 0).map(
    (method) => `${methods[method]} ${method}`,
  )

  if (counts.length === 0) return null

  return <span class="split">{counts.join(' · ')}</span>
}

/** Best first, so a rising fallback count reads as something arriving from the
 * right. */
const ORDER: readonly ExtractionMethod[] = ['targeted', 'readability', 'stub']

function Entry({ entry, now }: { readonly entry: IndexEntry; readonly now: Date }) {
  return (
    <li class={entry.isRead ? 'entry entry--read' : 'entry'}>
      {/* An Article opens in the reader; a Stub goes straight to its Source,
          because following that link is the whole of how a Stub is read and
          an intermediate page would be a click that says nothing. */}
      <a href={entry.isStub ? entry.url : articlePath(entry)}>
        <Thumbnail entry={entry} />
        <span>
          <span class="headline">{entry.headline}</span>
          {entry.teaser === '' ? null : <span class="teaser">{entry.teaser}</span>}
          <span class="meta">
            <span class="source">{sourceName(entry.source)}</span>
            <time datetime={entry.publishedAt}>{relativeTime(entry.publishedAt, now)}</time>
            {entry.isStub ? <span class="stub">At the Source</span> : null}
          </span>
        </span>
      </a>
    </li>
  )
}

/**
 * The Feed's hero image at thumbnail size, or the space where one would be.
 *
 * The space is kept deliberately: an Article without a hero image would
 * otherwise pull its headline left and break the column the eye is scanning
 * down.
 */
function Thumbnail({ entry }: { readonly entry: IndexEntry }) {
  if (entry.heroImageUrl === null) return <span class="thumb thumb--absent" aria-hidden="true" />

  const { src, srcSet } = candidates(entry.heroImageUrl, THUMBNAIL_WIDTH)

  return (
    <img
      class="thumb"
      src={src}
      srcset={srcSet}
      width={THUMBNAIL_WIDTH}
      height={THUMBNAIL_WIDTH}
      // Empty rather than the Feed's alt text: the thumbnail sits inside a link
      // the headline already names, so announcing it twice is noise.
      alt=""
      loading="lazy"
      decoding="async"
    />
  )
}
