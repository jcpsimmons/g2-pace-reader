import { unzipSync } from 'fflate'

export type EpubChapter = { id: string; href: string; title: string; text: string }
export type EpubBook = { title: string; author: string; text: string; chapters: EpubChapter[] }
export type CatalogChapter = { title: string; startIndex: number; wordCount: number; frontMatter: boolean }

const decoder = new TextDecoder()
const MAX_ARCHIVE_BYTES = 30 * 1024 * 1024
const MAX_EXPANDED_TEXT_BYTES = 64 * 1024 * 1024
const text = (bytes: Uint8Array) => decoder.decode(bytes)
const attr = (s: string, name: string) => s.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)`, 'i'))?.[1] ?? ''
const unescape = (s: string) => s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&#(x[\da-f]+|\d+);/gi, (_, n: string) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n)))
const joinPath = (base: string, href: string) => {
  const parts = `${base}/${href}`.split('/')
  const out: string[] = []
  for (const p of parts) { if (!p || p === '.') continue; if (p === '..') out.pop(); else out.push(p) }
  return out.join('/')
}
const htmlText = (html: string) => unescape(html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

export function parseEpub(buffer: ArrayBuffer): EpubBook {
  if (buffer.byteLength > MAX_ARCHIVE_BYTES) throw new Error('EPUB must be smaller than 30 MB')
  let expandedTextBytes = 0
  const files = unzipSync(new Uint8Array(buffer), {
    filter: file => {
      const isTextResource = file.name === 'META-INF/container.xml' || /\.(?:opf|xml|xhtml|html?|ncx)$/i.test(file.name)
      if (!isTextResource) return false
      expandedTextBytes += file.originalSize
      if (expandedTextBytes > MAX_EXPANDED_TEXT_BYTES) throw new Error('EPUB text is too large to import safely')
      return true
    },
  })
  const container = text(files['META-INF/container.xml'] ?? new Uint8Array())
  const opfPath = attr(container.match(/<rootfile\b[^>]*>/i)?.[0] ?? '', 'full-path')
  if (!opfPath || !files[opfPath]) throw new Error('EPUB package document not found')
  const opf = text(files[opfPath]); const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : ''
  const metadata = opf.match(/<metadata\b[\s\S]*?<\/metadata>/i)?.[0] ?? ''
  const title = htmlText(metadata.match(/<dc:title\b[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] ?? '')
  const author = htmlText(metadata.match(/<dc:creator\b[^>]*>([\s\S]*?)<\/dc:creator>/i)?.[1] ?? '')
  const manifest = new Map<string, { href: string; media: string; properties: string }>()
  for (const m of opf.matchAll(/<item\b([^>]+)>/gi)) {
    const rawHref = attr(m[1], 'href').split(/[?#]/, 1)[0]
    let href = rawHref
    try { href = decodeURIComponent(rawHref) } catch { /* Preserve malformed but usable paths. */ }
    manifest.set(attr(m[1], 'id'), {
      href,
      media: attr(m[1], 'media-type'),
      properties: attr(m[1], 'properties'),
    })
  }
  const spine = [...opf.matchAll(/<itemref\b([^>]+)>/gi)].map(m => attr(m[1], 'idref'))
  const chapters: EpubChapter[] = []
  for (const id of spine) {
    const item = manifest.get(id)
    if (!item || item.properties.split(/\s+/).includes('nav') || !/^application\/(xhtml|xml)|text\/html/i.test(item.media)) continue
    const href = joinPath(base, item.href)
    const html = text(files[href] ?? new Uint8Array())
    if (!html) continue
    const fallback = `Chapter ${chapters.length + 1}`
    for (const part of splitDocument(html, fallback)) {
      chapters.push({ id: `${id}:${chapters.length}`, href, title: part.title, text: part.text })
    }
  }
  return { title, author, chapters, text: chapters.map(c => c.text).join('\n\n') }
}

export function splitDocument(html: string, fallbackTitle: string): { title: string; text: string }[] {
  const marker = html.match(/\*{3}[^*]*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^*]*\*{3}/i)
  if (!marker || marker.index == null) return splitHtmlChapters(html, fallbackTitle)
  const front = htmlText(html.slice(0, marker.index + marker[0].length))
  const rest = splitHtmlChapters(html.slice(marker.index + marker[0].length), fallbackTitle)
  return [
    ...(front ? [{ title: 'Front matter', text: front }] : []),
    ...rest,
  ]
}

export function splitHtmlChapters(html: string, fallbackTitle: string): { title: string; text: string }[] {
  const headingRe = /<h([1-3])\b[^>]*>[\s\S]*?<\/h\1>/gi
  const matches = [...html.matchAll(headingRe)]
  if (!matches.length) {
    const body = htmlText(html)
    return body ? [{ title: fallbackTitle, text: body }] : []
  }
  const parts: { title: string; text: string }[] = []
  const preamble = htmlText(html.slice(0, matches[0].index))
  if (preamble) parts.push({ title: isFrontMatterText(fallbackTitle, preamble) ? 'Front matter' : fallbackTitle, text: preamble })
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0
    const end = i + 1 < matches.length ? matches[i + 1].index ?? html.length : html.length
    const title = htmlText(matches[i][0]) || fallbackTitle
    const text = htmlText(html.slice(start, end))
    if (text) parts.push({ title, text })
  }
  return parts
}

export function isFrontMatter(chapter: { title: string; text: string; href?: string }): boolean {
  return isFrontMatterText(chapter.title, chapter.text, chapter.href)
}

export function catalogChapters(chapters: Pick<EpubChapter, 'title' | 'text' | 'href'>[]): CatalogChapter[] {
  const catalog: CatalogChapter[] = []
  let startIndex = 0
  for (const chapter of chapters) {
    const count = wordCount(chapter.text)
    if (!count) continue
    catalog.push({
      title: chapter.title,
      startIndex,
      wordCount: count,
      frontMatter: isFrontMatter(chapter),
    })
    startIndex += count
  }
  return catalog
}

export function firstReadableChapter(chapters: CatalogChapter[]): CatalogChapter | undefined {
  return chapters.find(chapter => !chapter.frontMatter) ?? chapters[0]
}

export function chapterAt(chapters: CatalogChapter[], index: number): CatalogChapter | undefined {
  let current: CatalogChapter | undefined
  for (const chapter of chapters) {
    if (chapter.startIndex > index) break
    current = chapter
  }
  return current
}

function isFrontMatterText(title: string, text: string, href = ''): boolean {
  const hay = `${title}\n${text.slice(0, 1200)}\n${href}`
  if (/project\s+gutenberg/i.test(hay)) return true
  if (/gutenberg[- ]tm/i.test(hay)) return true
  if (/www\.gutenberg\.org/i.test(hay)) return true
  if (/\bebook\s+is\s+for\s+the\s+use\s+of\s+anyone\s+anywhere/i.test(hay)) return true
  if (/start of (the|this) project gutenberg/i.test(hay)) return true
  if (/end of (the|this) project gutenberg/i.test(hay)) return true
  if (/^(cover|title page|imprint|copyright|license|colophon|contents|table of contents|front matter)$/i.test(title.trim())) return true
  if (/(cover|titlepage|title-page|imprint|\btoc\b|copyright|license|about)(page)?/i.test(href)) return true
  return false
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}
