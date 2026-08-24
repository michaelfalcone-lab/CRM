import { useState } from 'react'
import type { User } from 'shared'
import { Button, TextArea } from '../../components/ui'
import { addNote, deleteNote, updateNote, useContactNotes } from '../../lib'
import styles from './ContactNotesPanel.module.css'

function formatTimestamp(ts: { seconds: number } | undefined): string {
  if (!ts) return ''
  return new Date(ts.seconds * 1000).toLocaleString()
}

export interface ContactNotesPanelProps {
  contactId: string
  currentUser: User | null
}

/**
 * Notes for one contact, newest first. Any active user can add a note
 * (add-only textarea, always visible); edit/delete are shown only on the
 * note's own author's notes, or to an admin — matching
 * `firestore.rules`' `contacts/{id}/notes` rules exactly, so the UI never
 * offers an action the server would reject.
 */
export function ContactNotesPanel({ contactId, currentUser }: ContactNotesPanelProps) {
  const { notes, loading } = useContactNotes(contactId)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  if (!currentUser?.authUid) return null
  const uid = currentUser.authUid
  const isAdmin = currentUser.role === 'admin'

  async function handleAdd() {
    if (!draft.trim() || submitting) return
    setSubmitting(true)
    try {
      await addNote(contactId, draft, uid, currentUser!.displayName)
      setDraft('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.section}>
      <h3>Notes</h3>

      <div className={styles.addForm}>
        <TextArea
          id={`note-draft-${contactId}`}
          name="note"
          label="Add a note"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Log a call, a follow-up, anything worth remembering…"
        />
        <Button variant="secondary" onClick={() => void handleAdd()} disabled={submitting || !draft.trim()}>
          Add Note
        </Button>
      </div>

      {loading && <p>Loading notes…</p>}
      {!loading && notes.length === 0 && <p className={styles.empty}>No notes yet.</p>}

      <ul className={styles.list}>
        {notes.map((note) => {
          const canModify = isAdmin || note.authorId === uid
          const isEditing = editingId === note.id
          return (
            <li key={note.id} className={styles.note}>
              {isEditing ? (
                <div className={styles.editForm}>
                  <TextArea
                    rows={3}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                  />
                  <div className={styles.editActions}>
                    <Button
                      variant="primary"
                      onClick={() => {
                        void updateNote(contactId, note.id, editText).then(() => setEditingId(null))
                      }}
                      disabled={!editText.trim()}
                    >
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.noteMeta}>
                    <span className={styles.author}>{note.authorName}</span>
                    <span className={styles.timestamp}>{formatTimestamp(note.createdAt)}</span>
                  </div>
                  <p className={styles.text}>{note.text}</p>
                  {canModify && (
                    <div className={styles.noteActions}>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingId(note.id)
                          setEditText(note.text)
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => void deleteNote(contactId, note.id)}>
                        Delete
                      </Button>
                    </div>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
