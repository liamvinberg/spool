# Spool for macOS

A window with the canvas in it, and a menu bar item for when the window is
closed. The daemon already serves the whole UI over HTTP, so the app is a shell
around it rather than a second implementation of anything.

It is Chromium, not a native web view: the canvas draws frames as transformed
iframes and WebKit renders those blurry, so a WKWebView window would show a worse
canvas than the browser does. Chromium is the point of the window.

It bundles the published `spool.page` of its own version, so someone who has
never installed Node can download a DMG, drag it to Applications, open it, and be
looking at a canvas. A developer keeps using the CLI against the same daemon;
nothing forks.

Apple silicon, macOS 14 or later.

## Do not also run `spool autostart`

`spool autostart` installs a launchd job that starts the daemon at login. The app
starts one too. Pick one, not both: two supervisors racing for the same port
means one of them loses and says so in a log nobody reads.

If you use the app, `spool autostart off` removes the launchd job. If you prefer
launchd, the app adopts the daemon it finds and will not start a second one, so
nothing breaks — the app just supervises nothing.

## Who owns the daemon

One rule, and it is the CLI's rule seen from the other side:

- On launch the app reads `daemon.json` in the state directory and asks the
  daemon it names for `/api/health`. An answer that names the same pid means a
  daemon is running, and it is adopted exactly as it is: not restarted, not
  upgraded.
- Only when nothing answers does the bundled daemon start, as a child process
  running under Electron's own executable with `ELECTRON_RUN_AS_NODE=1`. That is
  plain Node, so the native addons in spool's dependency tree load into that
  process rather than into the one drawing the window, and a daemon that crashes
  cannot take the window with it.
- Closing the window leaves the app in the menu bar and the daemon running. Quit
  stops a daemon this app started and leaves an adopted one alone. The pid is
  checked again at quit, so a daemon `spool upgrade` restarted in the meantime is
  left alone rather than killed by a stranger.

`SPOOL_DIR` and `SPOOL_PORT` are read the way the CLI reads them, which is what
lets a checkout's app and the daily one stay out of each other's way:

```
SPOOL_DIR=~/.spool-lane SPOOL_PORT=7778 release/mac-arm64/Spool.app/Contents/MacOS/Spool
```

## Why this folder is not in the repo's pnpm workspace

`desktop/` carries its own `pnpm-workspace.yaml`, which makes it its own pnpm
root, and its own lockfile. The alternative was to add it to the repo's
workspace, and the cost of that is that every root `pnpm install --frozen-lockfile`
— every CI job, every fresh checkout, every contributor who will never build a
DMG — downloads Electron. This way the root install and the published package are
exactly what they were: the root lockfile does not mention Electron and
`spool.page` has no idea this folder exists.

The price is one extra install step, `pnpm --dir desktop install`, which the two
CI jobs that need it run for themselves.

## Build it locally

```
./scripts/build.sh
```

That compiles the TypeScript, fetches the published spool package, and hands both
to electron-builder, which assembles `release/mac-arm64/Spool.app` and ad-hoc
signs it. `SIGN_IDENTITY` passes a real Developer ID instead.

```
./scripts/package.sh          the dmg, signed, and notarized if the notary keys are set
./scripts/version.sh          the version the next build will carry
./scripts/icon.sh             regenerate the app icon and the menu bar mark from src/brand.ts
pnpm typecheck                the type gate
pnpm test                     the offline checks
pnpm smoke                    one real Electron launch: the main module loads, the menus build
pnpm start                    run the app straight out of this folder, unpackaged
```

The bundle is around 413MB and the compressed dmg around 168MB. Most of that is
Chromium; the rest is the spool package with the dependency tree npm resolves for
it. Nothing is pruned: the point is that the app runs the same `spool.page` npm
ships, not a trimmed copy that behaves differently.

What goes into the bundle, and how:

| Piece | Where it comes from |
| --- | --- |
| Version | `../package.json`, via `scripts/version.sh`, passed to electron-builder as `extraMetadata.version` |
| Node | Electron's own binary, under `ELECTRON_RUN_AS_NODE=1`. Electron 43 carries Node 24, above the repo's `>=22` floor |
| Spool | `npm install spool.page@<version>` into `build/cli`, by `scripts/bundle-cli.sh` |
| App icon and menu bar mark | `SPOOL_MARK_PATH` in `../src/brand.ts`, rendered by `scripts/icon.ts` and committed under `assets/` |

Building a version npm does not have yet packs this checkout instead, which is
what you want when the app and the CLI are changing together. That path runs the
repo's build, so `pnpm install` in the repo root first.

`shim/electron-argv.js` is the one piece of glue worth knowing about: Electron's
node keeps `process.versions.electron` set, Commander reads that field to decide
argv has no script path in it, and the bundled cli would otherwise refuse `serve`
as an unknown command. The shim rides in `-r`, so anything the cli spawns of
itself inherits it through `process.execArgv`.

## The release

One version number for everything: the npm package, the git tag, the daemon's
`/api/health`, the `spool.page` inside the bundle, and
`CFBundleShortVersionString`. Changesets picks it, in the repo root's
`package.json`. Nothing in this folder ever writes a version, which is why there
is no `version.sh 1.2.3` here that bumps and tags.

So a release is the release described in `docs/releases.md`, with one job on the
end. `publish.yml` cuts the tag, publishes to npm, and then the `dmg` job checks
out that tag, builds the app, signs it with the repo's Developer ID certificate,
sends it to Apple for notarization, staples the ticket, and attaches two files to
the GitHub release:

- `Spool-X.Y.Z.dmg`, the one to keep and check a hash against
- `Spool.dmg`, the same file under a name that does not move, so
  `releases/latest/download/Spool.dmg` is a link that never needs editing

The `dmg` job runs after the npm publish and depends on it, because the app
installs `spool.page@<version>` from the registry. That ordering is also the
safety: a DMG failure cannot retract anything, since npm already has the release
and the GitHub release already exists. Rerun it the way a refused publish is
rerun, with `gh workflow run publish.yml -f tag=vX.Y.Z`.

Check for Updates asks this repo's `releases/latest` for its tag and compares it.
On a newer release it updates in place: electron-updater downloads the release's
zip, checks it against `latest-mac.yml`, and hands it to Squirrel.Mac, which
verifies the new bundle's signature against the running one's and swaps it on
quit. The feed is the release itself — `app-update.yml` inside the bundle names
this repo, `latest-mac.yml` beside the dmg names the zip — so there is no update
server. A checkout build has no feed file and falls back to opening the release
page.

Two things about that path cost a release to find out, and `src/updates.ts` says
both at length. Squirrel cannot be handed a file, so electron-updater downloads
the zip and then serves it to Squirrel over loopback; `autoInstallOnAppQuit` is
what makes Squirrel ask for it, and with it off the download completes having
installed nothing. And every failure arrives as an `error` event, which on an
emitter with no listener throws out of the main process. `src/updates.test.ts`
pins both, against a stand-in for electron-updater.

## Signing, for a fork

The `dmg` job needs five repository secrets, and without them it fails at the
first step that needs one rather than shipping a DMG Gatekeeper refuses:

| Secret | What it is |
| --- | --- |
| `MACOS_CERTIFICATE` | a base64 `.p12` holding a Developer ID Application certificate and its private key |
| `MACOS_CERTIFICATE_PASSWORD` | the password that `.p12` was exported with |
| `NOTARY_KEY` | a base64 App Store Connect API `.p8` key |
| `NOTARY_KEY_ID` | that key's id |
| `NOTARY_ISSUER_ID` | the issuer id of the team the key belongs to |

Getting those is an afternoon of Apple's website the first time. There is a
wizard:

```
./scripts/setup-signing.sh
```

It generates the certificate signing request with `openssl`, walks you through
Apple's pages, pairs the certificate Apple issues back with the private key that
never left your machine, imports the result into a throwaway keychain to prove it
is a valid identity before anything is stored, checks the notary key against
Apple by asking for the team's notarization history, and only then sets all five
secrets on the repository with `gh`. Nothing is written to a file: the values go
from your clipboard to GitHub's secret store and nowhere else.

The certificate is issued by the Account Holder of an Apple Developer team and
nobody else, so the wizard has a branch for when that is not you: it writes the
message to send and tells you which file to attach.
