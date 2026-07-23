# MeshForge architecture

## Design goals

- Local edits should render in under 16 ms.
- Remote edits should appear with p95 end-to-end latency below 100 ms in-region.
- Concurrent edits must converge without a central lock.
- Reconnects must be idempotent and must not lose acknowledged operations.
- AI suggestions must always arrive as reviewable patches, never silent mutations.

## System boundaries

| Component | Responsibility | Initial technology |
| --- | --- | --- |
| Web workspace | Editor, file tree, optimistic operations, presence, telemetry | React, TypeScript |
| Realtime gateway | Upgrade sockets, validate batches, route by room | WebSocket edge worker (implemented) |
| Room coordinator | Order broadcasts, retain hot state, issue snapshots | Durable stateful worker |
| Collaboration core | RGA operations, dependency queues, replay, compaction | TypeScript library (core implemented) |
| Repository service | Git objects, refs, diffs, pull requests | Worker API + object storage + SQL metadata |
| Media plane | Audio transport, mute state, and active-speaker metering | WebRTC mesh (implemented); SFU at scale |
| AI patch service | Context selection, inference, diff validation | Retrieval pipeline + sandbox worker |

## Data structures worth discussing in interviews

### Indexed sequence

An order-statistic treap maps editor offsets to replicated elements. Each node stores subtree size, so `at(index)`, `insert(index)`, and `remove(index)` are expected `O(log n)`. Split/merge primitives make batched edits cheap and keep implementation small enough to audit.

### Operation identity

Each CRDT operation receives `(logicalClock, replicaId, localSequence)`. Lexicographic comparison provides a stable total order without using wall-clock time. A hash set of operation IDs makes replay idempotent.

### Causal summary

A version vector stores the highest contiguous sequence observed per replica. Delta synchronization sends only missing ranges. Space is `O(r)` where `r` is the number of replicas that contributed to the document.

### Repository objects

File blobs, trees, and commits are content-addressed by hash. A hash map gives expected `O(1)` deduplication lookup; a DAG represents commit history. Lowest-common-ancestor search supports merge-base selection.

### Presence and fan-out

Presence is ephemeral and uses a hash map keyed by connection ID plus a min-heap of expiry deadlines. Broadcast work is `O(p)` for `p` peers; backpressure drops superseded cursor events before document operations.

## Realtime edit path

1. The editor converts a local change into one or more CRDT operations.
2. Operations update the local indexed sequence immediately.
3. A binary batch is appended to an outbound queue and sent with the current causal summary.
4. The room coordinator deduplicates, persists, and broadcasts operations.
5. Peers apply missing operations, translate them to editor ranges, and acknowledge the latest contiguous sequence.
6. The coordinator compacts tombstones after every active replica has crossed the safe version boundary.

The current deployment implements steps 1–5. WebSockets are the low-latency fast path. A D1 event log is the source for reconnect replay and periodic reconciliation, so a socket reconnect or isolate change cannot silently lose acknowledged state. Presence is held separately with a 15-second lease. Safe tombstone compaction remains the next protocol milestone.

## Performance plan

Measure before optimizing. The first benchmark suite will cover documents from 1 KB to 5 MB, 1–50 peers, random and clustered edits, offline bursts, and adversarial concurrent inserts. Track operation encoding size, apply throughput, p50/p95/p99 propagation latency, memory per document, reconnect replay time, and compaction duration.

Budgets:

- Local apply: p95 below 4 ms for a single edit.
- Remote apply: p95 below 8 ms for a 100-operation batch.
- Encoded operation: median below 40 bytes before transport compression.
- Hot document state: below 2.5× visible UTF-8 text after compaction.

## AI safety and evaluation

The AI service receives only explicitly selected repository context plus retrieval results authorized for the current user. Output is parsed into a structured patch, applied in a sandbox, formatted, type-checked, and tested before presentation.

Evaluation tracks patch-apply rate, test pass rate, reviewer acceptance, regressions, latency, token cost, and retrieval precision on a versioned repository task set.

## Milestone acceptance tests

- Property-based tests prove convergence across randomized operation orderings.
- Replay tests prove duplicate delivery is harmless.
- Network simulation covers delay, reordering, disconnects, and reconnects.
- Load tests hold the latency SLO with 50 active peers in a room.
- Authorization tests prove repo and room isolation.
- AI tests prove generated changes remain reviewable and sandboxed.
