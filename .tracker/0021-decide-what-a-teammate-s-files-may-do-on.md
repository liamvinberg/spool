# #21 · Decide what a teammate's files may do on your machine

- State: closed
- Labels: wayfinder:grilling
- Parent: #3
- Blocked by: #13
- Created: 2026-10-18T17:43:55.486Z
- Updated: 2026-10-18T17:43:57.653Z
- Closed: 2026-10-18T17:43:57.653Z

## Question

On a shared canvas, frames and shared components a teammate's agent writes arrive on your machine and run in your Spool, possibly before anyone has looked at them. Today the only way someone else's code reaches you is a git pull you chose to make. What may a teammate's files do on a member's machine, and what does the member approve, and when?

Terminal frames, which ran real processes, were removed in v0.16.0 (2026-09-03), so frames now run only in sandboxed browser documents. What remains to weigh: what a sandboxed frame can still reach (network requests, packages pulled in through the import map, `spool shot` running frames headlessly), and a member's own agent reading files a teammate's agent wrote, which can carry instructions aimed at that agent.

*From Linear DEV-120.*

Related: #40, #57, #61, #65

Plane: SPOOL-21

## Comments

### agent, 2026-10-18T17:43:57.647Z

**Liam, 2026-10-04:** ## Resolution (grilling with Liam, 2026-10-04)

**A teammate's files are trusted the way a git collaborator's code is, the same as running a teammate's dev server. Defences cover only what is new: files arriving with no pull you chose, a teammate's agent hijacked by something it read, a removed member, and Spool Cloud as a channel that writes onto every member's disk.**

- **Approval:** joining the team is the only approval. No per-change approval, nothing held, and no trust warnings in the UI, invite screen included (as in Figma and similar tools). History records who wrote each save.
- **What a sync may write:** only Spool's own layout: `canvas.json`, `AGENTS.md`, `CLAUDE.md`, `frames/**`, `shared/**`. Regular files only: no symlinks, no file modes, no dot-folders except Spool's own. Enforced by the cloud and again by every receiving daemon, which never trusts the cloud's check alone. A file outside the list stays local, and Spool shows it didn't travel. Why: a synced `.git/config` (`core.fsmonitor`), `.claude/settings.json` hooks, `.vscode/tasks.json`, `.envrc` or `.mcp.json` would run commands outside the browser.
- **Frames go https-only everywhere**, solo projects included: a CSP (`connect-src`, `script-src`, `img-src` limited to `https:`, `data:`, `blob:` and Spool's own `/vendor/`) blocks plain-http `localhost` and LAN targets. Frames are served from loopback, so Chrome's local-network prompt never protects against them today. Prototypes calling `http://localhost:3000` break; scenarios and mocks are the intended path. `spool shot` is covered by the same rule.
- **The daemon's font fetch** (`webfonts.ts`, any `http(s)` URL in `shared/fonts.css`, fetched from Node) goes https-only and refuses loopback and private addresses. A gap under today's trust model already; it must be closed before teams ship.
- **Agents unchanged.** A member's agent's own permissions are the boundary, as in any repo. Spool's spawned agent keeps `Read(//**)`, `WebFetch` and `Bash`; `AGENTS.md` and `CLAUDE.md` travel like any file.
- **Removal:** the cloud refuses a removed member's writes, and a revoked device's, at once. What they already wrote stays as team content; rolling it back is history's job.
- **No signed saves in v1.** The daemon allowlist and the browser sandbox limit what any pushed file can do, whoever wrote it. Moved to the backlog: Idea: signed saves on team projects (#40), beside end-to-end encryption.
- `SECURITY.md` gains a team-project paragraph when team projects ship: "repository contents are trusted" extends to "your team's `design/`".

Facts this rests on (from the code, 2026-10-04): frames run `sandbox="allow-scripts"` on `run.spool.localhost` with an opaque origin and cannot reach the daemon API (control capability only in the UI document); no `connect-src` on frames; the import map loads any URL in the browser and nothing is installed; no `design/` file is imported in Node; Tailwind refuses `@plugin`/`@config`; history commits run no hooks.

The frame CSP and the font fetch are left as notes for the spec, not filed as public issues yet.
