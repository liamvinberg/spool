# spool

A canvas where the frames are alive.

Agent-authored TSX frames on an infinite canvas: arrange them spatially, link them into walkable flows, and feel an app (interactions, motion, state, real inputs) before it exists. Code is the document; the canvas is a projection of it. A design space is just a `design/` folder inside your product repo: local-first, git-tracked, no cloud.

Home: [spool.page](https://spool.page). Pre-1.0: published, dogfooded daily, and still moving.

## Install

```sh
npm i -g spool.page
```

If your npm setup blocks dependency install scripts, use the hardened form below. It permits only esbuild's required install script.

```sh
npm i -g spool.page --allow-scripts=esbuild
```

Node 22+, and the canvas wants Chrome (WebKit renders transformed iframes blurry). macOS and Linux; on Windows, use WSL. `spool autostart` is launchd-backed, so it is macOS-only.

```sh
cd your-product
spool init        # scaffold design/, register the project, and open its tab
spool open        # or: register an existing project and open its tab
spool remove      # forget the exact registered root; project files stay untouched
spool serve       # daemon at http://localhost:7766 — any spool command starts it too
spool autostart   # start at login (launchd); spool autostart off removes it
```

Open the canvas in Chrome (install as app for the dock icon). Frames are authored by your agent: `spool skill` prints the complete contract, verify verbs (`spool shot <frame>` and friends) included, and `spool init` writes the signposts that point agents at it.

## Develop

```sh
pnpm install
pnpm dev <command>   # the checkout cli — own state dir (~/.spool-dev), own port (7767)
```

Real projects run the released version; a checkout daemon serves beside it on its own port and state dir (the `dev` script sets `SPOOL_DIR` and `SPOOL_PORT`). Shipping: changesets on main feed the release PR; merging it is the one human gate, and the publish workflow re-runs the gates, then npm trusted publishing releases `spool.page`.

[`CONTRIBUTING.md`](CONTRIBUTING.md) covers the gates, what gets merged, and how to find your way around the source. [`CONTEXT.md`](CONTEXT.md) is the canonical vocabulary and [`docs/adr/`](docs/adr/) records why the load-bearing decisions went the way they did.

## License

[MIT](LICENSE.md). Fork it, rework it, rename it, ship it. It is a tool for designing things; make it your own if you want to.

Third-party components keep their own licenses, listed in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Security issues go to [`SECURITY.md`](SECURITY.md), never to a public issue.
