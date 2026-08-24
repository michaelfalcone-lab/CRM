/** A Firestore document's data plus its document id — the shape every read
 * hook in `frontend/src/lib/firestore/*` returns instead of the bare
 * `shared` interface (which has no id field of its own). */
export type WithId<T> = T & { id: string }
