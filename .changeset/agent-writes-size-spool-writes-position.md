---
"spool.page": minor
---

An agent can now state a frame's size without stating where it goes. Write `{ "w": 1440, "h": 900 }` into `frame.json` and the frame arrives that size, in clear space beside the other frames on its page, and spool fills in the position. Before this, a size on its own was ignored: the frame came out 390×844 with nothing said about it, so the only way to get a size was to make up coordinates too, and the guess landed on top of another frame.
