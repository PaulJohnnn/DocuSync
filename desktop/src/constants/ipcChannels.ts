export const IPC_CHANNELS = {
  FILE_OPEN: 'file:open',
  FILE_SAVE: 'file:save',
  FILE_HISTORY: 'file:history',
  FILE_RESTORE: 'file:restore',
  SYNC_STATUS: 'sync:status',
  SYNC_TRIGGER: 'sync:trigger',
  CONFLICT_RESOLVE: 'conflict:resolve',
  CONFLICT_LIST: 'conflict:list',
  CONFLICT_DETAIL: 'conflict:detail',
  PEER_LIST: 'peer:list',
  PEER_CONNECT: 'peer:connect',
  SESSION_TERMINATE: 'session:terminate',
} as const;
