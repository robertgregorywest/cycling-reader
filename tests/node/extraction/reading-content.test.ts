import { JSDOM, VirtualConsole } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { extract } from '../../../src/ingest/extraction/index.ts'
import { FIXTURES, fixture, readFixture } from '../../fixtures/corpus.ts'

const extractFixture = (name: string) =>
  extract(readFixture(name), { url: fixture(name).url })

const bodyOf = (html: string) =>
  new JSDOM(html, { virtualConsole: new VirtualConsole() }).window.document.body

describe('results tables survive intact', () => {
  const body = bodyOf(extractFixture('cyclingnews-race-report').html)
  const tables = body.querySelectorAll('table')

  it('keeps both the stage result and the general classification', () => {
    expect(tables).toHaveLength(2)
  })

  it('keeps every row of the stage result', () => {
    const stageResult = tables[0]!
    expect(stageResult.querySelectorAll('thead th')).toHaveLength(3)
    expect(stageResult.querySelectorAll('tbody tr')).toHaveLength(10)
  })

  it('keeps the winner, the runner-up and their times', () => {
    const firstRow = tables[0]!.querySelectorAll('tbody tr')[0]!
    expect(text(firstRow)).toContain('Giulio Pellizzari')
    expect(text(firstRow)).toContain('3:16:46')

    const secondRow = tables[0]!.querySelectorAll('tbody tr')[1]!
    expect(text(secondRow)).toContain('Oscar Onley')
  })

  it('keeps the general classification under its own heading', () => {
    expect(text(body)).toContain('Final general classification')
    expect(tables[1]!.querySelectorAll('tbody tr').length).toBeGreaterThan(5)
  })
})

describe('page furniture is absent', () => {
  const bodies = FIXTURES.map((entry) => ({
    name: entry.name,
    html: extract(readFixture(entry.name), { url: entry.url }).html,
  }))

  it.each(bodies)('$name carries no advertising unit', ({ html }) => {
    expect(bodyOf(html).querySelectorAll('[class*="ad-unit"], [id*="ad-unit"]')).toHaveLength(0)
  })

  it.each(bodies)('$name carries no newsletter block', ({ html }) => {
    expect(text(bodyOf(html))).not.toContain('Get The Leadout Newsletter')
    expect(text(bodyOf(html))).not.toContain('direct to your inbox')
    expect(bodyOf(html).querySelectorAll('[class*="newsletter"], form, input')).toHaveLength(0)
  })

  it.each(bodies)('$name carries no share bar', ({ html }) => {
    const content = text(bodyOf(html))
    expect(content).not.toContain('Share this article')
    expect(content).not.toContain('Join the conversation')
    expect(content).not.toContain('Copy link')
  })

  it.each(bodies)('$name carries no tooltip container', ({ html }) => {
    expect(bodyOf(html).querySelectorAll('[class*="tooltip"], [role="tooltip"]')).toHaveLength(0)
  })

  it.each(bodies)('$name carries no recirculation or video promotion', ({ html }) => {
    const content = text(bodyOf(html))
    expect(content).not.toContain('You may like')
    expect(content).not.toContain('What to read next')
    expect(content).not.toContain('Latest Videos From')
    expect(content).not.toContain('Swipe to scroll horizontally')
  })

  it.each(bodies)('$name never begins with the share bar', ({ html }) => {
    const opening = text(bodyOf(html)).slice(0, 120)
    expect(opening).not.toMatch(/^(copy link|share this article|share|facebook|join the conversation)\b/i)
  })
})

describe('what the reader is shown', () => {
  it('begins a race report with its opening paragraph', () => {
    const body = bodyOf(extractFixture('cyclingnews-race-report').html)
    expect(text(body.firstElementChild!)).toMatch(/^Giulio Pellizzari \(Red Bull-Bora-Hansgrohe\) was victorious/)
  })

  it('keeps figures with their captions and credits', () => {
    const body = bodyOf(extractFixture('cyclingnews-race-report').html)
    const figure = body.querySelector('figure')!
    expect(figure.querySelector('img')?.getAttribute('alt')).toContain('Felix Gall')
    expect(text(figure.querySelector('figcaption')!)).toContain("Felix Gall on the winner's podium")
    expect(text(figure.querySelector('figcaption')!)).toContain('Image credit: Getty Images')
  })

  it('keeps images addressable at the Source CDN, so Mirroring can find them later', () => {
    const body = bodyOf(extractFixture('cyclingnews-race-report').html)
    for (const image of body.querySelectorAll('img')) {
      expect(image.getAttribute('src')).toMatch(/^https:\/\//)
    }
  })

  it('keeps links to the Source absolute', () => {
    const body = bodyOf(extractFixture('cyclingweekly-race-report').html)
    for (const link of body.querySelectorAll('a')) {
      expect(link.getAttribute('href')).toMatch(/^https?:\/\//)
    }
  })

  it('keeps section headings', () => {
    const body = bodyOf(extractFixture('cyclingweekly-race-report').html)
    expect(text(body.querySelector('h2')!)).toBe('How it happened')
  })

  it('strips presentation and analytics attributes from what it keeps', () => {
    const html = extractFixture('cyclingnews-race-report').html
    expect(html).not.toMatch(/\sstyle=/)
    expect(html).not.toMatch(/\sclass=/)
    expect(html).not.toMatch(/\sdata-[a-z-]+=/)
    expect(html).not.toMatch(/\sid=/)
  })

  it('keeps no script, iframe or event handler out of the stored body', () => {
    for (const entry of FIXTURES) {
      const html = extract(readFixture(entry.name), { url: entry.url }).html
      expect(html, entry.name).not.toMatch(/<script|<iframe|<style|\son[a-z]+=/i)
    }
  })
})

function text(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim()
}
