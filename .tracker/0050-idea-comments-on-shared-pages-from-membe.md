# #50 · Idea: comments on shared pages, from members and outsiders

- State: open
- Created: 2026-10-18T17:43:55.767Z
- Updated: 2026-10-18T17:43:55.767Z

Taken out of the Spool Cloud for teams map on 2026-10-04 by Decide whether outsiders can comment, and where comments live (#39). The first paid version is built for how Devosurf works, and Liam doesn't expect the team to comment. Feedback keeps arriving the way it does today.

The idea: members and outsiders leave feedback on a team's canvas and shared pages. Feedback means threads pinned to a frame or an element, with replies and resolve. Reactions don't count: an agent can't act on an emoji.

Open when it's picked up:

- **Who can comment.** Members of every role, signed-in outsiders, and whether an anyone-with-the-link visitor must sign in first. Figma, Vercel, Chromatic and Loom's share page all require an account. BugHerd, [Marker.io](http://Marker.io)'s guest form and embedded Loom don't.
- **Where comments live.** Leaning towards Spool Cloud only, not `design/`. Three reasons. A solo project's `design/` is in git, so a client's comments could end up in a public repo. Outsiders aren't writers on the sync. And Figma keeps comments in a separate store from the document.
- **What a pin attaches to.** A point on a frame, maybe carrying the element under it (the selection's four handles) so an agent can find the source. Also which version it was made on, since frames keep changing under it.
- **Who sees what.** Today an outsider sees nobody and appears nowhere (Prototype the read-only cloud canvas (#15)). Commenting would show their name to the team, and maybe to other outsiders on the same share.
- **Reaching the agent.** How a member's agent reads the comments, and notifications for new ones.

Evidence: `spool-cloud/research/109-presence-locks-feedback/` (comment anchoring and the account gate) and `spool-cloud/research/105-collaboration-competitors/` ([Pen.dev](http://Pen.dev)'s share links with comments).

*From Linear DEV-164.*

Related: #62, #63, #39, #15, #3

Plane: SPOOL-50
