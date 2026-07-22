/**
 * @module FileService
 * Single Responsibility: All file-related IPC operations for the Desktop app.
 * Wraps window.docuSync IPC calls and normalises errors via ServiceError.
 */
import { ServiceError } from './errors/ServiceError';

export interface FileRecord {
  fileId: number;
  filePath: string;
  contentLength: number;
  extension: string;
  content?: string;
  sizeBytes?: number;
  fileName?: string;
}

export interface FileSaveResult {
  fileId: number;
  bytesSaved: number;
  deltaSize: number;
  peersNotified: number;
  vectorClock: Record<string, unknown>;
}

export interface HistoryEntry {
  id: number;
  eventId: string;
  nodeId: string;
  eventType: 'edit' | 'merge' | 'conflict-resolve' | 'restore' | 'offline-replay' | 'delete';
  logicalTimestamp: number;
  createdAt: string;
  isCompacted: boolean;
  payloadPreview: string;
}

export interface RestoreResult {
  fileId: number;
  restoredToEventId: string;
  contentLength: number;
}

class FileService {
  /**
   * Opens a file via the system file dialog.
   * Returns the file record on success.
   */
  static async open(): Promise<FileRecord> {
    if (!window.docuSync) throw new ServiceError('FileService.open', 'IPC bridge not available.');
    const result = await window.docuSync.openFile();
    if (!result.success) throw new ServiceError('FileService.open', result.error ?? 'Failed to open file.');
    return result.data as FileRecord;
  }

  /**
   * Loads a specific file by its ID (used by the editor).
   */
  static async load(fileId: number): Promise<FileRecord> {
    if (!window.docuSync) throw new ServiceError('FileService.load', 'IPC bridge not available.');
    const result = await window.docuSync.openFile(fileId);
    if (!result.success || !result.data) throw new ServiceError('FileService.load', result.error ?? 'No data returned.');
    return result.data as FileRecord;
  }

  /**
   * Saves (Check-In) file content and triggers a sync delta to peers.
   */
  static async sync(fileId: number, content: string): Promise<FileSaveResult> {
    if (!window.docuSync) throw new ServiceError('FileService.sync', 'IPC bridge not available.');
    const result = await window.docuSync.saveFile(fileId, content, {});
    if (!result.success) throw new ServiceError('FileService.sync', result.error ?? 'Save failed.');
    return result.data as FileSaveResult;
  }

  /**
   * Downloads (Check-Out) a local copy of the file to the user's chosen path.
   */
  static async checkOut(fileId: number): Promise<{ destPath: string }> {
    if (!window.docuSync?.checkoutFile) throw new ServiceError('FileService.checkOut', 'Check-out not available.');
    const result = await window.docuSync.checkoutFile(fileId);
    if (!result.success) throw new ServiceError('FileService.checkOut', result.error ?? 'Check-out failed.');
    return result.data as { destPath: string };
  }

  /**
   * Retrieves the EventLog version history for a file.
   */
  static async getHistory(fileId: number): Promise<{ entries: HistoryEntry[]; totalEntries: number }> {
    if (!window.docuSync) throw new ServiceError('FileService.getHistory', 'IPC bridge not available.');
    const result = await window.docuSync.getHistory(fileId);
    if (!result.success || !result.data) throw new ServiceError('FileService.getHistory', result.error ?? 'No history data.');
    return result.data as { entries: HistoryEntry[]; totalEntries: number };
  }

  /**
   * Restores a file to a prior EventLog snapshot by eventId.
   */
  static async restoreVersion(fileId: number, eventId: string): Promise<RestoreResult> {
    if (!window.docuSync) throw new ServiceError('FileService.restoreVersion', 'IPC bridge not available.');
    const result = await window.docuSync.restoreVersion(fileId, eventId);
    if (!result.success) throw new ServiceError('FileService.restoreVersion', result.error ?? 'Restore failed.');
    return result.data as RestoreResult;
  }

  /**
   * Imports a room file (from another peer) into the local repository.
   */
  static async importRoomFile(fileName: string, content: string, fileId?: number): Promise<FileRecord> {
    if (!window.docuSync?.importRoomFile) throw new ServiceError('FileService.importRoomFile', 'Import not available.');
    const result = await window.docuSync.importRoomFile(fileName, content, fileId);
    if (!result.success) throw new ServiceError('FileService.importRoomFile', result.error ?? 'Import failed.');
    return result.data as FileRecord;
  }

  /**
   * Lists all currently tracked files.
   */
  static async list(): Promise<FileRecord[]> {
    const result = await (window as any).electron?.ipcRenderer?.invoke('files:list');
    if (!result?.success) throw new ServiceError('FileService.list', 'Could not list files.');
    return result.data as FileRecord[];
  }
}

export default FileService;
