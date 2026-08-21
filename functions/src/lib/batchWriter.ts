/**
 * Wraps a Firestore `WriteBatch`, automatically committing and starting a
 * fresh batch before the 500-writes-per-commit limit would be exceeded.
 *
 * Used by both `commitImport` (which can create/update far more than 500
 * contact + import-row documents in one call) and `revertImportBatch`
 * (which can touch just as many on undo).
 */
import type { DocumentData, DocumentReference } from 'firebase-admin/firestore'
import { db } from './firebaseAdmin'

const MAX_OPS_PER_BATCH = 500

export class BatchWriter {
  private batch = db.batch()
  private opCount = 0

  private async flushIfNeeded(): Promise<void> {
    if (this.opCount >= MAX_OPS_PER_BATCH) {
      await this.batch.commit()
      this.batch = db.batch()
      this.opCount = 0
    }
  }

  async set(ref: DocumentReference, data: DocumentData): Promise<void> {
    await this.flushIfNeeded()
    this.batch.set(ref, data)
    this.opCount += 1
  }

  async update(ref: DocumentReference, data: DocumentData): Promise<void> {
    await this.flushIfNeeded()
    this.batch.update(ref, data)
    this.opCount += 1
  }

  async delete(ref: DocumentReference): Promise<void> {
    await this.flushIfNeeded()
    this.batch.delete(ref)
    this.opCount += 1
  }

  /** Commits any remaining buffered writes. Must be called once after the
   * last `set`/`update`/`delete` call. Safe to call with nothing buffered. */
  async commit(): Promise<void> {
    if (this.opCount > 0) {
      await this.batch.commit()
      this.opCount = 0
    }
  }
}
