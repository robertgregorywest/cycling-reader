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
