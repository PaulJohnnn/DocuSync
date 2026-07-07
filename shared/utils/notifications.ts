/**
 * @module notifications
 * Centralised notification helpers shared across Desktop/Web/Mobile.
 * Wraps sonner `toast` with consistent durations and formatting.
 * Import this instead of calling toast.success/toast.error directly.
 */
import { toast } from 'sonner';
import { formatBytes } from './formatters';

export const notify = {
  /** Short success notification */
  success: (msg: string, description?: string) =>
    toast.success(msg, { description, duration: 2500 }),

  /** Error notification with slightly longer display */
  error: (msg: string, description?: string) =>
    toast.error(msg, { description, duration: 3000 }),

  /** Specific Check-In (Save & Sync) confirmation */
  saved: (deltaSize: number, peers: number) =>
    toast.success('Local workspace purged — version checked in cleanly', {
      description: `Δ ${formatBytes(deltaSize)} · ${peers} peer${peers !== 1 ? 's' : ''} notified`,
      duration: 3000,
    }),

  /** Offline queue notification */
  queued: () =>
    toast('Edit queued', {
      description: 'You are offline. Changes will sync on reconnect.',
      duration: 3500,
    }),

  /** Online restore notification */
  flushed: () =>
    toast.success('Queued edits synced', {
      description: 'All offline changes have been pushed to peers.',
      duration: 4000,
    }),
};
