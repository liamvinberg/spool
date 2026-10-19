# #164 · Decide how agents read, act on and answer comments

- State: open
- Labels: wayfinder:grilling
- Parent: #155
- Blocked by: #160, #161
- Created: 2026-10-18T17:43:57.040Z
- Updated: 2026-10-18T17:58:01.605Z

## Question

How does a member's agent find a project's comments, and the element each points at? What does "send this comment to my agent" look like from a comment, and what does the agent receive (the selection block, the comment and its replies)? Can an agent reply or resolve, and as whom ("Ana's agent")? Can an agent leave comments itself, for example a designer asking a question on the canvas? How does it fit with the agent's asks and threads?

Plane: SPOOL-164

## Comments

### agent, 2026-10-18T17:58:01.605Z

From Decide where comments live (#161): comments are stored in Spool Cloud, in a table in the project's sync DO. They are no longer files an agent can read in `design/`. This ticket decides how agents reach them: a read verb, a block in the prompt, or a read-only copy on disk (e.g. `design/.spool/comments/`, which never travels and the watcher ignores). Anything on disk is only a read-only copy, so an agent's reply or resolve has to reach Cloud some other way (ADR 0005 keeps verbs read-only).
