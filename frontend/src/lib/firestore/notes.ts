/**
 * `contacts/{contactId}/notes` subcollection reads/writes. Per
 * `firestore.rules`: any active user may create a note (with their own uid
 * as `authorId`); only the note's own author or an admin may update/delete
 * it — this file's mutations always send `authorId` unchanged on
 * update, matching the rule's `request.resource.data.authorId ==
 * resource.data.authorId` check.
 */
import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import type { ContactNote } from 'shared'
import { db } from '../firebase'
import type { WithId } from '../firestoreTypes'

export interface UseContactNotesResult {
  notes: WithId<ContactNote>[]
  loading: boolean
  error: string | null
}

/** Live notes for one contact, newest first. */
export function useContactNotes(contactId: string | undefined): UseContactNotesResult {
  const [notes, setNotes] = useState<WithId<ContactNote>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!contactId) {
      setNotes([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    const q = query(
      collection(db, 'contacts', contactId, 'notes'),
      orderBy('createdAt', 'desc'),
    )
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setNotes(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as ContactNote) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
    return unsubscribe
  }, [contactId])

  return { notes, loading, error }
}

export async function addNote(
  contactId: string,
  text: string,
  authorId: string,
  authorName: string,
): Promise<void> {
  await addDoc(collection(db, 'contacts', contactId, 'notes'), {
    authorId,
    authorName,
    text: text.trim(),
    createdAt: serverTimestamp(),
  })
}

export async function updateNote(contactId: string, noteId: string, text: string): Promise<void> {
  await updateDoc(doc(db, 'contacts', contactId, 'notes', noteId), { text: text.trim() })
}

export async function deleteNote(contactId: string, noteId: string): Promise<void> {
  await deleteDoc(doc(db, 'contacts', contactId, 'notes', noteId))
}
