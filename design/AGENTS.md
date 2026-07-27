# spool canvas

This folder is a [spool](https://spool.page) project: live TSX frames on an infinite canvas — agents author the files, humans arrange and play them.

Run `spool skill` before working here. It is the complete contract: if it isn't in there, spool doesn't do it. Topics: `spool skill frames|flows|scenarios|mock|styling|verbs`.

- A frame is born by writing `frames/<page>/<name>/frame.tsx` default-exporting one React component — no registration, no `spool new`. Variants are `--`-named siblings (`checkout--empty/`).
- The one law: never write app-owned files — `canvas.json` and `.spool/` are spool's.
- Commit completed design work atomically before handoff.

## The pages

Every frame lives on a page; the root page stays empty on purpose.

| Page | What it holds |
| --- | --- |
| `app` | Spool as it shipped — home, the canvas, its context menu, the empty project, the player, the system sheet. Six frames, the core and nothing else. Walk it end to end: it is a working model of the product. |
| `site` | spool.page (#31), unbuilt. The hub and its four sections. |
| `directing` | The directing toolset (#56, #65), unbuilt. `directing--annotate` is the canonical frame the spec is written against. |

`app` is the baseline. A new prototype starts by copying the frame it changes,
not from nothing — so the thing being proposed is legible as a diff against
what exists.

Keeping it honest is the whole job. Every frame on `app` must match the code
in `src/ui/` and `src/runtime/`; when a design ships, the frame here becomes
what shipped. Read the implementation before trusting a frame — that is how
"design mode" survived here for months after select became the only pointer
tool. What the chrome is today: one 44px bar (brand lockup, project tabs, "+",
then threads toggle and zoom), the Pages rail at 248px, the Inspector rail at
300px with its elements and connections tabs, and the tool bar floating over
the bottom of the viewport. No mode switch. Play lives on the selection.

Explorations are deleted once their decision ships — git history is the
archive, and `git log --diff-filter=D --stat -- design/frames` finds them.
