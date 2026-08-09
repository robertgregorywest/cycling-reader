/**
 * Time, as the index shows it.
 *
 * Relative and compact while scanning — recency is the only question the index
 * has to answer, and "3h" answers it in less space than a date. The absolute
 * local time belongs in the Article, where precision is worth the room.
 *
 * Storage is UTC throughout, so everything here takes ISO 8601 instants.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/**
 * How long ago, in one or two characters plus a unit.
 *
 * An instant in the future — a Source that publishes with a clock running fast
 * — reads as `now` rather than as a negative age, because a headline dated in
 * the future is a distraction from the headline.
 */
export function relativeTime(instant: string, now: Date): string {
  const elapsed = now.getTime() - new Date(instant).getTime()

  if (Number.isNaN(elapsed)) return ''
  if (elapsed < MINUTE) return 'now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h`
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d`

  return `${Math.floor(elapsed / WEEK)}w`
}

/**
 * How long ago, in words, for the footer.
 *
 * The index's compact form is for scanning a column of times against each
 * other; the footer has one time and a sentence to put it in, where "2 hours
 * ago" is read without being decoded.
 */
export function relativePhrase(instant: string, now: Date): string {
  const elapsed = now.getTime() - new Date(instant).getTime()

  if (Number.isNaN(elapsed)) return ''
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour')

  return plural(Math.floor(elapsed / DAY), 'day')
}

/**
 * How long the reader may go without a successful Ingest Run before the footer
 * says so.
 *
 * Runs are scheduled every two hours, so this is three missed Runs. One missed
 * Run is GitHub's shared schedulers being busy, which happens and is not worth
 * a mark on the page; six hours of silence is something being wrong.
 */
export const STALE_AFTER = 6 * HOUR

/** Whether the last successful Ingest Run is old enough to be worth saying so
 * about. A reader that has never run is not stale — it is new. */
export function isStale(lastSucceededAt: string | null, now: Date): boolean {
  if (lastSucceededAt === null) return false

  const elapsed = now.getTime() - new Date(lastSucceededAt).getTime()

  return !Number.isNaN(elapsed) && elapsed >= STALE_AFTER
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'} ago`
}
