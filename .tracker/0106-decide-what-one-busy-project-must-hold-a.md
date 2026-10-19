# #106 · Decide what one busy project must hold at launch

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Created: 2026-10-18T17:43:56.385Z
- Updated: 2026-10-18T17:44:00.470Z
- Closed: 2026-10-18T17:44:00.470Z

## Question

Load-test a busy team project (#103) found three ceilings in one project. Which of them must move before Spool Cloud takes money, and which can be a known limit at launch?

- **Presence.** Past about 1,000 for (people moving) × (people − 1), for example 30 people all moving, Cloudflare drops every moving person's socket, and their sync with it. Options seen: batch presence into one frame per tick, slow updates as the project fills, a cap on who is relayed, or a stated limit.
- **Saves.** 120 a minute holds about 80 busy agents. #83's 2,000-save bucket absorbs bursts, but not a sustained rate above that. Past that, saves wait minutes, and refused saves upload their whole file and retry together.
- **Catch-up.** A new editor on a 500 MB+ project blocks the object for seconds and drops everyone moving. Chunked catch-up was already a must-have in Research: running Spool Cloud for paying customers on Cloudflare (#94).

This decides what the build tickets for these are, and what (if anything) the landing or docs say about project size.

*From Linear DEV-257.*

Related: #107, #108, #109, #110, #104, #103, #94, #90, #83

Plane: SPOOL-106

## Comments

### agent, 2026-10-18T17:44:00.462Z

**Liam, 2026-10-11:** ## Resolution

Grilled with Cata (agent-hub task 121). He took every recommendation, relaxed the presence bar (no need to match Figma's 200, just feel fast with no friction), and agreed the size caps stay.

**Presence must move before money.** One project should feel fast for **100 people** at once. The pattern follows Figma, which [shows at most 200 cursors](https://help.figma.com/hc/en-us/articles/1500006775761) in a file, editors first, followed people always.
- Pointer updates go only to people on the same page. Others hear only which page a person is on.
- Batched: one frame per receiver per tick with everyone who changed, so the load stops growing with people × people.
- At most 50 cursors shown on a page, editors first, followed people always. Past that, a person is told their pointer is hidden, and their canvas stops sending it.
- Presence never closes a socket: overload drops updates, never connections or saves.
- Proven by re-running the load test's scripts. If it fails, presence gets its own object.

**Saves stay a known limit.** 120 a minute with the 2,000 bucket holds about 80 busy agents in one project, far past a launch team. Only the waste is fixed: daemons pace to the bucket instead of uploading files to be refused, retries are spread out, a project stuck 10 minutes on its bucket is logged for alerts, and a maintainer can raise one project's rate.

**Catch-up must move** (already a must in #94): chunked and yielding. Done when a 990 MB join while 10 people move drops nobody and others' saves land within 1 s.

**Reconnects spread out** after any drop (overload or deploy): random, growing backoff that resets only after a minute connected.

**Size stays 1 GB a project and 25 MB a file.** Our own canvas is 97 MB for 662 frames after months, so 1 GB is about 6,000 frames. A web-ready 30 s 1080p clip is about 19 MB. Spool compresses nothing: lossless compression gains little on already-compressed media, and rewriting files would change them under their owners. Instead agents are told: the skill names the limit and says to shrink media on the Mac, and the next `spool` command names any file that didn't sync. The docs list the limits, with no limit on people; the landing says nothing about size. Media over 25 MB (Figma takes 100 MB videos) is out of scope for launch.

Build: Presence stays light in a crowded project (#107), A new editor's catch-up never blocks the project (#108), A dropped daemon comes back spread out (#109), Agents hear about a file that didn't sync, and the docs list the limits (#110), and two additions to Moving in counts against no limit, and the minute limit becomes a bucket (#104).
