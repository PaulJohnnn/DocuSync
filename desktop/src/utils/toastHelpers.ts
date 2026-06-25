import { toast } from 'sonner';
import { formatBytes } from '@docusync/shared/utils/formatters';

export const toastSuccess = (msg: string) => {
  toast.success(msg, { duration: 2500 });
};

export const toastError = (msg: string) => {
  toast.error(msg, { duration: 3000 });
};

export const toastSaved = (deltaSize: number, peers: number) => {
  toast.success('Saved & synced', {
    description: `Δ ${formatBytes(deltaSize)} · ${peers} peers notified`,
    duration: 2500
  });
};
