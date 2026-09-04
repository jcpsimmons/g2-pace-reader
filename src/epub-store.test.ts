import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { importEpubToLibrary } from './import-book'
import { createLibrary } from './library'

function epubBuffer(version: string, title: string, author: string, chapter: string) {
  return zipSync({
    'META-INF/container.xml': strToU8('<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'),
    'OEBPS/book.opf': strToU8(`<package version="${version}"><metadata><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="nav"/><itemref idref="c1"/></spine></package>`),
    'OEBPS/nav.xhtml': strToU8('<html><body><nav>Skip</nav></body></html>'),
    'OEBPS/ch1.xhtml': strToU8(`<html><body><h1>${chapter}</h1><p>Readable ${version} spine text.</p></body></html>`),
  }).buffer
}

describe('EPUB library store', () => {
  it.each([
    ['2.0', 'EPUB Two', 'Ann Two', 'Opening'],
    ['3.0', 'EPUB Three', 'Ann Three', 'First'],
  ] as const)('parses EPUB %s and keeps title, author, and spine text after list/get', async (version, title, author, chapter) => {
    const library = createLibrary()
    const filename = `${title.replace(/\s+/g, '-').toLowerCase()}.epub`
    const stored = await importEpubToLibrary(library, epubBuffer(version, title, author, chapter), filename)
    expect(stored.title).toBe(title)
    expect(stored.author).toBe(author)
    expect(stored.text).toContain(`${chapter} Readable ${version} spine text.`)
    expect(stored.originalFilename).toBe(filename)
    expect(stored.chapters.length).toBeGreaterThan(0)
    expect(stored.chapters[0]).toMatchObject({ title: chapter, startIndex: 0, frontMatter: false })

    const listed = await library.list()
    expect(listed.map(book => book.id)).toEqual([stored.id])
    const fetched = await library.get(stored.id)
    expect(fetched).toMatchObject({
      id: stored.id,
      title,
      author,
      text: stored.text,
      originalFilename: filename,
    })
    expect(fetched?.text.trim()).not.toBe('')
  })
})
