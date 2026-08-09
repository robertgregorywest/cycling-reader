/**
 * The secrets the Worker is given under test.
 *
 * Read by `vitest.config.ts`, which hashes the passphrase the same way `pnpm
 * passphrase` does and binds the result as `PASSPHRASE_HASH`, and by the tests
 * that sign in. Nothing here resembles a real passphrase, and the real one
 * exists only as a Worker secret (ADR-0002).
 */

export const TEST_PASSPHRASE = 'a passphrase under test'

export const TEST_COOKIE_SECRET = 'a signing key under test, long enough to be one'
