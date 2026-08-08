/**
 * Print the Extraction of a named fixture, so that a result can be inspected
 * by eye rather than only asserted against.
 *
 *   pnpm extract                          # list the corpus
 *   pnpm extract cyclingnews-race-report  # print the Extraction
 *   pnpm extract cyclingnews-race-report --text
 */
import { FIXTURES, fixture, readFixture } from '../../../tests/fixtures/corpus.ts'
import { extract, extractReadability, extractTargeted } from './index.ts'

const [name, ...flags] = process.argv.slice(2)

if (name === undefined || name === '--help') {
  console.log('Fixtures:')
  for (const entry of FIXTURES) console.log(`  ${entry.name.padEnd(42)} ${entry.kind}`)
  console.log('\nUsage: pnpm extract <fixture> [--text]')
  process.exit(name === undefined ? 1 : 0)
}

const entry = fixture(name)
const html = readFixture(name)
const result = extract(html, { url: entry.url })

console.log(`fixture     ${entry.name}`)
console.log(`source      ${entry.source}`)
console.log(`url         ${entry.url}`)
console.log(`method      ${result.method}`)
console.log(`textLength  ${result.textLength}`)
console.log(`targeted    ${describe(extractTargeted(html, { url: entry.url }))}`)
console.log(`readability ${describe(extractReadability(html, { url: entry.url }))}`)
console.log()

if (result.method === 'stub') {
  console.log('(Stub — this Article is read by following the link to its Source.)')
} else if (flags.includes('--text')) {
  console.log(toReadableText(result.html))
} else {
  console.log(result.html.replace(/></g, '>\n<'))
}

function describe(attempt: { failure: string | null; body: { textLength: number } }): string {
  return attempt.failure === null
    ? `accepted (${attempt.body.textLength} characters)`
    : `rejected: ${attempt.failure}`
}

function toReadableText(html: string): string {
  return html
    .replace(/<\/(p|h2|h3|h4|h5|h6|li|tr|figcaption|blockquote)>/gi, '\n\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
