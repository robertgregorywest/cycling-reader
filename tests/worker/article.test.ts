import { env } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { FONTS, fontPath } from '../../src/worker/fonts/index.ts'
import { STYLESHEET_HREF } from '../../src/worker/styles.ts'
import { aStub, anArticle, seed } from './support/articles.ts'
import { readerAs, signIn } from './support/reader.ts'

/**
 * The article view — where the beauty lives, and the one page in the reader
 * that writes anything.
 *
 * What can be asserted here is not whether it is beautiful: it is that the
 * things beauty is made of arrive on the page. The reading face is served and
 * declared, the photography is fetched at reading size rather than at whatever
 * the picture desk uploaded, captions survive, a results table gets a box of
 * its own to scroll in, and a Stub is a page rather than a broken Article.
 */

const GUID = 'Djx8QZAfLkekqGKNHgJzwj'
const PATH = `/article/cyclingnews/${GUID}`

let cookie: string

beforeEach(async () => {
  cookie = await signIn()
})

async function article(path: string = PATH): Promise<string> {
  const response = await readerAs(cookie, path)

  expect(response.status).toBe(200)
  return response.text()
}

describe('an Article', () => {
  it('carries its headline, teaser and body', async () => {
    await seed(
      anArticle({
        guid: GUID,
        headline: 'Pellizzari wins on Lagunas de Neila',
        teaser: 'Gall takes the overall.',
        bodyHtml: '<p>The final stage was full gas from kilometre zero.</p>',
      }),
    )

    const body = await article()

    expect(body).toContain('Pellizzari wins on Lagunas de Neila')
    expect(body).toContain('Gall takes the overall.')
    expect(body).toContain('The final stage was full gas from kilometre zero.')
  })

  it('names its Source, its author and when it was published, in local time', async () => {
    await seed(
      anArticle({
        guid: GUID,
        author: 'Barry Ryan',
        // Midsummer, so British Summer Time: stored UTC, read in the time zone
        // the reader is in.
        publishedAt: '2026-08-09T09:00:00.000Z',
      }),
    )

    const body = await article()

    expect(body).toContain('Cyclingnews')
    expect(body).toContain('Barry Ryan')
    expect(body).toContain('Sunday 9 August, 10:00')
    expect(body).toContain('datetime="2026-08-09T09:00:00.000Z"')
  })

  it('links to the original at its Source', async () => {
    await seed(
      anArticle({ guid: GUID, url: 'https://www.cyclingnews.com/races/vuelta-a-burgos/stage-5/' }),
    )

    expect(await article()).toContain(
      'href="https://www.cyclingnews.com/races/vuelta-a-burgos/stage-5/"',
    )
  })

  it('is not there when the guid is not', async () => {
    expect((await readerAs(cookie, '/article/cyclingnews/never-ingested')).status).toBe(404)
  })
})

describe('reading', () => {
  it('is set in the self-hosted serif, which the page declares and serves', async () => {
    await seed(anArticle({ guid: GUID }))

    expect(await article()).toContain(`href="${STYLESHEET_HREF}"`)

    const stylesheet = await (await readerAs(cookie, STYLESHEET_HREF)).text()

    expect(stylesheet).toContain('font-family: "Source Serif 4"')
    // Swap, so an Article is readable in the fallback serif while a hundred
    // kilobytes of variable font arrives.
    expect(stylesheet).toContain('font-display: swap')
    // Latin *and* Latin Extended: cycling is reported in names.
    expect(stylesheet).toContain('U+0100-02BA')
  })

  it.each(FONTS.map((font) => [font.file, font] as const))(
    'serves %s as a font, cached for a year',
    async (_file, font) => {
      const response = await readerAs(cookie, fontPath(font))

      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('font/woff2')
      expect(response.headers.get('cache-control')).toContain('immutable')
      expect((await response.arrayBuffer()).byteLength).toBe(font.bytes.byteLength)
    },
  )
})

describe('the photography', () => {
  it('is fetched at reading size rather than at the size it was uploaded', async () => {
    await seed(
      anArticle({
        guid: GUID,
        bodyHtml:
          '<figure><p><img src="https://cdn.mos.cms.futurecdn.net/HQs7zTGocFp9oChGCRatFH-1280-80.jpg" alt="Felix Gall on the podium"></p><figcaption><span>Felix Gall</span><span>(Image credit: Getty Images)</span></figcaption></figure>',
      }),
    )

    const body = await article()

    expect(body).toContain('HQs7zTGocFp9oChGCRatFH-420-80.jpg 420w')
    expect(body).toContain('HQs7zTGocFp9oChGCRatFH-640-80.jpg 640w')
    expect(body).toContain('HQs7zTGocFp9oChGCRatFH-1280-80.jpg 1280w')
    expect(body).toContain('sizes=')
    expect(body).toContain('loading="lazy"')
  })

  it('keeps the caption and the picture credit', async () => {
    await seed(
      anArticle({
        guid: GUID,
        bodyHtml:
          '<figure><p><img src="https://cdn.mos.cms.futurecdn.net/abc.jpg" alt=""></p><figcaption><span>Felix Gall on the winner\'s podium</span><span>(Image credit: Getty Images)</span></figcaption></figure>',
      }),
    )

    const body = await article()

    expect(body).toContain('<figcaption>')
    expect(body).toContain("Felix Gall on the winner's podium")
    expect(body).toContain('(Image credit: Getty Images)')
  })

  it('shows the Feed hero above an Article whose body does not have it', async () => {
    await seed(
      anArticle({
        guid: GUID,
        heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg',
        heroImageAlt: 'The bunch on the Lagunas de Neila',
        bodyHtml: '<p>No pictures in this one.</p>',
      }),
    )

    const body = await article()

    expect(body).toContain('class="hero"')
    expect(body).toContain('2topYbW6G5ADgqfFFwzeLW-640-80.jpg')
    expect(body).toContain('The bunch on the Lagunas de Neila')
  })

  it('does not print the hero twice when the body already opens with it', async () => {
    await seed(
      anArticle({
        guid: GUID,
        heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg',
        bodyHtml:
          '<figure><p><img src="https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-640-80.jpg" alt=""></p></figure><p>Then the words.</p>',
      }),
    )

    expect(await article()).not.toContain('class="hero"')
  })

  it('recognises the hero in the body when the Source sizes by query string', async () => {
    // Velo asks its CDN for a width in the query rather than in the filename,
    // and the Feed's width is never the body's.
    await seed(
      anArticle({
        guid: GUID,
        source: 'velo',
        url: 'https://velo.outsideonline.com/road/road-gear/a-piece/',
        heroImageUrl:
          'https://velo-cdn.outsideonline.com/wp-content/uploads/2026/08/Wahoo_Indoor_SYSTM_Lifestyle.jpg?width=1200',
        bodyHtml:
          '<figure><img src="https://velo-cdn.outsideonline.com/wp-content/uploads/2026/08/Wahoo_Indoor_SYSTM_Lifestyle.jpg?auto=webp&amp;width=3840&amp;quality=75&amp;fit=cover" alt=""></figure><p>Then the words.</p>',
      }),
    )

    expect(await article(`/article/velo/${GUID}`)).not.toContain('class="hero"')
  })
})

describe('a results table', () => {
  it('scrolls within a box of its own rather than widening the page', async () => {
    await seed(
      anArticle({
        guid: GUID,
        bodyHtml:
          '<table><thead><tr><th><p>Position</p></th><th><p>Rider</p></th></tr></thead><tbody><tr><td><p>1</p></td><td><p>Giulio Pellizzari</p></td></tr></tbody></table>',
      }),
    )

    const body = await article()

    expect(body).toContain('<div class="scroller" tabindex="0" role="region" aria-label="Table"><table>')
    expect(body).toContain('</table></div>')
    // Still a table, with its results in it: the box is around it, not
    // instead of it.
    expect(body).toContain('Giulio Pellizzari')

    const stylesheet = await (await readerAs(cookie, STYLESHEET_HREF)).text()
    expect(stylesheet).toContain('overflow-x: auto')
  })
})

describe('a Stub', () => {
  it('is a page of what the Feed gave and a way to the rest, not a broken Article', async () => {
    await seed(
      aStub({
        guid: GUID,
        headline: 'An Article whose Extraction failed',
        teaser: 'The teaser survived.',
        url: 'https://www.cyclingnews.com/pro-cycling/racing/a-difficult-page/',
        heroImageUrl: 'https://cdn.mos.cms.futurecdn.net/2topYbW6G5ADgqfFFwzeLW-1280-80.jpg',
      }),
    )

    const body = await article()

    expect(body).toContain('An Article whose Extraction failed')
    expect(body).toContain('The teaser survived.')
    expect(body).toContain('class="hero"')
    expect(body).toContain('href="https://www.cyclingnews.com/pro-cycling/racing/a-difficult-page/"')
    // Nothing anywhere says something went wrong: a Stub is a legitimate
    // Article.
    expect(body).not.toMatch(/error|failed to|unavailable/i)
  })
})

describe('opening an Article', () => {
  it('marks it Read', async () => {
    await seed(anArticle({ guid: GUID }))

    await article()

    expect(await readAt()).not.toBeNull()
  })

  it('shows it Read on the next request, which is how a second device knows', async () => {
    await seed(anArticle({ guid: GUID }))

    await article()

    // A different device is a different cookie, and the same database.
    const elsewhere = await readerAs(await signIn(), '/')

    expect(await elsewhere.text()).toContain('entry--read')
  })

  it('keeps the moment it was first opened, so a second reading does not move it', async () => {
    await seed(anArticle({ guid: GUID }))

    await article()
    const first = await readAt()

    await article()

    expect(await readAt()).toBe(first)
  })

  it('is the only thing that does: scrolling past it in the index does not', async () => {
    await seed(anArticle({ guid: GUID }))

    await readerAs(cookie, '/')

    expect(await readAt()).toBeNull()
  })
})

/** When the Article under test was Read, straight from the database. */
async function readAt(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT read_at FROM articles WHERE guid = ?')
    .bind(GUID)
    .first<{ read_at: string | null }>()

  return row?.read_at ?? null
}
