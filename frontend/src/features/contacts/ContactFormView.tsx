import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router-dom'
import { ACTIVITY_TYPES, type ActivityType } from 'shared'
import { Button, Card, Select, TextField } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import { capitalizeFirstLetter } from '../../lib/capitalizeFirstLetter'
import { formatPhoneInput, isValidPhoneDigitCount, phoneDigitCount, PHONE_DEFAULT_PREFIX, PHONE_PLACEHOLDER } from '../../lib/phoneFormat'
import {
  ACTIVITY_TYPE_TO_LAST_CONTACT_MODE,
  createContact,
  logContact,
  parseLocalDateInput,
  toLocalDateInput,
  updateContact,
  useContact,
  useOwnerDirectory,
} from '../../lib'
import { OrganizationCombobox, type OrganizationComboboxValue } from './OrganizationCombobox'
import { OwnerPicker } from './OwnerPicker'
import styles from './ContactFormView.module.css'

const schema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    email: z
      .union([z.string().trim().email('Enter a valid email address'), z.literal('')])
      .optional(),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => isValidPhoneDigitCount(v), { message: 'Enter a 10-digit phone number' }),
    lastContactDate: z.string().optional(),
    lastContactMode: z.string().optional(),
    // Required now — every user sees the Owner picker, not just admins, and
    // an admin (who isn't one of the two rep options) must make an
    // explicit choice rather than silently defaulting to nothing.
    ownerId: z.string().min(1, 'Choose an owner'),
  })
  // Email and Phone are each individually optional, but at least one is
  // required — a "complete" phone specifically (10 digits), not a bare
  // accepted 401 default, which must not count as "phone provided."
  .refine((data) => Boolean(data.email) || phoneDigitCount(data.phone) === 10, {
    message: 'Enter an email or phone number',
    path: ['email'],
  })

type FormValues = z.infer<typeof schema>

/**
 * Add/edit contact form.
 *
 * Required fields: First/Last Name, Owner, and (email OR a complete phone
 * number) — Organization is the only field genuinely marked optional.
 * Status is NOT a form field at all: every new contact starts at
 * `'new-lead'` (set by `createContact`) and advances automatically from
 * there (`../../lib/statusWorkflow`) — a manual dropdown here would let a
 * rep set it out of band from the workflow that owns it.
 *
 * The organization field is the `OrganizationCombobox` (search-existing-or-
 * create-inline), managed as separate component state rather than a React
 * Hook Form field, since it isn't a plain text input.
 */
export function ContactFormView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { contact, loading } = useContact(id)
  const { owners, loading: ownersLoading } = useOwnerDirectory(user)
  const isEdit = Boolean(id)
  const isAdmin = user?.role === 'admin'
  const reps = owners.filter((o) => o.role === 'rep')

  const [org, setOrg] = useState<OrganizationComboboxValue | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Tracks whether the phone field has received any keystroke yet, so
  // blur can tell "tabbed through empty" (commit the 401 default) apart
  // from "typed something, then deleted it all" (leave it genuinely
  // empty — the user explicitly overrode the default, they don't get it
  // back by clearing what they typed).
  const [phoneTouched, setPhoneTouched] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      lastContactDate: '',
      lastContactMode: '',
      ownerId: '',
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
      lastContactDate: contact.lastContactDate
        ? toLocalDateInput(new Date(contact.lastContactDate.seconds * 1000))
        : '',
      // Only prefill when the stored legacy value happens to also be a
      // valid `ActivityType` ('Email'/'Other' overlap; 'Phone'/'In-Person'/
      // 'Text' don't). The mapping is many-to-one and not reversible —
      // 'Phone' could have come from any of four call types — so guessing
      // one would put a specific claim in the field the record doesn't
      // support. Left blank instead; the contact's real history is the
      // Contact Log, and re-picking here only rewrites the legacy field.
      lastContactMode: (ACTIVITY_TYPES as readonly string[]).includes(contact.lastContactMode ?? '')
        ? (contact.lastContactMode ?? '')
        : '',
      ownerId: contact.ownerId,
    })
    if (contact.organizationId && contact.organizationName) {
      setOrg({ id: contact.organizationId, name: contact.organizationName })
    } else {
      setOrg(null)
    }
  }, [contact, reset])

  // Create mode only: once the rep directory has loaded, pre-select the
  // viewer's own option if they're one of the two reps. An admin (not a
  // listed rep) gets no default — the Owner picker's `min(1)` requirement
  // then forces an explicit choice.
  //
  // Every dependency here is a primitive (or the stable `setValue`)
  // rather than the derived `reps` array, whose identity changes on every
  // render and would re-run this on each keystroke.
  const selfAuthUid = user?.authUid
  const selfIsRep = reps.some((r) => r.authUid === selfAuthUid)
  useEffect(() => {
    if (isEdit || ownersLoading) return
    if (selfIsRep && selfAuthUid) setValue('ownerId', selfAuthUid)
  }, [isEdit, ownersLoading, selfIsRep, selfAuthUid, setValue])

  if (isEdit && loading) {
    return <Card>Loading…</Card>
  }
  if (isEdit && !loading && !contact) {
    return <Card>Contact not found.</Card>
  }
  if (!user?.authUid) {
    return <Card>Loading…</Card>
  }

  const ownerId = watch('ownerId')
  const lockedToAuthUid = isAdmin ? null : user.authUid

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
          lastContactDate: values.lastContactDate ? parseLocalDateInput(values.lastContactDate) : null,
          // The Contact Mode dropdown speaks the richer `ActivityType`
          // vocabulary (what `logContact` needs on create); `Contact
          // .lastContactMode` still stores the coarser legacy
          // `LastContactMode`, so map down through the same many-to-one
          // table `logContact` itself uses rather than casting.
          lastContactMode: values.lastContactMode
            ? ACTIVITY_TYPE_TO_LAST_CONTACT_MODE[values.lastContactMode as ActivityType]
            : null,
          ...(isAdmin && values.ownerId ? { ownerId: values.ownerId } : {}),
        })
        navigate(`/contacts/${contact.id}`)
      } else {
        const newId = await createContact({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email || undefined,
          phone: values.phone || undefined,
          organizationId: org?.id ?? null,
          organizationName: org?.name ?? undefined,
          ownerId: values.ownerId,
          createdBy: user.authUid!,
        })

        // A contact who's already been reached gets a real logged
        // activity (visible in their Contact Log), not just the field
        // baked silently into the create payload — see `logContact`'s doc
        // comment for why that distinction matters. Fires whenever either
        // field was filled in; a missing counterpart falls back to "now"
        // / the catch-all type rather than blocking the log.
        const alreadyContacted = Boolean(values.lastContactDate) || Boolean(values.lastContactMode)
        if (alreadyContacted) {
          const loggedDate = values.lastContactDate
            ? parseLocalDateInput(values.lastContactDate)
            : new Date()
          const loggedType = (values.lastContactMode as ActivityType) || 'Other'
          await logContact(newId, loggedType, loggedDate, {
            contactName: `${values.firstName} ${values.lastName}`,
            organizationId: org?.id ?? null,
            ownerId: values.ownerId,
            createdBy: user.authUid!,
            currentStatus: undefined, // brand-new contact, no prior status
          })
        }

        navigate(`/contacts/${newId}`)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  })

  const firstNameField = register('firstName')
  const lastNameField = register('lastName')
  const phoneField = register('phone')

  return (
    <Card>
      <h2>{isEdit ? 'Edit Contact' : 'Add Contact'}</h2>
      <form className={styles.form} onSubmit={onSubmit}>
        <div className={styles.row}>
          <TextField
            label="First Name"
            error={errors.firstName?.message}
            {...firstNameField}
            onChange={(e) => {
              e.target.value = capitalizeFirstLetter(e.target.value)
              firstNameField.onChange(e)
            }}
          />
          <TextField
            label="Last Name"
            error={errors.lastName?.message}
            {...lastNameField}
            onChange={(e) => {
              e.target.value = capitalizeFirstLetter(e.target.value)
              lastNameField.onChange(e)
            }}
          />
        </div>
        <div className={styles.row}>
          <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
          <TextField
            label="Phone"
            placeholder={PHONE_PLACEHOLDER}
            error={errors.phone?.message}
            {...phoneField}
            onChange={(e) => {
              setPhoneTouched(true)
              e.target.value = formatPhoneInput(e.target.value)
              phoneField.onChange(e)
            }}
            onBlur={(e) => {
              // Tabbed/clicked away with nothing typed: the 401 default
              // becomes the real, committed value. Typed-then-deleted
              // (phoneTouched already true) does NOT get this — the rep
              // explicitly overrode the default already.
              if (!phoneTouched && e.target.value === '') {
                setValue('phone', PHONE_DEFAULT_PREFIX)
              }
              phoneField.onBlur(e)
            }}
          />
        </div>
        <p className={styles.fieldHint}>Provide an email or phone number.</p>

        <OrganizationCombobox
          value={org}
          onChange={setOrg}
          ownerId={user.authUid!}
          createdBy={user.authUid!}
        />

        <OwnerPicker
          options={reps.map((r) => ({ authUid: r.authUid, displayName: r.displayName }))}
          value={ownerId}
          onChange={(authUid) => setValue('ownerId', authUid)}
          lockedToAuthUid={lockedToAuthUid}
          error={errors.ownerId?.message}
        />

        <div className={styles.row}>
          <TextField label="Contact Date" type="date" {...register('lastContactDate')} />
          <Select
            label="Contact Mode"
            options={ACTIVITY_TYPES.map((m) => ({ value: m, label: m }))}
            placeholder="No mode"
            {...register('lastContactMode')}
          />
        </div>
        <p className={styles.fieldHint}>
          Only fill these in if you've already reached this person — leave them blank for a lead you
          haven't contacted yet.
        </p>

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
