/**
 * @module PeerService
 * Single Responsibility: All peer/network IPC operations for the Desktop app.
 * Wraps window.docuSync IPC calls and normalises errors via ServiceError.
 */
import { ServiceError } from './errors/ServiceError';

export interface PeerRecord {
  nodeId: string;
  displayName: string;
  address: string;
  port: number;
  isOnline: boolean;
  firstSeen: string;
  lastSeen: string;
}

export interface PeerListResult {
  peers: PeerRecord[];
  totalPeers: number;
  onlinePeers: number;
}

export interface SyncStatusResult {
  localNodeId: string;
  counters: number[];
  connectedPeers: string[];
  totalConnections: number;
  openFileCount: number;
  pendingConflicts: number;
  peerCount: number;
}

class PeerService {
  /**
   * Returns the full list of known peers and their online status.
   */
  static async list(): Promise<PeerListResult> {
    if (!window.docuSync) throw new ServiceError('PeerService.list', 'IPC bridge not available.');
    const result = await window.docuSync.getPeers();
    if (!result.success || !result.data) throw new ServiceError('PeerService.list', result.error ?? 'Could not fetch peers.');
    return result.data as PeerListResult;
  }

  /**
   * Connects to a remote peer via their WebSocket address.
   */
  static async connect(ip: string, port: number): Promise<void> {
    if (!window.docuSync) throw new ServiceError('PeerService.connect', 'IPC bridge not available.');
    const result = await window.docuSync.connectToPeer(ip, port);
    if (!result.success) throw new ServiceError('PeerService.connect', result.error ?? 'Connection failed.');
  }

  /**
   * Returns the local machine's LAN IP address for sharing with peers.
   */
  static async getLocalIp(): Promise<string> {
    if (!window.docuSync) throw new ServiceError('PeerService.getLocalIp', 'IPC bridge not available.');
    const result = await window.docuSync.getLanIp();
    return result.success && result.data ? String(result.data) : '127.0.0.1';
  }
}

export default PeerService;
