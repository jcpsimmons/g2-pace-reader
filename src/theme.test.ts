import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8')
const companion = readFileSync(new URL('./companion.ts', import.meta.url), 'utf8')
const main = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')
const page = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')

describe('Even Realities 2025 light companion theme', () => {
  it('loads the shipped stylesheet from the phone entry page', () => {
    expect(page).toMatch(/href=["']\/src\/style\.css["']/)
    expect(page).toContain('id="app"')
    expect(page).toMatch(/src=["']\/src\/main\.ts["']/)
    expect(main.indexOf("import './companion'")).toBeLessThan(main.indexOf('waitForEvenAppBridge'))
  })

  it('defines and uses Even Realities light tokens on page, cards, connected, and warning', () => {
    const tokens = {
      '--color-bg': '#EEEEEE',
      '--color-text': '#232323',
      '--color-surface': '#FFFFFF',
      '--color-positive': '#4BB956',
      '--color-accent-warning': '#FEF991',
      '--radius-default': '6px',
    }
    for (const [name, value] of Object.entries(tokens)) {
      expect(stylesheet).toContain(`${name}: ${value}`)
      expect(stylesheet).toContain(`var(${name})`)
    }
    expect(stylesheet).toMatch(/html,\s*body[^{]*\{[^}]*background:\s*var\(--color-bg\)/)
    expect(stylesheet).toMatch(/html,\s*body[^{]*\{[^}]*color:\s*var\(--color-text\)/)
    expect(stylesheet).toMatch(/\.continue-card[\s\S]*?background:\s*var\(--color-surface\)/)
    expect(stylesheet).toMatch(/\.book-list[\s\S]*?background:\s*var\(--color-surface\)/)
    expect(stylesheet).toMatch(/\.connection-status\.connected\s*>\s*span[^{]*\{[^}]*background:\s*var\(--color-positive\)/)
    expect(stylesheet).toMatch(/\.book-row\.active-book[^{]*\{[^}]*background:\s*var\(--color-accent-warning\)/)
    expect(stylesheet).toMatch(/\.safety-note[\s\S]*?background:\s*var\(--color-accent-warning\)/)
    expect(stylesheet).not.toContain('#f1f1ef')
  })

  it('mounts a library and EPUB import control with no bookmark button', () => {
    expect(companion).toContain('companion-shell')
    expect(companion).toContain('id="epubFile"')
    expect(companion).toContain('accept=".epub,application/epub+zip"')
    expect(companion).toContain('id="bookList"')
    expect(companion).not.toMatch(/bookmark/i)
  })
})
