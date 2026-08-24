/**
 * Unit tests for `organizations.ts`'s write helpers — same approach as
 * `contacts.test.ts`. The organization case matters most for the inline
 * "create new org from typed text" combobox flow: the brief specifies it
 * "creates a minimal `organizations` doc with just `name` + `ownerId`".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const addDocMock = vi.fn()
const updateDocMock = vi.fn()
const collectionMock = vi.fn((...args: unknown[]) => ({ __collection: args.slice(1) }))
const docMock = vi.fn((...args: unknown[]) => ({ __doc: args.slice(1) }))

vi.mock('firebase/firestore', () => ({
  addDoc: (...args: unknown[]) => addDocMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
  collection: (...args: unknown[]) => collectionMock(...args),
  doc: (...args: unknown[]) => docMock(...args),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((ref: unknown) => ref),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
}))

vi.mock('../firebase', () => ({ db: {} }))

import { createOrganization, updateOrganization } from './organizations'

beforeEach(() => {
  vi.clearAllMocks()
  addDocMock.mockResolvedValue({ id: 'org-new-1' })
  updateDocMock.mockResolvedValue(undefined)
})

describe('createOrganization', () => {
  it('creates a minimal doc from just name + ownerId (the inline-create combobox path)', async () => {
    const id = await createOrganization({ name: 'Acme Corp', ownerId: 'rep-1', createdBy: 'rep-1' })
    expect(id).toBe('org-new-1')
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).toMatchObject({
      name: 'Acme Corp',
      type: '',
      phone: '',
      address: '',
      ownerId: 'rep-1',
      externalIds: { paciolanCustomerId: null },
      mergedInto: null,
      createdBy: 'rep-1',
    })
  })

  it('never sends searchTokens/nameLower — those are the server trigger\'s job', async () => {
    await createOrganization({ name: 'Acme Corp', ownerId: 'rep-1', createdBy: 'rep-1' })
    const payload = addDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload).not.toHaveProperty('searchTokens')
    expect(payload).not.toHaveProperty('nameLower')
  })
})

describe('updateOrganization', () => {
  it('never sends searchTokens/nameLower/ownerId unless explicitly asked', async () => {
    await updateOrganization('org-1', { name: 'New Name' })
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.name).toBe('New Name')
    expect(payload).not.toHaveProperty('searchTokens')
    expect(payload).not.toHaveProperty('nameLower')
    expect(payload).not.toHaveProperty('ownerId')
  })

  it('only includes ownerId when a reassignment is explicitly requested', async () => {
    await updateOrganization('org-1', { ownerId: 'new-owner' })
    const payload = updateDocMock.mock.calls[0]![1] as Record<string, unknown>
    expect(payload.ownerId).toBe('new-owner')
  })
})
