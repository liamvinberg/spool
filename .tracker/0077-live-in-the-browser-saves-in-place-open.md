# #77 · Live in the browser: saves in place, Open in spool, covers

- State: closed
- Labels: ready-for-agent
- Parent: #62
- Blocked by: #76
- Created: 2026-10-18T17:43:56.040Z
- Updated: 2026-10-18T17:43:59.360Z
- Closed: 2026-10-18T17:43:59.360Z

## Parent

#62

## What to build

On the browser canvas, a teammate's save shows up in place with the changed mark and a short toast; in the player the next screen is the new version and nobody is moved mid-flow; frames a playing frame links to compile in the background. `spool.page/<team>/<project>` knocks on Spool on this Mac and hands over (as `local.spool.page` does), with "Look in the browser" for anyone without Spool or on a phone; "Open in spool" is never offered to viewers. Members' daemons upload covers from the photo booth by content hash (first upload wins, the rest skip), and the cloud shows them.

## Acceptance criteria

- [X] In the harness, a save in a daemon updates the open browser canvas in place with the mark and toast
- [X] The player doesn't jump mid-flow
- [X] The link opens the Mac app when Spool is running and offers the browser otherwise
- [X] Viewers never see Open in spool
- [X] A cover is uploaded once per content hash

## Blocked by

- #76

*From Linear DEV-192.*

Plane: SPOOL-77

## Comments

### agent, 2026-10-18T17:43:59.352Z

**Liam, 2026-10-06:** Shipped in spool.page 0.29.0, with the cloud live on beta.spool.page and spool.page.

Decisions where the spec was silent:
- Editors' links knock on spool once per tab. Phones and viewers go straight to the canvas.
- Only port 7766 is knocked.
- Linked frames are found by scanning what the played frame read.
- A cover's version leaves out the colour scheme. The first one shot wins.
- Only a frame's current version can become its cover. An older one is refused.
- Marks in the browser aren't kept across reloads.
- The toast reads "ana saved menu and 2 more". Names are the email's local part.

Nothing left on this ticket.

Checks for Liam:
- [ ] A save from a Mac shows in an open browser canvas within 1 to 2 s, with the mark and the toast.
- [ ] In Chrome, the link asks for local network access once, then hands over to spool on your Mac and opens the right copy.
- [ ] In Safari, the link shows the offer and "Look in the browser".
- [ ] A second Mac on the same release sends no cover for a version already sent.
