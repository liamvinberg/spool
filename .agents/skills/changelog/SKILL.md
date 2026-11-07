---
name: changelog
description: Curate spool.page/changelog after a release: name the new features, pick each week's highlights and record their clips in spool's real window. Use when a release went out, or when asked to re-record a clip.
---

# Changelog

spool.page/changelog reads three things from `main`: `CHANGELOG.md`, which changesets write; npm's publish dates; and `changelog/highlights.json`, which is yours. A release shows on the page within ten minutes without you. What you add is taste:

- `headlines`: a short name, by changeset id, for a minor whose changeset opens without a bold title (`docs/releases.md`). Two to four words, a noun phrase a person would search for: "Knobs", "Versions in History". A patch needs none.
- `highlights`: the week's one to three changes worth a large entry, each with a clip when the window can show it.
- `through`: the newest version you have curated.

## 1. Find what is new

Read `changelog/highlights.json` and the releases in `CHANGELOG.md` above its `through`. None: stop, and say so in one line.

**Done when:** you have the new releases' minors and patches by week (Monday to Sunday, Stockholm).

## 2. Name and pick

Give each new minor without a bold title a headline. Then pick highlights for the weeks the new releases fall in, keeping any already picked:

- Pick what changes how someone works: a new thing to do, a new place in the window. Not a fix, a rename or plumbing.
- Prefer a change the window can show in ten seconds.
- One to three a week; a fixes-only week gets none.

**Done when:** every new minor has a name, and each touched week has its picks.

## 3. Record each new pick

A clip is spool's real window on a small project made for it, driven by a script you write at `changelog/clips/<id>.ts` and keep, so the clip can be made again when the window changes. `changelog/clips/4d9b579.ts` is a worked example: read it first.

```sh
pnpm exec tsx .agents/skills/changelog/scripts/clip.ts changelog/clips/<id>.ts --out /tmp/<id>.mp4 --rehearse
```

`--rehearse` walks the steps in a fresh spool of this checkout and stops, leaving `<id>.start.png` and `<id>.end.png`. Look at both, fix the steps, repeat. Then drop `--rehearse` to render `<id>.mp4` (1120 wide, silent) and `<id>.jpg`, its last frame, for the poster. Each run starts its own daemon on a free port and stops it; the shared one is never touched.

- Show one thing, start to finish, in 8 to 15 seconds. The page loops it muted at 560 wide, so make the change visible at that size: a frame that changes colour beats a value in a text field.
- Aim steps by selector (`text=radius`, `[aria-label="#c8553d"]`, `role=button[name="Play"]`) rather than points, so the script survives layout changes.
- The take replays the rehearsal's inputs on a virtual clock, so the window's slow parts (a frame selected, its knobs arriving) need a `wait` after them. A take that drifts from the rehearsal needs a longer one.
- The recorder carries no modifier keys: drive a shortcut's menu item instead.
- When the window cannot show the change alone (a CLI verb, a share link's page), make a frame on the canvas that does and record it with `pnpm -s dev record`.

Extract stills across the take with ffmpeg and look at them before keeping it. A take that does not show the change is worse than none: keep the highlight without a clip.

**Done when:** every new pick has a clip you have watched, or a reason it has none.

## 4. Publish

Name each file `<id>-<first 8 of its sha256>.mp4` and `.jpg`, so a new take never meets an old one in a cache, and upload both to the `spool-changelog` R2 bucket under `changelog/` with `cache-control: public, max-age=31536000, immutable`; the run that sent you here says how. Add `{ "id", "clip", "poster" }` with those names to `highlights`, set `through`, and commit `changelog/` alone to main (`changelog: curate 0.51.0`).

Report the week's picks in one line each, the clip linked as `https://media.spool.page/changelog/<file>`, so a person can say which to drop.

**Done when:** main has the commit, and spool.page/changelog shows it within ten minutes.
