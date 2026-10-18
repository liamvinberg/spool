# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to the labels of spool's tracker, which Desk shows on each ticket.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this ticket  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |
| `bug`                      | `bug`                | Something is broken                      |
| `enhancement`              | `enhancement`        | New feature or improvement               |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label from this table.

The tracker also has the wayfinder labels `wayfinder:map`, `wayfinder:grilling`, `wayfinder:prototype`, `wayfinder:research` and `wayfinder:task` (see `docs/agents/issue-tracker.md`), and up to 8 labels of the project's own, made on first use.

The labels pick the run Desk's Start offers first on a ticket's page: `needs-triage` or no state label offers Triage, `ready-for-agent` offers Implement (Implement spec with child tickets), a `wayfinder:map` offers Work the map and its `wayfinder:` tickets Resolve, and `needs-info` and `ready-for-human` only Open task, which opens a task linked to the ticket but starts no run: Liam's first message in its thread starts it, with the ticket named ahead of his words. Start offers the other runs after it, and a map's page has its autopilot's Start and Pause too. A ticket with an open blocker can't be started until its blockers close, and a closed one not at all.
