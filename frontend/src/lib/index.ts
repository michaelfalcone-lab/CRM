export type { WithId } from './firestoreTypes'
export { canEditRecord } from './permissions'
export { toBadgeColor } from './badgeColor'
export { ownerLabel } from './ownerLabel'

export {
  useContacts,
  useContact,
  createContact,
  updateContact,
  logContact,
  type ContactFilters,
  type CreateContactInput,
  type UpdateContactInput,
} from './firestore/contacts'

export {
  useOrganizations,
  useOrganization,
  createOrganization,
  updateOrganization,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
} from './firestore/organizations'

export { useOrganizationSearch } from './firestore/organizationSearch'

export {
  useOpportunitiesForContact,
  useOpportunitiesForOrganization,
  createOpportunity,
  updateOpportunity,
  type CreateOpportunityInput,
  type UpdateOpportunityInput,
} from './firestore/opportunities'

export { useContactNotes, addNote, updateNote, deleteNote } from './firestore/notes'

export { useStatuses, useOpportunityStages } from './firestore/config'

export { useOwnerDirectory, type OwnerOption } from './firestore/users'
