---
"spool.page": patch
---

Spool now finds the Tailwind classes a frame uses with a scanner of its own, in place of Tailwind's native one, so the same scan can run anywhere a frame is compiled. Every frame gets the same stylesheet as before, and the install no longer carries Tailwind's native scanner.
