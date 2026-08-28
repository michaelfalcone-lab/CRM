import { useState } from 'react'
import type { Opportunity, User } from 'shared'
import { Button, Card, Select } from '../../components/ui'
import { canEditRecord, updateOpportunity, useOpportunityStages, type WithId } from '../../lib'
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
 * as just its sport rather than "Football ·  · ". */
function summarize(opp: WithId<Opportunity>): string {
  return [opp.sport, opp.year, opp.productType].filter(Boolean).join(' · ')
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
                      <Button variant="ghost" onClick={() => setEditingId(opp.id)}>
                        Edit
                      </Button>
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
