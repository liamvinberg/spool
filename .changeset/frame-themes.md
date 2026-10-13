---
"spool.page": minor
---

A frame can now import a theme of its own, so two looks can live side by side in one project. A theme is a stylesheet that imports `tailwindcss`. A frame that imports one compiles against it instead of `shared/tokens.css`, and gets the theme's fonts instead of `shared/fonts.css`, on the canvas, in the player and in an export. Frames without a theme work exactly as before. See `spool skill styling`.
