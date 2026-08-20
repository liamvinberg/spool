# spool canvas

This folder is a [spool](https://spool.page) project: live TSX frames on an infinite canvas — agents author the files, humans arrange and play them.

Run `pnpm dev skill` before working here — this repo's checkout CLI, never the installed `spool`. It is the complete contract: if it isn't in there, spool doesn't do it. Topics: `pnpm dev skill frames|flows|scenarios|mock|styling|verbs`.

- A frame is born by writing `frames/<page>/<name>/frame.tsx` default-exporting one React component — no registration, no `spool new`. Variants are `--`-named siblings (`checkout--empty/`).
- The one law: never write app-owned files — `canvas.json` and `.spool/` are spool's.
- Commit completed design work atomically before handoff.
- This file is orientation, not a ledger. A decision's story lives in its ticket and a component's behavior in its file; keep the table below to pointers, and never append session summaries here.

## Voice

How spool talks, wherever words face a user — frames, chrome, the site, docs.

- One rule, two registers. If the machine would print it, it is verbatim lowercase mono: commands, paths, frame names, chips, counts, status lines (`live · esc exits`, `no frames yet`). If a person is saying it, it is a sentence: sentence case, proper nouns restored (Node, Chrome, TSX, GitHub), a period when it is a whole sentence.
- The name is "spool" in every register, sentence start included — wordmark, command and prose share the one form.
- Say what the thing is, then stop. One evocative line is allowed per page and the sentence after it has to be literal. No hype adjectives, no exclamation marks, no em-dashes in copy.
- Two constructions are banned, because they are the ones a language model reaches for first: the correction ("The bars are not drawn. They are a number over the largest number.") and the stacked negation ("No server, no seed script."). State what is true and let the reader draw the contrast.
- Vary sentence length inside a block. Four leads built to the same two-fragment shape read as generated even when every one of them is accurate.
- Reach for a filename, a number or a key before an abstraction. "frame.json is where it sits on the canvas" beats "spatial configuration".
- When the terminal is the subject, let it speak: the prompt names the working directory rather than a sentence saying "in your repo".
- A demo product on a frame speaks like a real product — its own name, its own sentence case — never in spool's costume.

## The pages

Every frame lives on a page; the root page stays empty on purpose.

| Page | What it holds |
| --- | --- |
| `app` | Spool as it shipped — home, the canvas, its context menu, the empty project, the player, the system sheet. Walk it end to end: it is a working model of the product. |
| `agent` | The agent chat, decided by map [#114](https://github.com/liamvinberg/spool/issues/114) and swept to its winners on 2026-08-01 — the deleted explorations read back from `444c39c`. Read `agent-chat` first, the compile ([#180](https://github.com/liamvinberg/spool/issues/180)). `agent-hand` is the visual source of truth for what the canvas draws while the agent works a frame, built in [#214](https://github.com/liamvinberg/spool/issues/214). |
| `components` | Four unresolved takes on the component library page ([#189](https://github.com/liamvinberg/spool/issues/189)): sheet, index, slots and walk. |
| `site` | spool.page ([#31](https://github.com/liamvinberg/spool/issues/31)), unbuilt. The hub and its four sections. |
| `directing` | The directing toolset ([#56](https://github.com/liamvinberg/spool/issues/56), [#65](https://github.com/liamvinberg/spool/issues/65)), unbuilt. `directing--annotate` is the canonical frame the spec is written against. |
| `play-inline` | Whether play should zoom into the frame rather than open `/play/...` in a new tab. Three transition characters over one mock canvas, built to be felt rather than argued. Decided against by [#227](https://github.com/liamvinberg/spool/issues/227): play opens a tab. |
| `play-tab` | The other branch of the same question: play opens a real browser tab, and the frame gets the viewport. Four chrome models over one identical page; the page is `shared/ui/tidemark-landing.tsx` so the only variable is the chrome. Decided by [#227](https://github.com/liamvinberg/spool/issues/227): the edge bar won, and `play-tab--edge` is the visual source of truth. |
| `manipulate` | Direct manipulation v1 ([spool-cloud#11](https://github.com/liamvinberg/spool-cloud/issues/11)), unbuilt. The `select--` frames are five readings of the selection ladder over one shared cart document, every rule a flag in `shared/lib/select-ladder.ts`; `select--descend` won and is the visual source of truth. The `properties--` frames are the properties surface, in flight. |
| `explorer` | The pages rail upgraded from a read-only tree to a file explorer: drag to reorder and nest, sub-pages to any depth, rename, duplicate, copy and paste, delete with an undo toast, context menus and keyboard travel. `explorer-rail` is the shipped canvas with only that rail swapped, wired end to end so the gestures can be felt; nothing decided. |

`app` is the baseline. Every frame on it must match the code in `src/ui/` and `src/runtime/`; when a design ships, the frame here becomes what shipped, and reading the implementation before trusting a frame is how it stays honest. A new prototype starts by copying the frame it changes, not from nothing — so the thing being proposed is legible as a diff against what exists.

Explorations live until the work they decided is built: while a page is being resolved, the rejected frames are what the next session reads to see what was already argued. When the work ships, the winner moves onto `app` and the rest are deleted. Git history is the archive — `git log --diff-filter=D --stat -- design/frames` finds them.
