# #344 · How the canvas is drawn, and how a picture becomes live

- State: closed (moved to spool-next)
- Labels: wayfinder:grilling
- Parent: #333
- Blocked by: #343, #342
- Created: 2026-11-13T14:47:11.082Z
- Updated: 2026-11-14T10:28:43.232Z
- Closed: 2026-11-14T10:28:43.232Z

## Question

Which drawing design does the new spool stand on?

From the spikes and from what a frame is: what the GPU draws and what the browser lays out; the rule for when a frame is a picture and when it is live (he wants "image replacement that looks identical and when zooming in it goes live"); who makes the pictures and when; how motion is drawn (a frame drawn apart from where it stands, which the old plan added late and the rethink's "forward" needs from the start); what extensions are allowed to draw, and where.

## Comments

### agent, 2026-11-14T10:28:43.232Z

Moved to spool-next#1, where it is recorded as decided: the browser draws live frames when near, GPU pictures when far (spike spool#343 met the frame rate on the m1). The open drawing rules are in that map's fog and go to spool-next#7 and spool-next#15.
