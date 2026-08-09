import { env } from 'cloudflare:workers'

/**
 * The reader's own state, reached directly.
 *
 * Last Visit is written by the act of opening the index, which is exactly what
 * these tests are asserting about — so setting it here is how a test says
 * "the reader was last here at this moment" without pretending to have
 * visited, and reading it here is how a test sees that a visit moved it.
 */

/** When the reader was last at the index. Null is a reader who has never been,
 * for whom everything is New. */
export async function lastVisited(instant: string | null): Promise<void> {
  await env.DB.prepare('UPDATE app_state SET last_visit_at = ? WHERE id = 1').bind(instant).run()
}

export async function lastVisit(): Promise<string | null> {
  const row = await env.DB.prepare('SELECT last_visit_at FROM app_state WHERE id = 1').first<{
    last_visit_at: string | null
  }>()

  return row?.last_visit_at ?? null
}

/** When an Article was first opened, or null if it never has been. */
export async function readAt(source: string, guid: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT read_at FROM articles WHERE source = ? AND guid = ?')
    .bind(source, guid)
    .first<{ read_at: string | null }>()

  return row?.read_at ?? null
}
