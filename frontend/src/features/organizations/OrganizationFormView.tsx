import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Select, TextField } from '../../components/ui'
import { useCurrentUser } from '../../app/AuthProvider'
import { createOrganization, updateOrganization, useOrganization, useOwnerDirectory } from '../../lib'
import styles from './OrganizationFormView.module.css'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  type: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  address: z.string().trim().optional(),
  ownerId: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

/** Add/edit organization form. Only `name` is required. */
export function OrganizationFormView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useCurrentUser()
  const { organization, loading } = useOrganization(id)
  const { owners } = useOwnerDirectory(user)
  const isEdit = Boolean(id)
  const isAdmin = user?.role === 'admin'

  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', type: '', phone: '', address: '', ownerId: user?.authUid ?? '' },
  })

  useEffect(() => {
    if (!organization) return
    reset({
      name: organization.name,
      type: organization.type,
      phone: organization.phone,
      address: organization.address,
      ownerId: organization.ownerId,
    })
  }, [organization, reset])

  if (isEdit && loading) return <Card>Loading…</Card>
  if (isEdit && !loading && !organization) return <Card>Organization not found.</Card>
  if (!user?.authUid) return <Card>Loading…</Card>

  const ownerOptions = owners.map((o) => ({ value: o.authUid, label: o.displayName }))

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      if (isEdit && organization) {
        await updateOrganization(organization.id, {
          name: values.name,
          type: values.type ?? '',
          phone: values.phone ?? '',
          address: values.address ?? '',
          ...(isAdmin && values.ownerId ? { ownerId: values.ownerId } : {}),
        })
        navigate(`/organizations/${organization.id}`)
      } else {
        const ownerId = isAdmin && values.ownerId ? values.ownerId : user.authUid!
        const newId = await createOrganization({
          name: values.name,
          type: values.type,
          phone: values.phone,
          address: values.address,
          ownerId,
          createdBy: user.authUid!,
        })
        navigate(`/organizations/${newId}`)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  })

  return (
    <Card>
      <h2>{isEdit ? 'Edit Organization' : 'Add Organization'}</h2>
      <form className={styles.form} onSubmit={onSubmit}>
        <TextField label="Name" error={errors.name?.message} {...register('name')} />
        <div className={styles.row}>
          <TextField label="Type (optional)" placeholder="e.g. Corporate, Booster Club" {...register('type')} />
          <TextField label="Phone (optional)" {...register('phone')} />
        </div>
        <TextField label="Address (optional)" {...register('address')} />
        {isAdmin && ownerOptions.length > 0 && (
          <Select label="Owner" options={ownerOptions} {...register('ownerId')} />
        )}

        {submitError && <p className={styles.formError}>{submitError}</p>}

        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isEdit ? 'Save Organization' : 'Add Organization'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              navigate(isEdit && organization ? `/organizations/${organization.id}` : '/organizations')
            }
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  )
}
