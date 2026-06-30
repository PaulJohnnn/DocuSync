/**
 * @module ipcChannels
 * Single source of truth for all Electron IPC channel names.
 * Use these constants in preload.ts, ipc-handlers.ts, and all services.
 * Eliminates magic strings scattered across the codebase.
 */
export const IPC_CHANNELS = {
  // File operations
  FILE_OPEN:    'file:open',
  FILE_SAVE:    'file:save',
  FILE_CHECKOUT: 'file:checkout',
  FILE_HISTORY: 'file:history',
  FILE_RESTORE: 'file:restore',
  FILES_LIST:   'files:list',
  FILE_IMPORT:  'file:import',

  // Sync operations
  SYNC_STATUS:  'sync:status',
  SYNC_TRIGGER: 'sync:trigger',

  // Conflict operations
  CONFLICT_LIST:    'conflict:list',
  CONFLICT_DETAIL:  'conflict:detail',
  CONFLICT_RESOLVE: 'conflict:resolve',

  // Peer operations
  PEER_LIST:    'peer:list',
  PEER_CONNECT: 'peer:connect',

  // System / utility
  SYSTEM_GET_IP:       'system:get-ip',
  SYSTEM_LOCK_VAULT:   'system:lock-vault',
  SYSTEM_TERMINATE:    'system:terminate-session',
  CACHE_SIZE:          'cache:size',
  CACHE_CLEANUP:       'cache:cleanup',

  // Admin operations
  ADMIN_VERIFY:        'admin:verify-account',
  ADMIN_GENERATE:      'admin:generate-account',
  ADMIN_DELETE_GROUP:  'admin:delete-group',
  ADMIN_SESSION_LOG:   'admin:session-log',
} as const;

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
