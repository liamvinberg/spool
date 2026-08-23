# Spool for macOS

A menu bar app that is a daemon supervisor with four menu items on it. No window
and no webview: the canvas is a web app and stays in the browser you already have
your tabs in. What this replaces is the terminal on the way there.

It bundles a Node runtime and the published `spool.page` of its own version, so
someone who has never installed Node can download a DMG, drag it to Applications,
click Open Canvas, and be looking at their canvas. A developer keeps using the
CLI against the same daemon; nothing forks.

Apple silicon, macOS 14 or later.

## Do not also run `spool autostart`

`spool autostart` installs a launchd job that starts the daemon at login. The app
does the same thing from the menu bar. Pick one, not both: two supervisors racing
for the same port means one of them loses and says so in a log nobody reads.

If you use the app, `spool autostart off` removes the launchd job. If you prefer
launchd, the app still adopts the daemon it starts and will not start a second
one, so nothing breaks — you just have a menu bar item that supervises nothing.

## Who owns the daemon

One rule, and it is the CLI's rule seen from the other side:

- On launch the app reads `~/.spool/daemon.json` and asks the daemon it names for
  `/api/health`. An answer that names the same pid means a daemon is running, and
  it is adopted exactly as it is: not restarted, not upgraded.
- Only when nothing answers does the bundled daemon start.
- Quit stops a daemon this app started, and leaves an adopted one running. The
  pid is checked again at quit, so a daemon `spool upgrade` restarted in the
  meantime is left alone rather than killed by a stranger.

`SPOOL_DIR` and `SPOOL_PORT` are read the way the CLI reads them, which is what
lets a checkout's app and the daily one stay out of each other's way.

## Build it locally

```
./scripts/build.sh
```

That compiles the Swift binary, fetches the runtime, assembles
`~/Applications/Spool.app`, stamps the version and ad-hoc signs it. `DEST=` puts
the bundle somewhere else. The first run takes a couple of minutes; the runtime is
cached in `.build/runtime` and reused after that.

The bundle is around 245MB, most of it Node and the dependency tree npm resolves,
and the compressed DMG is around 83MB. Nothing is pruned out of the install: the
point is that the app runs the same `spool.page` npm ships, not a trimmed copy of
it that behaves differently.

What goes into the bundle, and how:

| Piece | Where it comes from |
| --- | --- |
| Version | `../package.json`, via `scripts/version.sh`, stamped into the bundle's `Info.plist` |
| Node | `nodejs.org/dist`, newest release in major 22, checked against that release's `SHASUMS256.txt` |
| Spool | `npm install spool.page@<version>` into `Resources/runtime/cli` |
| Menu bar mark | `SPOOL_MARK_PATH` in `../src/brand.ts`, copied by `scripts/mark.sh` |
| App icon | `Resources/AppIcon.icns`, drawn from the same mark by `scripts/icon.sh` |

Node's major is pinned to 22 because that is the floor in the repo's
`package.json` (`"engines": { "node": ">=22" }`). The patch is not pinned, so a
build picks up Node's security releases; `SPOOL_NODE_VERSION` overrides that when
a specific build has to be reproduced. Whatever was chosen is written to
`Resources/runtime/RUNTIME.txt` inside the bundle, along with the archive's
sha256 and the spool version.

Building a version npm does not have yet packs this checkout instead, which is
what you want when the app and the CLI are changing together. That path runs the
repo's build, so `pnpm install` in the repo root first.

Other scripts:

```
./scripts/version.sh                 the version the next build will carry
./scripts/mark.sh                    regenerate the mark from src/brand.ts
./scripts/icon.sh                    regenerate Resources/AppIcon.icns
swift test                           the offline checks
swift run spoolctl status            the daemon lifecycle from a terminal
```

`spoolctl` is a development CLI and is not in the bundle. It runs the same
SpoolKit calls the app runs, so adopt-versus-start can be checked over ssh, where
a menu bar does not exist.

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

Check for updates in the app asks this repo's `releases/latest` for its tag and
compares it. It downloads nothing and replaces nothing: the answer is a sentence
and a link. No Sparkle, no in-place auto-update.

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
