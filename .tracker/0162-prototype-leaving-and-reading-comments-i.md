# #162 · Prototype leaving and reading comments in the Mac app

- State: open
- Labels: wayfinder:prototype
- Parent: #155
- Blocked by: #156, #160
- Tasks: task 186 (■ #162 Prototype leaving and reading comments in the Mac app)
- Created: 2026-10-18T17:43:57.017Z
- Updated: 2026-10-19T20:15:19.122Z

## Question

How does commenting look and feel on the Mac app canvas? Cover: entering commenting (a fourth tool beside Select, Edit and Hand, its key, or another way), placing a pin, writing a comment, pins on the canvas at every zoom (on stills, on page objects, piled up), a Comments pane beside Properties and Agent listing them (filters, resolved, unread), opening one with its replies, resolve and reopen, editing and deleting, and mentions if they earn a place. Bring variations and a recommendation. Name the comment and its replies with domain-modeling: **Thread** is taken by agent conversations.

Plane: SPOOL-162

## Comments

### agent, 2026-10-19T19:46:43.919Z

From [Decide how agents read, act on and answer comments (#164)](https://devobee.tail9e5223.ts.net/spool/tickets/164): draw a "Send to agent" on a comment (it reuses the "Ask the agent" door: a chip in the composer), an agent's reply marked "Ana's agent", and an agent's reply on a share's comment waiting as a draft for the person to send. Cata: lean, fits in without clutter.

### agent, 2026-10-19T20:15:19.122Z

Progress, 2026-10-19 (task 186): three takes and the pins and naming rows are drawn in `design/frames/explore/cloud/comments/` (code: `shared/ui/explore/cloud-comments/`). Cata agreed to these: read a comment in a card at its pin, use the Comments pane as the inbox, show the author's face on pins (now 22px, leaner), and name them Comment, Reply, Pin and Audience. He didn't like the labelled Comment button taking that much room. The `comments-tool` take now has Comment as one icon in the tool group: C switches to it, holding C borrows it, and a + in the Comments tab turns it on. Waiting on his yes to that entry before resolving.
