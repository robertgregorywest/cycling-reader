import type { SourceId } from '../../shared/article.ts'
import type { ExtractionMethod } from '../../shared/extraction.ts'
import type { Section } from '../../shared/section.ts'
import { SECTIONS, sectionName } from '../../shared/section.ts'
import { SOURCE_IDS, sourceName } from '../../shared/source.ts'
import type { Appearance } from '../appearance.ts'
import type { IndexFilter } from '../filters.ts'
import { filterPath, isFiltered } from '../filters.ts'
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

/** Where marking everything Read posts. A form and a redirect, like every
 * other control here: nothing in the reader runs JavaScript (ADR-0008). */
export const READ_ALL_PATH = '/read-all'

export function IndexPage({
  entries,
  health,
  filter,
  newCount,
  appearance,
  now,
}: {
  readonly entries: readonly IndexEntry[]
  readonly health: ReaderHealth
  readonly filter: IndexFilter
  /** How many Articles arrived since the Last Visit. The only number the
   * reader is ever shown. */
  readonly newCount: number
  readonly appearance: Appearance
  readonly now: Date
}) {
  const here = filterPath(filter)

  return (
    <html lang="en" data-theme={appearance}>
      <Head title="Cycling Reader" />
      <body>
        <div class="shell">
          <Masthead appearance={appearance} returnTo={here} />

          <Visit newCount={newCount} returnTo={here} />
          <Filters filter={filter} />

          {entries.length === 0 ? (
            // Under a filter, the difference between an empty reader and an
            // empty Section is the difference between something being wrong
            // and nothing having happened in cyclo-cross this week.
            <p class="empty">{isFiltered(filter) ? 'Nothing under this filter.' : 'Nothing yet.'}</p>
          ) : (
            <ol class="index">
              {entries.map((entry) => (
                <Entry entry={entry} filter={filter} now={now} />
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
 * What this visit is: how much has arrived since the last one, and the single
 * action that clears it.
 *
 * The count is of New — Articles that arrived since the Last Visit — and
 * nothing here is a cumulative unread total. That is the whole point of
 * counting this and not that: New resets every time the index is opened, so
 * the number describes what has happened rather than what is owed.
 */
function Visit({ newCount, returnTo }: { readonly newCount: number; readonly returnTo: string }) {
  return (
    <div class="visit">
      <p class={newCount === 0 ? 'new' : 'new new--some'}>
        {newCount === 0 ? 'Nothing new' : `${newCount} new`}
      </p>

      {/* One action, always in the same place, because the moment it is wanted
          is the moment of returning after a week away. */}
      <form class="mark-all" method="post" action={READ_ALL_PATH}>
        <input type="hidden" name="return" value={returnTo} />
        <button type="submit">Mark all read</button>
      </form>
    </div>
  )
}

/**
 * The filters: Section, then Source.
 *
 * Sections are the reader's own normalised taxonomy and never a Source's raw
 * Categories, which is what makes a row of chips honest — `racing` means the
 * same thing whichever publication an Article came from, so the two Sources
 * filter identically rather than nearly.
 *
 * Two independent facets that combine, each with its own way back to all of
 * it. Every chip is a link to this same index at a different query, so the
 * back button undoes a filter and a bookmark keeps one.
 */
function Filters({ filter }: { readonly filter: IndexFilter }) {
  return (
    <div class="filters">
      <nav aria-label="Section">
        <ul class="chips">
          <Chip target={{ ...filter, section: null }} on={filter.section === null} label="All" />
          {SECTIONS.map((section: Section) => (
            <Chip
              target={{ ...filter, section }}
              on={filter.section === section}
              label={sectionName(section)}
            />
          ))}
        </ul>
      </nav>

      <nav aria-label="Source">
        <ul class="chips">
          <Chip target={{ ...filter, source: null }} on={filter.source === null} label="Both" />
          {SOURCE_IDS.map((source: SourceId) => (
            <Chip
              target={{ ...filter, source }}
              on={filter.source === source}
              label={sourceName(source)}
            />
          ))}
        </ul>
      </nav>
    </div>
  )
}

/**
 * One filter, and whether it is the one in force.
 *
 * `aria-current` rather than the class alone: a reader who cannot tell which
 * lens they are looking through will read the absence of an Article as the
 * absence of the news, and that has to be true said aloud as well as drawn.
 */
function Chip({
  target,
  on,
  label,
}: {
  readonly target: IndexFilter
  readonly on: boolean
  readonly label: string
}) {
  return (
    <li>
      <a
        class={on ? 'chip chip--on' : 'chip'}
        href={filterPath(target)}
        aria-current={on ? 'true' : undefined}
      >
        {label}
      </a>
    </li>
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

function Entry({
  entry,
  filter,
  now,
}: {
  readonly entry: IndexEntry
  /** Handed on to the Article, so that reading onwards from it stays inside
   * the lens the reader chose here. */
  readonly filter: IndexFilter
  readonly now: Date
}) {
  return (
    <li class={entryClass(entry)}>
      {/* An Article opens in the reader; a Stub goes straight to its Source,
          because following that link is the whole of how a Stub is read and
          an intermediate page would be a click that says nothing. */}
      <a href={entry.isStub ? entry.url : articlePath(entry, filter)}>
        <Thumbnail entry={entry} />
        <span>
          <span class="headline">{entry.headline}</span>
          {entry.teaser === '' ? null : <span class="teaser">{entry.teaser}</span>}
          <span class="meta">
            <span class="source">{sourceName(entry.source)}</span>
            <time datetime={entry.publishedAt}>{relativeTime(entry.publishedAt, now)}</time>
            {/* The Updated Marker: this was Revised after it was Read, which
                on a race report usually means it has gained its results. */}
            {entry.isUpdated ? <span class="updated">Updated</span> : null}
            {entry.isStub ? <span class="stub">At the Source</span> : null}
          </span>
        </span>
      </a>
    </li>
  )
}

/**
 * How an entry states itself: Read, and Revised since.
 *
 * An Updated Marker only ever appears on something Read, and Read is dimmed —
 * so an entry carrying one is dimmed less than the rest. The point of the
 * marker is to bring the eye back to an Article the reader has already
 * dismissed once, and it cannot do that from behind the dimming.
 */
function entryClass(entry: IndexEntry): string {
  const classes = ['entry']

  if (entry.isRead) classes.push('entry--read')
  if (entry.isUpdated) classes.push('entry--updated')

  return classes.join(' ')
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
