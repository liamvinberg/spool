# Contributing

Thanks for looking. Spool is a small, opinionated project with one maintainer, so this document is mostly about saving you wasted effort.

## What gets merged

Likely:

- Bug fixes, especially with a failing test
- Platform quirks: Linux and Windows support, shell differences, Node version issues
- Performance work backed by a measurement
- Documentation fixes, including anything in this file that turned out to be wrong
- Missing standard behavior in a command that already exists

Unlikely without discussion first:

- New canvas interactions, tools, or UI changes. How spool feels is the product, and those decisions are made deliberately.
- New frame kinds. There are two, `frame.tsx` and `term.tsx`, and `CONTEXT.md` calls the terminal frame "the second and final frame kind" on purpose.
- New dependencies. `design/` is dependency-free by construction and the core package is deliberately small.
- Anything that changes the shape of `design/` on disk. That layout is a compatibility surface.

If you are not sure, open an issue before writing code. An issue costs you five minutes; a rejected pull request costs you an afternoon.

## License

Spool is [MIT](LICENSE.md). There is no CLA to sign and no sign-off to remember: your contribution is MIT like the rest of the project, and you keep the copyright on what you wrote.

If your idea is on the "unlikely" list above and you still want it, forking is a fine outcome rather than a consolation prize. Rename it, rework it, make it yours.

## Development

Node 22+ and pnpm.

```sh
pnpm install
pnpm dev <command>    # the checkout CLI
```

`pnpm dev` runs your checkout against its own state directory (`~/.spool-dev`) and its own port (7767), so it never touches a real spool install running on 7766. Every subcommand works the same as the published CLI:

```sh
pnpm dev init         # scaffold design/ in the current directory
pnpm dev serve        # start the daemon
pnpm dev open <path>  # register a project and open its tab
```

The canvas wants Chrome. WebKit renders transformed iframes blurry, which is a browser limitation rather than something spool can work around.

### Before you open a pull request

```sh
pnpm test         # vitest
pnpm typecheck    # three tsconfigs: node, runtime, ui
pnpm check        # biome
```

All three must pass. Run `pnpm test` rather than a single file when your change has behavioral reach beyond one module.

Two things about the edit loop:

- **UI changes.** Every dev daemon watches `src/ui/` and rebuilds the canvas automatically — the auto-started one included, since it respawns through the same dev entry. Reload the tab to pick a rebuild up; `pnpm build:ui` exists for building without a daemon.
- **Daemon, CLI, and runtime changes.** These run straight from source, so there is nothing to rebuild — but nothing restarts the daemon for you. After editing `src/daemon/`, `src/cli.ts`, or `src/runtime/`, run `pnpm dev stop`; the next verb starts a fresh daemon and the canvas reconnects on its own.

Your checkout runs fully isolated from an installed spool: the dev entry pins `SPOOL_DIR` and `SPOOL_PORT`, so it keeps its own project registry on its own port, and the canvas favicon turns blue instead of red. You never need to `npm link` anything.

To drive the checkout from another project — dogfooding unreleased spool on real design work — put a one-line shim on your PATH and use it where you would use `spool`:

```sh
#!/bin/sh
exec "$HOME/path/to/spool/node_modules/.bin/tsx" "$HOME/path/to/spool/src/dev.ts" "$@"
```

It stays on the dev instance and keeps your working directory, which is how the verbs resolve which project you mean. (`npm link` would run the built `dist` against the installed spool's state — the one pairing to avoid.)

### Working in a git worktree

If you develop in a disposable worktree, register the lane itself with `pnpm dev open <lane>` before verifying, and run `pnpm dev remove <lane>` before deleting the worktree — from inside the lane, so it is the lane's own CLI. Do not point the lane at your main checkout: verification has to read the lane's own source, or you will be testing the wrong code.

## Finding your way around

| Path | What lives there |
| --- | --- |
| `src/cli.ts` | Every command, start here |
| `src/daemon/` | The local server, project state, compilation |
| `src/ui/` | The canvas |
| `src/runtime/` | Code injected into frames and the player |
| `src/term/` | Terminal frame rendering |
| `CONTEXT.md` | Canonical vocabulary. Use these words in issues, tests, and code. |
| `docs/adr/` | Why the load-bearing decisions went the way they did |
| `AGENTS.md` | Repo conventions, written for coding agents but accurate for humans |

Tests sit next to what they test, as `<module>.test.ts`. If you are changing behavior, the nearest test file is usually the fastest way to understand what the current behavior is supposed to be.

`design/` is spool's own dogfood canvas, built in spool. Changes confined to it are live design work and follow the rules in its nested `AGENTS.md`.

## Commits and changesets

Commit messages describe the work; they never drive a release. When a change alters what someone running the published package sees, land a changeset file with it: the bump level and one honest sentence written for the changelog. Work confined to `design/`, docs, tests, or internals ships no changeset.

`docs/releases.md` has the whole model. Read it before opening a PR that changes published behavior.

## Reporting bugs

Use the issue templates. The version, your OS, and a reproduction are what make a bug actionable; without them an issue usually stalls waiting for a reply.

Security issues do not go in public issues. See `SECURITY.md`.
