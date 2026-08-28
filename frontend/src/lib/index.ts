export type { WithId } from './firestoreTypes'
export { canEditRecord } from './permissions'
export { toBadgeColor } from './badgeColor'
export { nextStatusInCycle } from './statusCycle'
export { ownerLabel } from './ownerLabel'
export { parseLocalDateInput, toLocalDateInput, todayLocalDateInput } from './dates'

export {
  useContacts,
  useContact,
  createContact,
  updateContact,
  logContact,
  deleteActivity,
  ACTIVITY_TYPE_TO_LAST_CONTACT_MODE,
  type ContactFilters,
  type CreateContactInput,
  type UpdateContactInput,
  type LogContactContext,
  type RemainingActivity,
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
  useGlobalSearch,
  mergeGlobalSearchResults,
  type GlobalSearchResult,
  type GlobalSearchResultType,
} from './firestore/globalSearch'

export {
  useOpportunitiesForContact,
  useOpportunitiesForOrganization,
  createOpportunity,
  updateOpportunity,
  type CreateOpportunityInput,
  type UpdateOpportunityInput,
} from './firestore/opportunities'

export { useContactNotes, addNote, updateNote, deleteNote } from './firestore/notes'

export {
  useFlaggedDuplicates,
  markNotDuplicate,
  confirmDuplicateMerge,
  type UseFlaggedDuplicatesResult,
} from './firestore/duplicates'

export { useStatuses, useOpportunityStages } from './firestore/config'
export { useActivitiesForContact, useActivityCountsByContact } from './firestore/activities'
export type {
  UseActivitiesForContactResult,
  UseActivityCountsResult,
} from './firestore/activities'

export { useOwnerDirectory, type OwnerOption } from './firestore/users'
