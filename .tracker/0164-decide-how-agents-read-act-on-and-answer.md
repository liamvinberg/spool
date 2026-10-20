# #164 · Decide how agents read, act on and answer comments

- State: closed (resolved)
- Labels: wayfinder:grilling
- Parent: #155
- Blocked by: #160, #161
- Tasks: task 187 (◆ #164 Decide how agents read, act on and answer comments)
- Created: 2026-10-18T17:43:57.040Z
- Updated: 2026-10-19T19:46:43.923Z
- Closed: 2026-10-19T19:46:43.923Z

## Question

How does a member's agent find a project's comments, and the element each points at? What does "send this comment to my agent" look like from a comment, and what does the agent receive (the selection block, the comment and its replies)? Can an agent reply or resolve, and as whom ("Ana's agent")? Can an agent leave comments itself, for example a designer asking a question on the canvas? How does it fit with the agent's asks and threads?

Plane: SPOOL-164

## Comments

### agent, 2026-10-18T17:58:01.605Z

From Decide where comments live (#161): comments are stored in Spool Cloud, in a table in the project's sync DO. They are no longer files an agent can read in `design/`. This ticket decides how agents reach them: a read verb, a block in the prompt, or a read-only copy on disk (e.g. `design/.spool/comments/`, which never travels and the watcher ignores). Anything on disk is only a read-only copy, so an agent's reply or resolve has to reach Cloud some other way (ADR 0005 keeps verbs read-only).

### agent, 2026-10-19T19:46:43.918Z

## Resolution

Decided with Cata (agent-hub task 187), every recommendation taken. He wants it lean: it should fit in without clutter.

1. **Reading: one verb, `spool comments`.** It prints the project's open comments (filter by page, frame or share), served by the daemon from what it last got from Cloud, and says when that was, so it works offline. It serves terminal agents and the agent pane alike. No copy on disk. Kept to one verb with subcommands because Cata doesn't want the CLI bloated; the CLI's overall shape is filed as [Rethink the spool CLI's shape before it grows (#166)](https://devobee.tail9e5223.ts.net/spool/tickets/166), for him to do by hand later.
2. **"Send to agent" from a comment** puts it in the composer as a chip, on the thread that is open, the way a refusal's "Ask the agent" does today (`askAgent` / `setAgentRequest` in `src/ui/canvas/canvas.tsx`, reuse that door). The person types what they want, or presses Enter to mean "deal with this". Nothing runs until they send. Only in the Mac app, and only with an agent installed (the wall otherwise).
3. **What the agent gets: one `<comment>` block**, one rendering for both the verb and the prompt, as the selection block is: who wrote it (name, "via share X" for an outsider), Team or which share, open or resolved, the frame and element pointer (path, lines, excerpt), "edited since" when the frame changed, then every reply in order. When edited since, the still of the comment's revision rides along as an image attachment.
4. **Replying and resolving.** On a Team comment an agent may reply and resolve, through `spool comments`. On a share's comment, which the outsider reads, its reply is only a draft that the person sends or edits; it never talks to a client unchecked. Lean in the UI: the draft and the agent mark must fit without clutter (the prototypes draw them).
5. **As whom: "Ana's agent".** The person's account with an agent mark, their permissions, reopenable like any resolve.
6. **Agents may start a comment**, Team only, when the person asks them to (a note for teammates on a frame). Questions for the person running the turn stay asks.
7. **A comment never starts an agent.** No @agent trigger: an agent only runs when someone presses send on their Mac (ADR-0007).

Recorded as an amendment to [ADR-0005](https://github.com/liamvinberg/spool/blob/main/docs/adr/0005-agents-author-files-verbs-stay-read-only.md) (`spool comments` is the one verb that writes) and a pointer in ADR-0011, spool main `9d82e415`.

### For the spec
- Engines differ on asking: Codex auto-accepts only exactly-read-only `spool` verbs, so a `spool comments reply` asks under Ask first; Claude Code's `Bash` rule never asks. The share draft is the guard that holds on every engine.
- How an agent names where a new comment goes (frame plus selector or element pointer, pinned at its top-left) is a spec detail.
- The draft on a share's comment, and the "Ana's agent" mark, are for the Mac app prototype ([Prototype leaving and reading comments in the Mac app (#162)](https://devobee.tail9e5223.ts.net/spool/tickets/162)) to draw.
