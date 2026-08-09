import { sourceName } from '../../shared/source.ts'
import { candidates } from '../images.ts'
import type { IndexEntry } from '../store.ts'
import { STYLESHEET_PATH } from '../styles.ts'
import { relativeTime } from '../time.ts'

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
  now,
}: {
  readonly entries: readonly IndexEntry[]
  readonly now: Date
}) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Cycling Reader</title>
        <link rel="stylesheet" href={STYLESHEET_PATH} />
      </head>
      <body>
        <div class="shell">
          <header class="masthead">
            <h1>Cycling Reader</h1>
          </header>

          {entries.length === 0 ? (
            <p class="empty">Nothing yet.</p>
          ) : (
            <ol class="index">
              {entries.map((entry) => (
                <Entry entry={entry} now={now} />
              ))}
            </ol>
          )}
        </div>
      </body>
    </html>
  )
}

function Entry({ entry, now }: { readonly entry: IndexEntry; readonly now: Date }) {
  return (
    <li class="entry">
      {/* Every Article links out for now. The article view arrives with the
          next ticket and takes this link; a Stub keeps it, because a Stub is
          read by following the link to its Source. */}
      <a href={entry.url}>
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
