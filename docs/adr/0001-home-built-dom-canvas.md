# Home-built DOM canvas, not tldraw

The canvas is a small owned DOM implementation, decided by a hands-on bake-off against tldraw (#9). tldraw's license was disqualifying (unlicensed builds self-terminate off localhost, which breaks the tailnet share path; commercial pricing is opaque), the home-built spike already hit the Figma-feel checklist, and spool's deliberately narrow canvas contract (frame-level manipulation only) would leave most of a library's surface unused while the sensitive parts, iframe lifecycle and overlays, benefit from owning the substrate.

## Consequences

The canvas owes its own snapping, arrow routing, and any future undo/redo command stack; a library would have shipped these. v1 undo is the delete toast only.
