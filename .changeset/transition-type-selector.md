---
"spool.page": patch
---

`spool skill flows` and the scaffolded `shared/transitions.css` now name the selector that actually styles one walk direction or one `data-transition` apart. A swap's direction and type ride it as View Transitions types rather than attributes on the root, so the rule has to be keyed on `:active-view-transition-type()`; plain `::view-transition-*` rules match every swap alike.
