import type { Appearance } from '../appearance.ts'
import { Head, Masthead } from './chrome.tsx'

/**
 * The one control that promotes an Article from Stream to Archive.
 *
 * A form and a redirect, like every other control in the reader: nothing here
 * runs JavaScript (ADR-0008). It posts the state the reader wants rather than
 * "toggle", so pressing Save twice — a double tap, a resubmitted form, a phone
 * on a bad connection — asks for the same thing twice and gets it.
 */

export const SAVE_PATH_PREFIX = '/save/'

export function savePath(article: { source: string; guid: string }): string {
  return `${SAVE_PATH_PREFIX}${article.source}/${encodeURIComponent(article.guid)}`
}

interface SaveProps {
  readonly article: { source: string; guid: string }
  readonly saved: boolean
  /** Where the reader is standing, so that Saving returns them to it — filter
   * and all, and the Archive rather than the index when that is where they
   * pressed it. */
  readonly returnTo: string
}

/**
 * Saving from the index: a star, at the end of the row.
 *
 * Marked rather than named, because the index is triage and a word here would
 * compete with a hundred headlines. What it is is said to a screen reader,
 * where there is no such competition.
 */
export function SaveStar({ article, saved, returnTo }: SaveProps) {
  return (
    <form class="save" method="post" action={savePath(article)}>
      <Intent saved={saved} returnTo={returnTo} />
      <button type="submit" class={saved ? 'save__star save__star--on' : 'save__star'}>
        <span aria-hidden="true">{saved ? '★' : '☆'}</span>
        <span class="offscreen">{saved ? 'Saved. Remove from the Archive.' : 'Save'}</span>
      </button>
    </form>
  )
}

/**
 * Saving from the Article: named, in the footer beside the link to the Source.
 *
 * Named here because this is where the decision is actually made — the reader
 * has just finished the piece and is deciding whether to keep it — and because
 * there is one of it on the page rather than a hundred.
 */
export function SaveAction({ article, saved, returnTo }: SaveProps) {
  return (
    <form class="save save--action" method="post" action={savePath(article)}>
      <Intent saved={saved} returnTo={returnTo} />
      <button type="submit" class={saved ? 'save__action save__action--on' : 'save__action'}>
        <span aria-hidden="true">{saved ? '★ ' : '☆ '}</span>
        {saved ? 'Saved' : 'Save'}
        {saved ? <span class="offscreen"> — remove from the Archive</span> : null}
      </button>
    </form>
  )
}

/**
 * What the reader is asking for, as a state and not as a toggle: `yes` Saves,
 * `no` returns the Article to the Stream. Asking for the state it is already in
 * is what makes a resubmitted form harmless.
 */
function Intent({ saved, returnTo }: { readonly saved: boolean; readonly returnTo: string }) {
  return (
    <>
      <input type="hidden" name="saved" value={saved ? 'no' : 'yes'} />
      <input type="hidden" name="return" value={returnTo} />
    </>
  )
}

/**
 * Saving that could not Mirror, said out loud.
 *
 * The alternative is the failure archiving exists to prevent: an Article shown
 * as Saved whose pictures are not in the bucket reads perfectly today and
 * breaks silently in a year, when the CDN has moved on and nobody is watching.
 * So Saving either copies every image or does not happen, and when it does not
 * happen the reader is told rather than redirected back to a star that quietly
 * failed to light.
 *
 * A page rather than a flash message, because there is nowhere to keep a flash
 * message: the reader runs no JavaScript and holds no session state beyond the
 * cookie that signs it in (ADR-0008).
 */
export function SavingFailedPage({
  back,
  appearance,
}: {
  /** Where the reader was: the listing or the Article they pressed Save on. */
  readonly back: string
  readonly appearance: Appearance
}) {
  return (
    <html lang="en" data-theme={appearance}>
      <Head title="Saving failed — Cycling Reader" />
      <body>
        <div class="shell">
          <Masthead appearance={appearance} returnTo={back} home="/" />

          <div class="trouble">
            <h2>Saving failed</h2>
            <p>
              The Source's images could not be copied, so this Article has not been Saved — it is
              still in the Stream, and still subject to Expiry.
            </p>
            <p>
              <a href={back}>Back</a>
            </p>
          </div>
        </div>
      </body>
    </html>
  )
}
