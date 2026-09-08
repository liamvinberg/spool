---
"spool.page": minor
---

Edit appearance and typography in the properties rail and spool writes your source. Colors, sizes, corner radii, borders, opacity, transforms, filters, gradients and text properties become real class changes in the file that owns them, each with one save and one Undo.

Typography and Appearance are grouped together, and letter spacing or border width can be added when a design needs one. Color menus show which choice is an authored reference and which is a value of its own, keep project and default colors searchable, and remove a declaration without inventing a token for it. Every corner radius can be edited on its own.

An edit made under a variant writes that variant. Removing a whole scope, taking off a raw class, or changing several properties at once is one change with one save and one Undo, and cancelling while the read is still open writes nothing.

Every frame that shares the edited source shows the result, and the rail says what each use actually rendered instead of assuming they match. An uncertain save can be checked or retried, and recovery stays until every affected use verifies.

While an edit is in flight the rail previews it immediately, and if the file has moved on it discloses the current declaration rather than overwriting it. Inline styles it can read supply context for a class edit; the ones it cannot read are refused rather than guessed.

Creating, changing and removing a property all reverse through the same history, including properties that started with no class at all.
