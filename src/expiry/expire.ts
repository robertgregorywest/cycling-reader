import type { ExpiryStore } from './store.ts'

/**
 * Expiry: the scheduled deletion of Stream Articles past the retention
 * horizon.
 *
 * Storage is not what forces this — a year of Articles fits inside D1's free
 * tier several times over. Retention is a *reading* decision: an index that
 * accumulates indefinitely stops being calm
 * ([ADR-0005](../../docs/adr/0005-stream-expires-archive-persists.md)).
 *
 * Deletion is by **age alone**. Age-plus-read-state and newest-N caps both
 * make the horizon unpredictable, and a deletion rule the reader cannot
 * predict feels indistinguishable from data loss even when it is working
 * correctly. Thirty days is the whole of the rule, and Saving is the single
 * exemption from it.
 */

/** Thirty days, the retention horizon of ADR-0005. */
export const RETENTION_DAYS = 30

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export interface ExpiryDependencies {
  readonly store: ExpiryStore
  /** The run's clock. The horizon is measured from here. */
  readonly now: () => Date
  /** Overridden only by a test that wants a horizon it can reach. */
  readonly retentionDays?: number
}

/** What one Expiry run did. */
export interface ExpiryReport {
  readonly startedAt: string
  readonly finishedAt: string
  /**
   * The instant deletion was measured against: Articles published before this
   * and not Saved are the ones that went.
   */
  readonly horizon: string
  readonly deleted: number
}

/**
 * A single Expiry run: work out the horizon, delete what is behind it, and
 * report how much that was.
 *
 * The count is the report's reason for existing. Expiry is irreversible and
 * runs unattended, so a run that says how many Articles it deleted makes an
 * anomalous spike visible in the workflow log — where a silent run would make
 * the difference between "thirty days of news expired" and "the Archive
 * predicate broke" invisible until the reader went looking for something.
 */
export async function expire(dependencies: ExpiryDependencies): Promise<ExpiryReport> {
  const startedAt = dependencies.now()
  const horizon = horizonAt(startedAt, dependencies.retentionDays ?? RETENTION_DAYS)

  const deleted = await dependencies.store.expire(horizon)

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: dependencies.now().toISOString(),
    horizon,
    deleted,
  }
}

/**
 * The retention horizon: the instant an Article must have been published after
 * to survive this run.
 *
 * Days rather than calendar months, and an instant rather than a date, because
 * the horizon is compared against `published_at` directly. An Article
 * published twenty-nine days and twenty-three hours ago is inside it; one
 * published thirty days and one hour ago is not.
 */
export function horizonAt(now: Date, retentionDays: number = RETENTION_DAYS): string {
  return new Date(now.getTime() - retentionDays * MILLISECONDS_PER_DAY).toISOString()
}
