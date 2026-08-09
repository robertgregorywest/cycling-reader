import { SIGN_IN_STYLES } from '../styles.ts'
import { SIGN_IN_PATH } from '../session.ts'
import { styleElement } from './page.tsx'

/**
 * The one page served to a reader who is not signed in.
 *
 * It says as little as it can. The passphrase guards a private reading list on
 * a hostname anyone can guess, so the page names the reader and nothing else:
 * not what is behind it, not how many Articles there are, and not whether the
 * passphrase submitted a moment ago was close.
 */
export function SignInPage({ failed }: { readonly failed: boolean }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>Cycling Reader</title>
        {styleElement(SIGN_IN_STYLES)}
      </head>
      <body>
        <form method="post" action={SIGN_IN_PATH}>
          <h1>Cycling Reader</h1>
          {failed ? <p class="error">That is not the passphrase.</p> : null}
          <label for="passphrase">Passphrase</label>
          <input
            id="passphrase"
            name="passphrase"
            type="password"
            autocomplete="current-password"
            autofocus
            required
          />
          <button type="submit">Sign in</button>
        </form>
      </body>
    </html>
  )
}
