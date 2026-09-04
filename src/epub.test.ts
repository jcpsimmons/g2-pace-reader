import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { catalogChapters, chapterAt, firstReadableChapter, parseEpub } from './epub'
import { createReader } from './reader'

const fixture = (version = '3.0') => zipSync({ 'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'), 'OEBPS/book.opf': strToU8(`<package version="${version}"><metadata><dc:title>My Book</dc:title><dc:creator>Jane Doe</dc:creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="nav"/><itemref idref="c1"/><itemref idref="c2"/></spine></package>`), 'OEBPS/nav.xhtml': strToU8('<html><body><h1>Contents</h1><nav>Chapter links</nav><p>Navigation fallback</p></body></html>'), 'OEBPS/ch1.xhtml': strToU8('<html><head><style>.x{}</style></head><body><h1>Start</h1><p>Hello &amp; welcome.</p><nav>Contents</nav><script>alert(1)</script></body></html>'), 'OEBPS/ch2.xhtml': strToU8('<body><p>Second chapter.</p></body>') }).buffer

describe('EPUB parser', () => {
  it.each(['2.0', '3.0'])('reads EPUB %s metadata, spine order, and clean text', version => {
    const book = parseEpub(fixture(version))
    expect(book.title).toBe('My Book')
    expect(book.author).toBe('Jane Doe')
    expect(book.chapters.map(c => c.title)).toEqual(['Start', 'Chapter 2'])
    expect(book.text).toBe('Start Hello & welcome.\n\nSecond chapter.')
    expect(book.text).not.toMatch(/Contents|Navigation|alert|\.x/)
  })

  it('rejects a zip without an EPUB package document', () => {
    const invalid = zipSync({ 'notes.txt': strToU8('not an epub') }).buffer
    expect(() => parseEpub(invalid)).toThrow('EPUB package document not found')
  })

  it('splits a Gutenberg file on headings and skips the license by default', () => {
    const buffer = zipSync({
      'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'),
      'OEBPS/book.opf': strToU8('<package version="3.0"><metadata><dc:title>The Brothers Karamazov</dc:title><dc:creator>Fyodor Dostoevsky</dc:creator></metadata><manifest><item id="c1" href="book.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>'),
      'OEBPS/book.xhtml': strToU8(`<html><body>
        <p>The Project Gutenberg eBook of The Brothers Karamazov</p>
        <p>This ebook is for the use of anyone anywhere in the United States.</p>
        <p>*** START OF THE PROJECT GUTENBERG EBOOK THE BROTHERS KARAMAZOV ***</p>
        <h1>THE BROTHERS KARAMAZOV</h1>
        <p>From the Russian of Fyodor Dostoevsky.</p>
        <h2>Chapter I. Fyodor Pavlovitch Karamazov</h2>
        <p>Alexey Fyodorovitch Karamazov was the third son.</p>
      </body></html>`),
    }).buffer
    const book = parseEpub(buffer)
    expect(book.chapters.map(chapter => chapter.title)).toEqual([
      'Front matter',
      'THE BROTHERS KARAMAZOV',
      'Chapter I. Fyodor Pavlovitch Karamazov',
    ])
    const catalog = catalogChapters(book.chapters)
    expect(catalog[0].frontMatter).toBe(true)
    expect(firstReadableChapter(catalog)?.title).toBe('THE BROTHERS KARAMAZOV')
    expect(chapterAt(catalog, catalog[2].startIndex)?.title).toBe('Chapter I. Fyodor Pavlovitch Karamazov')
    const started = createReader(book.text, { resume: { index: firstReadableChapter(catalog)!.startIndex } })
    expect(started.getState().frame.current).toBe('THE')
  })
})
