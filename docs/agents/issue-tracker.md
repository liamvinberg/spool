# Issue tracker: Plane

spool's issues, specs and Wayfinder maps live in Plane, self-hosted at [plane.devosurf.dev](https://plane.devosurf.dev): workspace `devosurf`, project `SPOOL`. An issue is named `SPOOL-N` and links as `https://plane.devosurf.dev/devosurf/browse/SPOOL-N/`.

Agents reach Plane through the `plane` MCP group (codemode scripts: `describeNamespace("mcp__plane")`). It is a small server for this setup (on devobee, `~/.config/agent-hub/bin/plane_tracker.py`; its API key is in `~/.config/agent-hub/plane.env`) with five tools: `list_projects`, `get_issue`, `list_issues`, `create_issue`, `update_issue`. Bodies and comments go in and come out as Markdown.

## Conventions

- **Create an issue**: `create_issue` with `project: "SPOOL"`, a `title`, a Markdown `body` and its `labels`; `parent` and `blockedBy` (`SPOOL-N`) when they're known.
- **Read an issue**: `get_issue`, which returns its body, comments, labels, state, claim, parent, children, blockers (each with whether it's still open), what it blocks, related issues and its link.
- **List issues**: `list_issues` by `project` or `parent`, filtered by `label` and `state` (`open`, the default, `closed` or `all`); `frontier: true` for the ones ready to work on. No bodies: read those with `get_issue`.
- **Comment**: `update_issue` with `comment`.
- **Labels**: `update_issue` with `addLabels` / `removeLabels`, by name; a new label is made on first use. The triage labels are in `docs/agents/triage-labels.md`.
- **Close**: `update_issue` with `close: true` (Done), and a `comment` when there's an answer to record. A rejected issue: `close: true, reason: "wontfix"` (Cancelled, label added). Reopen with `reopen: true`.
- **Parent/child**: `parent` on `create_issue` or `update_issue`; `clearParent: true` removes it.
- **Blocking**: `blockedBy` on `create_issue`, `addBlockedBy` on `update_issue`. Removing a blocker isn't in Plane's API for this edition: do it in Plane's UI, or ask Liam.

PRs as a request surface: no.

## When a skill says "publish to the issue tracker"

Create an issue in project `SPOOL` with `create_issue`. For a set of tickets, create them blockers first, each with its `parent` and its `blockedBy` naming the issues just made.

## When a skill says "fetch the relevant ticket"

`get_issue` by `SPOOL-N`, comments included.

## Wayfinding operations

Used by `/wayfinder`. The map is a Plane issue; its tickets are its children.

- **Map**: one issue labelled `wayfinder:map`, holding Destination, Notes, Decisions so far, Not yet specified and Out of scope. Find the open maps with `list_issues({ project: "SPOOL", label: "wayfinder:map" })`. The latest map is [Wayfinder map: Spool Cloud public launch](https://plane.devosurf.dev/devosurf/browse/SPOOL-89/) (`SPOOL-89`).
- **Ticket**: a child of the map labelled `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling` or `wayfinder:task`.
- **Blocking**: Plane's native "blocked by" relation. A ticket is unblocked when every blocker is Done or Cancelled.
- **Frontier**: `list_issues({ parent: MAP, frontier: true })`: the map's open, unclaimed children with no open blocker. First in number order wins.
- **Claim**: `update_issue({ issue, claim: true })`, the session's first write: it assigns the ticket to Liam, and is refused when the ticket is already claimed, so take another from the frontier then.
- **Resolve**: `update_issue` with the answer as `comment` and `close: true`, then `update_issue` on the map with its whole `body` again, a one-line gist and link under "Decisions so far". Graduate fog from "Not yet specified" into new child tickets as it becomes answerable.
- **Specs and build tickets** are the handoff after the map: no parent, no `wayfinder:` label; link the decision they come from.

## GitHub issues

GitHub Issues on `liamvinberg/spool` take reports from outside only. Triage one by moving what is still wanted into Plane and closing it on GitHub, with a comment that names no private detail.
