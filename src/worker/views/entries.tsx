import { sourceName } from '../../shared/source.ts'
import type { IndexFilter } from '../filters.ts'
import { candidates } from '../images.ts'
import { mirrorPath } from '../mirror.ts'
import type { IndexEntry } from '../store.ts'
import { relativeTime } from '../time.ts'
import { articlePath } from './article.tsx'
import { SaveStar } from './save.tsx'

/**
 * One line of a listing, shared by the index and the Archive.
 *
 * The two are different destinations and not two lenses on one — the Archive is
 * the durable collection and the index is the disposable one (ADR-0009) — but a
 * line of either is the same line: what it is, when it arrived, and whether it
 * has been Read. A reader should not have to learn two ways of reading a list
 * of Articles.
 */

/** The thumbnail's display size in CSS pixels; the CDN is asked for this and
 * for twice it. */
const THUMBNAIL_WIDTH = 72

export function Entry({
  entry,
  filter,
  now,
  returnTo,
}: {
  readonly entry: IndexEntry
  /** Handed on to the Article, so that reading onwards from it stays inside
   * the lens the reader chose here. */
  readonly filter: IndexFilter
  readonly now: Date
  /** Where Saving from this row comes back to: this listing, as the reader is
   * standing in it. */
  readonly returnTo: string
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

      {/* Outside the link, because it is a different act on the same Article:
          one opens it, the other keeps it. */}
      <SaveStar article={entry} saved={entry.isSaved} returnTo={returnTo} />
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
 *
 * A Mirrored image is served as itself and at one size: the reader's own copy
 * is stored at a single width, so there is nothing to offer a dense screen and
 * nothing to ask a CDN for.
 */
function Thumbnail({ entry }: { readonly entry: IndexEntry }) {
  if (entry.heroMirrorKey !== null) {
    return <Thumb src={mirrorPath(entry.heroMirrorKey)} />
  }

  if (entry.heroImageUrl === null) return <span class="thumb thumb--absent" aria-hidden="true" />

  const { src, srcSet } = candidates(entry.heroImageUrl, THUMBNAIL_WIDTH)

  return <Thumb src={src} srcSet={srcSet} />
}

function Thumb({ src, srcSet }: { readonly src: string; readonly srcSet?: string }) {
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
