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

## pi rpc sessions

Five recordings of the person's own `pi --mode rpc` (pi 1.0.3), taken through
the same commands spool's pi engine sends, on 2026-10-08, in a scratch project
with `--offline --no-context-files --no-skills --no-prompt-templates
--no-extensions` so nothing of the recording machine's own setup rode along.
Unlike the Claude windows they are whole sessions, and they are scripts rather
than streams: an array of `{"in": …}` (a command spool wrote) and `{"out": …}`
(a line pi printed) steps, replayed by `scriptedAgentExecutor` in
`src/test-helpers.ts`, which answers each `in` with the `out`s after it and
rewrites the recorded command ids to spool's own.

| capture | what it holds |
| --- | --- |
| `pi-turn.json` | `get_state`, then one prompt: a `read` tool call and its result, then the one-word answer, ending on `agent_settled`. Session created under a spool-chosen id (`--session-id`). |
| `pi-resume.json` | The next turn of that session, opened by its exact file (`--session`). |
| `pi-stop.json` | A prompt aborted after its first words: `abort` goes down mid-stream and the turn settles as `aborted`. |
| `pi-models.json` | The offer probe (`--no-session`): `get_state`, `get_available_models`, then `set_model` and `get_available_thinking_levels` per model, on a ChatGPT login. |
| `pi-models-local.json` | The same probe against two Ollama models (`baseUrl` `http://localhost:11434/v1`), one with no thinking levels but `off`. |

Scrubbed: pi's system prompt sections are markers (`<pi tools section
elided>`), the scratch project path is `$ROOT` (replayed as the test's own
project), and home and install paths are `/home/person` and
`/usr/local/lib/node_modules`. Model and session ids are as recorded.

## Codex app-server sessions

The `codex-*` files are a different shape (#362): whole `codex app-server`
connections recorded through spool's own Codex engine, as a JSON array of
`{"in": …}` (a line spool wrote) and `{"out": …}` (a line Codex printed) steps.
`scriptedAgentExecutor` in `src/test-helpers.ts` replays them: it matches each
line spool writes against the next `in` by method, prints the `out` steps after
it with the request ids rewritten to spool's own, and keeps whatever did not
match in `mismatches`. `$ROOT` in a capture is the spawn's working directory.

All were recorded on `codex-cli` 0.161.0 against a ChatGPT login, on
`gpt-5.6-luna` at `low` effort, in a scratch git project with a stand-in `spool`
on the path that only echoes its arguments.

| capture | steps | what it holds |
| --- | --- | --- |
| `codex-models.json` | 7 | The offer probe: `model/list` and `config/read`. `gpt-5.6-terra` reports an `ultra` effort. |
| `codex-account.json` | 6 | The account probe, signed in. |
| `codex-signed-out.json` | 5 | `account/read` with no login (an empty `CODEX_HOME`); a turn stops here too. |
| `codex-turn.json` | 28 | A new thread under edits (`on-request`, `workspace-write`): one shell call, then one word. |
| `codex-resume.json` | 24 | The next turn on that thread, through `thread/resume` with `excludeTurns`. |
| `codex-ask.json` | 78 | Ask first (`untrusted`): an `apply_patch` into `design/` and `spool skill`, both answered by spool, then `touch outside.txt`, answered by the person. |
| `codex-bypass.json` | 47 | Bypass (`never`, `danger-full-access`): one shell call with no approval. |
| `codex-interrupt.json` | 34 | `sleep 30` stopped by `turn/interrupt`; the turn ends `interrupted`. |

Scrubbed: the project path is `$ROOT`, home directories are `/home/user`, the
account email is `you@example.com`, the ChatGPT account id is zeroed, and
`config/read`'s reply keeps only the model fields spool reads.

Edited since: each `thread/start` spool wrote has lost its `cwd`, which spool
stopped sending (a named `cwd` has Codex write the project's trust into the
person's `config.toml`). Each turn's connection has a `config/read` spliced in
after `account/read`, answered with no `developer_instructions`: spool now reads
the person's own and sends them with its framing as the thread's
`developerInstructions`, which the recorded `thread/start` and `thread/resume`
lines predate. Codex's other replies are as recorded.

## Designer fan-outs

Three recordings of the same ask, two directions for a `hello` frame, one per
engine, taken on 2026-10-09 through spool's own engines with spool's designer
mounted (#367) and nothing else of the recording machine's setup changed. Each
main agent gave each direction to its own designer. The scratch project held
one frame and a stand-in `spool` that only echoes its arguments.

| capture | shape | what it holds |
| --- | --- | --- |
| `claude-designers.json` | stream | Claude Code 2.1.295 on `claude-haiku-5-5` under Auto-edit: the second turn of one process, two `Agent` calls with `subagent_type` `designer`, both sub-agents' work and their task notifications. The `init` lists `designer` among the agents. |
| `codex-designers.json` | `in`/`out` | `codex-cli` 0.161.0 on `gpt-5.6-luna` at `low`, under edits: two `spawnAgent` calls through code-mode `exec`, both child threads' turns, and two `wait` calls naming them. |
| `pi-designers.json` | `in`/`out` | pi 1.0.3 on `openai-codex/gpt-5.6-luna` at `low`: two `designer` tool calls run in parallel, each child's tools as `tool_execution_update` steps, and each child's last words as the result. |

Scrubbed as the captures above: the project is `$ROOT`, home is `/home/user`,
spool's state is `/home/user/.spool`, the ChatGPT account id is zeroed, and
the init's tool, connector, command, skill and plugin listings and pi's system
prompt sections are markers. In the Claude window each tool call's streamed
input is one fragment rather than the recorded several, so the path in it
could be scrubbed whole.

## Background designers

`claude-background.json` (377 lines, stream) is one whole turn on Claude Code
2.1.295 on `claude-haiku-5-5` at `low`, under Bypass, taken 2026-10-09 through
spool's own spawn with the designer mounted (#365). Asked for two directions of
`hello`, the main agent started two `Agent` calls with `run_in_background: true`
and answered while both still ran. It holds what a turn's lifetime is read off:
`background_tasks_changed` with the whole running set after each change, a
`result` at 8 seconds with both designers running, one more `init` and `result`
each time a `task_notification` wakes the main agent, and the last `result`
after the set is empty. Each designer wrote its frame with a shell heredoc, and
one heredoc failed and was retried with an absolute path. Background sub-agents'
messages carry `parent_tool_use_id` but stream no partial deltas.

Scrubbed as the fan-outs above, except that each streamed input keeps its
recorded number of fragments: the fragments were joined, scrubbed and cut again
evenly, so the cuts fall in different places than the wire's.
