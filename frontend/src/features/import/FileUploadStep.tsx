import { useState, type ChangeEvent } from 'react'
import { Card } from '../../components/ui'
import { parseCsvFile } from './csv'
import type { ParsedCsv } from './types'
import styles from './ImportPage.module.css'

export interface FileUploadStepProps {
  onParsed: (fileName: string, parsed: ParsedCsv) => void
}

/** Step 1 of 4: pick a `.csv`/`.txt` file and parse it client-side with
 * PapaParse (`csv.ts`) — the raw file is never sent anywhere; only the
 * structured rows produced here flow into the later steps and eventually
 * `commitImport`. */
export function FileUploadStep({ onParsed }: FileUploadStepProps) {
  const [error, setError] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Reset the input immediately so re-selecting the same file (e.g. after
    // fixing it and re-exporting under the same name) fires `onChange` again.
    event.target.value = ''
    if (!file) return

    setError(null)
    setParsing(true)
    try {
      const parsed = await parseCsvFile(file)
      if (parsed.rows.length === 0) {
        setError('This file has a header row but no data rows.')
        return
      }
      onParsed(file.name, parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setParsing(false)
    }
  }

  return (
    <Card>
      <h2>Import Contacts</h2>
      <p>Upload a .csv or .txt file exported from your contact list.</p>
      <label className={styles.fileInput}>
        <input
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          aria-label="Choose CSV file"
          onChange={handleFileChange}
          disabled={parsing}
        />
      </label>
      {parsing && <p>Reading file…</p>}
      {error && <p className={styles.error}>{error}</p>}
    </Card>
  )
}
