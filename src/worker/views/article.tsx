import { raw } from 'hono/html'
import { sourceName } from '../../shared/source.ts'
import type { Appearance } from '../appearance.ts'
import { presentBody } from '../body.ts'
import type { IndexFilter } from '../filters.ts'
import { NO_FILTER, filterPath, filterQuery } from '../filters.ts'
import { READING_SIZES, readingSrc, readingSrcSet } from '../images.ts'
import type { Neighbour, Neighbours, ReaderArticle } from '../store.ts'
import { absoluteTime } from '../time.ts'
import { Head, Masthead } from './chrome.tsx'

/**
 * The article view — where the beauty lives.
 *
 * The index triages; this is the magazine. Everything here is in service of
 * sustained reading: one column at a comfortable measure, photography at the
 * size the screen can use, captions kept because knowing who is in the picture
 * is part of the journalism, and results tables kept readable because on a
 * race report they are frequently the most valuable thing on the page.
 *
 * The body arrives already sanitised from ingest (ADR-0001) and is emitted
 * verbatim: the security boundary is at ingest and there is exactly one of it.
 */

export function ArticlePage({
  article,
  neighbours,
  filter,
  appearance,
}: {
  readonly article: ReaderArticle
  /** Where the reader can go from here without going back. */
  readonly neighbours: Neighbours
  /** The lens the reader arrived under, carried so that leaving this Article
   * — forwards or back — does not silently leave their Section too. */
  readonly filter: IndexFilter
  readonly appearance: Appearance
}) {
  return (
    <html lang="en" data-theme={appearance}>
      <Head title={`${article.headline} — Cycling Reader`} />
      <body>
        <div class="shell">
          <Masthead
            appearance={appearance}
            returnTo={articlePath(article, filter)}
            home={filterPath(filter)}
          />

          <article class="article">
            <header class="article__head">
              <h1>{article.headline}</h1>
              {article.teaser === '' ? null : <p class="standfirst">{article.teaser}</p>}
              <p class="byline">
                <span class="byline__source">{sourceName(article.source)}</span>
                {article.author === null ? null : <span>{article.author}</span>}
                <time datetime={article.publishedAt}>{absoluteTime(article.publishedAt)}</time>
              </p>
            </header>

            <Hero article={article} />

            {article.isStub ? <StubBody article={article} /> : <Body article={article} />}

            <footer class="article__foot">
              {/* Context, sharing, and the pictures the Extraction could not
                  take with it. An Article is always readable where it was
                  published. */}
              <a class="at-source" href={article.url} rel="noreferrer">
                Read at {sourceName(article.source)}
              </a>
            </footer>
          </article>

          <ReadOn neighbours={neighbours} filter={filter} />
        </div>
      </body>
    </html>
  )
}

/**
 * Where this Article is: its Source, its guid, and the filter it is being read
 * under.
 *
 * The filter rides in the query string rather than in the path because it is
 * not part of the Article's identity — the same Article under two Sections is
 * one Article — and because a link stripped of its query still resolves to the
 * right piece, only without its neighbours.
 */
export function articlePath(
  article: { source: string; guid: string },
  filter: IndexFilter = NO_FILTER,
): string {
  return `/article/${article.source}/${encodeURIComponent(article.guid)}${filterQuery(filter)}`
}

/**
 * The end of the Article, and the way on to the next one.
 *
 * Reading three pieces should not be three round trips through the index, so
 * the reader is handed the neighbours by name: the headline is what decides
 * whether the next one is worth opening, and "Next ›" alone makes that
 * decision blind.
 *
 * The first Article has no previous and the last has no next, and under a
 * filter both ends arrive sooner. A missing neighbour is simply absent — not a
 * disabled control, which would be a thing to look at that cannot be used.
 * When neither exists there is nothing here at all.
 */
function ReadOn({
  neighbours,
  filter,
}: {
  readonly neighbours: Neighbours
  readonly filter: IndexFilter
}) {
  const { previous, next } = neighbours

  if (previous === null && next === null) return null

  return (
    <nav class="read-on" aria-label="Articles">
      <Onward neighbour={previous} filter={filter} towards="previous" />
      <Onward neighbour={next} filter={filter} towards="next" />
    </nav>
  )
}

const LABEL = { previous: 'Newer', next: 'Older' } as const

/**
 * One neighbour. Named "Newer" and "Older" rather than "Previous" and "Next":
 * the index is in time order, so time is what the reader is moving through,
 * and prev/next on a page that also has browser back is one ambiguity too
 * many.
 *
 * A Stub links to its Source, exactly as it does from the index — following
 * that link is the whole of how a Stub is read.
 */
function Onward({
  neighbour,
  filter,
  towards,
}: {
  readonly neighbour: Neighbour | null
  readonly filter: IndexFilter
  readonly towards: 'previous' | 'next'
}) {
  if (neighbour === null) return <span class={`read-on__side read-on__side--${towards}`} />

  return (
    <a
      class={`read-on__side read-on__side--${towards}`}
      href={neighbour.isStub ? neighbour.url : articlePath(neighbour, filter)}
      rel={neighbour.isStub ? 'noreferrer' : towards === 'next' ? 'next' : 'prev'}
    >
      <span class="read-on__label">{LABEL[towards]}</span>
      <span class="read-on__headline">{neighbour.headline}</span>
    </a>
  )
}

function Body({ article }: { readonly article: ReaderArticle }) {
  return <div class="body">{raw(presentBody(article.bodyHtml))}</div>
}

/**
 * A Stub — an Article whose Extraction failed — as a page rather than as a
 * broken Article.
 *
 * It has everything the Feed gave: the headline, the teaser and the
 * photography. What it does not have is the body, and the honest thing is to
 * say so once, plainly, and hand over the link. A Stub is a legitimate
 * Article, so this is not an error page and does not read like one.
 */
function StubBody({ article }: { readonly article: ReaderArticle }) {
  return (
    <div class="body body--stub">
      <p class="stub-note">This one is read at its Source.</p>
      <p>
        <a class="stub-link" href={article.url} rel="noreferrer">
          Open at {sourceName(article.source)}
        </a>
      </p>
    </div>
  )
}

/**
 * The Feed's photography, at the top where a magazine puts it.
 *
 * Not repeated when the body already opens with the same picture, which is
 * usual on a race report: the Feed's hero and the article page's first figure
 * are frequently the same asset, and printing it twice is the sort of thing
 * that makes a page look automated.
 *
 * Eager, alone among the images on the page: it is the one the reader is
 * already looking at.
 */
function Hero({ article }: { readonly article: ReaderArticle }) {
  const url = article.heroImageUrl
  if (url === null || bodyOpensWith(article, url)) return null

  return (
    <figure class="hero">
      <img
        src={readingSrc(url)}
        srcset={readingSrcSet(url)}
        sizes={READING_SIZES}
        alt={article.heroImageAlt ?? ''}
        decoding="async"
      />
    </figure>
  )
}

/**
 * Whether the body already carries this image. Compared by the CDN's asset
 * name rather than by URL, because the same photograph is served at whatever
 * width each page asked for and the widths will not match.
 */
function bodyOpensWith(article: ReaderArticle, heroImageUrl: string): boolean {
  const asset = assetName(heroImageUrl)

  return asset !== null && article.bodyHtml.includes(asset)
}

/** `…/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg` names the asset
 * `2topYbW6G5ADgqfFFwzeLW`. */
function assetName(url: string): string | null {
  const file = url.split('/').pop()
  if (file === undefined || file === '') return null

  const name = file.replace(/(?:-\d+-\d+)?\.[a-z]+$/i, '')

  return name === '' ? null : name
}
