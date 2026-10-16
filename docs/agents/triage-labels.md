# Triage labels

The engineering skills use canonical triage roles. This repo's tracker (Plane) uses the same strings as labels.

| Canonical role | Plane label | Meaning |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | Maintainer needs to evaluate this issue |
| `needs-info` | `needs-info` | Waiting on the reporter for more information |
| `ready-for-agent` | `ready-for-agent` | Fully specified and ready for an AFK agent |
| `ready-for-human` | `ready-for-human` | Requires human implementation |
| `wontfix` | `wontfix` | Will not be actioned |

When a skill names a canonical role, use the corresponding label. Wayfinder maps use `wayfinder:map`, `wayfinder:grilling`, `wayfinder:prototype`, `wayfinder:research` and `wayfinder:task` (see `docs/agents/issue-tracker.md`).
