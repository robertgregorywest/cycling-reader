/**
 * What the Worker is given at runtime: one binding and two secrets.
 *
 * The secrets are never in the repository — this one is public (ADR-0002) —
 * and never in `wrangler.jsonc` either, which is why they are typed here by
 * hand rather than generated from it. `docs/setup.md` covers putting them in
 * place.
 */
export interface Env {
  /** The reader's D1 database. The Worker only ever reads from it (ADR-0001). */
  readonly DB: D1Database

  /**
   * The encoded hash of the passphrase, as `pnpm passphrase` produces it. Not
   * the passphrase: see `shared/passphrase.ts`.
   */
  readonly PASSPHRASE_HASH: string

  /** The key the session cookie is signed with. */
  readonly COOKIE_SECRET: string
}
