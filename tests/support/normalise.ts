/**
 * Golden comparisons normalise whitespace so that a trivial reformatting of a
 * Source's markup does not fail the suite. Only whitespace between and inside
 * elements is affected; text, tags and attributes are compared as they are.
 */
export function normaliseWhitespace(html: string): string {
  return html
    .replace(/>\s*</g, '>\n<')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim()
}
