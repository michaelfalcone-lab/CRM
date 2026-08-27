/**
 * Unit tests for `parseCsvFile` — the PapaParse wrapper. jsdom (via
 * vitest's `environment: 'jsdom'`) implements `File`/`FileReader`, so this
 * runs the real PapaParse parser against real `File` objects rather than
 * a mock.
 */
import { describe, expect, it } from 'vitest'
import { parseCsvFile } from './csv'

function csvFile(text: string, name = 'contacts.csv'): File {
  return new File([text], name, { type: 'text/csv' })
}

describe('parseCsvFile', () => {
  it('parses headers and rows as plain strings', async () => {
    const result = await parseCsvFile(
      csvFile('First,Last,Email\nAda,Lovelace,ada@example.com\nGrace,Hopper,grace@example.com\n'),
    )
    expect(result.headers).toEqual(['First', 'Last', 'Email'])
    expect(result.rows).toEqual([
      { First: 'Ada', Last: 'Lovelace', Email: 'ada@example.com' },
      { First: 'Grace', Last: 'Hopper', Email: 'grace@example.com' },
    ])
  })

  it('never coerces a value to a number (dynamicTyping is off) — a phone number stays a string', async () => {
    const result = await parseCsvFile(csvFile('Phone\n0015551234\n'))
    expect(result.rows[0]!.Phone).toBe('0015551234')
  })

  it('skips blank trailing lines rather than producing an all-empty row', async () => {
    const result = await parseCsvFile(csvFile('First\nAda\n\n\n'))
    expect(result.rows).toEqual([{ First: 'Ada' }])
  })

  it('rejects a file with no header row', async () => {
    await expect(parseCsvFile(csvFile(''))).rejects.toThrow(/no header row/i)
  })
})
