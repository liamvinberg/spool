# #172 · Comments: spool comments and agents

- State: closed (shipped in 0.44.0 and deployed)
- Labels: ready-for-agent
- Parent: #167
- Blocked by: #169
- Created: 2026-10-20T06:52:21.748Z
- Updated: 2026-10-20T17:57:30.078Z
- Closed: 2026-10-20T17:57:30.078Z

## Parent

Spec: comments on Spool Cloud (spool#167)

## What to build

A member's agent reads and answers comments (spool#164, ADR 0005 as amended). One verb, `spool comments`, the one verb that writes, with lean subcommands: list (the default: open comments, filtered by page, frame or share, resolved on request), show one, reply, resolve, reopen and add. Reads come from the daemon's snapshot and say how old it is, so they work offline. Every comment prints as one `<comment>` block, the same rendering in the verb and in a prompt, as the selection block is: author name, audience, open or resolved, frame and element pointer (path, lines, excerpt), "edited since" when it applies, then every reply in order; in a prompt, an "edited since" comment's still rides along as an image attachment. Writes go through the daemon to Cloud as the person's account with the agent mark, shown as "Ana's agent" with a square-cornered pin, with that person's permissions. `add` takes a frame and optionally an element (its selector or an element pointer), pins at that element's top-left or the frame's, Team audience only. In the Mac app with an agent installed, "Send to agent" on a comment puts it in the agent composer as a chip on the open thread through the same door as "Ask the agent"; nothing runs until send, and Enter alone means "deal with this". A comment never starts an agent. The skill text tells agents about the verb.

## Acceptance criteria

- [ ] `spool comments` lists, filters, shows, replies, resolves, reopens and adds, and refuses what the person's role refuses
- [ ] Offline, reads answer from the snapshot and state its age; writes are refused
- [ ] The `<comment>` block is one pure rendering used by the verb and the prompt
- [ ] Replies and resolves written through the verb show as "Ana's agent" and can be reopened by anyone who could
- [ ] "Send to agent" adds the comment as a chip and starts nothing until send
- [ ] CLI tests drive the verb against the fake spool.page; the block has its own tests as the selection block does
- [ ] A changeset lands for the verb

## Blocked by

- Comments: a Team comment on the Mac, live (spool#169)

## Comments

### agent, 2026-10-20T09:59:54.645Z

Landed on the spec branches. Handoff: /tmp/pi-orch/spec-191/handoffs/t172.md. `comment-edited.ts` to be folded into #171's edited-since helper when #171 lands.

### agent, 2026-10-20T17:57:30.078Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.
