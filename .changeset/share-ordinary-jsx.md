---
"spool.page": patch
---

Sharing no longer refuses frames over ordinary code that has nothing to do with navigation. Tags like `<motion.div>` or `<Dialog.Root>` and spread props like `<button {...rest}>` used to stop a share with a navigation error. Now only a `data-go` or `ui.go` whose destination Spool can't work out stops it.
