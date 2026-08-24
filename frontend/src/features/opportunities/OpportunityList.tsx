import { useState } from 'react'
import type { Opportunity, User } from 'shared'
import { Button, Card } from '../../components/ui'
import { canEditRecord, useOpportunityStages, type WithId } from '../../lib'
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

/** Compact opportunity list (sport + stage badge) with an inline
 * add/edit form, reused by both the contact and organization detail
 * pages. */
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
                      <span className={styles.sport}>{opp.sport}</span>
                      <StageBadge label={stage?.label ?? opp.stage} color={stage?.color} />
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
