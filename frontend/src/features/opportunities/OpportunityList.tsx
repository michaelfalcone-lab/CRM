import { useState } from 'react'
import type { Opportunity, User } from 'shared'
import { Button, Card, Select } from '../../components/ui'
import {
  canEditRecord,
  deleteOpportunity,
  updateOpportunity,
  useOpportunityStages,
  type WithId,
} from '../../lib'
import { formatOpportunityYear } from './formatOpportunityYear'
import { OpportunityForm } from './OpportunityForm'
import { StageBadge } from './StageBadge'
import styles from './OpportunityList.module.css'

export interface OpportunityListProps {
  opportunities: WithId<Opportunity>[]
  organizationId: string | null
  currentUser: User | null
  /** Exactly one of these two — see `OpportunityForm`'s prop docs. */
  contactId?: string
  contactOptions?: { id: string; label: string }[]
  emptyMessage?: string
  /** contactId -> display label, shown per-row when the list spans more
   * than one contact (the org detail view). */
  contactLabels?: Record<string, string>
}

/** Sport · year · product, joined for the row's one-line summary. Skips
 * blanks so an opportunity created before year/productType existed reads
 * as just its sport rather than "Football ·  · ". Year renders through
 * `formatOpportunityYear` so basketball reads as a season span. */
function summarize(opp: WithId<Opportunity>): string {
  return [opp.sport, formatOpportunityYear(opp.sport, opp.year), opp.productType]
    .filter(Boolean)
    .join(' · ')
}

/** Compact opportunity list (sport/year/product + a one-click stage
 * dropdown) with an inline add/edit form, reused by both the contact and
 * organization detail pages. */
export function OpportunityList({
  opportunities,
  organizationId,
  currentUser,
  contactId,
  contactOptions,
  emptyMessage = 'No opportunities yet.',
  contactLabels,
}: OpportunityListProps) {
  const { stages } = useOpportunityStages()
  const stageById = new Map(stages.map((s) => [s.id, s]))
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** The opportunity whose stage write is in flight, or `null`. */
  const [stageSavingId, setStageSavingId] = useState<string | null>(null)
  /** The opportunity awaiting delete confirmation, or `null` — same
   * two-step pattern as `ContactActivityPanel`'s log-entry delete: a
   * second click confirms, opening a different row's confirm replaces it. */
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete(opp: WithId<Opportunity>) {
    if (deletingId) return
    setDeletingId(opp.id)
    setDeleteError(null)
    try {
      await deleteOpportunity(opp.id)
      setConfirmingDeleteId(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete this opportunity.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handleStageChange(opp: WithId<Opportunity>, nextStage: string) {
    if (stageSavingId || nextStage === opp.stage) return
    setStageSavingId(opp.id)
    try {
      // `updateOpportunity` runs the same transaction the Edit form does —
      // it stamps `wonAt`/`lostAt` and syncs the linked contact's status
      // on a won/lost transition, so a one-click stage change here is not
      // a shortcut past that bookkeeping.
      await updateOpportunity(opp.id, { stage: nextStage }, stages)
    } finally {
      setStageSavingId(null)
    }
  }

  if (!currentUser?.authUid) return null
  const currentUserUid = currentUser.authUid
  const canAdd = Boolean(contactId) || Boolean(contactOptions && contactOptions.length > 0)

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <h3>Opportunities</h3>
        {!adding && canAdd && (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            + Add Opportunity
          </Button>
        )}
      </div>

      {!canAdd && !adding && opportunities.length === 0 && (
        <p className={styles.empty}>Add a contact to this organization first.</p>
      )}

      {deleteError && <p className={styles.error}>{deleteError}</p>}

      {adding && (
        <Card className={styles.formCard}>
          <OpportunityForm
            currentUserUid={currentUserUid}
            organizationId={organizationId}
            contactId={contactId}
            contactOptions={contactOptions}
            onSaved={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </Card>
      )}

      {opportunities.length === 0 && !adding && canAdd && (
        <p className={styles.empty}>{emptyMessage}</p>
      )}

      {opportunities.length > 0 && (
        <ul className={styles.list}>
          {opportunities.map((opp) => {
            const stage = stageById.get(opp.stage)
            const canEdit = canEditRecord(currentUser, opp)
            const isEditing = editingId === opp.id
            return (
              <li key={opp.id} className={styles.row}>
                {isEditing ? (
                  <Card className={styles.formCard}>
                    <OpportunityForm
                      currentUserUid={currentUserUid}
                      organizationId={organizationId}
                      existing={opp}
                      contactId={contactId ?? opp.contactId}
                      contactOptions={contactId ? undefined : contactOptions}
                      onSaved={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  </Card>
                ) : (
                  <>
                    <div className={styles.rowMain}>
                      <span className={styles.sport}>{summarize(opp)}</span>
                      {canEdit && stages.length > 0 ? (
                        <Select
                          id={`opp-stage-${opp.id}`}
                          name="opportunityStage"
                          label="Stage"
                          className={styles.stageSelect}
                          options={
                            stageById.has(opp.stage)
                              ? stages.map((s) => ({ value: s.id, label: s.label }))
                              : // Keep a since-retired stage selectable rather than
                                // snapping the row to whatever sorts first.
                                [
                                  { value: opp.stage, label: `${opp.stage} (inactive)` },
                                  ...stages.map((s) => ({ value: s.id, label: s.label })),
                                ]
                          }
                          value={opp.stage}
                          disabled={stageSavingId === opp.id}
                          onChange={(e) => void handleStageChange(opp, e.target.value)}
                        />
                      ) : (
                        <StageBadge label={stage?.label ?? opp.stage} color={stage?.color} />
                      )}
                      {contactLabels?.[opp.contactId] && (
                        <span className={styles.contactLabel}>{contactLabels[opp.contactId]}</span>
                      )}
                    </div>
                    {opp.note && <p className={styles.note}>{opp.note}</p>}
                    {canEdit && (
                      <div className={styles.rowActions}>
                        <Button variant="ghost" onClick={() => setEditingId(opp.id)}>
                          Edit
                        </Button>
                        {confirmingDeleteId === opp.id ? (
                          <span className={styles.confirm}>
                            Delete this opportunity?
                            <button
                              type="button"
                              className={styles.confirmDelete}
                              disabled={deletingId === opp.id}
                              onClick={() => void handleDelete(opp)}
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              className={styles.confirmCancel}
                              disabled={deletingId === opp.id}
                              onClick={() => setConfirmingDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setDeleteError(null)
                              setConfirmingDeleteId(opp.id)
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
