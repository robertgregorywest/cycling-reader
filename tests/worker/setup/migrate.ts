import { applyD1Migrations } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeAll, beforeEach } from 'vitest'

/**
 * Bring the test database up to the schema, and empty it between tests.
 *
 * These are the migration files themselves, applied by the same mechanism
 * `pnpm migrate` applies them to D1 with. A hand-written schema for the tests
 * would let the suite pass against columns production does not have, which is
 * the failure mode the whole two-real-stores arrangement exists to rule out.
 *
 * The pool isolates storage per test *file*, not per test, so a test that
 * seeds three Articles would otherwise leave them for the next one — and "the
 * index is empty" is a state worth being able to assert. Emptying is by
 * deletion rather than by re-migrating, which is far cheaper and leaves the
 * schema exactly as the migrations made it.
 */

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
})

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM article_images'),
    env.DB.prepare('DELETE FROM articles'),
    env.DB.prepare('DELETE FROM ingest_runs'),
    // One row, seeded by the migration, so it is reset rather than removed.
    env.DB.prepare('UPDATE app_state SET last_visit_at = NULL'),
  ])

  // The bucket Mirroring writes to, emptied alongside the database for the same
  // reason: a Mirrored object left behind by the previous test is an image
  // Saving would find already there and decline to copy, which is exactly the
  // thing several of these tests are asserting about.
  const { objects } = await env.MIRROR.list()
  if (objects.length > 0) await env.MIRROR.delete(objects.map((object) => object.key))
})
