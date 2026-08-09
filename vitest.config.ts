import { fileURLToPath } from 'node:url'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import { hashPassphrase } from './src/shared/passphrase.ts'
import { TEST_COOKIE_SECRET, TEST_PASSPHRASE } from './tests/worker/support/secrets.ts'

/**
 * Two projects, because there are two runtimes (ADR-0001).
 *
 * `node` runs Extraction and the Ingest Run, which need jsdom and the file
 * system. `worker` runs the reader inside workerd itself, against a real D1
 * binding carrying the real migrations — the Worker's SQL is exactly the thing
 * a mocked binding would stop testing.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: { label: 'node', color: 'green' },
          environment: 'node',
          include: ['tests/node/**/*.test.ts'],
          setupFiles: ['tests/node/setup/no-network.ts'],
        },
      },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: './wrangler.jsonc' },
            miniflare: {
              // The schema, applied per test file by the setup below, so that
              // the Worker is read against the same migrations D1 runs.
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations(
                  fileURLToPath(new URL('migrations', import.meta.url)),
                ),
                // The secrets, which are not in `wrangler.jsonc` and never in
                // the repository. The hash is produced here exactly as `pnpm
                // passphrase` produces the real one, so a change to the
                // hashing that the Worker could not verify fails the suite.
                PASSPHRASE_HASH: await hashPassphrase(TEST_PASSPHRASE),
                COOKIE_SECRET: TEST_COOKIE_SECRET,
              },
            },
          })),
        ],
        test: {
          name: { label: 'worker', color: 'cyan' },
          include: ['tests/worker/**/*.test.ts'],
          setupFiles: ['tests/worker/setup/no-network.ts', 'tests/worker/setup/migrate.ts'],
        },
      },
    ],
  },
})
