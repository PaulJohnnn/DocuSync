/**
 * @module ConflictService
 * Single Responsibility: All conflict-related IPC operations for the Desktop app.
 * Wraps window.docuSync IPC calls and normalises errors via ServiceError.
 */
import { ServiceError } from './errors/ServiceError';

export interface ConflictRecord {
  conflictId: string;
  fileId: number;
  nodeIdA: string;
  nodeIdB: string;
  payloadA: string;
  payloadB: string;
  logicalTimestampA: number;
  logicalTimestampB: number;
  detectedAt: string;
}

class ConflictService {
  /**
   * Lists all pending conflicts from the local database.
   */
  static async list(): Promise<ConflictRecord[]> {
    if (!window.docuSync?.listConflicts) throw new ServiceError('ConflictService.list', 'IPC bridge not available.');
    const result = await window.docuSync.listConflicts();
    if (!result.success) throw new ServiceError('ConflictService.list', result.error ?? 'Could not list conflicts.');
    return ((result as any).data?.conflicts ?? []) as ConflictRecord[];
  }

  /**
   * Fetches full payload detail for a single conflict by ID.
   */
  static async getDetail(conflictId: string): Promise<ConflictRecord> {
    if (!window.docuSync?.getConflictDetail) throw new ServiceError('ConflictService.getDetail', 'IPC bridge not available.');
    const result = await window.docuSync.getConflictDetail(conflictId);
    if (!result.success || !(result as any).data) throw new ServiceError('ConflictService.getDetail', result.error ?? 'No detail data.');
    return (result as any).data as ConflictRecord;
  }

  /**
   * Accepts an incoming change (Side B wins). Owner-only action.
   */
  static async accept(conflictId: string): Promise<void> {
    if (!window.docuSync) throw new ServiceError('ConflictService.accept', 'IPC bridge not available.');
    const result = await window.docuSync.resolveConflict(conflictId, 'B');
    if (!result.success) throw new ServiceError('ConflictService.accept', result.error ?? 'Accept failed.');
  }

  /**
   * Rejects an incoming change (Side A / original wins). Owner-only action.
   */
  static async reject(conflictId: string): Promise<void> {
    if (!window.docuSync) throw new ServiceError('ConflictService.reject', 'IPC bridge not available.');
    const result = await window.docuSync.resolveConflict(conflictId, 'A');
    if (!result.success) throw new ServiceError('ConflictService.reject', result.error ?? 'Reject failed.');
  }

  /**
   * Resolves a conflict using a custom provided payload. Owner-only action.
   */
  static async resolveManual(conflictId: string, customPayload: string): Promise<void> {
    if (!window.docuSync?.resolveConflictManual) throw new ServiceError('ConflictService.resolveManual', 'IPC bridge not available.');
    const result = await window.docuSync.resolveConflictManual(conflictId, customPayload);
    if (!result.success) throw new ServiceError('ConflictService.resolveManual', result.error ?? 'Manual resolve failed.');
  }
}

export default ConflictService;
