import { useState } from 'react'
import { Card } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import { useOwnerDirectory, useStatuses } from '../../lib'
import { ColumnMappingStep } from './ColumnMappingStep'
import { FileUploadStep } from './FileUploadStep'
import { PreviewStep } from './PreviewStep'
import { ResultStep } from './ResultStep'
import type { ColumnMapping, CommitImportResult, ParsedCsv, WizardStep } from './types'
import styles from './ImportPage.module.css'

const STEP_LABELS: Record<WizardStep, string> = {
  file: '1. File',
  mapping: '2. Map Columns',
  preview: '3. Preview',
  result: '4. Done',
}
const STEP_ORDER: WizardStep[] = ['file', 'mapping', 'preview', 'result']

/**
 * The CSV contact-import flow (Task 9) — the frontend for the
 * already-built-and-tested `commitImport`/`revertImportBatch` callables
 * (Task 4). Four steps, driven by local wizard state (mapping/preview
 * choices are never persisted across sessions, per the task brief):
 *
 *   1. `FileUploadStep`   — pick + client-side-parse a `.csv`/`.txt` file.
 *   2. `ColumnMappingStep` — detected headers -> `CommitImportRow` fields.
 *   3. `PreviewStep`       — mapped/flagged rows, owner + default-status
 *                            inputs, then the actual `commitImport` call.
 *   4. `ResultStep`        — returned counts/errors + one immediate undo.
 *
 * Owner-picker permission decision: a non-admin importer is locked to
 * themselves as `defaultOwnerId` (no picker shown) — the same `isAdmin &&
 * ownerOptions.length > 0` gate `ContactFormView`/`OrganizationFormView`
 * already use for "reassign owner." `useOwnerDirectory` itself returns the
 * full directory to any active user (Task 8 widened *reading* it), but
 * reading the directory and being allowed to *reassign ownership* onto it
 * are different questions — every other owner-reassignment surface in this
 * app answers the second one "admin only," and a bulk import creating many
 * new contacts at once is if anything a more sensitive place to widen that
 * than a single manual contact form, not a less sensitive one. Following
 * the existing convention here means a non-admin doing an import never
 * silently gains a capability the rest of the app deliberately withholds
 * from them.
 */
export function ImportPage() {
  const { user } = useCurrentUser()
  const { owners } = useOwnerDirectory(user)
  const { statuses } = useStatuses()
  const isAdmin = user?.role === 'admin'

  const [step, setStep] = useState<WizardStep>('file')
  const [fileName, setFileName] = useState('')
  const [parsedCsv, setParsedCsv] = useState<ParsedCsv | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [commitResult, setCommitResult] = useState<CommitImportResult | null>(null)

  const handleParsed = (name: string, parsed: ParsedCsv) => {
    setFileName(name)
    setParsedCsv(parsed)
    setStep('mapping')
  }

  const handleMapped = (nextMapping: ColumnMapping) => {
    setMapping(nextMapping)
    setStep('preview')
  }

  const handleCommitted = (result: CommitImportResult) => {
    setCommitResult(result)
    setStep('result')
  }

  const handleStartOver = () => {
    setFileName('')
    setParsedCsv(null)
    setMapping(null)
    setCommitResult(null)
    setStep('file')
  }

  if (!user?.authUid) {
    return <Card>Loading…</Card>
  }

  return (
    <div className={styles.page}>
      <nav className={styles.steps} aria-label="Import steps">
        {STEP_ORDER.map((s) => (
          <span key={s} className={s === step ? styles.stepCurrent : undefined}>
            {STEP_LABELS[s]}
          </span>
        ))}
      </nav>

      {step === 'file' && <FileUploadStep onParsed={handleParsed} />}

      {step === 'mapping' && parsedCsv && (
        <ColumnMappingStep parsedCsv={parsedCsv} onBack={() => setStep('file')} onNext={handleMapped} />
      )}

      {step === 'preview' && parsedCsv && mapping && (
        <PreviewStep
          fileName={fileName}
          parsedCsv={parsedCsv}
          mapping={mapping}
          currentUserId={user.authUid}
          isAdmin={isAdmin}
          owners={owners}
          statuses={statuses}
          onBack={() => setStep('mapping')}
          onCommitted={handleCommitted}
        />
      )}

      {step === 'result' && commitResult && (
        <ResultStep result={commitResult} isAdmin={isAdmin} onStartOver={handleStartOver} />
      )}
    </div>
  )
}
