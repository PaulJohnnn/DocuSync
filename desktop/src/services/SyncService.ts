/**
 * @module SyncService
 * Single Responsibility: Sync-status and sync-trigger IPC operations.
 * Wraps window.docuSync IPC calls and normalises errors via ServiceError.
 */
import { ServiceError } from './errors/ServiceError';
import type { SyncStatusResult } from './PeerService';

class SyncService {
  /**
   * Returns the current sync engine status including vector clock and peer counts.
   */
  static async getStatus(): Promise<SyncStatusResult> {
    if (!window.docuSync) throw new ServiceError('SyncService.getStatus', 'IPC bridge not available.');
    const result = await window.docuSync.getSyncStatus();
    if (!result.success || !result.data) throw new ServiceError('SyncService.getStatus', result.error ?? 'No status data.');
    return result.data as SyncStatusResult;
  }

  /**
   * Manually triggers a full sync propagation to all connected peers.
   */
  static async trigger(): Promise<void> {
    if (!window.docuSync) throw new ServiceError('SyncService.trigger', 'IPC bridge not available.');
    const result = await window.docuSync.triggerSync();
    if (!result.success) throw new ServiceError('SyncService.trigger', result.error ?? 'Sync trigger failed.');
  }

  /**
   * Terminates the current active session and disconnects all peers.
   */
  static async terminateSession(): Promise<void> {
    if (!window.docuSync) throw new ServiceError('SyncService.terminateSession', 'IPC bridge not available.');
    await window.docuSync.terminateSession();
  }
}

export default SyncService;
