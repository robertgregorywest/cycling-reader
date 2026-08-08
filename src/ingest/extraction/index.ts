import { Readability } from '@mozilla/readability'
import { JSDOM, VirtualConsole } from 'jsdom'
import { STUB, type Extraction } from '../../shared/extraction.ts'
import { cleanToAllowlist, type CleanBody } from './clean.ts'
import { findValidationFailure, type ValidationFailure } from './validate.ts'

/**
 * The container both Sources render an article body into. Both run the same
 * Future PLC platform, so one selector covers both.
 */
export const ARTICLE_BODY_SELECTOR = '#article-body'

export interface ExtractOptions {
  /** The Article's URL at its Source. Relative links are resolved against it. */
  readonly url: string
}

/**
 * Reduce a Source's article page to clean reading content.
 *
 * Targeted first, Readability second, Stub last (ADR-0004). Pure: no network,
 * no clock, no state. The returned HTML is already sanitised, because
 * sanitisation happens at ingest and the Worker emits the stored body verbatim.
 */
export function extract(html: string, options: ExtractOptions): Extraction {
  const targeted = extractTargeted(html, options)
  if (targeted.failure === null) {
    return { method: 'targeted', html: targeted.body.html, textLength: targeted.body.textLength }
  }

  const readability = extractReadability(html, options)
  if (readability.failure === null) {
    return {
      method: 'readability',
      html: readability.body.html,
      textLength: readability.body.textLength,
    }
  }

  return STUB
}

interface Attempt {
  readonly body: CleanBody
  readonly failure: ValidationFailure | 'no-body-container' | 'readability-found-nothing' | null
}

const EMPTY_BODY: CleanBody = { html: '', textLength: 0 }

/**
 * Select the Source's article body container and apply the Tag Allowlist.
 * Exported for the CLI, which reports how each path fared.
 */
export function extractTargeted(html: string, options: ExtractOptions): Attempt {
  const document = parse(html, options.url)
  const container = document.querySelector(ARTICLE_BODY_SELECTOR)
  if (container === null) return { body: EMPTY_BODY, failure: 'no-body-container' }

  const body = cleanToAllowlist(container, { pageUrl: options.url, unknownWrappers: 'discard' })
  return { body, failure: findValidationFailure(body) }
}

/**
 * Run Readability over the whole page, then hold its output to the same Tag
 * Allowlist, so that every stored body has passed through one sanitisation
 * boundary regardless of which path produced it.
 */
export function extractReadability(html: string, options: ExtractOptions): Attempt {
  const document = parse(html, options.url)
  const article = new Readability(document).parse()
  const content = article?.content ?? ''
  if (content.trim() === '') {
    return { body: EMPTY_BODY, failure: 'readability-found-nothing' }
  }

  const holder = parse(`<body>${content}</body>`, options.url).body
  const body = cleanToAllowlist(holder, { pageUrl: options.url, unknownWrappers: 'descend' })
  return { body, failure: findValidationFailure(body) }
}

/** Sources ship CSS jsdom cannot parse; its complaints are not ours to log. */
function parse(html: string, url: string): Document {
  return new JSDOM(html, { url, virtualConsole: new VirtualConsole() }).window.document
}
