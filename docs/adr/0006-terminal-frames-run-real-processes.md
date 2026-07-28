# Terminal frames run real processes

> This is the terminal-frame ADR. A numbering collision also assigned 0006 to
> [the warm-pool ADR](./0006-warm-pool-and-wake-queue-replace-the-hibernation-timer.md).
> Both filenames stay unchanged so existing links keep working.
>
> Superseded by the project-code isolation boundary in
> [issue #41](https://github.com/liamvinberg/spool/issues/41). Terminal frames
> remain discoverable, but Spool renders a static disabled surface and never
> executes `term.tsx` until project processes can run inside an OS sandbox.

A terminal frame is the second and final frame kind, discriminated by its entry filename — `term.tsx` — because a kind must stay knowable by every layer while source is broken mid-edit; a folder holding both entries is a discovery error (#42, #43). The entry is OpenTUI TSX run as a real process in a PTY by spool's own pinned bun, provisioned idempotently under `~/.spool/toolchain` on first use — `design/` gains no manifest, and the daemon (Node) reaches the PTY through a bun-side supervisor over framed pipes, so spool ships no native dependency. The daemon holds each screen in a headless emulator: attach late and receive the screen so far over spool's first WebSocket, freeze and the process is SIGSTOPped (kernel-frozen, zero CPU), hibernate and it is killed with the screen serialized, and stills rasterize from the grid in the pinned mono (JetBrains Mono, 0.6 em — cells are 9×18 px at 15 px, so cols×rows and pixels never disagree). Death is legible and never auto-healed: an exited process keeps its last screen and exit code until a save or an entering hand revives it.

This amends ADR-0002's scope rather than its substance: "frames are TSX compiled by spool" is the html kind's contract; a terminal frame's TSX is executed, never compiled into a document, and its document is the emulator page. ADR-0003 and ADR-0004 hold unchanged — canvas iframes and the one composed player document (terminal frames appear there as daemon-rendered grids), and a flow map read from source, where `term.go` sites mint edges and the runtime's OSC navigation can only verify them.
