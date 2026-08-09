/**
 * Mirroring: copying an Article's images into storage the reader controls.
 *
 * It happens at the moment of Saving and never later (ADR-0005). A nightly job
 * would leave a window in which a Saved Article could lose its images to a CDN
 * purge, and that is precisely the failure archiving exists to prevent — so
 * Saving does not report success until every image is in the bucket.
 *
 * A key is the SHA-256 of the *canonical* Source URL, so it is the same key
 * every time the same photograph is Mirrored. That is what makes Saving twice
 * cost nothing and store nothing twice, and it means two Articles carrying the
 * same picture — a rider portrait reused across a week of coverage — share one
 * object without either of them knowing about the other (ADR-0009).
 */

import { atWidth } from './images.ts'

/** Where a Mirrored image is served from. Behind the passphrase like
 * everything else (ADR-0003), which is the reason it is a route at all. */
export const MIRROR_PATH_PREFIX = '/mirror/'

export function mirrorPath(key: string): string {
  return `${MIRROR_PATH_PREFIX}${key}`
}

/**
 * The width an image is Mirrored at.
 *
 * The Archive is for reading later, not for keeping negatives: 1280 is the
 * widest candidate the reading column ever asks the CDN for — the measure at
 * twice the device pixel density — so a Mirrored image is never smaller than
 * what the reader would have been served, and never the several megabytes an
 * unresized original can be.
 */
const MIRROR_WIDTH = 1280

/**
 * A key is a hex digest and an extension, and a request for one is checked
 * against this before it reaches the bucket: `/mirror/…` is reader input, and
 * a key built out of it must not be able to name anything the Mirroring itself
 * would not have written.
 */
const KEY = /^[0-9a-f]{64}\.[a-z0-9]{2,4}$/

export function isMirrorKey(key: string): boolean {
  return KEY.test(key)
}

/**
 * What Mirroring answers with: the key each canonical URL now has an object
 * under. Keyed by the canonical URL, because that is what the caller holds —
 * the row in `article_images`, and the Article's own `hero_image_url`.
 */
export type MirrorKeys = ReadonlyMap<string, string>

/**
 * Every one of these images in the bucket, and the key each is under.
 *
 * Idempotent by construction. The key does not depend on when the Mirroring
 * happened, so an image already there is found by `head` and neither fetched
 * nor written again: Saving an Article twice makes no second copy of anything,
 * and re-Saving one that was un-Saved is free.
 *
 * Duplicates within an Article collapse for the same reason, which is worth
 * having — a race report often opens and closes on the same photograph.
 *
 * All at once rather than one after another: an Article carries a dozen images
 * at the outside, comfortably inside the free plan's fifty subrequests, and
 * Saving is a thing the reader waits on.
 */
export async function mirrorImages(
  bucket: R2Bucket,
  urls: readonly string[],
): Promise<MirrorKeys> {
  const distinct = [...new Set(urls.filter((url) => url.trim() !== ''))]

  const mirrored = await Promise.all(
    distinct.map(async (url) => [url, await mirrorOne(bucket, url)] as const),
  )

  return new Map(mirrored)
}

async function mirrorOne(bucket: R2Bucket, url: string): Promise<string> {
  const key = await mirrorKey(url)

  // Already Mirrored, by this Article or by another one carrying the same
  // photograph. The bucket is asked rather than the database, because what
  // makes an Article readable is the object existing and not a row saying so.
  if ((await bucket.head(key)) !== null) return key

  const response = await fetch(atWidth(url, MIRROR_WIDTH))

  // Loudly, and without Saving: an Article reported Saved whose images are not
  // in the bucket is an Archive entry that will break silently, months from
  // now, when the CDN moves on.
  if (!response.ok || response.body === null) {
    throw new MirroringFailed(url, `the Source answered ${response.status}`)
  }

  await bucket.put(key, response.body, {
    httpMetadata: { contentType: response.headers.get('content-type') ?? contentType(key) },
  })

  return key
}

export class MirroringFailed extends Error {
  constructor(
    readonly url: string,
    why: string,
  ) {
    super(`Could not Mirror ${url}: ${why}`)
    this.name = 'MirroringFailed'
  }
}

/**
 * The key an image is Mirrored under: the digest of its canonical URL, and the
 * extension it was published with so that a browser handed the object knows
 * what it is even if the stored content type is ever lost.
 *
 * The canonical URL and not the sized one that is actually fetched: the width
 * Mirroring asks for is this application's choice and may change, while what
 * identifies the photograph does not.
 */
export async function mirrorKey(url: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url))

  return `${hex(digest)}.${extension(url)}`
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The Sources serve jpg, and occasionally png or webp. Anything else — or a
 * URL with no extension at all — is stored as jpg, which is what it will be. */
function extension(url: string): string {
  const match = /\.([a-z0-9]{2,4})$/i.exec(new URL(url, 'https://invalid.example').pathname)

  return match?.[1]?.toLowerCase() ?? 'jpg'
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
}

/** What a Mirrored object is served as when the Source did not say. */
export function contentType(key: string): string {
  return CONTENT_TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream'
}
