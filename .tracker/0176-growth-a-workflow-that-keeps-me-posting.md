# #176 · #growth: a workflow that keeps me posting

- State: closed (built)
- Labels: enhancement
- Tasks: task 195 (Build growth posting workflow)
- Created: 2026-10-20T12:00:46.058Z
- Updated: 2026-10-20T17:06:55.948Z
- Closed: 2026-10-20T17:06:55.948Z

From spool tasks 150 and 183, decided in agent-hub task 192. **Waits on agent-hub#57** (workflows, schedules and waking), the first workflow built on it; start it once that ships. The tracker can't block across projects, so this line is the blocker.

**What to build:** a `#growth` channel in Spool's category and the workflow `workflows/spool/growth.ts` in agent-hub's repo (not spool's: spool's repo is public), with notes in `workflows/spool/growth/`, `voice.md` first, built from Liam's real replies on X (lowercase, one or two lines, "i made spool" not "i use spool", a link only when asked).

- **Tuesday 10:00, a nudge:** a task that reads what shipped this week from spool's git log and changesets, and posts it with one clip idea ("record 20s of …"). It ends with a card or an ask: Recorded / Snooze.
- **A pasted tweet link** (no tag needed): a task drafts 2 or 3 replies in Liam's voice, each with a link button that opens X with the reply already typed. X's API only lets an app reply to a post whose author mentioned or quoted it (since 23 Feb 2026), so Liam taps Post himself.
- **A weekly post draft with screenshots** of the canvas, taken by the agent, ending with Approve / Edit / Skip. A link to X can't carry images, so Approve hands over the text and images ready to post. Posting through X's API (a developer app, charged per post) comes later, only if Liam still wants one tap after a few weeks.
- Feedback in a draft's thread ("too salesy") goes into `voice.md`, which a firing's task may edit.

**Added by Liam (agent-hub task 192):** automatic post ideas too. Without being asked, the workflow suggests posts built from what he has actually made: screenshots of spool canvases and frames, and things he shipped recently, each with a draft caption, ready to post. He only picks one and posts it.

## Comments

### agent, 2026-10-20T16:14:09.602Z

agent-hub#57 is built and merged: this ticket is unblocked. Make the workflow with `save_workflow` (task-only tools in the `workflows` group) from a task in Spool's category, after making `#growth`.

### agent, 2026-10-20T17:06:55.948Z

Built in task 195. `#growth` is in Spool's category, and `workflows/spool/growth.ts` is live on agent-hub's main (b14ee63), with notes in `workflows/spool/growth/`: voice.md (from @liamvinberg's own posts and the replies he picked), playbook.md (what each firing's task does), log.md (what was suggested and posted, so ideas don't repeat) and canvas-shot.mjs (screenshots a canvas page the way it looks in the app).

- Tue 10:00: nudge, what shipped in 8 days plus one clip to record, ending with an ask: Recorded / Snooze to tomorrow (wake_me) / Skip.
- Fri 10:00 and Run now: 3 post ideas from canvases and frames he made and what shipped, with screenshots and captions, ending with an ask to pick one; a pick comes back ready to post with an X compose link.
- A pasted x.com link: 2 or 3 replies with link buttons that open X with the reply typed.
- Anything else untagged (a clip, an idea): a growth task with it.
- Corrections in a thread go into voice.md, through save_workflow with notes alone.

First run by hand: task 197.
