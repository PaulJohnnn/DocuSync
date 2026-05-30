import { VectorClock } from './vectorClock';

export interface QueuedEdit {
    id: string;
    repoName: string;
    fileName: string;
    delta: Uint8Array;       // Yjs binary update
    vectorClock: VectorClock;
    queuedAt: number;        // Date.now() for ordering
}

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is not supported in this environment'));
            return;
        }
        const request = indexedDB.open('docusync_offline_queue', 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('edits')) {
                db.createObjectStore('edits', { keyPath: 'id' });
            }
        };
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error);
        };
    });
}

/**
 * Enqueues an offline edit into IndexedDB for persistence.
 */
export async function enqueueEdit(edit: QueuedEdit): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('edits', 'readwrite');
        const store = tx.objectStore('edits');
        store.put(edit);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Dequeues and returns all queued edits, sorted by vector clock causal ordering.
 */
export async function dequeueAllEdits(): Promise<QueuedEdit[]> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('edits', 'readonly');
        const store = tx.objectStore('edits');
        const request = store.getAll();
        tx.oncomplete = () => {
            const results = request.result as QueuedEdit[];
            // Sort by vector clock counter to preserve causal sequence.
            // Fall back to physical queue ordering (queuedAt) when counters are concurrent.
            results.sort((a, b) => {
                if (a.vectorClock.counter !== b.vectorClock.counter) {
                    return a.vectorClock.counter - b.vectorClock.counter;
                }
                return a.queuedAt - b.queuedAt;
            });
            resolve(results);
        };
        tx.onerror = () => reject(tx.error);
    });
}

/**
 * Clears the offline edit queue.
 */
export async function clearQueue(): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('edits', 'readwrite');
        const store = tx.objectStore('edits');
        store.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}
