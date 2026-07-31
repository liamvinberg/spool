---
"spool.page": patch
---

Leave the canvas in a background tab while an agent works and it is current when you come back to it, without a refresh.

The connection the canvas listens on now says something every fifteen seconds. A browser that stops hearing it hangs up and opens a new one, so a laptop that slept, a network that moved, and a daemon that restarted are all noticed instead of looking like a project nobody is editing. Reconnecting reads the project again rather than trusting what is on screen, because edits made while the connection was gone were never delivered.

A daemon that is actually down is retried more slowly each time instead of twice a second forever.

Coming back to the tab is now a thing that happens: frames that stopped animating start again, pictures that a throttled background tab could not take are asked for again, and a frame edited on another page keeps its debt until you go back to it.
