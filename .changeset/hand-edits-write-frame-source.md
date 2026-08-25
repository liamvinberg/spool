---
"spool.page": minor
---

Hands can now change frame source, one small edit at a time. The canvas sends a typed edit, such as a class token, a string, an element's text, or an element removed, and spool parses the file fresh, checks the edit can be made honestly, and replaces exactly those characters. The rest of the file comes back unchanged, so a hand edit reads as an ordinary working tree change.

An edit that cannot be made honestly is refused with its reason rather than half applied: a computed class, an inline style, an element a shared file defines, words that come from data. An edit formed against a file that has changed since is refused too, so an agent and a person can work in the same file at the same time. Every edit stores the edit that puts it back, on the undo stack the canvas already keeps for moving frames.
