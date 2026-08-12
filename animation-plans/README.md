# Animation improvement plans

Audit baseline: commit `50b230c`.

| Plan | Title | Severity | Status | Depends on |
| --- | --- | --- | --- | --- |
| 001 | Remove route and message entrance latency | HIGH | DONE | — |
| 002 | Make search and popup motion interruptible | HIGH | DONE | 004 |
| 003 | Move routine progress to compositor transforms | HIGH | DONE | 004 |
| 004 | Consolidate motion curves and transforms | MEDIUM | DONE | — |
| 005 | Replace broad and layout transitions | MEDIUM | DONE | 004 |
| 006 | Respect reduced motion and pointer capability | MEDIUM | DONE | 004 |
| 007 | Make continuous progress linear | MEDIUM | DONE | 004 |
| 008 | Coordinate high-value state changes | MEDIUM | DONE | 004 |

## Recommended execution order

1. `004` establishes the shared motion vocabulary.
2. `001`, `003`, `005`, and `007` remove high-frequency latency and layout work.
3. `002` converts rapidly reversible overlays to interruptible transitions.
4. `006` applies accessibility behavior after the primitives are stable.
5. `008` adds restrained continuity only after corrective work is complete.

Execute and verify one plan at a time. If the cited code differs from commit
`50b230c`, stop and refresh the plan rather than improvising.
