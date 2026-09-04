import { describe, expect, it } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { parseEpub } from './epub'

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
})
