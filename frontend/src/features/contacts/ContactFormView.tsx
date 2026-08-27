import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router-dom'
import { LAST_CONTACT_MODES, type LastContactMode } from 'shared'
import { Button, Card, Select, TextField } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import {
  createContact,
  parseLocalDateInput,
  toLocalDateInput,
  updateContact,
  useContact,
  useOwnerDirectory,
  useStatuses,
} from '../../lib'
import { OrganizationCombobox, type OrganizationComboboxValue } from './OrganizationCombobox'
import styles from './ContactFormView.module.css'

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z
    .union([z.string().trim().email('Enter a valid email'), z.literal('')])
    .optional(),
  phone: z.string().trim().optional(),
  status: z.string().optional(),
  lastContactDate: z.string().optional(),
  lastContactMode: z.string().optional(),
  ownerId: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

/**
 * Add/edit contact form. Only `firstName`/`lastName` are required —
 * everything else is optional, per the plan's simplicity bar. The
 * organization field is the `OrganizationCombobox` (search-existing-or-
 * create-inline), managed as separate component state rather than a
 * React Hook Form field, since it isn't a plain text input.
 */
export function ContactFormView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { contact, loading } = useContact(id)
  const { statuses } = useStatuses()
  const { owners } = useOwnerDirectory(user)
  const isEdit = Boolean(id)
  const isAdmin = user?.role === 'admin'

  const [org, setOrg] = useState<OrganizationComboboxValue | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      status: '',
      lastContactDate: '',
      lastContactMode: '',
      ownerId: user?.authUid ?? '',
    },
  })

  // Async default values: reset the form once the existing contact loads
  // (edit mode) rather than gating hook calls behind `loading`.
  useEffect(() => {
    if (!contact) return
    reset({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      status: contact.status ?? '',
      lastContactDate: contact.lastContactDate
        ? toLocalDateInput(new Date(contact.lastContactDate.seconds * 1000))
        : '',
      lastContactMode: contact.lastContactMode ?? '',
      ownerId: contact.ownerId,
    })
    if (contact.organizationId && contact.organizationName) {
      setOrg({ id: contact.organizationId, name: contact.organizationName })
    } else {
      setOrg(null)
    }
  }, [contact, reset])

  if (isEdit && loading) {
    return <Card>Loading…</Card>
  }
  if (isEdit && !loading && !contact) {
    return <Card>Contact not found.</Card>
  }
  if (!user?.authUid) {
    return <Card>Loading…</Card>
  }

  const statusOptions = statuses.map((s) => ({ value: s.id, label: s.label }))
  if (contact?.status && !statusOptions.some((o) => o.value === contact.status)) {
    statusOptions.unshift({ value: contact.status, label: `${contact.status} (inactive)` })
  }

  const ownerOptions = owners.map((o) => ({ value: o.authUid, label: o.displayName }))

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      if (isEdit && contact) {
        await updateContact(contact.id, {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email || null,
          phone: values.phone || null,
          organizationId: org?.id ?? null,
          organizationName: org?.name ?? null,
          status: values.status || null,
          lastContactDate: values.lastContactDate ? parseLocalDateInput(values.lastContactDate) : null,
          lastContactMode: (values.lastContactMode as LastContactMode) || null,
          ...(isAdmin && values.ownerId ? { ownerId: values.ownerId } : {}),
        })
        navigate(`/contacts/${contact.id}`)
      } else {
        const ownerId = isAdmin && values.ownerId ? values.ownerId : user.authUid!
        const newId = await createContact({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email || undefined,
          phone: values.phone || undefined,
          organizationId: org?.id ?? null,
          organizationName: org?.name ?? undefined,
          status: values.status || undefined,
          lastContactDate: values.lastContactDate ? parseLocalDateInput(values.lastContactDate) : undefined,
          lastContactMode: (values.lastContactMode as LastContactMode) || undefined,
          ownerId,
          createdBy: user.authUid!,
        })
        navigate(`/contacts/${newId}`)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  })

  return (
    <Card>
      <h2>{isEdit ? 'Edit Contact' : 'Add Contact'}</h2>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.row}>
          <TextField label="First name" error={errors.firstName?.message} {...register('firstName')} />
          <TextField label="Last name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <div className={styles.row}>
          <TextField label="Email (optional)" type="email" error={errors.email?.message} {...register('email')} />
          <TextField label="Phone (optional)" error={errors.phone?.message} {...register('phone')} />
        </div>

        <OrganizationCombobox
          value={org}
          onChange={setOrg}
          ownerId={user.authUid!}
          createdBy={user.authUid!}
        />

        <div className={styles.row}>
          <Select
            label="Status (optional)"
            options={statusOptions}
            placeholder="No status"
            {...register('status')}
          />
          {isAdmin && ownerOptions.length > 0 && (
            <Select label="Owner" options={ownerOptions} {...register('ownerId')} />
          )}
        </div>

        <div className={styles.row}>
          <TextField label="Last contact date (optional)" type="date" {...register('lastContactDate')} />
          <Select
            label="Last contact mode (optional)"
            options={LAST_CONTACT_MODES.map((m) => ({ value: m, label: m }))}
            placeholder="No mode"
            {...register('lastContactMode')}
          />
        </div>

        {submitError && <p className={styles.formError}>{submitError}</p>}

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isEdit ? 'Save Contact' : 'Add Contact'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate(isEdit && contact ? `/contacts/${contact.id}` : '/contacts')}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
