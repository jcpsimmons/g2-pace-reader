import { parseEpub, type EpubBook } from './epub'
import type { Book, BookInput } from './library'

export function bookInputFromEpub(parsed: EpubBook, filename: string): BookInput {
  if (!parsed.text.trim()) throw new Error('No readable text was found in this EPUB')
  const fallbackTitle = filename.replace(/\.epub$/i, '') || 'Untitled book'
  return {
    title: parsed.title || fallbackTitle,
    author: parsed.author || 'Unknown author',
    originalFilename: filename,
    text: parsed.text,
  }
}

export async function importEpubToLibrary(
  library: { add: (input: BookInput) => Promise<Book> },
  buffer: ArrayBuffer,
  filename: string,
): Promise<Book> {
  return library.add(bookInputFromEpub(parseEpub(buffer), filename))
}
