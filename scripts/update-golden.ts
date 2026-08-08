/**
 * Rewrite the golden bodies from the fixture corpus.
 *
 *   pnpm golden:update
 *
 * Run this when Extraction changes on purpose, and read the diff: it is the
 * only view of what the reader will actually be shown.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { extract } from '../src/ingest/extraction/index.ts'
import { FIXTURES, readFixture } from '../tests/fixtures/corpus.ts'
import { normaliseWhitespace } from '../tests/support/normalise.ts'

const directory = fileURLToPath(new URL('../tests/fixtures/golden/', import.meta.url))
mkdirSync(directory, { recursive: true })

for (const entry of FIXTURES) {
  const result = extract(readFixture(entry.name), { url: entry.url })
  const body = result.method === 'stub' ? '' : `${normaliseWhitespace(result.html)}\n`
  writeFileSync(`${directory}${entry.name}.html`, body)
  console.log(`${entry.name.padEnd(42)} ${result.method.padEnd(12)} ${result.textLength}`)
}
