---
"spool.page": minor
---

Move between frames without leaving them. Inside a live frame, ⌥ arrows (or ⌥ H J K L) open an overview of the frames around it, and letting go of ⌥ enters the one you picked; holding ⌥ alone shows the same overview. ⌘⌥ arrows step straight to the neighbour, even from a text field. ⌘] and ⌘[ walk along the threads and back, with ] again choosing the next branch at a fork, and one click on another frame enters it. A frame that handles ⌥ itself keeps the key by calling preventDefault, and `spool check` notes frames that read it.
