import type { D1Migration } from '@cloudflare/vitest-pool-workers'
import type { Env } from '../../src/worker/env.ts'

/**
 * What `env` holds inside the Workers test runtime: the Worker's own bindings,
 * plus the migrations the setup file applies. Declaration merging, as
 * `@cloudflare/workers-types` invites.
 */
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      readonly TEST_MIGRATIONS: D1Migration[]
    }
  }
}

type WorkerEnv = Env

export {}
