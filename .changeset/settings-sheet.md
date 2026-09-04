---
"spool.page": minor
---

Added the settings sheet. Press the cog at the foot of the right rail, or `⌘,`, to open it. General holds history, agent permissions and update checks, each under the file it writes to. Appearance holds the look, with dark, light, and follow the system, and a theme for each look: pick one of the presets (Catppuccin, Nord, Dracula, Tokyo Night, One Dark, Gruvbox, Solarized, Rosé Pine, GitHub, Mono, and spool's own), copy the current theme as text to share it, or paste one somebody sent. Under that, an accent picker and every colour the chrome is built on, each with its own picker and hex field. A change shows on the canvas as you make it, and Reset to spool's takes every moved colour back out of the file. `PUT /api/settings` now also takes `{ "writes": [...] }` so a theme lands as one write. Nothing chosen here reaches inside a frame.
