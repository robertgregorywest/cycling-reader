import { defineConfig } from 'vitest/config'

// One project today: ingest and Extraction under Node. The Worker gets its own
// project (@cloudflare/vitest-pool-workers) when the Worker exists.
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
    ],
  },
})
