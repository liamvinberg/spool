# #325 · Exported player says when it needs the internet, and keyboard play warms too

- State: closed (done: merged to main)
- Labels: ready-for-agent, bug
- Parent: #300
- Created: 2026-11-12T18:25:58.211Z
- Updated: 2026-11-12T19:22:55.031Z
- Closed: 2026-11-12T19:22:55.031Z

## Parent

#300 (follow-up from judging it, task 609)

## What to build

Two small gaps found while trying the merged work.

**1. An exported file that cannot reach its web packages blames a browser extension.**
A frame that imports packages from the web (the export dialog already warns "needs the internet to work") is exported with the player and opened with no network. After about 8 seconds the player shows:

> player failed to load. the player loaded but never connected to its shell. something running inside the player iframe is interfering with its boot; a browser extension injected into the sandbox is the usual culprit. the bare player runs the same prototype without the embedding.

That is the live player's message and it is wrong here: the cause is the missing network, and there is no "bare player" for the person who was sent a file. Reproduce: export `site/pricing` from spool's own design canvas with the player (it imports clsx, tailwind-merge and motion from esm.sh), open the file in a browser context that is offline.

In an exported file, when the played document does not connect, say what a receiver can act on, in spool's Voice (design/AGENTS.md), along the lines of: "This prototype needs the internet to load. Connect and reload." Show it as soon as the cause is known (a web module failed to load) rather than after the full wait, if that is cheap. The live player's message does not change. If the file has no web packages and still fails to connect, keep a plain failure line without the extension and bare-player advice.

**2. Playing from the keyboard gets no early warm-up.**
Pointing at Play warms the frame (#303), but pressing `p` has no hover before it. Selecting a frame is the keyboard's sign of intent: call the same warm-up when a frame becomes the selection that `p` would play, with the same cheapness (fire and forget, never recomposes what is composed). If selection changes fast (arrowing through frames, marquee), it must not spam: once per project per settle is enough since the warm-up is per project.

Leave alone: everything else in the player and the export.

## Acceptance criteria

- [ ] An exported file with web packages, opened offline, shows the internet message, not the extension one. Proven by extending the export browser test.
- [ ] The live player's failure message is unchanged.
- [ ] Selecting a frame warms its project for play; proven where the hover's warm-up is proven.
- [ ] A changeset.

## Comments

### agent, 2026-11-12T19:22:55.031Z

Merged to main in 788e1df9 (task 619).

1. An exported file's played document reports a module that fails to load (a web package out of reach; React is the file's own) at once, through the existing player-load-error message: "This prototype needs the internet to load. Connect and reload." Without that report, an exported file that never connects or never shows says "This prototype could not load. Reload to try again." (host field `stalled` on PlayerShellHost); the live player's messages are unchanged. Proven by extending the export browser test (offline, web package not served: the line within 3 s; red without the report). A reviewer checked inline-module onerror fires for an aborted import in Chromium 149, Firefox 157 and WebKit 26.5, and not for syntax or evaluation errors.

2. The one frame P would play (keyboardTargetsOf in canvas-store: the selection, else the frame behind an element pick, none when entered) is warmed once the selection settles (150 ms), through the same POST /warm as the hover. Rule proven in canvas-store.test.ts, wiring in canvas-tools.test.ts (marquee select gives exactly one warm).

Two patch changesets. CI: all Linux shards pass; macOS shards show the known /var vs /private/var failures and one tab-strip timing flake, none in touched code.
