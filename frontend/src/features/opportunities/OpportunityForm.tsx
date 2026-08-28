import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { OPPORTUNITY_YEARS, PRODUCT_TYPES, type Opportunity, type Sport } from 'shared'
import { Button, Select, TextArea } from '../../components/ui'
import { createOpportunity, updateOpportunity, useOpportunityStages, type WithId } from '../../lib'
import { SPORTS } from './sports'
import styles from './OpportunityForm.module.css'

const schema = z.object({
  contactId: z.string().min(1, 'Contact is required'),
  sport: z.string().refine((v) => (SPORTS as string[]).includes(v), 'Pick a sport'),
  // Validated against the same lists the dropdowns render, so a stale
  // form (an option retired between page load and submit) fails loudly
  // instead of writing a value nothing else recognizes.
  year: z.string().refine((v) => (OPPORTUNITY_YEARS as string[]).includes(v), 'Pick a year'),
  productType: z
    .string()
    .refine((v) => (PRODUCT_TYPES as string[]).includes(v), 'Pick a product'),
  stage: z.string().min(1, 'Stage is required'),
  note: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export interface OpportunityFormProps {
  currentUserUid: string
  /** Denormalized onto the created/edited opportunity so it also surfaces
   * in the org-level opportunities list, per the brief. */
  organizationId: string | null
  existing?: WithId<Opportunity>
  onSaved: () => void
  onCancel: () => void
  /** Fixed contact — used when this form is mounted from a contact's own
   * detail page, where the contact is unambiguous. Exactly one of
   * `contactId`/`contactOptions` must be given (enforced by callers, not
   * the type, so this one component can compose cleanly into
   * `OpportunityList` either way). */
  contactId?: string
  /** The org's linked contacts to choose from — used when this form is
   * mounted from an organization's detail page, where an opportunity still
   * requires exactly one contact (`Opportunity.contactId` is required, not
   * nullable) but there's no single obvious one. */
  contactOptions?: { id: string; label: string }[]
}

/**
 * Add/edit form for one opportunity, reused by both the contact detail
 * page's inline "Add Opportunity" section and the organization detail
 * page's org-level opportunities section (via `contactId` or
 * `contactOptions` respectively — see prop docs). Sport, year, product,
 * and stage are all required; note is optional.
 */
export function OpportunityForm({
  currentUserUid,
  organizationId,
  existing,
  onSaved,
  onCancel,
  contactId,
  contactOptions,
}: OpportunityFormProps) {
  const { stages } = useOpportunityStages()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      contactId: existing?.contactId ?? contactId ?? '',
      sport: existing?.sport ?? '',
      // `?? ''` rather than a default year: an opportunity created before
      // these fields existed has none, and guessing one would silently
      // attribute it to a season nobody chose. The empty placeholder
      // forces an explicit pick on the next edit.
      year: existing?.year ?? '',
      productType: existing?.productType ?? '',
      stage: existing?.stage ?? '',
      note: existing?.note ?? '',
    },
  })

  const sportOptions = SPORTS.map((s) => ({ value: s, label: s }))
  const yearOptions = OPPORTUNITY_YEARS.map((y) => ({ value: y, label: y }))
  const productOptions = PRODUCT_TYPES.map((p) => ({ value: p, label: p }))
  const stageOptions = stages.map((s) => ({ value: s.id, label: s.label }))
  if (existing && !stageOptions.some((o) => o.value === existing.stage)) {
    // Preserve a now-inactive stage rather than silently blanking it out.
    stageOptions.unshift({ value: existing.stage, label: `${existing.stage} (inactive)` })
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      if (existing) {
        await updateOpportunity(
          existing.id,
          {
            sport: values.sport as Sport,
            year: values.year,
            productType: values.productType,
            stage: values.stage,
            note: values.note ?? null,
          },
          stages,
        )
      } else {
        await createOpportunity(
          {
            contactId: values.contactId,
            organizationId,
            sport: values.sport as Sport,
            year: values.year,
            productType: values.productType,
            stage: values.stage,
            note: values.note || undefined,
            ownerId: currentUserUid,
            createdBy: currentUserUid,
          },
          stages,
        )
      }
      onSaved()
    } catch (err) {
      setError('root', {
        message: err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      })
    }
  })

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      {contactOptions && (
        <Select
          label="Contact"
          options={contactOptions.map((c) => ({ value: c.id, label: c.label }))}
          placeholder="Select a contact"
          error={errors.contactId?.message}
          {...register('contactId')}
        />
      )}
      {contactId && <input type="hidden" {...register('contactId')} />}

      <Select
        label="Sport"
        options={sportOptions}
        placeholder="Select a sport"
        error={errors.sport?.message}
        {...register('sport')}
      />
      <Select
        label="Year"
        options={yearOptions}
        placeholder="Select a year"
        error={errors.year?.message}
        {...register('year')}
      />
      <Select
        label="Product"
        options={productOptions}
        placeholder="Select a product"
        error={errors.productType?.message}
        {...register('productType')}
      />
      <Select
        label="Stage"
        options={stageOptions}
        placeholder="Select a stage"
        error={errors.stage?.message}
        {...register('stage')}
      />
      <TextArea label="Note (optional)" rows={3} {...register('note')} />

      {errors.root?.message && <p className={styles.formError}>{errors.root.message}</p>}

      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={isSubmitting}>
          {existing ? 'Save Opportunity' : 'Add Opportunity'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
