/**
 * The passphrase, and the hash of it the Worker holds as a secret.
 *
 * The reader authenticates itself with a single passphrase rather than sitting
 * behind Cloudflare Access, because Access cannot protect a `workers.dev`
 * hostname and a custom domain would break the zero-cost constraint
 * (ADR-0003). The passphrase itself is never stored anywhere: the Worker holds
 * only the encoded output of `hashPassphrase`, as the `PASSPHRASE_HASH`
 * secret.
 *
 * This is shared rather than the Worker's own because both runtimes derive the
 * same key: the Worker verifies a submitted passphrase, and `pnpm passphrase`
 * produces the secret under Node. Two implementations would let the secret be
 * generated in a form the Worker cannot verify, which is a failure discovered
 * at the sign-in form and nowhere earlier.
 *
 * PBKDF2-HMAC-SHA-256, because it is the only password KDF WebCrypto offers:
 * there is no bcrypt, scrypt or Argon2 in the Workers runtime, and shipping
 * one compiled to WASM would cost far more of the CPU budget than it is worth
 * here.
 */

/**
 * Deliberately below the hundreds of thousands a login form would normally
 * use. Workers on the free plan get 10 ms of CPU per invocation, and PBKDF2 is
 * pure CPU: an iteration count tuned for a server would not fail slowly here,
 * it would put signing in permanently over the limit. Measured on a
 * development machine, this is under 2 ms against roughly 7 ms for 100,000,
 * which leaves the sign-in request most of its budget on a slower core.
 *
 * What the low count costs is offline resistance if the secret ever leaks. The
 * mitigation is the passphrase rather than the KDF — `docs/setup.md` asks for
 * a long generated one, and against that the iteration count is not what an
 * attacker is defeated by. The salt and the KDF remain worth having: they cost
 * a millisecond and they rule out precomputation.
 */
export const PBKDF2_ITERATIONS = 20_000

const ALGORITHM = 'pbkdf2-sha256'
const SALT_BYTES = 16
const KEY_BITS = 256

/**
 * Hash a passphrase for storage as the `PASSPHRASE_HASH` secret, with a fresh
 * random salt. The encoded form carries its own algorithm, iteration count and
 * salt, so a secret hashed today still verifies after the parameters change.
 */
export async function hashPassphrase(
  passphrase: string,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const derived = await derive(passphrase, salt, iterations)

  return [ALGORITHM, iterations, base64(salt), base64(derived)].join('$')
}

/**
 * Whether a submitted passphrase is the one `encoded` was made from.
 *
 * A malformed or unrecognised secret is a wrong passphrase and not an
 * exception: the sign-in route would have nothing better to do with the
 * exception than refuse the request, and refusing here keeps a
 * misconfigured secret from being distinguishable at the form.
 */
export async function verifyPassphrase(passphrase: string, encoded: string): Promise<boolean> {
  const [algorithm, iterations, salt, expected] = encoded.split('$')

  if (algorithm !== ALGORITHM) return false
  if (iterations === undefined || salt === undefined || expected === undefined) return false

  const rounds = Number(iterations)
  if (!Number.isSafeInteger(rounds) || rounds < 1) return false

  let expectedBytes: Uint8Array<ArrayBuffer>
  try {
    expectedBytes = bytes(expected)
  } catch {
    return false
  }

  return equal(await derive(passphrase, bytes(salt), rounds), expectedBytes)
}

async function derive(
  passphrase: string,
  // Backed by an `ArrayBuffer` and not a `SharedArrayBuffer`, which is what
  // WebCrypto will take.
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  // NFC, because the same passphrase typed on a phone and on a laptop can
  // arrive as different bytes otherwise, and the difference is invisible.
  const material = new TextEncoder().encode(passphrase.normalize('NFC'))
  const key = await crypto.subtle.importKey('raw', material, 'PBKDF2', false, ['deriveBits'])
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    KEY_BITS,
  )

  return new Uint8Array(derived)
}

/** Compared in constant time, so that a wrong passphrase reveals nothing by
 * how quickly it is rejected. */
function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false

  let difference = 0
  for (let i = 0; i < a.length; i += 1) difference |= (a[i] as number) ^ (b[i] as number)

  return difference === 0
}

function base64(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
}

function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
}
