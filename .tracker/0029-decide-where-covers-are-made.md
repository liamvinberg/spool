# #29 · Decide where covers are made

- State: closed
- Labels: wayfinder:grilling
- Parent: #23
- Blocked by: #28
- Created: 2026-10-18T17:43:55.560Z
- Updated: 2026-10-18T17:43:57.868Z
- Closed: 2026-10-18T17:43:57.868Z

A decision with Liam, once the booth spike has numbers from Spool's own canvas and the Mac app.

## The options

- **Booth only.** The daemon makes every cover. The canvas stops borrowing frames for pictures: causes 2 and 3 of the lifecycle (`picture missing`, `picture wrong`), the errand cap, the arrival waits and the SVG capture route all go, which is the largest deletion on offer. The shim's capture survives only if exports still need it (export fidelity is settled elsewhere and out of this map).
- **Booth first, canvas as fallback.** The canvas still photographs when the booth cannot run (no headless shell on the machine, booth crashed). Two capture paths, against liamvinberg/spool#107's one-codepath rule.
- **Canvas only, with the quick wins.** No new process; covers stay 3 to 5 times slower and blank for rAF-driven frames.

## What the decision needs to settle

- Browser mode (npm package, no Mac app): the headless shell is already pinned for `spool shot` and the healer; is starting it for covers acceptable on every machine, and what happens on one without it.
- The Mac app: hidden Electron window or the same headless shell.
- When the booth runs: on every source change, debounced how, and whether it runs for pages nobody has open.
- What an agent sees: `spool shot` and covers from one path.

Blocked by the booth spike.

*From Linear DEV-128.*

Related: #30, #14

Plane: SPOOL-29

## Comments

### agent, 2026-10-18T17:43:57.862Z

**Liam, 2026-10-02:** **Verdict: booth only.** Decided by the agent on 2026-10-02 after Liam handed the technical calls over ("you do recommendations here, I don't know the best technical things"). Evidence: research 114.

What is settled:

- **Who makes covers.** The daemon, always. The canvas never photographs a frame again. No fallback path (liamvinberg/spool#107's one-codepath rule): a fallback would keep the whole errand machinery alive for one case, a machine without the browser, and that case is already handled by fetching it.
- **Which browser.** The pinned headless shell `spool shot` already uses, launched with GPU rasterization on (`--enable-gpu --use-angle=metal --ignore-gpu-blocklist` on macOS), because SwiftShader draws `backdrop-filter` mirrored and under-draws WebGL. Fetched on first need without blocking the daemon; frames show their placeholder until it lands.
- **The Mac app.** The same headless shell, not hidden Electron windows. One codepath beats saving a one-time 90 MB fetch, and hidden windows share the GPU process with the canvas window: a tall frame past 16,384 device pixels kills that process (research 114, section 3).
- **When it runs.** On every change-hub event that changes a picture (a frame's source, a shared file it imports, a size change), and for any frame read without a cover, for every project, open or not. One queue: frames on screen in an open canvas first, then the open page, then the rest. An edit jumps the backlog; a frame edited while in a tab is shot once more when the tab frees.
- **What a cover shows.** The frame's first screen in its default scenario, never where a person left it. Covers are addressed by source hash: a cover that depended on session state would give one hash two pictures. Agents, shares and the player see the first screen too.
- **How long it waits.** The shim's own settle (900 ms budget) in an isolated world, plus a hard deadline outside the page for frames too busy to run timers. No extra 1.5 s wait for staged reveals: it would cost about 70 s per pass on Spool's canvas for a few frames.
- **Colour scheme.** The booth renders the colour scheme the canvas is showing, so a cover matches the live frame it fades into.
- **Memory.** A fresh page every 20 covers and the browser closed when the queue drains (research 114, section 4: 0.66 GB a pass instead of 3.5 to 4.8 GB).
- **One path for agents.** `spool shot` and covers share the booth's browser and settle.
- **Deleted.** In `lifecycle.ts`, causes 2 and 3 entirely (errands, their cap, picture tries, staleness, `markPictureWrong`, `refreshing`, the capture waits); the cover PUT and error routes and their callers; the one-at-a-time healer. The shim's capture route stays only for exports, whose fidelity is settled elsewhere.
- **A small tier.** The booth also writes a small picture beside each cover for the GPU layer; its size is decided with #30.

Build follows as its own work, in parallel with the picture layer.
