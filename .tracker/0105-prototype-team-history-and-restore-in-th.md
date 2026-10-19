# #105 · Prototype team history and restore in the app

- State: closed
- Labels: wayfinder:prototype
- Parent: #89
- Created: 2026-10-18T17:43:56.372Z
- Updated: 2026-10-18T17:44:00.436Z
- Closed: 2026-10-18T17:44:00.436Z

## Question

How does a team history look and work in the app: a frame's history from its menu and the whole project's, saves grouped so 2,000 rows a day stay readable, filtering by person, set-aside saves and restores shown, comparing a version with today, and restoring a file, frame, page or the whole project to a moment. The model is decided in Decide history and restore for team projects (#57).

*From Linear DEV-256.*

Related: #114, #57

Plane: SPOOL-105

## Comments

### agent, 2026-10-18T17:44:00.426Z

**Liam, 2026-10-11:** ## Resolution

Prototype on the canvas: `explore/cloud/history` in spool.page/devosurf/spool, the frames `history-paced`, `--open`, `--project`, `--compare` and `--restored`. Their code is in `design/shared/ui/explore/cloud-history/` and the fixture in `design/shared/lib/explore/cloud-history/`. The dashed strip, with its Play the walk button, is the prototype's readout and not design. Cata settled it over three rounds on 2026-10-11 (agent-hub task 120).

**Where it lives: a pane.** History is a third tab beside Properties and Agent (⇧⌘H). It was chosen over a sheet over the canvas and over the canvas itself rewound with a timeline.
- History… in a frame's right-click opens that frame's history. History… in the project tab's menu, beside Match the team, opens the whole project's. The pane's head names what it shows, and × widens a frame's history to the project.
- A frame's history also lists saves to shared files the frame imports, marked "through order-button.tsx".
- Everyone or one person is picked from the pane's head.

**How it reads: a paced spine.** It was chosen over rows and a ledger, then over three other spines (dots, faces, thread).
- Days, then **stretches**. A stretch is one person's run of saves on one machine with no 10-minute gap, so today's 1,966 saves are 5 rows.
- Each row has the time the stretch ended on the left (the moment a restore goes back to), a mark on the line in the person's colour as tall as the stretch ran, then who, how long and what it touched, with its save count.
- The space between rows grows with the time between stretches (square root, capped), and a long gap says "50 min quiet".
- A restore is a row of its own, marked ↺ and "restore". Set-aside saves show as "1 set aside" on their stretch. Inside it the file explains whose save arrived first, with Compare and Put back.
- The pane ends with "Saves are kept 90 days. Today's files are always kept." and "Moved in from git on  by , in ".

**Compare and restore.**
- Picking a stretch opens it to its files and to Compare with now and Restore….
- Compare with now stands the version beside today's on the canvas, each labelled with its moment or "now". A frame deleted since comes back dashed, and the other frames step out.
- Restore… goes back to the stretch's end. From a frame's history it restores that frame. From the project's it offers each frame and page the stretch touched and the whole project, each with its file count. A file is restored from its line (Restore on hover).
- One question asks before restoring. It says the restore reaches the team as new saves and can be undone.
- Restoring a frame that imports a shared file changed since **offers it as a checkbox, off by default**, naming the other frames that use it.
- A done restore says so in a toast with Undo (⌘Z). Its row has Undo this restore.
- **Moments are stretch ends only.** Every single save stays in the log, and agents read them with `spool history`.

**Motion (accepted as drawn).** It uses the house timings (base 180 ms, ease-out, snap), and all of it turns off under reduced motion.
- A picked stretch folds open (rows 0fr to 1fr, 200 ms), and its files follow 30 ms apart.
- A stretch under the pointer outlines the frames it touched on the canvas, in its person's colour.
- Compare slides today's frame aside (260 ms, snap), and the old version fades up where it stood.
- A restore cross-fades the frame to what it got back and rings it once. Its row grows in at the top with a wash that fades.
- The person filter folds rows away rather than cutting them.

**For the sync spec:**
- Compare means the daemon renders one frame at a past moment, with its frame files and the shared files it imports as they stood then.
- The history needs, per save, who, which machine and when, plus whether it was set aside or a restore. Stretches can then be grouped on read.
- A restore is ordinary saves marked as a restore, carrying what it restored and to when.
