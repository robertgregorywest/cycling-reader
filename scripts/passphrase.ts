import { createInterface } from 'node:readline/promises'
import { hashPassphrase } from '../src/shared/passphrase.ts'

/**
 * Turn a passphrase into the value of the `PASSPHRASE_HASH` Worker secret.
 *
 *   pnpm --silent passphrase | npx wrangler secret put PASSPHRASE_HASH
 *
 * `--silent`, or pnpm's own banner goes down the pipe with the hash.
 *
 * It reads the passphrase from a prompt rather than an argument so that it
 * does not reach the shell history, does not echo it, and prints only the
 * hash: the passphrase itself must exist nowhere but in the reader's head and
 * their password manager. This repository is public (ADR-0002).
 *
 * The hash carries its own algorithm, iteration count and salt, so a secret
 * made today still verifies if those change later.
 */

// The prompt goes to stderr, so that stdout carries the hash alone and can be
// piped straight into `wrangler secret put`.
const input = createInterface({ input: process.stdin, output: process.stderr })

const asked = input.question('Passphrase: ')
mute()
const passphrase = await asked
process.stderr.write('\n')
input.close()

if (passphrase.trim() === '') {
  process.stderr.write('Nothing entered.\n')
  process.exit(1)
}

process.stdout.write(`${await hashPassphrase(passphrase)}\n`)

/**
 * Stop the terminal echoing what is typed, after the prompt itself has been
 * written. Node's readline offers no masked input, and `_writeToOutput` is the
 * documented-by-usage way to take it away.
 */
function mute(): void {
  if (process.stdin.isTTY !== true) return

  ;(input as unknown as { _writeToOutput: (text: string) => void })._writeToOutput = () => {}
}
