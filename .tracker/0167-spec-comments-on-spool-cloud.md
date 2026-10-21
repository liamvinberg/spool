# #167 · Spec: comments on Spool Cloud

- State: open
- Labels: ready-for-agent
- Tasks: task 191 (#167 Spec: comments on Spool Cloud)
- Created: 2026-10-20T06:14:23.251Z
- Updated: 2026-10-20T17:57:37.364Z

## Problem Statement

A team project on Spool Cloud has no way to talk about a frame where it stands. A member who wants a change on a screen writes it in chat or tells their agent, and the note is lost to everyone else. A client looking at a share has no way to say "this button is wrong" except by email, with a screenshot, pointing at nothing. And an agent asked to "deal with the feedback" has nothing to read: the feedback lives outside Spool.

## Solution

Comments on team projects, in the Mac app and in the browser, close to how Figma does it, cut to Spool.

Anyone who can see a team project's canvas can leave a **Comment**: admins, editors, viewers, and outsiders on a share once they sign in. A comment stands on the canvas as a **Pin**, a point on a frame (or on a page's empty field), with **Replies** one level deep. Each comment has an **Audience**: the team, or one share of the page it stands on. An outsider only ever sees their share's comments; the team sees all of them. Commenting is a fourth canvas tool on C, a comment opens as a card at its pin, and a Comments tab (on the Mac) or panel (in the browser) is the inbox.

Comments live in Spool Cloud, not in `design/` (ADR 0011), so they cost nothing against the save limits and reach everyone live over the sockets they already hold. A member's agent reads them with one verb, `spool comments`, gets each one as a `<comment>` block, and may reply and resolve on Team comments as "Ana's agent"; on a share's comment its reply waits as a draft for the person to send. People learn about comments meant for them through an unread mark in the project and a batched email.

Decided on the map "Wayfinder map: comments on Spool Cloud" (spool#155), ticket by ticket; the prototypes are on the team canvas under `explore/cloud/comments/` (Mac) and `explore/cloud/comments-browser/` (browser).

## User Stories

### Leaving a comment on the Mac

1. As an editor, I want a Comment tool beside Select, Edit and Hand, so that commenting is one click away and looks like the rest of the canvas tools.
2. As an editor, I want to tap C to switch to the Comment tool, so that I can comment without reaching for the mouse.
3. As an editor, I want to hold C, click to place a pin and let go to return to the tool I had, so that a quick note doesn't throw me out of what I was doing, the way Space lends Hand.
4. As an editor, I want V or Esc to leave the Comment tool, so that leaving works like every other tool.
5. As an editor, I want placing a pin to hand me back the pointer, so that I write my comment with a normal cursor and place one pin per pick.
6. As an editor, I want a + in the Comments tab to turn on the same tool, so that I can start from the inbox too.
7. As an editor, I want frames to be inert while the Comment tool is on, so that a click places a pin instead of pressing a button inside the frame.
8. As an editor, I want the pointer to show a pin and the element under it outlined, so that I know exactly what my comment will point at.
9. As an editor, I want a comment to sit at a point on a frame, measured in the frame's own pixels, so that it moves with the frame.
10. As an editor, I want to comment on a page's empty field, so that I can leave a note about the page as a whole or about a gap between frames.
11. As an editor, I want a click on a page object to go inside the page as it does today, and the page object to show how many comments are inside, so that comments never stand on a page object.
12. As an editor, I want the composer to open as a small card at the pin, so that I write right where I pointed.
13. As an editor, I want the composer to show a chip for the element it took, so that I can see the context my comment carries for agents.
14. As an editor, I want an Audience picker in the composer that defaults to Team, so that a note for my team never reaches a client by accident.
15. As an editor on a shared page, I want to pick one of the page's shares as the audience, so that I can speak to the client who is reviewing it.
16. As an editor, I want to @mention a member in a comment, so that they are told about it.
17. As an editor, I want Enter to send and Shift+Enter to make a new line, so that writing a comment is fast.
18. As an editor, I want an empty comment never to be sent, so that stray clicks leave nothing behind.
19. As an editor who is offline, I want the composer to say I'm offline and not let me post, so that I never think a comment went out when it didn't.

### Reading comments on the Mac

20. As a member, I want every comment to show as a pin with its author's face, the initial in their presence colour, so that I can tell at a glance who said what.
21. As a member, I want pins to stay 22 px at every zoom, so that they are readable zoomed out and never cover a frame zoomed in.
22. As a member, I want an outsider's pin drawn hollow and an agent's pin square-cornered, so that I can tell client feedback and agent notes from my team's.
23. As a member, I want pins closer than 32 screen pixels to merge into one count with faces, which fans out when I click it, so that a busy frame stays readable.
24. As a member, I want an unread comment's pin to carry an accent ring, so that I see what's new on the canvas itself.
25. As a member, I want clicking a pin under any tool to open its card without changing my tool, so that reading never interrupts editing.
26. As a member, I want a comment's card to show the comment, its replies in order, a reply field and Resolve, so that the whole conversation is in one place.
27. As a member, I want the card to grow out of its pin and shrink back into it, so that the motion tells me where the comment lives.
28. As a member, I want Shift+C to hide and show every pin, so that I can look at the design without them.
29. As a member, I want resolved comments hidden unless the Resolved switch is on, and then shown hollow with a check, so that the canvas shows what's still open.
30. As a member, I want a Comments tab beside Properties and Agent that lists every comment I can see, grouped by frame, so that I have one inbox.
31. As a member, I want the Comments tab to filter by all, unread and for you, with a Resolved switch and sorting in its menu, so that I can find what needs me.
32. As a member, I want each row to say its audience, its reply count and whether the frame was edited since, so that I can judge a comment before opening it.
33. As a member, I want clicking a row to fly the camera to its pin and open it, so that I see the comment in place.
34. As a member, I want the Comments tab to carry an unread dot when it isn't showing, so that I know new comments came in.
35. As a member, I want a comment and its replies to reach my canvas live, so that a conversation feels like a conversation.

### Comments over a frame's life

36. As a member, I want a pin to follow its frame when the frame is moved, so that the comment stays on what it was about.
37. As a member, I want a pin to keep its pixel distance from the frame's top-left when the frame is resized, held inside the frame, so that it stays near the same content in a web layout.
38. As a member, I want a pin to stay put when the frame is edited, and the comment to say "edited since", so that I know the design changed after the comment was made.
39. As a member, I want Compare in an "edited since" card to show the still from when the comment was made beside the frame as it is now, so that I can see what the commenter saw.
40. As a member, I want comments to follow a frame through every rename or move to another page that Spool makes, including an agent's delete and add of the same source, so that renaming never loses feedback.
41. As a member, I want a duplicated frame or variant to start with no comments, so that copies don't repeat old feedback.
42. As a member, I want a deleted frame's comments to drop onto the page's field at the frame's last place, dashed and marked as on a deleted frame, keeping their still, so that feedback outlives the frame it was on.
43. As a member, I want a frame brought back by a restore, at the path of a deleted frame, to take back the comments that dropped from it, so that undoing a delete undoes it for comments too.
44. As a member, I want comments on a deleted page to leave the canvas and stay in the inbox under Resolved, marked "page deleted" with their stills, so that nothing said is lost without a trace.

### Commenting in the browser

45. As a viewer in a browser, I want a tool group of Pointer and Comment at the bottom of the canvas, so that I can comment the same way editors do on the Mac.
46. As a viewer, I want Pointer to keep today's browser behaviour (a click plays a frame, a drag pans), so that commenting adds to the browser canvas instead of changing it.
47. As a viewer, I want C, held C, V, Esc and Shift+C to work as on the Mac, so that I learn commenting once.
48. As a viewer, I want the Mac's card at the pin for reading and writing, with the audience picker and the element chip, so that members get the same comments wherever they are.
49. As a member in a browser, I want a Comments button beside Shared showing the open count and an unread dot, which slides the inbox in from the right, so that the browser has the Mac's inbox without panes.
50. As a member in a browser, I want choosing the Comment tool not to open the panel, so that placing pins and reading the list stay separate.

### Outsiders

51. As an outsider on a link share, I want to keep viewing the shared pages without an account, so that a client can look at work without friction.
52. As an outsider, I want comments to need a sign-in, for reading as well as writing, as Figma does, so that every comment has a real person behind it.
53. As an outsider, I want the Comment tool, C, the Comments button and Sign in to open one sign-in dialog, "Sign in to see comments", so that there is one way in.
54. As an outsider on my first visit, I want a one-time tip over the Comment tool, so that I find commenting at all.
55. As an outsider, I want to sign in with Google or with an email code followed by a name step, so that I can comment with whatever account I have.
56. As an outsider signing in with an email code, I want the name step prefilled from my address with a preview of how my comments will head, so that giving a name is one click.
57. As an outsider, I want Esc or a click outside to close the dialog and leave me viewing, so that signing in is never forced.
58. As an outsider, I want whatever I reached for to carry on once I'm signed in (the tool turns on, or the list opens) and the pins to pop in, so that signing in doesn't lose my place.
59. As an outsider, I want to stay on the link's own page while signing in, so that the share doesn't send me away.
60. As an outsider, I want to see only the comments started on my share, with every reply in them, members' replies included, so that I see my conversation with the team and nothing else.
61. As an outsider, I want to see the comments of others on the same share, so that two people reviewing for one client see each other's feedback.
62. As an outsider, I want my composer to say that my share and the team read it, with no audience picker, so that I know who reads what I write.
63. As an outsider, I want to see the outline of the element under my pointer but never its code or tag, so that I can point precisely without seeing the team's source.
64. As an outsider, I want the rail's foot to show my name once I'm signed in, so that I know who I'm commenting as.
65. As an outsider, I want new replies to reach my page live, so that a quick back-and-forth with the team works.
66. As an outsider, I want to be emailed when someone replies to a comment I'm part of, so that I come back when the team answers.
67. As an outsider, I want never to see the team's own comments or another share's, so that the team can talk frankly about my project.
68. As a member, I want an outsider never to appear in presence, so that commenting doesn't change who sees whom live.
69. As a member, I want a share's settings to list who has commented through it, so that I know who is behind a link.

### Names

70. As a person signing up with an email code, I want a required name step after the code, before the passkey offer, so that my comments carry a name and not my address.
71. As a person signing in with Google, I want Google's name taken without asking, so that there's no extra step, and never to have it overwrite a name I already have.
72. As an existing member without a name, I want to be asked on my next sign-in, and in the comment box the first time I comment, so that every comment ends up with a name.
73. As anyone, I want people shown by name alone everywhere they appear, with the email only on People, my own account page and my sidebar menu, so that addresses don't leak to clients.
74. As anyone, I want an account without a name shown by its address before the @, the same everywhere, so that one person never shows two ways.
75. As anyone, I want a rename on my account page to show everywhere at once, past comments included, so that I'm one person over time.

### Agents

76. As an editor with an agent, I want "Send to agent" on a comment to put it in the agent composer as a chip on the open thread, the way "Ask the agent" does today, so that handing feedback to my agent is one click.
77. As an editor, I want nothing to run until I press send, and Enter alone to mean "deal with this", so that my agent never acts on a comment by itself.
78. As an agent, I want `spool comments` to print the project's open comments, filterable by page, frame or share, so that I can read the feedback I'm asked to act on.
79. As an agent, I want each comment as one `<comment>` block (who wrote it, its audience, open or resolved, the frame and element pointer, "edited since", and every reply), the same in the verb and in my prompt, so that I read one contract.
80. As an agent, I want the still from the comment's revision attached when the frame was edited since, so that I can see what the commenter saw.
81. As an agent offline, I want `spool comments` to answer from the last comments the daemon heard and say when that was, so that I can still work.
82. As an agent, I want to reply to and resolve a Team comment through `spool comments`, shown as "Ana's agent", so that my person's team sees what I did about it.
83. As a member, I want an agent's reply on a share's comment to wait as a draft that its person sends or edits, so that an agent never talks to a client unchecked.
84. As a member, I want to start a Team comment through my agent when I ask it to, pinned to a frame or an element, so that an agent can leave a note for my teammates.
85. As a member, I want a comment never to start an agent, @agent included, so that agents only run when someone presses send on their Mac.
86. As a member, I want an agent's resolve to be reopenable like anyone's, so that an agent's call is never final.

### Being told

87. As a member, I want a comment or reply to count as unread for me until I open it, and never my own, so that unread means new to me.
88. As a member, I want the "for you" filter to hold comments that mention me, comments I wrote or replied in, and outsiders' comments on shares I made, so that I can find what I'm expected to answer.
89. As a member, I want one email about what's for me in a project, sent a few minutes after it happens and skipped if I read it in the meantime, so that a busy conversation doesn't flood my inbox.
90. As anyone, I want to switch comment emails between "For you" and "Off" on my account page, and stop them from any email in one click, so that I control my inbox.
91. As a member, I want no email for Team comments that aren't for me, so that email stays for what needs me.

### Who may do what

92. As anyone who can read a comment, I want to reply to it, so that the conversation is open to everyone in it.
93. As anyone who can reply, I want to resolve and reopen a comment, as in Figma, so that whoever closes the loop can say so.
94. As an author, I want to edit my own comment or reply, marked edited, and nobody else to edit it, so that my words stay mine.
95. As an author, I want to delete my own comment or reply, so that I can take back a mistake; deleting a comment's first message deletes its replies with it.
96. As an admin or editor, I want to delete anyone's comment or reply, so that the team can clean its canvas.
97. As a member, I want Copy link and Mark unread on any comment, so that I can point a teammate at one and come back to it later.
98. As an admin or editor, I want to block an outsider from a share's comments from the share's commenter list, deleting their comments, so that a link that spread too far can't be used to spam us.
99. As the team, I want a cap on how fast one account can post, and on how much a link share's outsiders can post a day, so that a leaked link can't flood a project.

### Comments over a project's life

100. As a member, I want a stopped share's comments to stay readable by members, marked "share ended", so that client feedback outlives the link.
101. As a member of a lapsed team, I want comments to be read-only, with admins still reading them on the cloud canvas and Macs showing the last they saw, and everything to carry on when the team pays, so that not paying freezes comments instead of losing them.
102. As an admin taking a project out of the team, I want the sheet to say how many comments go with the team's copy, so that I know they are deleted when the project goes local.
103. As a member, I want a project moved to another team to keep its comments, so that a move loses nothing.
104. As a member, I want a removed member's comments to stay under their name, so that the record stays whole.
105. As anyone, I want deleting my account to leave my comments and replies in place but shown as "Deleted account", with my name and face gone, so that the team keeps its record and I'm not named on it.

## Implementation Decisions

### Where comments live (ADR 0011)

- Spool Cloud holds the truth. Comments are tables in each team project's sync object, beside its files but outside the save path: a comment takes nothing from the project's bucket or an editor's month, makes no history row, does not wake the compile object and does not restart a shared page's wait. Anything on a Mac is at most a read-only copy.
- Tables (shape, not schema): **comments** (id, audience: team or a share id, page id, frame path or null for the field, point in frame pixels or world point, the element's four handles as context, the frame's source revision and still at creation, author account, written-by-agent flag, body, created, edited, resolved by and when, and a standing: on frame, on deleted frame, on deleted page); **replies** (id, comment, author, agent flag, body, created, edited, draft-for account or null); **reads** (account, comment, last read); **outbox** (who is to be emailed about what, and when).
- Ids are short and printable, so an agent and a person can name one in a terminal.
- Comments are cleared with the project when its sync object forgets it, and follow a move between teams because the project id stays.

### One protocol for both sides

- The comment messages and their validators join the sync protocol module the spool package exports and spool-cloud imports (`spool.page/sync-protocol`), so the daemon, the browser and Cloud read one definition. The protocol version is raised.
- A daemon that has caught up gets a snapshot of every comment it may see, then each change live: added, replied, edited, resolved, reopened, deleted, read. A member's browser gets the same on its looking socket. An outsider's browser opens a comments-only socket to the sync object, tagged with its share, and hears only that share's audience. Every socket hibernates as today.
- Writes from the Mac go through the daemon to Cloud. Writes from the browser go to Cloud's comments API. Both are refused while offline; there is no offline queue.
- The daemon keeps the last snapshot it heard, with when, in its own machine state (never in `design/`), so the canvas and `spool comments` answer offline and after a restart.

### Pins and their frames (decided in spool#160)

- A pin is a point on a frame in the frame's pixels from its top-left, or a world point on a page's field. Never a region, never on a page object, never placed in the player or an entered frame.
- The sync object keeps pins current as it applies saves: a rename or move Spool makes, and a delete and add of the same source within one save batch, repoint the comment to the new path and page. A duplicate never takes comments.
- Resize keeps the pixel offset, clamped inside the frame. An edit leaves the pin put; a comment whose revision differs from its frame's says "edited since".
- A frame's delete moves its comments to the field at its last place, standing as on a deleted frame. A save that brings a frame back at that path stands them on it again.
- A page's delete stands its comments as on a deleted page: off the canvas, in the inbox's resolved view only. Comments are not part of history: a restore never rolls them back or brings deleted ones back.

### Audiences and access (decided in spool#158 and spool#163)

- Audience is Team (every member, every role) or one share of the comment's page. Replies keep their comment's audience.
- Members read every audience. An outsider reads only their share's, and only when signed in. A share that ends leaves its comments readable by members, marked "share ended"; nobody new can post to that audience.
- A link share keeps opening without an account. Every comment surface, reading included, needs sign-in through one dialog.
- **Signing in on a link host.** A link share lives on its own onspool.page host, which a spool.page session doesn't reach, and browsers block spool.page's cookie there. So a sign-in on a link host ends in a session cookie scoped to that one host, minted by the same account service. The email-code steps and the name step run inside the dialog against that host. Google runs in a popup on spool.page and hands a one-time code back to the dialog, which trades it for the host session. The passkey offer is skipped there, since a passkey belongs to spool.page. Named shares already sign in on spool.page and need nothing new.
- An outsider never connects to presence. A link share's settings list the accounts that have commented through it, with Block.

### Who may do what

- Read: members, every audience; outsiders, their share's.
- Post a comment: every member role, to Team or a share of that page; an outsider, to their share.
- Reply: anyone who reads the comment.
- Resolve and reopen: anyone who can reply.
- Edit: the author only, marked edited.
- Delete: the author, their own; admins and editors, anyone's. Deleting the first message deletes the comment with its replies.
- Block an outsider from a share's comments: admins and editors. It deletes their comments on that share and refuses their posts to it; viewing a link share's frames stays open, as a link can't be taken back from one person.
- Nobody posts while their team is lapsed. Admins still read on the cloud canvas; Macs keep their last snapshot.
- Mentions list members only, and only members' composers offer them.

### Limits (constants a maintainer can raise per project, as with the save bucket's refill)

- A comment or reply is plain text with mentions, 1 to 4,000 characters.
- One account posts at most 30 comments and replies a minute in a project, as a refilling bucket.
- A link share's outsiders together post at most 300 a day.
- A project holds at most 5,000 open comments; past that, new ones are refused with a message.
- Refusals carry a reason the composer shows in plain words.

### Names (decided in spool#159)

- An account has one Name, 1 to 64 characters. A required name step after a new email-code sign-in, prefilled from the address with a live pointer preview; Google's `profile` scope fills it without asking and never overwrites; existing accounts are asked on next sign-in and in the comment box. Fallback everywhere: the address before the @.
- Comments, replies and history point to the account, not a copy of its name, so renames show everywhere. No photos: a disc with an initial in the team colour.
- The email shows only on People, your own account page and your sidebar menu.
- A deleted account's comments stay, authored by "Deleted account" with a plain face; its reads and email settings go.

### The Mac app (decided in spool#162)

- Comment is a fourth tool in the bottom group. C switches, held C borrows and returns, V and Esc leave, a + in the Comments tab turns it on. Frames are inert under it. Placing a pin hands back the Pointer (a held C returns to the tool you had).
- The composer card at the pin carries the element chip, the Audience picker (Team by default, or one of the page's shares) and @mentions; Enter sends.
- A comment opens as a card at its pin under any tool, with replies, a reply field, Resolve, "edited since" with Compare, and a ⋯ menu (yours: Edit, Copy link, Delete; others': Copy link, Mark unread, and Delete for admins and editors).
- Pins: the author's face, 22 px at every zoom, outsiders hollow, agents square-cornered, unread with an accent ring, the open one with a thicker ring, merged into counts under 32 screen px, a count on page objects, dashed on the field for a deleted frame, hollow with a check for resolved when the switch is on. Shift+C hides all.
- The Comments tab beside Properties and Agent is the inbox: filters all, unread, for you; Resolved switch; sorting; rows grouped by frame with audience, reply count and "edited since"; a click flies to the pin; an unread dot on the tab when it's out of sight.
- Motion: cards grow from and shrink into their pin, pins pop from their tip, all on the theme's curves. The prototype's frames are the visual reference and are followed literally.

### The browser canvas (decided in spool#163)

- A tool group of Pointer and Comment, same keys, no Hand. The Mac's card at the pin. Members get the Mac's composer; outsiders get one that says their share and the team read it, and see the element outline but never its tag.
- The inbox is a panel that slides in from the right, opened by a Comments button beside Shared with the open count and an unread dot. Choosing the tool doesn't open it.
- Signed out on a link share: no pins, no count; the Comment tool, C, the Comments button, the rail's Sign in and a one-time tip all open "Sign in to see comments". After sign-in, pins ripple in and the reached-for action carries on. The rail's foot shows the outsider's name.

### Agents (decided in spool#164, ADR 0005 amended)

- One verb, `spool comments`, the one verb that writes, with subcommands kept lean: list (the default; open comments, filters for page, frame, share, and resolved), show one, reply, resolve, reopen, and add. It talks to the daemon, which answers reads from its snapshot (saying how old it is) and sends writes to Cloud.
- `add` takes a frame and optionally an element (its selector or an element pointer) and pins at that element's top-left, or the frame's; Team audience only.
- Everything written through the verb is the person's account with the agent mark: shown as "Ana's agent", with Ana's permissions. On a Team comment, reply and resolve go out. On a share's comment, a reply is stored as a draft for that person only, which they send or edit from the card; the outsider never sees it.
- One `<comment>` block, one rendering for the verb's output and the prompt, as the selection block is: author name (and "via share X" for an outsider), audience, open or resolved, frame and element pointer (path, lines, excerpt), "edited since" when it applies, then every reply in order. With "edited since", the comment's still rides along as an image attachment in a prompt.
- "Send to agent" on a comment, in the Mac app with an agent installed, puts the comment in the agent composer as a chip on the open thread through the same door as "Ask the agent". Nothing runs until send. A comment never starts an agent; @agent is not a trigger.
- Codex asks before `spool comments reply` under Ask first (it auto-accepts only read-only verbs); Claude Code doesn't. The share draft is the guard that holds on every engine.

### Being told

- Unread is per account per comment: a comment is unread when it or a reply came after you last opened it and wasn't yours. Opening the card marks it read; Mark unread undoes it. Reads reach your other Macs and browsers live.
- "For you" means: a comment that mentions you, one you wrote or replied in, or an outsider's comment on a share you made.
- Email goes only for what's for you. The sync object holds each event in its outbox for 10 minutes, then sends one email per person per project bundling everything still unread, through the mail sender Cloud already uses. Outsiders are emailed about replies on comments they're part of. Every email has a one-click unsubscribe; the account page has "Comment emails: For you / Off".
- No cross-project index in this spec: every email is decided inside its project's sync object.

### Comments over a project's life

- Share stopped or gone: comments kept, readable by members, "share ended".
- Team lapsed: read-only for everyone; admins read on the cloud canvas; shares are stopped so outsiders can't read; paying again carries on.
- A project leaving the team: its comments are deleted with the team's copy; the leave sheet states how many. A move to another team keeps them.
- Member removed: their comments stay under their name; they lose access.
- Account deleted: comments stay as "Deleted account".

### Glossary

- Comment, Reply, Pin and Audience are in spool's glossary; Name is in spool-cloud's. When this ships, spool-cloud's **Outsider** changes: an outsider is seen on their comments by the team and by others on their share, and in the share's commenter list, never in presence.

## Testing Decisions

- A good test drives the feature from the outside, through the surface a real client uses, and asserts what a person or agent would see: what a reader gets, what is refused and why, what is sent. No test reaches into tables or component state.
- **Seam 1, Cloud: the worker's comments API and sockets.** One suite in spool-cloud's workers test style drives HTTP and WebSockets against the real sync object with an injected clock and a fake mail sender. It covers audiences and who sees what (members, each share's outsiders, signed out), every permission row, limits and refusals, live delivery to daemon, member browser and outsider sockets, pins kept current through renames, deletes and restores applied as saves, unread and "for you", the outbox's hold and bundling, the link-host sign-in handoff, lapse, share end, project leave and move, and account deletion. Prior art: the sync, shares, presence and billing endings suites (the endings suite's sweep with emails is the model for the outbox).
- **Seam 2, spool: the daemon through `spool comments` and its routes, against the fake spool.page.** The in-process fake Cloud in the team sync test harness learns comments, keeping the same rules as the real object, and the CLI tests drive the verb: list and filters, show, reply, resolve, reopen, add, the share draft, the agent mark, offline answers with their age, refusals. The `<comment>` block is a pure rendering tested directly, as the selection block is. Prior art: the team CLI tests, the team sync tests, the selection block tests.
- **Seam 3, the canvases: browser tests** for the Mac Comment tool and the browser canvas, driving keys and clicks: C, held C, V, Esc, Shift+C, placing, the card, the inbox, pins merging, the sign-in dialog and carry-on. Prior art: the edit tool, set-aside and viewer browser suites.
- The protocol is shared code, so the fake and the real object read the same messages; seam 1 is where its rules are proven, and seam 2 trusts the fake to keep them.

## Out of Scope

- Phones: the navigator and the player show no comments.
- Projects that aren't team projects, solo projects' shares included.
- Emoji reactions.
- Images or other attachments on comments, and a capture of what the commenter saw beyond the frame's still.
- Comments placed in the player, inside an entered frame, or on a frame walked into a state.
- Regions, and pins that follow an element.
- An offline queue for posting.
- A history of comments, or restoring a deleted one.
- Unread on Home or across projects, desktop notifications, and a cross-project index.
- Mentioning outsiders, and outsiders mentioning anyone.
- Turning a comment into an agent run without a person pressing send.
- Exporting comments before a project leaves its team (an agent can save `spool comments` output).

## Further Notes

- The map: Wayfinder map: comments on Spool Cloud (spool#155). Decisions: spool#156 to spool#164. ADRs: 0011 (comments live in Spool Cloud), 0005 as amended (`spool comments` is the one verb that writes).
- The three areas the map left in its fog (being told, comments over time, limits and abuse) are decided in this spec by best practice, following Figma where it fits; they are the parts to challenge first.
- The work spans both repos: Cloud's tables, API, sockets, sign-in handoff and email in spool-cloud; protocol, daemon, verb, Mac canvas and browser canvas in spool. Build tickets should land the protocol and Cloud side first, then the daemon and verb, then the two canvases.
- Changesets: the verb, the Mac tool and the browser canvas change published behaviour and each lands a changeset.

## Comments

### agent, 2026-10-20T15:17:30.072Z

All eight tickets and the review fixes are on the spec branches (spool `191-167-spec-comments-on-spool-cloud`, main merged in; spool-cloud same name at ~/dev/projects/spool-cloud-191). Checks green except team-sync 'says a long wait once', broken on main. Not merged: shipping needs a spool release (protocol 2) together with Cloud's pin bump and deploy (auth migrations 0031-0033; serving worker secrets RESEND_API_KEY, MAILBOX_CODE_KEY). Remaining: name prompt in the comment box (story 72); 38 spool tests still read the fake's stores; design/frames/app mirror not redrawn; large-file/duplication smells. Fix report: /tmp/pi-orch/spec-191/handoffs/fix.md.

### agent, 2026-10-20T17:57:30.083Z

Shipped: spool.page 0.44.0 is on npm (spool `b3d38aab`), and Spool Cloud is merged (`40e1a7d`) and deployed to production on 2026-10-20 with auth migrations 0031–0033 applied.

Kept open for what remains:
- Liam's open questions: should blocked outsiders still read, should viewers see the commenters list, should the expired-invite page show admins' emails, and the name prompt in the comment box (story 72)
- 38 spool tests still read the fake's stores directly
- the `design/frames/app` mirror isn't redrawn for comments
- large-file and duplication smells from review (see /tmp/pi-orch/spec-191/notes/followups.md)
- some sign-out paths don't cut comment sockets

### agent, 2026-10-20T17:57:37.364Z

Follow-ups noted while building (the /tmp note won't last):
- the Comments tab order browser test flakes when two comments share a timestamp
- Card Compare and the agent prompt fetch the still two different ways
- link outsiders have no sign-out button
- forgetComments doesn't clear the reads and mentions tables
- members of a lapsed team still get comment emails already queued in the outbox
