/**
 * What the Worker is given at runtime: one binding and two secrets.
 *
 * The secrets are never in the repository — this one is public (ADR-0002) —
 * and never in `wrangler.jsonc` either, which is why they are typed here by
 * hand rather than generated from it. `docs/setup.md` covers putting them in
 * place.
 */
export interface Env {
  /**
   * The reader's D1 database. The Worker never writes an Article's content
   * (ADR-0001) — only the reader's own state: Read, Last Visit, Saved.
   */
  readonly DB: D1Database

  /**
   * Where Mirroring puts the Archive's images, written at the moment of Saving
   * and read by the route that serves them back (ADR-0009).
   */
  readonly MIRROR: R2Bucket

  /**
   * The encoded hash of the passphrase, as `pnpm passphrase` produces it. Not
   * the passphrase: see `shared/passphrase.ts`.
   */
  readonly PASSPHRASE_HASH: string

  /** The key the session cookie is signed with. */
  readonly COOKIE_SECRET: string
}
