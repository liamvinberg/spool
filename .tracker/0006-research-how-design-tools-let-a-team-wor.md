# #6 · Research: how design tools let a team work together

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.355Z
- Updated: 2026-10-18T17:43:57.227Z
- Closed: 2026-10-18T17:43:57.227Z

## Question

How do design and prototyping tools, especially those whose document lives as files in a git repo, let a team work together, and what do they charge for it? Pencil first, then Paper, Figma, Framer, Onlook, Magic Patterns, Subframe, v0, Lovable, Bolt, Stitch, Penpot, Play, Plasmic, [Builder.io](http://Builder.io), Storybook with Chromatic, tldraw, Excalidraw+, UXPin Merge. For each: where the document lives, live or async, relationship to git, presence, comments and review, how agents fit when several people work at once, guest access, phone preview, seats and what triggers payment. Plus documented pain with file-based design collaboration. Extends research 27, 03 and 06.

Report: `spool-cloud/research/105-collaboration-competitors/`.

*From Linear DEV-105.*

Plane: SPOOL-6

## Comments

### agent, 2026-10-18T17:43:57.222Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/105-collaboration-competitors/` (commit `8f1963c`), with per-tool notes for 20+ tools, a table of documented pain and a comparison table.

- The common 2026 shape is a cloud canvas with the code in the customer's git: Subframe, v0, Lovable, Builder.io, Framer 3.0 and Figma Make's closed local-code beta.
- Pen.dev moved since research 27. Its terms effective 2026-09-30 describe cloud workspaces with version history, share links that can be viewed, commented on and downloaded, and comment emails; its CLI skill calls it "a collaborative multiplayer environment". Pricing still says "currently free".
- Pen's only documented way through a file merge conflict is manual (pick a base, redo the other side's changes, don't hand-edit the JSON). Its own tracker documents lost work: an MCP call zeroed a 133 KB file and returned success, and a CLI save overwrote a 1.4 MB design with an empty one.
- Viewers and commenters are free almost everywhere. Payment is triggered by an edit seat ($6 to about $70 a month, mostly $16 to $40), AI credits, or higher tiers for branching and SSO.
- Four documented patterns for several people plus agents: a shared queue (Bolt), a private draft or branch per person (Lovable, v0, Framer), one seat-gated agent writer (Figma, Paper), many agents on one canvas (Pen, openpencil). Lovable and v0 hand overlapping changes to the agent to resolve.
- The only file-in-repo, agent-driven newcomers with any collaboration are open-pencil and openpencil, both peer-to-peer.

Unverified: whether two people can edit one `.pen` live, a real `.pen` git merge, Stitch multi-person editing, a few prices. Marked `UNCONFIRMED` in the report.
