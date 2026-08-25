/**
 * @module VectorClock
 *
 * A Vector Clock is like a digital timestamp for a group of computers.
 * Normal computer clocks can be out of sync (one might be 5 minutes fast), so we can't trust them.
 * Instead, a Vector Clock counts how many edits each person has made.
 * By comparing these counts, the system can mathematically prove who edited what first,
 * or if two people edited at the exact same time (a conflict).
 *
 * This file organizes those counts in a "tree" shape, which makes it easier for new
 * phones or laptops to join the room without breaking the system.
 *
 * References for your thesis:
 * - [8] Fidge, C. (1988). Timestamps in message-passing systems.
 * - [11] Mattern, F. (1989). Virtual time and global states of distributed systems.
 *
 * @packageDocumentation
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum safe counter value. Any slot that reaches or exceeds this threshold
 * triggers overflow protection to prevent silent precision loss in JavaScript's
 * IEEE-754 double-precision floats.
 *
 * Set to `Number.MAX_SAFE_INTEGER / 2` so that an `increment` followed by a
 * `merge` (which also increments) can never silently exceed
 * `Number.MAX_SAFE_INTEGER`.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER}
 */
const OVERFLOW_THRESHOLD: number = Math.floor(Number.MAX_SAFE_INTEGER / 2);

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single node in the tree clock structure.
 *
 * Each node holds a monotonically increasing `counter` representing the
 * logical timestamp for one participant in the distributed system. The
 * `children` array allows the clock to mirror a hierarchical network
 * topology (e.g., sub-clusters, delegation chains) as described in [8].
 */
export interface TreeClockNode {
  /** Monotonically increasing logical timestamp for this slot. */
  counter: number;
  /** Child nodes in the tree clock hierarchy. */
  children: TreeClockNode[];
}

/**
 * JSON-safe representation of a {@link VectorClock}, suitable for
 * transmission over WebSocket or storage in SQLite via Prisma.
 *
 * @see {@link VectorClock.toJSON}
 * @see {@link VectorClock.fromJSON}
 */
export interface VectorClockJSON {
  /** Total number of nodes the clock was initialised with. */
  nodeCount: number;
  /** Index of the local node that owns this clock instance. */
  nodeIndex: number;
  /** Serialised tree structure. */
  root: TreeClockNode;
}

/**
 * Comparison result between two vector clocks.
 *
 * Used internally by {@link VectorClock.dominates} and
 * {@link VectorClock.isConcurrent}.
 *
 * | Value          | Meaning                                   |
 * |----------------|-------------------------------------------|
 * | `"dominant"`   | `this` clock strictly dominates `other`.  |
 * | `"dominated"`  | `other` clock strictly dominates `this`.  |
 * | `"equal"`      | Both clocks are identical.                |
 * | `"concurrent"` | Neither dominates — conflict detected.    |
 *
 * @see Thesis citation [8] §3.2 — partial ordering of vector timestamps
 */
export type ClockRelation = 'dominant' | 'dominated' | 'equal' | 'concurrent';

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a counter value exceeds {@link OVERFLOW_THRESHOLD}.
 *
 * Callers should handle this by triggering a clock-reset protocol
 * (coordinated epoch bump) across all peers in the P2P mesh.
 */
export class VectorClockOverflowError extends Error {
  constructor(slotIndex: number, value: number) {
    super(
      `VectorClock overflow: slot ${slotIndex} reached ${value}, ` +
        `exceeding safe threshold ${OVERFLOW_THRESHOLD}. ` +
        `Initiate a coordinated clock-reset protocol.`
    );
    this.name = 'VectorClockOverflowError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a tree clock with `nodeCount` leaf nodes, each counter
 * initialised to `0`.
 *
 * The tree is structured as a single root whose children are the leaf
 * slots. This flat-tree shape is the simplest topology; future work may
 * support deeper hierarchies for sub-cluster delegation [8].
 *
 * @param nodeCount - Number of participant nodes.
 * @returns The root of the newly created tree clock.
 *
 * @internal
 */
function buildTree(nodeCount: number): TreeClockNode {
  const children: TreeClockNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    children.push({ counter: 0, children: [] });
  }
  return { counter: 0, children };
}

/**
 * Deep-clones a {@link TreeClockNode} subtree.
 *
 * @param node - The node to clone.
 * @returns An independent deep copy.
 *
 * @internal
 */
function cloneTree(node: TreeClockNode): TreeClockNode {
  return {
    counter: node.counter,
    children: node.children.map(cloneTree),
  };
}

/**
 * Collects all leaf-level counters from a tree clock into a flat array
 * (left-to-right DFS order). This is the canonical representation used
 * for comparison operations.
 *
 * @param node - The root of the tree clock.
 * @returns Flat array of counter values, one per leaf slot.
 *
 * @internal
 */
function flattenCounters(node: TreeClockNode): number[] {
  if (node.children.length === 0) {
    return [node.counter];
  }
  const result: number[] = [];
  for (const child of node.children) {
    result.push(...flattenCounters(child));
  }
  return result;
}

/**
 * Pads a tree clock in place so that its root has `targetChildrenCount` leaf nodes.
 * New nodes are appended with counter 0.
 *
 * @param node - The root of the tree clock.
 * @param targetChildrenCount - The desired number of children at the root.
 *
 * @internal
 */
function padTree(node: TreeClockNode, targetChildrenCount: number): void {
  while (node.children.length < targetChildrenCount) {
    node.children.push({ counter: 0, children: [] });
  }
}

/**
 * Performs element-wise maximum of two tree clocks **in place** on `target`.
 *
 * If topologies mismatch due to network expansion, the smaller tree is 
 * dynamically padded with zeroes before merging.
 *
 * @param target - The tree to mutate.
 * @param source - The tree to merge values from.
 *
 * @internal
 */
function mergeTreeInPlace(target: TreeClockNode, source: TreeClockNode): void {
  // Dynamically pad target if it's smaller
  if (target.children.length < source.children.length) {
    padTree(target, source.children.length);
  }

  // Leaf node — take the max counter.
  if (target.children.length === 0 && source.children.length === 0) {
    target.counter = Math.max(target.counter, source.counter);
    return;
  }

  // Internal node — recurse into children.
  // Note: if source is smaller, the missing source children are virtually 0.
  // max(target, 0) == target, so we only need to merge up to source length.
  const lengthToMerge = Math.min(target.children.length, source.children.length);
  for (let i = 0; i < lengthToMerge; i++) {
    mergeTreeInPlace(target.children[i], source.children[i]);
  }
}

/**
 * Checks every leaf counter in the tree against {@link OVERFLOW_THRESHOLD}.
 *
 * @param node  - Tree clock root.
 * @param index - Mutable counter for tracking the current leaf index.
 * @returns The next unused leaf index (used for recursion bookkeeping).
 *
 * @throws {VectorClockOverflowError} If any leaf counter exceeds the threshold.
 *
 * @internal
 */
function checkOverflow(
  node: TreeClockNode,
  index: { value: number }
): void {
  if (node.children.length === 0) {
    if (node.counter > OVERFLOW_THRESHOLD) {
      throw new VectorClockOverflowError(index.value, node.counter);
    }
    index.value++;
    return;
  }
  for (const child of node.children) {
    checkOverflow(child, index);
  }
}

/**
 * Sets the counter of the leaf at `targetIndex` to `value`.
 *
 * @param node        - Current subtree root.
 * @param targetIndex - The leaf slot to update.
 * @param value       - The new counter value.
 * @param currentIndex - Mutable tracker for the current DFS leaf position.
 *
 * @internal
 */
function setLeafCounter(
  node: TreeClockNode,
  targetIndex: number,
  value: number,
  currentIndex: { value: number }
): void {
  if (node.children.length === 0) {
    if (currentIndex.value === targetIndex) {
      node.counter = value;
    }
    currentIndex.value++;
    return;
  }
  for (const child of node.children) {
    setLeafCounter(child, targetIndex, value, currentIndex);
    if (currentIndex.value > targetIndex) return; // early exit
  }
}

/**
 * Reads the counter of the leaf at `targetIndex`.
 *
 * @param node        - Current subtree root.
 * @param targetIndex - The leaf slot to read.
 * @param currentIndex - Mutable tracker for the current DFS leaf position.
 * @returns The counter value, or `-1` if not found (should not happen with valid input).
 *
 * @internal
 */
function getLeafCounter(
  node: TreeClockNode,
  targetIndex: number,
  currentIndex: { value: number }
): number {
  if (node.children.length === 0) {
    const result = currentIndex.value === targetIndex ? node.counter : -1;
    currentIndex.value++;
    return result;
  }
  for (const child of node.children) {
    const result = getLeafCounter(child, targetIndex, currentIndex);
    if (result !== -1) return result;
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────────────────────
// VectorClock Class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tree-structured vector clock for causal ordering and conflict detection
 * in the DocuSync masterless P2P sync engine.
 *
 * **Usage:**
 * ```ts
 * import { createVectorClock } from '@/engine/vector-clock/vector-clock';
 *
 * const clock = createVectorClock(3, 0);   // 3-node network, this is node 0
 * clock.increment();                        // local edit
 *
 * const remoteClock = createVectorClock(3, 1);
 * remoteClock.increment();
 *
 * clock.merge(remoteClock);                 // sync with remote
 * console.log(clock.dominates(remoteClock)); // true
 * ```
 *
 * **Thesis references:**
 * - [8]  Fidge (1988) — vector timestamp construction and comparison
 * - [11] Mattern (1989) — element-wise max merge rule
 */
export class VectorClock {
  /**
   * The tree clock root node. Each leaf corresponds to one participant
   * in the distributed system.
   *
   * @internal
   */
  private _root: TreeClockNode;

  /**
   * Total number of participant nodes this clock was created for.
   */
  public nodeCount: number;

  /**
   * Index of the local node that owns this clock instance (0-based).
   * @readonly
   */
  public readonly nodeIndex: number;

  /**
   * Constructs a new VectorClock.
   *
   * Prefer {@link createVectorClock} for public construction.
   *
   * @param nodeCount - Total number of nodes in the P2P network.
   * @param nodeIndex - The index (0-based) of the local node.
   * @param root      - Optional pre-built tree (used by {@link fromJSON}).
   *
   * @throws {RangeError} If `nodeCount < 1` or `nodeIndex` is out of range.
   */
  constructor(nodeCount: number, nodeIndex: number, root?: TreeClockNode) {
    if (nodeCount < 1) {
      throw new RangeError(`nodeCount must be ≥ 1, received ${nodeCount}.`);
    }
    if (nodeIndex < 0) {
      throw new RangeError(
        `nodeIndex must be ≥ 0, received ${nodeIndex}.`
      );
    }
    if (!Number.isInteger(nodeCount) || !Number.isInteger(nodeIndex)) {
      throw new RangeError(
        `nodeCount and nodeIndex must be integers. ` +
          `Received nodeCount=${nodeCount}, nodeIndex=${nodeIndex}.`
      );
    }

    this.nodeCount = nodeCount;
    this.nodeIndex = nodeIndex;
    this._root = root ? cloneTree(root) : buildTree(nodeCount);
  }

  // ── Accessors ──────────────────────────────────────────────────────────

  /**
   * Returns a deep clone of the internal tree clock structure.
   *
   * Useful for inspection and debugging without risking mutation of
   * internal state.
   *
   * @returns A deep copy of the root {@link TreeClockNode}.
   */
  public get root(): TreeClockNode {
    return cloneTree(this._root);
  }

  /**
   * Returns the flat array of all leaf counters in left-to-right DFS order.
   *
   * This is a convenience accessor; the canonical data structure is the
   * tree itself.
   *
   * @returns Array of counter values, length === `nodeCount`.
   */
  public get counters(): readonly number[] {
    return flattenCounters(this._root);
  }

  // ── Core Operations ────────────────────────────────────────────────────

  /**
   * Increments the local node's slot in the vector clock.
   *
   * Called on every local edit event (file write, document change) to
   * advance the causal timestamp before broadcasting to peers.
   *
   * > "Each process increments its own element of the vector clock before
   * > each event." — Fidge [8], §2.1
   *
   * @throws {VectorClockOverflowError} If the incremented value exceeds
   *   {@link OVERFLOW_THRESHOLD}.
   *
   * @returns `this` for method chaining.
   *
   * @example
   * ```ts
   * const vc = createVectorClock(3, 0);
   * vc.increment(); // counters: [1, 0, 0]
   * vc.increment(); // counters: [2, 0, 0]
   * ```
   *
   * @see Thesis citation [8] — Fidge (1988), vector timestamp increment rule
   */
  public increment(): this {
    const current = getLeafCounter(this._root, this.nodeIndex, { value: 0 });
    const next = current + 1;

    if (next > OVERFLOW_THRESHOLD) {
      throw new VectorClockOverflowError(this.nodeIndex, next);
    }

    setLeafCounter(this._root, this.nodeIndex, next, { value: 0 });
    return this;
  }

  /**
   * Merges a remote vector clock into this one by taking the element-wise
   * maximum of all corresponding leaf counters, then increments the local
   * node's slot.
   *
   * This implements the standard receive-event rule from Mattern [11]:
   *
   * > "Upon receiving a message, the recipient takes the component-wise
   * > maximum of its own clock and the timestamp on the message, then
   * > increments its own component." — Mattern [11], §3
   *
   * @param remote - The remote vector clock received over WebSocket.
   *
   * @throws {Error} If `remote.nodeCount !== this.nodeCount` (topology mismatch).
   * @throws {VectorClockOverflowError} If any merged counter exceeds the
   *   safe threshold.
   *
   * @returns `this` for method chaining.
   *
   * @example
   * ```ts
   * const local  = createVectorClock(3, 0).increment(); // [1, 0, 0]
   * const remote = createVectorClock(3, 1).increment(); // [0, 1, 0]
   * local.merge(remote); // [2, 1, 0]  (max + increment own)
   * ```
   *
   * @see Thesis citation [11] — Mattern (1989), merge rule
   * @see Thesis citation [8]  — Fidge (1988), message receive handling
   */
  public merge(remote: VectorClock): this {
    // Step 1: Element-wise max, dynamically padding if needed.
    mergeTreeInPlace(this._root, remote._root);

    // Update local node count if the remote topology was larger.
    this.nodeCount = Math.max(this.nodeCount, remote.nodeCount);

    // Step 2: Check for overflow after merge.
    checkOverflow(this._root, { value: 0 });

    // Step 3: Increment own slot (receive-event rule [11]).
    this.increment();

    return this;
  }

  /**
   * Determines whether this vector clock **strictly dominates** another.
   *
   * Clock A dominates Clock B iff:
   * - For every slot `i`: `A[i] >= B[i]`
   * - There exists at least one slot `j` where `A[j] > B[j]`
   *
   * If A dominates B, the event represented by A is causally *after*
   * the event represented by B — no conflict exists, and A's state is
   * the most recent.
   *
   * > "Event e causally precedes event f iff V(e) < V(f), where < is
   * > the strict partial order on vector timestamps." — Fidge [8], §3.2
   *
   * @param other - The vector clock to compare against.
   *
   * @throws {Error} If `other.nodeCount !== this.nodeCount`.
   *
   * @returns `true` if this clock strictly dominates `other`.
   *
   * @example
   * ```ts
   * const a = createVectorClock(2, 0).increment().increment(); // [2, 0]
   * const b = createVectorClock(2, 0).increment();              // [1, 0]
   * a.dominates(b); // true
   * b.dominates(a); // false
   * ```
   *
   * @see Thesis citation [8] — Fidge (1988), partial ordering definition
   */
  public dominates(other: VectorClock): boolean {
    return this.compare(other) === 'dominant';
  }

  /**
   * Determines whether this clock and another are **concurrent** — meaning
   * neither dominates the other, indicating a write conflict.
   *
   * Concurrency arises when two nodes make independent edits without
   * having received each other's latest state. The sync engine must
   * then invoke the LWW (Last-Writer-Wins) or delta-merge resolver.
   *
   * > "Two events are concurrent iff neither's timestamp dominates the
   * > other's." — Fidge [8], §3.3
   *
   * @param other - The vector clock to compare against.
   *
   * @throws {Error} If `other.nodeCount !== this.nodeCount`.
   *
   * @returns `true` if the clocks are concurrent (conflict detected).
   *
   * @example
   * ```ts
   * const a = createVectorClock(2, 0).increment(); // [1, 0]
   * const b = createVectorClock(2, 1).increment(); // [0, 1]
   * a.isConcurrent(b); // true — conflict!
   * ```
   *
   * @see Thesis citation [8]  — Fidge (1988), concurrency definition
   * @see Thesis citation [11] — Mattern (1989), conflict detection
   */
  public isConcurrent(other: VectorClock): boolean {
    return this.compare(other) === 'concurrent';
  }

  /**
   * Full four-way comparison of two vector clocks.
   *
   * @param other - The vector clock to compare against.
   *
   * @throws {Error} If `other.nodeCount !== this.nodeCount`.
   *
   * @returns The {@link ClockRelation} between `this` and `other`.
   *
   * @see Thesis citation [8] — Fidge (1988), comparison algorithm
   */
  public compare(other: VectorClock): ClockRelation {
    const thisCounters = flattenCounters(this._root);
    const otherCounters = flattenCounters(other._root);

    // Dynamically pad the smaller array with zeroes to handle topology expansion
    const maxLength = Math.max(thisCounters.length, otherCounters.length);
    while (thisCounters.length < maxLength) thisCounters.push(0);
    while (otherCounters.length < maxLength) otherCounters.push(0);

    let hasGreater = false;
    let hasLesser = false;

    for (let i = 0; i < thisCounters.length; i++) {
      if (thisCounters[i] > otherCounters[i]) {
        hasGreater = true;
      } else if (thisCounters[i] < otherCounters[i]) {
        hasLesser = true;
      }

      // Early exit: if both flags are set, it's concurrent.
      if (hasGreater && hasLesser) {
        return 'concurrent';
      }
    }

    if (hasGreater && !hasLesser) return 'dominant';
    if (!hasGreater && hasLesser) return 'dominated';
    return 'equal';
  }

  // ── Serialization ──────────────────────────────────────────────────────

  /**
   * Serialises this vector clock to a JSON-safe plain object.
   *
   * The output is suitable for:
   * - Transmission over WebSocket (`JSON.stringify`)
   * - Storage in SQLite via Prisma (as a JSON column)
   * - Logging and debugging
   *
   * @returns A {@link VectorClockJSON} object.
   *
   * @example
   * ```ts
   * const vc = createVectorClock(3, 0).increment();
   * const json = vc.toJSON();
   * // Send over WebSocket:
   * ws.send(JSON.stringify({ type: 'sync', clock: json }));
   * ```
   *
   * @see Thesis citation [8] — Fidge (1988), serialisation for message passing
   */
  public toJSON(): VectorClockJSON {
    return {
      nodeCount: this.nodeCount,
      nodeIndex: this.nodeIndex,
      root: cloneTree(this._root),
    };
  }

  /**
   * Deserialises a {@link VectorClockJSON} object back into a live
   * {@link VectorClock} instance.
   *
   * Use this on the receiving end of a WebSocket message to reconstruct
   * the remote peer's clock for merge/comparison.
   *
   * @param json - The serialised clock data.
   *
   * @throws {RangeError} If the JSON contains invalid `nodeCount` or `nodeIndex`.
   * @throws {Error} If the tree structure is missing or malformed.
   *
   * @returns A new {@link VectorClock} instance.
   *
   * @example
   * ```ts
   * ws.onmessage = (event) => {
   *   const msg = JSON.parse(event.data);
   *   const remoteClock = VectorClock.fromJSON(msg.clock);
   *   localClock.merge(remoteClock);
   * };
   * ```
   *
   * @see Thesis citation [11] — Mattern (1989), clock reconstruction on receive
   */
  public static fromJSON(json: VectorClockJSON): VectorClock {
    if (!json || typeof json.nodeCount !== 'number' || typeof json.nodeIndex !== 'number') {
      throw new Error(
        'Invalid VectorClockJSON: missing or invalid nodeCount/nodeIndex.'
      );
    }
    if (!json.root || typeof json.root.counter !== 'number') {
      throw new Error(
        'Invalid VectorClockJSON: missing or malformed root tree node.'
      );
    }

    return new VectorClock(json.nodeCount, json.nodeIndex, json.root);
  }

  // ── Debug ──────────────────────────────────────────────────────────────

  /**
   * Returns a human-readable string representation for debugging.
   *
   * @returns A string like `VectorClock(node=0, [2, 1, 0])`.
   */
  public toString(): string {
    return `VectorClock(node=${this.nodeIndex}, [${this.counters.join(', ')}])`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a new {@link VectorClock} instance for a node in the P2P network.
 *
 * This is the recommended public API for constructing vector clocks.
 *
 * @param nodeCount - Total number of nodes in the P2P mesh (must be ≥ 1).
 * @param nodeIndex - The 0-based index of the local node.
 *
 * @throws {RangeError} If `nodeCount < 1` or `nodeIndex` is out of range.
 *
 * @returns A fresh {@link VectorClock} with all counters initialised to `0`.
 *
 * @example
 * ```ts
 * // 3-node network, this node is node 0
 * const vc = createVectorClock(3, 0);
 * vc.increment();                   // local edit  → [1, 0, 0]
 * vc.merge(remoteClockFromNode1);   // sync        → [2, 1, 0]
 *
 * if (vc.isConcurrent(anotherClock)) {
 *   // Conflict detected — invoke LWW resolver
 * }
 * ```
 *
 * @see Thesis citation [8]  — Fidge (1988), clock initialisation
 * @see Thesis citation [11] — Mattern (1989), distributed clock construction
 */
export function createVectorClock(
  nodeCount: number,
  nodeIndex: number
): VectorClock {
  return new VectorClock(nodeCount, nodeIndex);
}
