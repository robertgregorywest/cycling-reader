import { env } from 'cloudflare:workers'

/**
 * The Source CDN, stood up for the one act that reaches it: Mirroring.
 *
 * Everything else in the reader takes no network, and the suite enforces that
 * by default (`setup/no-network.ts`). Saving is the exception — it copies an
 * Article's images into the bucket before reporting success (ADR-0005) — so a
 * test about Saving says what the CDN is doing today, and a test about anything
 * else keeps the default and would fail if the Worker grew a subrequest.
 *
 * What it serves is not a real JPEG. Nothing in the reader looks inside an
 * image: Mirroring moves bytes and the route hands them back, so bytes that can
 * be told apart are worth more here than bytes that decode.
 */

/** The requests Mirroring made, in the order it made them. */
export let fetched: string[] = []

/**
 * A CDN that serves every image asked of it, each with its own recognisable
 * body so that a test can tell which URL an object came from.
 */
export function sourceCdn(): void {
  fetched = []

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input)
    fetched.push(url)

    return new Response(bodyFor(url), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })
  }) as unknown as typeof globalThis.fetch
}

/**
 * A CDN that has moved on — the failure Mirroring exists to survive, and the
 * failure Saving must refuse to paper over.
 */
export function sourceCdnGone(status = 404): void {
  fetched = []

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetched.push(String(input instanceof Request ? input.url : input))

    return new Response('gone', { status })
  }) as unknown as typeof globalThis.fetch
}

/** What the CDN serves for a URL: distinct per image, and stable across a
 * test, so a Mirrored object can be traced back to what it was copied from. */
export function bodyFor(url: string): string {
  return `image-bytes-for:${new URL(url).pathname}`
}

/** Everything in the bucket, by key. */
export async function mirrored(): Promise<readonly string[]> {
  const { objects } = await env.MIRROR.list()

  return objects.map((object) => object.key)
}

/** What is under a key, as text — the CDN's recognisable body. */
export async function mirroredBody(key: string): Promise<string | null> {
  const object = await env.MIRROR.get(key)

  return object === null ? null : object.text()
}
