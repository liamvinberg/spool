# #162 · Prototype leaving and reading comments in the Mac app

- State: closed (resolved)
- Labels: wayfinder:prototype
- Parent: #155
- Blocked by: #156, #160
- Tasks: task 186 (■ #162 Prototype leaving and reading comments in the Mac app)
- Created: 2026-10-18T17:43:57.017Z
- Updated: 2026-10-20T05:01:11.138Z
- Closed: 2026-10-20T05:01:11.138Z

## Question

How does commenting look and feel on the Mac app canvas? Cover: entering commenting (a fourth tool beside Select, Edit and Hand, its key, or another way), placing a pin, writing a comment, pins on the canvas at every zoom (on stills, on page objects, piled up), a Comments pane beside Properties and Agent listing them (filters, resolved, unread), opening one with its replies, resolve and reopen, editing and deleting, and mentions if they earn a place. Bring variations and a recommendation. Name the comment and its replies with domain-modeling: **Thread** is taken by agent conversations.

Plane: SPOOL-162

## Comments

### agent, 2026-10-19T19:46:43.919Z

From [Decide how agents read, act on and answer comments (#164)](https://devobee.tail9e5223.ts.net/spool/tickets/164): draw a "Send to agent" on a comment (it reuses the "Ask the agent" door: a chip in the composer), an agent's reply marked "Ana's agent", and an agent's reply on a share's comment waiting as a draft for the person to send. Cata: lean, fits in without clutter.

### agent, 2026-10-19T20:15:19.122Z

Progress, 2026-10-19 (task 186): three takes and the pins and naming rows are drawn in `design/frames/explore/cloud/comments/` (code: `shared/ui/explore/cloud-comments/`). Cata agreed to these: read a comment in a card at its pin, use the Comments pane as the inbox, show the author's face on pins (now 22px, leaner), and name them Comment, Reply, Pin and Audience. He didn't like the labelled Comment button taking that much room. The `comments-tool` take now has Comment as one icon in the tool group: C switches to it, holding C borrows it, and a + in the Comments tab turns it on. Waiting on his yes to that entry before resolving.

### agent, 2026-10-20T05:01:11.138Z

## Resolution

Decided with Liam (Cata), 2026-10-19, agent-hub task 186. The prototype is `design/frames/explore/cloud/comments/` on the team canvas (`comments-tool` and its states, `pins`, `naming`), with code in `shared/ui/explore/cloud-comments/`. The losing takes, `comments-hold`, `comments-pane` and `pins-number`, were deleted, and spool.page's history keeps them.

- **Entering**: Comment is a fourth tool, one icon in the bottom group beside Select, Edit and Hand. Tapping C switches to it. Holding C borrows it: click to place, let go to return to the tool you had, as Space lends Hand. A + in the Comments tab's row turns on the same tool. Esc or V leaves it. While it is on, frames are inert, as under Edit. That costs nothing, because comments go only on frames as they stand (#160). The labelled "Comment C" button was rejected because it takes too much room. Making a click comment whenever the Comments pane is showing was rejected because a pane is layout, not a mode: the same click would change meaning without anything saying so.
- **Placing**: under the tool the pointer is a pin, and the element under it is outlined. A click places the pin and opens the composer card at it.
- **Composer**: a small card at the pin. It shows a chip for the element it took (context for agents), an Audience picker (Team by default, or one of the page's shares) and @mentions. Enter sends.
- **Reading**: a comment opens as a card at its pin, with its replies, a reply field and resolve. Clicking a pin under any tool opens it without changing tool. "Edited since" sits in the card, and Compare shows the still from then beside the frame as it is now.
- **Comments pane**: a tab beside Properties and Agent, and the inbox. Filters are all, unread and for you, with a Resolved switch and sorting in its menu. Rows are grouped by frame, and each row says its audience, reply count and "edited since". Clicking a row flies to the pin. Out of sight, the tab carries an unread dot.
- **Pins**: the author's face (their initial in their presence colour; outsiders hollow, agents square-cornered), 22px at every zoom. Unread is an accent ring, and an open pin has a thicker one. Pins closer than 32 screen px merge into a count with faces, which fans out on click. A page object shows a count, not pins. Pins from a deleted frame stand dashed on the field. Resolved pins are hidden unless the Resolved switch is on, and then show hollow with a check. Shift+C hides all pins. A known risk: a face can read as presence.
- **Edit and delete**: your own comment or reply has a ⋯ menu with Edit, Copy link and Delete. On someone else's: Copy link and Mark unread. Who may delete others' comments stays with the "Limits and abuse" fog.
- **Mentions**: @ in the composer, drawn in the accent colour. @agent is how a comment speaks to an agent. What an agent does with it is for #164.
- **Naming**: **Comment** for the whole thing (the first message and its replies), **Reply**, **Pin** for its mark, and **Audience** for Team or a share. Added to `GLOSSARY.md`. Thread stays the agent's word.
