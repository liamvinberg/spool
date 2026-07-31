---
"spool.page": patch
---

The agent asks before mutations outside design/, and for nothing else.

Every shell command, web search and out-of-project read used to raise an approval, which buried the one ask that matters. The harmless tools are now allowed outright — reading anywhere, fetching pages, searching the web — and the shell never asks at all: commands run inside Claude Code's own sandbox where the OS confines their writes to the project, and spool's own verbs run outside it, because they are read-only by construction and Chrome cannot launch inside it, so a shot is just a shot. Editing files outside design/ asks the human first, exactly as before.
