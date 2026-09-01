---
"spool.page": patch
---

On Linux, a frame stopped updating the canvas after its first edit. The daemon watches `design/` for changes, and Linux has no recursive watch of its own — Node emulates one by watching every individual file. An inotify watch belongs to a file's inode rather than to its name, and every write spool makes replaces the inode behind the name, so the first edit to a frame threw away the watch that reported it. Nothing after that was ever announced: an agent's work, a hand edit put back, a file changed in your editor.

The daemon now watches folders rather than files where the OS does not walk the tree itself. A folder outlives the names inside it, so a frame keeps reporting for as long as its folder is there. macOS and Windows are unchanged, and use the recursive watch the OS provides.
