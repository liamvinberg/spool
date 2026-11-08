# #227 · Client sharing: folders as shares, mirrors and publishing

- State: open
- Labels: enhancement
- Created: 2026-11-07T10:32:02.866Z
- Updated: 2026-11-07T17:44:35.071Z

Grilled with Cata and mojo in task 473 (thread "i want for the list to be copied into the viewer"). Video of the pattern: video-library `videos/spool-client-folders`. Artifact on copies vs mirrors: https://devobee.tail9e5223.ts.net/spool/client-folder-shortcuts

## Decisions
1. **Publishing is a choice per share**: "Automatically" (today's settle: the agent's turn ends, or 30 s quiet) or "When I publish". Automatic stays the default; solo work never sees it.
2. **A share follows its folder**: pages added under a shared folder join the share at their next settle or publish, as a whole-project share does today. Today a folder share is a fixed page list.
3. **The shared folder is the client's whole view**: it opens on the shared folder as its top, with no parent names, no project path and no full frame paths in the player bar.
4. **No shortcut feature.** A frame mirrors another by code: a one-line frame (`export { default } from "../../../app/checkout/frame"`) with its own frame.json size. Shares keep a frame's last compiled version, so a deleted original never breaks a client.
5. **One frame can be shared alone**: right-click a frame, Share…, a share of that screen opening played.
6. **The client-folder habit (`prototypes/<client>/`, `shared/`, anything) lives in the spool-design skill and docs**, never created or required by spool. Any folder can be shared.
7. **Several shared items sit side by side at the client's top**, each by its own name (Drive's "Shared with me"); two with one name get their parent's name in grey. One item opens straight into it.
8. **Publish sends the whole share's changes at once**, after a list of what goes out: each changed screen by name (`changed` / `new` / `removed`), grouped by folder, a row moving the canvas to that frame. No before and after, as Figma's library publish (decided in #233, 2026-11-07). No picking single screens.
9. **Each share publishes on its own**, even over overlapping folders.
10. **The agent publishes only when a person asks** in words; it may say "3 changes ready for Scania".
11. **One step back** after a publish. Better canvas-wide version history is its own topic.
12. **Shared marks live in the pages rail only**: a mark on the highest shared row (a folder shared whole marks only the folder), a dot for unpublished changes. Nothing on the canvas.
13. **Editors and admins publish**, the same people who make and stop shares.
14. **The client sees an "updated" mark** on screens a publish changed, until opened (reuses spool#184's marks).
15. **Modes switch any time**; switching to automatic sends what was waiting.
16. **Links that leave a share**: nothing unless a shared screen walks outside it, then one quiet line ("`cart` walks to 2 screens outside the share") with Add them, at the foot of the publish list and in the share's detail (#233).
17. **Mirrors are code, documented**: the skill teaches them; spool re-aims mirrors when their original moves (today `import-aim.ts` re-aims only the moved folder's own imports, and calls reaching into another frame's folder "outside the contract"), and the rail says "mirror of app/checkout".
18. **Commenting in the played frame** is explored first (4 designers), then built.

19. **Publish lives in the bar** (#233, take `share-beside`): a Publish button with the waiting count beside Share, only while a share waits; with two shares waiting it asks which first. Share shrinks to the list of shares, everything rarer one step in (link, how it updates, QR behind a button, who opened it, Stop sharing). Named people take several emails as chips (Enter, comma or paste).

## Build order
Comments in the player, then share follows its folder plus the client's top, then single-frame shares, then publishing. Mirrors and the skill docs go in parallel.
