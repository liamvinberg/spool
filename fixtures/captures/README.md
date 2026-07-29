# agent captures

Seven recordings of real Claude Code sessions, taken with `claude -p
--output-format stream-json --include-partial-messages --verbose`. They are the
evidence the agent chat is designed and built against: the rail draws no state
that is not read off one of these, and a shipped test asserts on the same bytes
a design frame plays.

All seven were recorded on `claude_code_version` `2.1.220`, and every one
reports `apiKeySource: "none"` in its `init`. That field is the whole of the
no-keys claim: the binary was spawned against an existing CLI login and no key
was configured anywhere in the path.

They live here rather than under `design/` because the repo treats working-tree
changes confined to `design/` as live canvas work that must never block an
unrelated landing, and shipped tests read these. The canvas reads them through
spool's fixtures convention, which resolves under `design/` and nowhere else, so
`pnpm dev` mirrors this directory into `design/shared/fixtures/captures/`. That
mirror is untracked and always a copy: edit a capture here.

`design/shared/fixtures/claude-models.json` stays in the canvas. It is a
`list_models` reply captured whole, not a session, and only the model menu reads
it.

## The windows

Each file is a window cut out of a longer recording, not a whole session, and
three of them are windows onto the same session.

| capture | events | project | what the window holds |
| --- | --- | --- | --- |
| `claude-turn.json` | 236 | `mock-project` | A from-scratch build of a habit tracker called Streak. One agent, one thing at a time. |
| `claude-plan.json` | 328 | `mock-project` | The same nine minutes with the middle left in — the only window here where a plan is written, worked and ticked off rather than written and abandoned. |
| `claude-edits.json` | 429 | `mock-project` | 19:01:03 to 19:03:07 of that same session: the shortest window holding more than one run of edits to one frame and every boundary between them. |
| `claude-fanout.json` | 425 | `mock-kaffe` | Three sub-agents authoring three variants of one frame in parallel. |
| `claude-mcp.json` | 787 | `mock-mcp-project` | Twelve questions, four connector calls, and the longest assistant message in the repo at 3,372 characters. |
| `claude-interrupt.json` | 73 | `mock-mcp-project` | A turn stopped by a human press mid-flight, on `claude-sonnet-5` rather than Opus. |
| `claude-compact.json` | 16 | `mock-mcp-project` | A context compaction: the `compacting` status, the `compact_boundary`, and the summary the next turn continues from. |

`claude-turn.json`, `claude-plan.json` and `claude-edits.json` are all session
`503f0173-bcb0-439a-9a23-6cdfec768c98`, recorded 2026-07-27. They overlap:
every stamped event in `claude-turn.json` is also in `claude-plan.json`, and
`claude-edits.json` shares 25 stamped events with `claude-plan.json`'s tail
before running past its end. `claude-fanout.json` is a different project the
same evening; the other three are 2026-07-28.

## What is not here

**The parent recordings.** Every count, median and percentage in
`design/shared/lib/` was measured against the recording a window was cut from,
not against the window. They do not recompute from these files: the windows
overlap, so pooling them double-counts, and every one of them has content
elided. Read a distribution claim as a claim about the parent capture, and do
not correct it from what is in the repo.

**Connector payloads.** Everything a connector returned is a marker rather than
a body — `<4949 chars of MCP server payload elided>`, `<structured MCP result
elided>`, `<upstream serverInfo elided>`. Three of the four connector calls in
`claude-mcp.json` reached a server and all three are markers. The fourth carries
prose because it never ran: a permission rule refused it
(`non_execution_kind: "permission-rule"`) and its result is the refusal.

The same elision covers tool and skill listings, long file bodies, long tool
output, and one real email address that was scrubbed out of the 3,372-character
message.
