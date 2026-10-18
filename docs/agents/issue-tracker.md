# Issue tracker: agent-hub's tracker

The skills say issue; here an issue is a **ticket**, and the issue tracker is agent-hub's tracker. Tickets and specs for spool live in agent-hub's tracker: the service keeps them, and Desk, Liam's page of every project's tickets, shows them: lists, a board, a map's graph, and each ticket's page, where he starts its runs. Work them with the four tools in the `tickets` group (`create_ticket`, `get_ticket`, `list_tickets`, `update_ticket`), which only codemode scripts reach; `describeNamespace("tickets")` gives their parameters. They return typed data, so one script can read, filter and change several tickets.

A ticket is `#12` within spool and `spool#12` from another project; the tools take either. A bare `#12` is always a ticket: pull requests are not part of the tracker.

## Conventions

- **Create a ticket**: `create_ticket` with a `title`, a markdown `body` and its `labels`; `parent`, `blockedBy` and `model` too when they're known.
- **Read a ticket**: `get_ticket`, which returns its `body`, `labels`, `state`, `parent`, `children`, `blockedBy`, `comments` (author, text, time), `files`, `model`, linked `tasks` and `page` (its Desk link, for answers) in one call.
- **List tickets**: `list_tickets`, filtered by `label`, `state` (`open`, the default, `closed` or `all`) and `parent`; `frontier: true` for the ones ready to work on. It leaves out bodies and comments: read those with `get_ticket`.
- **Comment**: `update_ticket` with `comment`. Comments are where findings and context go: Desk shows them on the ticket's page.
- **Labels**: `update_ticket` with `addLabels` and `removeLabels`. A ticket has at most 5. The labels are in `docs/agents/triage-labels.md`; a project can add up to 8 of its own, made on first use.
- **Close**: `update_ticket` with `close: true`, and a `comment` when there's an answer to record. Close a rejected ticket with the `wontfix` label added and `reason: "wontfix"`. Reopen with `reopen: true`.
- **Parent/child**: the ticket's `parent`, set on `create_ticket` or `update_ticket` (`parent: null` clears it); `get_ticket` lists the `children`.
- **Blocking**: the ticket's `blockedBy`, a list of tickets: `blockedBy` on `create_ticket`, `addBlockedBy` and `removeBlockedBy` on `update_ticket`. A ticket is unblocked when every blocker is closed.
- **Model**: `model` (`provider/model:thinking`) on `create_ticket` or `update_ticket` sets the model the ticket's runs use; `model: null` clears it. Leave it unset unless Liam asks: the defaults by run type decide.

PRs as a request surface: no.

## When a skill says "publish to the issue tracker"

Create a ticket in spool with `create_ticket`. For a set of tickets, create them blockers first, each with its `parent` and its `blockedBy` naming the tickets just made.

## When a skill says "fetch the relevant ticket"

Read the ticket with `get_ticket`, by `#N` or `spool#N`, comments included.

## Wayfinding operations

Used by `/wayfinder`.

- **Map**: one ticket labelled `wayfinder:map`, its body holding Notes / Decisions so far / Fog. Find the open maps with `list_tickets({ label: "wayfinder:map", state: "open" })`.
- **Child ticket**: a ticket whose `parent` is the map, labelled `wayfinder:grilling` (a decision with Liam), `wayfinder:prototype` (built, then judged with Liam), `wayfinder:research` (an agent runs it end to end) or `wayfinder:task` (work that unblocks a decision).
- **Blocking**: the ticket's `blockedBy` (`addBlockedBy` on `update_ticket`); it is unblocked when every blocker is closed.
- **Frontier**: `list_tickets({ parent: map, frontier: true })`: the map's open children whose blockers are all closed and that no open task holds. First in map order wins.
- **Claim**: a ticket is claimed while a task linked to it is open; there is no assignee. A task started from the ticket in Desk, or by autopilot, is linked to it already. To claim a ticket you picked yourself, call `update_ticket({ ticket, claim: true })` before working it: it links your task (a worker's claim is its task's), and is refused while another open task holds the ticket, so take another from the frontier then.
- **Resolve**: `update_ticket` with the answer as `comment` and `close: true`, then `update_ticket` on the map with its whole `body` again, a one-line gist with `#N` added under "Decisions so far". Graduate fog from "Not yet specified" into new child tickets as it becomes answerable.
- **Autopilot**: a map Liam started autopilot on (Start on the map's page in Desk) starts its frontier tickets by itself, each as a task in the map's own channel, linked to the ticket. Closing any ticket starts the tickets it unblocks, so close a ticket as soon as it is resolved; tickets your run makes or unblocks start once the run ends, so set a new ticket's blockers in the same run that makes it. Pause stops new starts; closing the map ends autopilot.
