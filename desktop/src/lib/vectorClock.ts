export interface VectorClock {
    nodeId: string;
    counter: number;
}

export function incrementClock(clock: VectorClock): VectorClock {
    return {
        nodeId: clock.nodeId,
        counter: clock.counter + 1,
    };
}

export function mergeClock(local: VectorClock, remote: VectorClock): VectorClock {
    return {
        nodeId: local.nodeId,
        counter: Math.max(local.counter, remote.counter) + 1,
    };
}

export function compareClocks(a: VectorClock, b: VectorClock): 'before' | 'after' | 'concurrent' {
    if (a.counter < b.counter) return 'before';
    if (a.counter > b.counter) return 'after';
    return 'concurrent';
}
