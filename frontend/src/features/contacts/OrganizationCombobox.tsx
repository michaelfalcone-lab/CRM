import { useState } from 'react'
import { Button, TextField } from '../../components/ui'
import { createOrganization, useOrganizationSearch } from '../../lib'
import styles from './OrganizationCombobox.module.css'

export interface OrganizationComboboxValue {
  id: string
  name: string
}

export interface OrganizationComboboxProps {
  value: OrganizationComboboxValue | null
  onChange: (org: OrganizationComboboxValue | null) => void
  ownerId: string
  createdBy: string
  error?: string
}

/**
 * Search-existing-or-create-inline organization picker for the contact
 * form. Typing searches `organizations.nameLower` by prefix (via
 * `useOrganizationSearch`); picking a result selects it; a "Create ‹typed
 * text›" option at the bottom of the dropdown creates a brand-new minimal
 * org doc (`name` + `ownerId` only, per the brief) and selects it
 * immediately — no separate screen, no confirmation step. Once an org is
 * selected it's shown as a pill with a "Change" button that clears back to
 * the search box, rather than the text input and dropdown staying visible
 * alongside a selection.
 */
export function OrganizationCombobox({
  value,
  onChange,
  ownerId,
  createdBy,
  error,
}: OrganizationComboboxProps) {
  const [term, setTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const { results } = useOrganizationSearch(term)

  const trimmed = term.trim()
  const exactMatch = results.some((r) => r.name.toLowerCase() === trimmed.toLowerCase())

  async function handleCreate() {
    if (!trimmed || creating) return
    setCreating(true)
    try {
      const id = await createOrganization({ name: trimmed, ownerId, createdBy })
      onChange({ id, name: trimmed })
      setTerm('')
      setIsOpen(false)
    } finally {
      setCreating(false)
    }
  }

  if (value) {
    return (
      <div className={styles.field}>
        <span className={styles.label}>Organization</span>
        <div className={styles.pill}>
          <span>{value.name}</span>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              onChange(null)
              setTerm('')
            }}
          >
            Change
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.field}>
      <TextField
        id="organization-combobox"
        name="organization"
        label="Organization (optional)"
        placeholder="Search or create an organization…"
        value={term}
        error={error}
        onChange={(e) => {
          setTerm(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
      />
      {isOpen && trimmed.length > 0 && (
        <ul className={styles.dropdown}>
          {results.map((org) => (
            <li key={org.id}>
              <button
                type="button"
                className={styles.option}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange({ id: org.id, name: org.name })
                  setTerm('')
                  setIsOpen(false)
                }}
              >
                {org.name}
              </button>
            </li>
          ))}
          {!exactMatch && (
            <li>
              <button
                type="button"
                className={styles.createOption}
                disabled={creating}
                onMouseDown={(e) => {
                  e.preventDefault()
                  void handleCreate()
                }}
              >
                + Create "{trimmed}"
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
