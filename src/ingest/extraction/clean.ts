import {
  ATTRIBUTE_ALLOWLIST,
  BLOCK_TAGS,
  FURNITURE_TEXT,
  SELF_SUFFICIENT_TAGS,
  TAG_ALLOWLIST,
  TRANSPARENT_CONTAINER_CLASSES,
  TRANSPARENT_CONTAINER_TAGS,
} from './tag-allowlist.ts'

export interface CleanOptions {
  /** The Article's URL, used to resolve relative `href` and `src` values. */
  readonly pageUrl: string
  /**
   * Whether an unrecognised block wrapper is transparent (descend into it) or
   * furniture (discard it with its subtree).
   *
   * The targeted path discards, so that a promotional widget Future ships next
   * month is excluded by default. The Readability path descends, because
   * Readability has already made the content decision and its wrappers are its
   * own, not the Source's.
   */
  readonly unknownWrappers: 'discard' | 'descend'
}

export interface CleanBody {
  readonly html: string
  readonly textLength: number
}

const GENERIC_WRAPPER_TAGS: ReadonlySet<string> = new Set([
  'div',
  'section',
  'article',
  'main',
])

/**
 * Reduce a container element to the Tag Allowlist: allowlisted elements are
 * kept with allowlisted attributes, the Source's own layout wrappers are
 * descended through, and everything else — along with any text it holds
 * directly — is discarded.
 */
export function cleanToAllowlist(source: Element, options: CleanOptions): CleanBody {
  const document = source.ownerDocument
  const root = document.createElement('div')

  for (const node of convertChildren(source, root, document, options)) {
    root.appendChild(node)
  }

  removeInsignificantWhitespace(root)
  pruneFurnitureText(root)
  pruneEmpty(root)

  return { html: root.innerHTML.trim(), textLength: (root.textContent ?? '').trim().length }
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function convertChildren(
  source: Element,
  parent: Element,
  document: Document,
  options: CleanOptions,
): Node[] {
  const keepsText = isKeptElement(parent)
  const output: Node[] = []

  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      // Text belongs to the element that holds it. Text sitting directly
      // inside a discarded wrapper — a share count, an advertising label — is
      // discarded with it.
      if (keepsText) {
        output.push(document.createTextNode(collapseWhitespace(child.nodeValue ?? '')))
      }
      continue
    }
    if (child.nodeType !== ELEMENT_NODE) continue
    output.push(...convertElement(child as Element, document, options))
  }

  return output
}

function convertElement(
  element: Element,
  document: Document,
  options: CleanOptions,
): Node[] {
  const tag = element.tagName.toLowerCase()

  if (TAG_ALLOWLIST.has(tag)) {
    const kept = document.createElement(tag)
    copyAllowedAttributes(element, kept, options)
    for (const node of convertChildren(element, kept, document, options)) {
      kept.appendChild(node)
    }
    return [kept]
  }

  if (isTransparentContainer(element, tag, options)) {
    const holder = document.createElement('div')
    return convertChildren(element, holder, document, options)
  }

  return []
}

function isTransparentContainer(
  element: Element,
  tag: string,
  options: CleanOptions,
): boolean {
  if (TRANSPARENT_CONTAINER_TAGS.has(tag)) return true
  if (!GENERIC_WRAPPER_TAGS.has(tag)) return false
  if (options.unknownWrappers === 'descend') return true
  return TRANSPARENT_CONTAINER_CLASSES.some((className) =>
    element.classList.contains(className),
  )
}

/**
 * A converted element keeps its own text; the anonymous `div` used to gather
 * the children of a transparent container does not.
 */
function isKeptElement(parent: Element): boolean {
  return TAG_ALLOWLIST.has(parent.tagName.toLowerCase())
}

function copyAllowedAttributes(from: Element, to: Element, options: CleanOptions): void {
  const allowed = ATTRIBUTE_ALLOWLIST[to.tagName.toLowerCase()]
  if (!allowed) return

  for (const name of allowed) {
    const value = from.getAttribute(name)
    if (value === null) continue
    if (name === 'href' || name === 'src') {
      const absolute = toAbsoluteHttpUrl(value, options.pageUrl)
      if (absolute !== null) to.setAttribute(name, absolute)
      continue
    }
    to.setAttribute(name, value)
  }
}

function toAbsoluteHttpUrl(value: string, pageUrl: string): string | null {
  try {
    const url = new URL(value, pageUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ')
}

/** Whitespace between two block elements never renders, so it is not kept. */
function removeInsignificantWhitespace(root: Element): void {
  const walk = (element: Element): void => {
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === ELEMENT_NODE) {
        walk(child as Element)
        continue
      }
      if (child.nodeType !== TEXT_NODE) continue
      if ((child.nodeValue ?? '').trim() !== '') continue
      const text = child as CharacterData
      const previous = text.previousElementSibling
      const next = text.nextElementSibling
      if (isBlockOrAbsent(previous) && isBlockOrAbsent(next)) child.parentNode?.removeChild(child)
    }
  }
  walk(root)
}

function isBlockOrAbsent(element: Element | null): boolean {
  return element === null || BLOCK_TAGS.has(element.tagName.toLowerCase())
}

/** Drop elements whose whole content is one of the Source's reader instructions. */
function pruneFurnitureText(root: Element): void {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    if (text !== '' && FURNITURE_TEXT.has(text)) element.remove()
  }
}

/**
 * Drop allowlisted elements left holding nothing — the empty anchors the
 * platform uses as scroll targets, and headings whose furniture was removed
 * from beneath them.
 */
function pruneEmpty(root: Element): void {
  let removedSomething = true
  while (removedSomething) {
    removedSomething = false
    for (const element of Array.from(root.querySelectorAll('*'))) {
      const tag = element.tagName.toLowerCase()
      if (SELF_SUFFICIENT_TAGS.has(tag)) continue
      if ((element.textContent ?? '').trim() !== '') continue
      if (element.querySelector('img') !== null) continue
      element.remove()
      removedSomething = true
    }
  }
}
