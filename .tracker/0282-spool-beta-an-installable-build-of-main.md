# #282 · Spool Beta: an installable build of main to test before releasing

- State: open
- Labels: ready-for-agent
- Created: 2026-11-11T08:20:21.612Z
- Updated: 2026-11-11T08:20:21.612Z

## What Liam wants (task 590, 2026-11-11)

"i just want a better way to test. Like a 'staging' way for us to test, cause now i often just without testing things ship and notice things after." "a 'beta' release build ... i only like release versions to prod when i test them, but without having to like use the dev version via devobee, i actually download etc, and install, and doesnt need to have a blue accent, maybe just the application logo but like inside of spool it can look the same." Experiments such as presentations (`deck`) should simply be on in it.

## What was decided

A second Mac app, **Spool Beta**, installed beside Spool. It is main, installable: GitHub builds, signs and notarizes it on every push to main, it updates itself from its own feed, and each build is announced in Discord. Releasing to everyone stays exactly as it is: merging the changesets release PR. The beta is what Liam uses before he merges it.

1. **Own identity.** App id `page.spool.mac.beta`, product name `Spool Beta`, its own app icon: the same logo, tellable from Spool's in the Dock at a glance, and not the blue of a dev lane (blue already means a checkout lane, `LANE` in `desktop/src/main.ts`). The menu bar item should be tellable too, since both apps can run at once. Inside the window it looks exactly like Spool. The name is Beta, not Stage: "stage" is already the deck's stage and an experiment's stage in this codebase.
2. **Own state.** State dir `~/.spool-beta`, port 7768 (7766 is Spool, 7767 the checkout, 7788 the main lane on devobee), both still overridable by `SPOOL_DIR` and `SPOOL_PORT`. Decided because the app adopts whatever daemon `daemon.json` in its state dir names and replaces an older one (`desktop/src/daemon.ts`): on shared state the two apps would swap daemons under each other. It starts clean: Liam signs in once and gets his team projects from Home. Nothing is copied from `~/.spool`, and it never reads or writes there.
3. **Built from main, not from npm.** The beta bundles the checkout it was built from (`SPOOL_TARBALL` in `desktop/scripts/bundle-cli.sh` already allows it). No beta is ever published to npm and no dist-tag is added.
4. **Every push to main whose CI passed**, in a workflow of its own (`.github/workflows/beta.yml`), `macos-15`, only on `liamvinberg/spool`, a newer push cancelling an older run. The repo is public, so the runner is free.
5. **Its own feed.** Everything under the prefix `beta/` in the `spool-releases` bucket: `https://updates.spool.page/beta/latest-mac.yml`, the zip and blockmap, and `https://updates.spool.page/beta/Spool-Beta.dmg` as the link that never moves. The app checks it the way Spool checks its feed. Keep the newest five builds and delete older ones, so the bucket does not grow by 175 MB a push. No GitHub release for a beta.
6. **A version that orders.** Every beta's version must rank above every earlier beta's for the updater, must never equal a released version, and About must say the commit it was built from. How (a prerelease suffix on the next version, a changesets snapshot) is yours; `desktop/src/version.ts` refuses suffixes today, and the daemon leaves versions it cannot rank alone.
7. **Experiments on.** In a beta build every experiment in `src/settings/experiments.ts` defaults on (`experimentDefault`), still switchable off in Settings. A released build's defaults do not change.
8. **Announced in Discord.** Each finished build posts one message to a channel `beta` in the spool category (make it): the version, the subjects of the commits since the last beta, and the download link. Posted by the workflow through a Discord webhook kept as a repo secret, so no agent run is spent per build.
9. **Asks before upgrading a project.** A separate state dir does not protect a project both apps open: a build with a newer `canvas.json` format rewrites the project's files (`src/daemon/migrate-frame-names.ts`) and raises a team project's format, after which released Spool is paused as too old. In a beta build that migration never runs by itself: the project says it will be upgraded, that released Spool cannot open it until it updates, and waits for a yes. Smallest honest form; if it turns out large, message task 590 before building it.

## Turned down

- **One app with a beta switch on shared state**: a beta that writes something the release cannot read breaks the real setup, and the daemon adoption above.
- **Using the main lane on devobee or a dev checkout**: what Liam has today and does not want.
- **Building only on demand**: he wants it always current without thinking about it.
- **Attaching the dmg in Discord**: about 175 MB, over Discord's limit. A link.
- **The staging cloud (`beta.spool.page`)**: the beta talks to spool.page like Spool, so Liam tests on his real team projects.

## The risk, and a second review

A miss here reaches every installed Spool. Beside the standard review, ask for a second one by an Opus reviewer (`model: anthropic/claude-opus-5-5:high`) on exactly these:
- The beta job can never write a key the released app reads: `latest-mac.yml`, `Spool.dmg` and `Spool-*` at the bucket's root. Its deletes can only touch `beta/`.
- A released build is unchanged: with no channel set, the app id, name, icon, `~/.spool`, 7766, the feed URL, the experiment defaults and the migration behave byte for byte as today. `desktop/scripts/build.sh`, `package.sh`, `bundle-cli.sh` and `electron-builder.yml` serve both, so every new knob defaults to today.
- The signing and notary secrets are reachable only from pushes to main on this repo, never from a pull request.
- Spool Beta never installs or replaces `/usr/local/bin/spool`, and does not claim `.spool` files over Spool.

## Leave alone

- `.github/workflows/publish.yml`: leave it byte for byte. Repeat the signing steps in `beta.yml` rather than sharing them; unifying is a later cleanup.
- npm publishing, changesets, the release PR flow, spool-cloud.
- **Do not merge before `v0.55.0` is released** (`gh release view v0.55.0`, and `https://updates.spool.page/latest-mac.yml` naming it). Task 557 is releasing it and asked that nothing near the release pipeline lands first. Building and testing on your branch meanwhile is fine.

## Where to start

`docs/releases.md` and `desktop/README.md` are the truth for how releasing works; update both. `.github/workflows/publish.yml` (the `dmg` job is the model), `desktop/electron-builder.yml`, `desktop/scripts/`, `desktop/src/main.ts` (`LANE`, userData, the single-instance lock), `desktop/src/daemon.ts` (state dir, port, adoption), `desktop/src/updates.ts`, `desktop/src/version.ts`, `src/settings/experiments.ts`. A push-triggered workflow runs from the pushed branch's own file, so the job can be proven on your branch before main has it.

## Done when

- A beta built by the workflow from main is downloaded on the m1 from the link in the Discord message, opens with no Gatekeeper warning, and runs beside Spool: two icons, two menu bar items, separate state, Spool untouched.
- Decks and the other experiments are on in it without touching Settings.
- A second push to main produces a build the installed beta finds and installs by itself.
- After all of it, `https://updates.spool.page/latest-mac.yml` and `Spool.dmg` still name the released version.
- Opening a project whose format is older asks first.
- Proof in the report: screenshots from the m1 of both apps running and of the update offer, the two feed files' versions, and how long a build takes.
