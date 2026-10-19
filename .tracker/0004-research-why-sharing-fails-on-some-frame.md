# #4 · Research: why sharing fails on some frames

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.337Z
- Updated: 2026-10-18T17:43:57.177Z
- Closed: 2026-10-18T17:43:57.177Z

## Question

Liam saw right-click share fail on some frames, and sharing must always work. Why does it fail, on which frames, and what stands between each kind of failure and "always works"? Run the local export against every frame on Spool's own canvas without uploading, read the refusal rules and the cloud validator, check the installed instance's logs for the failures Liam hit, and count frames per cause: authoring rule, exporter bug, impossible when hosted (terminal frames, local-only files), size limit, cloud rejection, or a website that exports but doesn't play.

Spike, run on Opus. Report: `spool-cloud/research/103-share-failures/`.

*From Linear DEV-103.*

Related: #62

Plane: SPOOL-4

## Comments

### agent, 2026-10-18T17:43:57.165Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/103-share-failures/` (commit `971e2a3`), with scripts, fixtures and evidence. Spike run on Opus against every frame of Spool's own canvas and five other projects.

Almost every failure comes from one place: core's navigation check, which runs before anything is built or uploaded. It requires every frame reachable from the shared one to be knowable from source, and it refuses 631 of 752 frames on Spool's canvas (notaker 24/25, hunch 69/72, securesend 95/127, tuck 7/70, chamfer 512/614).

- **244 of Spool's refusals contain no navigation at all.** The check counts every `<motion.div>`, `<X.Provider>`, `<DialogPrimitive.Root>` and every `{...rest}` spread as a destination it can't see. `motion` is set up by Spool's own `init`. One `{...rest}` in notaker's shared Button blocks 20 of its 25 frames.
- **297 have real navigation the check can't follow**, mostly a destination passed down through two components (`coffee-screens.tsx:297` alone blocks 276 frames). This refusal is what [liamvinberg/spool-cloud#160](https://github.com/liamvinberg/spool-cloud/issues/160) asked for; its remedy is a `links` export per frame, which would clear 662 of 752. The catch: a computed destination missing from it only shows when a viewer clicks ("Navigation to "member" is not included from this frame.").
- **90 frames import shaders with `?raw`.** They render on the canvas, but the check and the exporter both refuse them, and the exporter's copy step drops the imported file. The error tells the person to fix navigation, which is wrong.
- **Past the check, everything worked.** All 121 passing frames built, passed the current Cloud validator and played in headless Chromium without errors, as did 97 of 105 sampled with the check switched off (the 8 others were `?raw`).
- **The Cloud validator from before `2a9f9eb` rejects every frame that sits on a page** ("invalid manifest"), because core v0.25.0 names frames by page path. Whether `2a9f9eb` is deployed is unverified.
- **The Share panel shows only the first problem** (median 11 per refused frame), with no file or line, and calls non-navigation JSX a "navigation destination".
- Terminal frames no longer exist: they were removed in v0.16.0 on 2026-09-03.

Not found: the failures Liam actually hit. `~/.spool` (installed 0.23.0) has no share errors logged and no publication state. Also unverified: pixel fidelity against the canvas, walks triggered by `ui.go` click handlers, Cloud quotas.

The fixes are ordinary bugs in the published product and belong in public GitHub issues, proposed to Liam before posting.

### agent, 2026-10-18T17:43:57.170Z

**Liam, 2026-10-02:** Fixes for the three core bugs this report found are now on `liamvinberg/spool` main (pushed 2026-10-02):

- `1796c55b` publication: read member tags and prop spreads as ordinary jsx
- `e165a7fb` publication: share frames that import a shader with ?raw
- `c31a95c3` publication: describe each readiness problem in its own words
- `29528d4d` share: list every problem with its file and line
- `84ebfe95` publication: keep navigation hidden behind member tags or unread data-go refused (fixes two gaps the code review found)
- `8c545598` share: key each listed problem by its place and wording

Changesets (all patch): `share-ordinary-jsx`, `share-raw-shaders`, `share-problems`.

**Before and after.** Both runs used the report's probes, on the same snapshot of `design/` taken 2026-10-02 (754 frames).

|  | Before | After |
| --- | --- | --- |
| Ready | 123 | 457 |
| Refused | 631 | 297 |
| Refused for unreadable source (`?raw`) | 90 | 0 |
| Diagnostics per refused frame, median (max) | 11 (47) | 1 (9) |

- **What became ready:** 334 frames. 244 had only non-navigation JSX and 90 were the `?raw` frames, exactly the report's classes A and C. No frame that passed before is refused now.
- **What is still refused:** 297 frames, the report's class B. Every one points at a real `data-go`/`ui.go` site whose destination can't be worked out, mostly `coffee-screens.tsx:297`, `shell.tsx:50`, `context-menu.tsx:54` and `canvas-screen.tsx:122`. Three point at `onGo={ui.go}` and now say "ui.go is passed on as a value".
- **Export:** all 334 newly ready frames build through `buildWebsite`, and the current Cloud validator accepts every one.
- **Playback:** 40 were written (20 `?raw`, 20 others) and played in headless Chromium. All 40 rendered with no banner, page error or failed request, and all 20 `?raw` sites carry their shader source.
- **Fixtures:** `member`, `spread`, `raw` and `raw-links` now pass `check` and `build`. `forward2`, `computed`, `asvalue`, `missing` and `broken` are still refused, each with its own message and file:line.

**The rule now.** Member tags and spreads count as ordinary code. A member tag is followed to the component it names, and its props are read the same way a plain tag's are.

`data-go` is read wherever it is spelled:
- a JSX attribute
- a literal `"data-go"` object key
- `setAttribute("data-go", …)`
- `dataset.go`

Any other spelling refuses the share with a precise message: the bare name `"data-go"` used indirectly, a dataset write under a computed name, `Object.assign(el.dataset, …)`, or markup carrying `data-go` handed to `innerHTML`/`__html`.

**Bounds that remain:**
- A member tag naming a component that is imported from another project file leaves that prop's set open, so it is refused.
- Markup read back from the page is not followed.

The Share panel now lists every problem once, with its file:line and the frames that reach it.
