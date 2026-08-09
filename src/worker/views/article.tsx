import { raw } from 'hono/html'
import { sourceName } from '../../shared/source.ts'
import type { Appearance } from '../appearance.ts'
import { presentBody } from '../body.ts'
import { READING_SIZES, readingSrc, readingSrcSet } from '../images.ts'
import type { ReaderArticle } from '../store.ts'
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
  appearance,
}: {
  readonly article: ReaderArticle
  readonly appearance: Appearance
}) {
  return (
    <html lang="en" data-theme={appearance}>
      <Head title={`${article.headline} — Cycling Reader`} />
      <body>
        <div class="shell">
          <Masthead appearance={appearance} returnTo={articlePath(article)} back={true} />

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
        </div>
      </body>
    </html>
  )
}

export function articlePath(article: { source: string; guid: string }): string {
  return `/article/${article.source}/${encodeURIComponent(article.guid)}`
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
