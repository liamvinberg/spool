# #156 · Research: how Figma and similar tools make commenting feel

- State: closed
- Labels: wayfinder:research
- Parent: #155
- Created: 2026-10-18T17:43:56.948Z
- Updated: 2026-10-18T17:44:02.238Z
- Closed: 2026-10-18T17:44:02.238Z

## Question

How do Figma, FigJam, Framer, Vercel's toolbar, Pen.dev and similar tools make leaving and reading comments feel? Specifically: how you enter commenting (a tool, its key, a mode), what a pin looks like at different zoom levels and how clusters of pins are drawn, the composer (where it opens, attachments, mentions), the list of comments (a side panel, filters, resolved, unread), replies and resolve, how a viewer or a link guest comments, and how presence and comments meet. Screens and short clips where possible (Mobbin through the `mcp__mobbin` group is allowed). `spool-cloud/research/109-presence-locks-feedback/` already covers anchoring and who may comment: build on it, don't redo it. Feeds Prototype leaving and reading comments in the Mac app (#162).

Plane: SPOOL-156

## Comments

### agent, 2026-10-18T17:44:02.229Z

**Liam, 2026-10-17:** ## Resolution

Every canvas tool enters commenting with the key C. Shift+C hides the pins. In Spool's canvas C and Shift+C are free (V, E, H, P, R, T are taken).
Comment mode is a tool in a bottom or side toolbar (Framer, Higgsfield, Figma). Figma blocks editing while it is on. Penpot users asked for pins to stay visible outside the mode.
Figma's own data: finding the entry is the hard part. A prompt raised comments 45% for view-only users. Moving the entry cut discovery 20%.
A pin is a fixed-size round marker above the canvas, 32 px in Liveblocks and Penpot, with one corner pointing at the spot. Penpot merges pins closer than 32 screen px into a count and fans them out in rings on click.
Figma moves all pins with one CSS translate on pan and zoom, to stay at 60 fps with 150 comments. Figma's pin size and cluster rule are not published (UNCONFIRMED).
Unread shows on the pin and in the list. Resolve hides the thread. A switch shows resolved ones.
The composer is a small card at the pin. Figma made it small on purpose. Figma allows 5 images. Miro keeps drafts.
For live code, Figma Make attaches a screenshot of the clicked element, because the app changes. It comments on the latest version only.
Link guests: Figma, Sketch and Excalidraw+ need a sign-in. Webflow asks outsiders for a name and a verified email. Pastel asks name and email. Pen.dev terms allow link comments but its UI is undocumented (UNCONFIRMED).
Presence and comments stay apart. Figma cursor chat (/) is temporary: 52 characters, gone after 5 seconds. Webflow does not show new comments live.
Figma's REST API and Webflow's Comments API let tools read and post comments. Replies go one level deep.
Spool facts: the browser canvas has no tools. Outsiders never connect to presence. "Thread" already means an agent conversation. Frames run on another origin.
Options for Spool (not decisions): a fourth Comment tool on C, a held-key gesture, a Comments pane, or a button in the browser.
Branch: 165-next-thing-i-think-is-really--wayfinder-165-research-165-commenting-feel
README: research/spool-156-commenting-feel/README.md
