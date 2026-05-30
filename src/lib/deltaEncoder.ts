import * as Y from 'yjs';

/**
 * Computes the binary delta update that transforms prevState to nextState.
 * Uses Yjs state vectors to find the exact binary diff.
 */
export function computeDelta(prevState: Uint8Array, nextState: Uint8Array): Uint8Array {
    const doc1 = new Y.Doc();
    Y.applyUpdate(doc1, prevState);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, nextState);

    const stateVector = Y.encodeStateVector(doc1);
    return Y.encodeStateAsUpdate(doc2, stateVector);
}

/**
 * Applies a binary delta update to a Yjs document.
 */
export function applyDelta(doc: Y.Doc, delta: Uint8Array): void {
    Y.applyUpdate(doc, delta);
}

/**
 * Returns the exact byte-level size of the binary delta update.
 */
export function getDeltaSizeBytes(delta: Uint8Array): number {
    return delta.length;
}
