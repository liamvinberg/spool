# #349 · The agent's side: the CLI, the skill and what an agent can see

- State: closed (moved to spool-next)
- Labels: wayfinder:grilling
- Parent: #333
- Blocked by: #342, #346
- Created: 2026-11-13T14:47:11.448Z
- Updated: 2026-11-14T10:28:43.249Z
- Closed: 2026-11-14T10:28:43.249Z

## Question

What is spool to an agent?

Liam: "probably fully agent native", and he asks what "the sdk looks like, the skill system". He drives spool from a terminal agent as often as from the built-in one, so the contract must not depend on which. Settle: what an agent does by writing files and what by calling spool (today: files to write, read-only verbs to look, ADR 0005); the verbs and how fast they must answer; what the agent can see (the selection, what is on screen, a picture of a frame, errors); the skill that teaches it, and how a project or an extension adds to that skill; how the built-in agent and a terminal agent stay equals.

The window's side of talking to the agent (the composer, pointing) is the rethink's.

## Comments

### agent, 2026-11-14T10:28:43.249Z

Moved to spool-next#11 (the agent's side).
