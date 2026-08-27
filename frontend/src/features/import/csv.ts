import Papa from 'papaparse'
import type { ParsedCsv } from './types'

/**
 * Parses a `.csv`/`.txt` file client-side with PapaParse (§ scope: "parsed
 * client-side with PapaParse" — the backend `commitImport` callable never
 * sees the raw file, only already-structured rows).
 *
 * `header: true` treats the first row as column names and returns each
 * data row as `{ [header]: value }`; `skipEmptyLines: true` drops blank
 * trailing lines a spreadsheet export commonly leaves behind, which would
 * otherwise show up as a single all-empty row and get correctly (but
 * needlessly) flagged by `isSkippedRow`. Every value comes back as a
 * string — `dynamicTyping` is deliberately left off, since fields like
 * `phone` should never be silently coerced to a number.
 */
export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? []
        if (headers.length === 0) {
          reject(new Error('This file has no header row — nothing to map.'))
          return
        }
        // PapaParse's `errors` array includes per-row issues (e.g. a row
        // with the wrong number of fields), which don't warrant failing
        // the whole parse — those rows are still usable for whichever
        // columns did line up. Only a total inability to parse the file
        // (no rows and no headers recognized) is treated as fatal, and
        // that's already covered by the `headers.length === 0` check
        // above.
        resolve({ headers, rows: results.data })
      },
      error: (error) => reject(error),
    })
  })
}
