import { useState } from 'react'
import { Button, Card, Select } from '../../components/ui'
import { IMPORT_FIELD_OPTIONS, claimedTargets, guessColumnMapping } from './mapping'
import { IGNORE_FIELD } from './types'
import type { ColumnMapping, MappingTarget, ParsedCsv } from './types'
import styles from './ImportPage.module.css'

export interface ColumnMappingStepProps {
  parsedCsv: ParsedCsv
  onBack: () => void
  onNext: (mapping: ColumnMapping) => void
}

/** Step 2 of 4: map each detected CSV header to a `CommitImportRow` field
 * (or "Ignore"). Pre-filled with `guessColumnMapping`'s best-effort
 * default, fully editable. A target field already claimed by one header is
 * hidden from every other header's dropdown, so two columns can never both
 * map to the same field. */
export function ColumnMappingStep({ parsedCsv, onBack, onNext }: ColumnMappingStepProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => guessColumnMapping(parsedCsv.headers))

  const allOptions = [
    { value: IGNORE_FIELD, label: 'Ignore this column' },
    ...IMPORT_FIELD_OPTIONS.map((o) => ({ value: o.field, label: o.label })),
  ]

  const handleChange = (header: string, target: string) => {
    setMapping((prev) => ({ ...prev, [header]: target as MappingTarget }))
  }

  return (
    <Card>
      <h2>Map Columns</h2>
      <p>Match each column from your file to a contact field, or ignore it.</p>
      <div className={styles.mappingGrid}>
        {parsedCsv.headers.map((header) => {
          const claimed = claimedTargets(mapping, header)
          const options = allOptions.filter(
            (o) => o.value === IGNORE_FIELD || !claimed.has(o.value as MappingTarget),
          )
          return (
            <Select
              key={header}
              label={header}
              options={options}
              value={mapping[header] ?? IGNORE_FIELD}
              onChange={(e) => handleChange(header, e.target.value)}
            />
          )
        })}
      </div>
      <div className={styles.actions}>
        <Button type="button" variant="primary" onClick={() => onNext(mapping)}>
          Continue to Preview
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
      </div>
    </Card>
  )
}
