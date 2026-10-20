# #158 · Decide who can comment and who sees whose comments

- State: closed (resolved)
- Labels: wayfinder:grilling
- Parent: #155
- Tasks: task 178 (◆ #158 Decide who can comment and who sees whose comments)
- Created: 2026-10-18T17:43:56.969Z
- Updated: 2026-10-19T19:23:22.596Z
- Closed: 2026-10-19T19:23:22.596Z

## Question

Members of every role and outsiders on a share can comment (decided at charting). Now: does an outsider see the team's comments, and other outsiders' comments, or only their own and the replies to them? Can a member mark a comment as team-only? Can someone with only an anyone-with-the-link share comment, and must they sign in first (Figma, Vercel, Chromatic and Loom's share page require an account; BugHerd and Marker.io's guest form don't)? Does a commenting outsider show up to the team in any way beyond their comments (today outsiders see no presence and have none)?

Plane: SPOOL-158

## Comments

### agent, 2026-10-19T19:23:22.596Z

## Resolution (with Cata, 2026-10-18, agent-hub task 170)

Cata: copy Figma where it fits, improve where Spool differs, the UI stays Spool's. He took every recommendation.

1. **What an outsider sees: their share's comments.** Each share is its own conversation. An outsider sees the comments started on the share they came through, with every reply in them, members' replies included. They never see the team's own comments, nor another share's. Two people on the same named-people share see each other's comments.
2. **How members choose who reads: the composer picks the audience.** A new comment is Team by default (members only, every role). On a page that is shared, the composer can pick one of its shares instead. Replies take their comment's audience; there are no team-only replies inside a share's comment. Members see every audience.
3. **Link shares: anyone with the link can comment, after signing in.** Viewing stays open with no sign-in, as today. The first comment asks them to sign in with the ways Spool Cloud already has (email code or Google), which makes them an ordinary account. This is Figma's rule (commenting on a prototype needs a Figma account). It gives every comment a verified person, a way to be told about replies, and a brake on spam.
4. **A commenting outsider shows up on their comments and in the share's settings.** A link share's settings list who has commented through it. They still have no presence and see none.

### Where this differs from Figma, and why

Figma shows every comment on a file to everyone who can open it, because a Figma file is shared whole. Spool shares chosen pages to different outsiders, and the team's comments are often instructions to their agents or frank talk about the client, so the share is the wall between conversations.

### Authentication

Nothing new is needed to match Figma: Figma asks for an account, and Spool Cloud already makes one from any verified email (email code or Google). The one gap is a name, which [Decide how people get a display name (#159)](https://devobee.tail9e5223.ts.net/spool/tickets/159) settles.

### For the spec

- A link share is served from its own onspool.page host, so a spool.page session does not reach it today. The spec must say how a sign-in reaches the link host (a handoff back to it, or comments posted to spool.page).
- The glossary's **Outsider** ("sees no one and appears nowhere") changes when comments ship: an outsider is seen on their comments by the team and by the others on their share. The word for "Team or a share" as the reader of a comment is settled with the naming in #162.
