# spool canvas

This folder is a [spool](https://spool.page) project: live TSX frames on an infinite canvas. Agents author the files, humans arrange and play them.

Run `pnpm dev skill` before working here, this repo's checkout CLI, never the installed `spool`. It is the complete contract: if it isn't in there, spool doesn't do it. Topics: `pnpm dev skill frames|flows|scenarios|styling|verbs`.

- A frame is born by writing `frames/<page>/<name>/frame.tsx` default-exporting one React component. No registration, no `spool new`.
- The one law: never write app-owned files. `canvas.json` and `.spool/` are spool's. Hands write frame source only as span patches, gated, with the same undo surface geometry already has. The one exception writes a file too: a picture swapped onto an `<img>` lands beside the frame and gains its import, because an image is an import and never a URL.
- History is off here. The daemon never commits `design/` for this project, so every change under it is yours to commit: atomic, lowercase, terse, before handoff.
- This file is orientation, not a ledger. A decision's story lives in its ticket and a component's behavior in its file. Keep the tables below to pointers and never append session summaries here.

## The shape

Four root pages, and the root itself stays empty.

| Page | What it is |
| --- | --- |
| `app` | spool as it ships. Every frame matches the code in `src/ui/` and `src/runtime/`; read the implementation before trusting a frame. A new proposal starts by copying the frame it changes, so it is legible as a diff. |
| `system` | The design system, live: `voice`, `tokens`, `type`, `motion`, `primitives`. `primitives` renders `shared/ui/spool/` itself, so a component with no specimen shows as a gap. |
| `site` | spool.page ([#31](https://github.com/liamvinberg/spool/issues/31)), unbuilt. One sub-page per family of takes. |
| `explore` | One sub-page per open question. When the question's work ships, the winner moves onto `app` and the sub-page is deleted. Git is the archive: `git log --diff-filter=D --stat -- design/frames` finds what was argued. |

Inside a question, takes go down and states go across. A row is a thing you choose between; a column is the same thing in another state. A frame is named `<subject>-<take>`, and only a state carries `--`: `dock-stack` is a take, `dock-stack--cut` is that take with its motion removed. Frame names are unique across the whole project, which is why the subject stays in the name. Rows run smallest diff to most radical, top to bottom. A page that holds several questions holds them as sub-pages, each with its own rows.

`shared/` is split by who reaches a file:

| Folder | What lives there |
| --- | --- |
| `shared/ui/spool/`, `shared/lib/spool/` | spool's own chrome and its models, one file per `src/ui` counterpart where one exists. Reached from `app` or from more than one question. |
| `shared/ui/demo/` | The fake products frames render inside: kaffe, Tvärsö, Tidemark, the coffee screens. They speak as themselves, never in spool's costume. |
| `shared/ui/site/` | What only the site reaches. |
| `shared/ui/explore/<question>/`, `shared/lib/explore/<question>/` | What only that question reaches. Deleted with the question. |
| `shared/tokens.css` | `src/ui/ui.css`'s `@theme` verbatim, keyframes included. When ui.css changes, this changes with it. |

Import by the design-root path from anywhere: `import { cn } from "shared/lib/utils"`. A file that a second question starts reaching moves up to `spool/`.

## Voice

How spool talks, wherever words face a user: frames, chrome, the site, docs.

- One rule, two registers. If the machine would print it, it is verbatim lowercase mono: commands, paths, frame names, chips, counts, status lines (`live · esc exits`, `no frames yet`). If a person is saying it, it is a sentence: sentence case, proper nouns restored (Node, Chrome, TSX, GitHub), a period when it is a whole sentence.
- The name is "spool" in every register, sentence start included. Wordmark, command and prose share the one form.
- Say what the thing is, then stop. One evocative line is allowed per page and the sentence after it has to be literal. No hype adjectives, no exclamation marks, no em-dashes in copy.
- Two constructions are banned, because they are the ones a language model reaches for first: the correction ("The bars are not drawn. They are a number over the largest number.") and the stacked negation ("No server, no seed script."). State what is true and let the reader draw the contrast.
- Vary sentence length inside a block. Four leads built to the same two-fragment shape read as generated even when every one of them is accurate.
- Reach for a filename, a number or a key before an abstraction. "frame.json is where it sits on the canvas" beats "spatial configuration".
- When the terminal is the subject, let it speak: the prompt names the working directory rather than a sentence saying "in your repo".
- A demo product on a frame speaks like a real product, its own name, its own sentence case, never in spool's costume.

## The questions

Under `explore/`. Each row is a pointer: the ticket, the one flag file if there is one, and where the question stands.

| Question | Ticket | Where it stands |
| --- | --- | --- |
| `agent` | [#114](https://github.com/liamvinberg/spool/issues/114), compiled in [#180](https://github.com/liamvinberg/spool/issues/180) | Built. The compile (`agent-chat`) and the hand ([#214](https://github.com/liamvinberg/spool/issues/214), `agent-hand`) moved onto `app` as `spool-canvas--agent` and `spool-canvas--hand`. What stays are the play-throughs: `agent-play` and its states are the moments a turn has, `agent-say-pace`, `agent-stop` and `agent-walk-ambient` the smaller questions the compile settled. Two motion sub-questions reopened 2026-09-02 off the shipped rail: `say/` is what a character does as it lands, `log/` is what the log does when a row lands under it, both over `StreamStage` in `shared/ui/explore/agent/stream-stage.tsx`. Nothing decided. |
| `booting` | none yet | The gap between the canvas mounting and the project answering. Five sub-questions: `boot`, `count`, `shape`, `ambient`, `handover`, four takes each over `BootShell` in `shared/ui/explore/booting/`. Nothing decided. |
| `components` | [#189](https://github.com/liamvinberg/spool/issues/189), shape from [spool-cloud#29](https://github.com/liamvinberg/spool-cloud/issues/29) | Four takes on the library page, and under `library/` the generation after them, drawn on `shared/ui/demo/tvarso-library.tsx`. `library-frames` is the direction as of 2026-09-03 ([spool-cloud#31](https://github.com/liamvinberg/spool-cloud/issues/31)): the library is a page and every component on it is a frame, `shared/ui/explore/components/library-frames.tsx` the projection; the others stand until it is built. `door/` is the way in ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)): three takes on where the `library` row stands, each with a `--held` state showing the origin line under the crumb as the door, over `DoorCanvas` in `shared/ui/explore/components/door.tsx`; `door/lit/` is how the lit row shows it, four takes on `door-foot--held`. Decided 2026-09-03 ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)): `door-foot--held` and `lit-dot` are the direction; the others stand until it is built. |
| `directing` | [#56](https://github.com/liamvinberg/spool/issues/56), [#65](https://github.com/liamvinberg/spool/issues/65) | `directing-annotate` is the canonical frame the spec is written against. Unbuilt. |
| `explorer` | none yet | The pages rail as a file explorer. `empty/` asks what a page with no frames of its own shows, `EmptyTake` in `shared/ui/explore/explorer/explorer-canvas.tsx` the flag; `real/` takes the winner onto spool's own design folder, shipped as [#265](https://github.com/liamvinberg/spool/issues/265). `only-pages/` asked what a page holding only pages shows, six takes over `OnlyPagesTake` in `shared/ui/explore/explorer/only-pages.tsx`. Decided 2026-09-04: `only-pages-shelf` with `only-pages-fit` folded in, shipped in `7f78339`; `only-pages-marks` became [#279](https://github.com/liamvinberg/spool/issues/279) in its per-edge form. The takes stand until the shipped shelf is drawn on `app`. |
| `manipulate` | [spool-cloud#11](https://github.com/liamvinberg/spool-cloud/issues/11), [spool-cloud#30](https://github.com/liamvinberg/spool-cloud/issues/30) | Selection and properties shipped and moved onto `app` (`spool-canvas--ladder`, `spool-canvas--properties`). What stays is `shared/`: how spool marks that the element under the cursor is shared. `shared-reach` won; the other four stand until it is built. |
| `play-app` | decided 2026-09-01 | What play is once spool is an app. `play-app-window` is the shape, `play-app-fit` and `play-app-remembered` its size; the other three stand until the work is built. `shared/ui/explore/play-app/desk.tsx` draws the Mac. |
| `threads` | [#136](https://github.com/liamvinberg/spool/issues/136), [#205](https://github.com/liamvinberg/spool/issues/205) | Reopened 2026-09-02 off the shipped rail: where the other conversations live and what a thread is called. Five takes over `ThreadsStage` in `shared/ui/explore/threads/threads-stage.tsx`, `shared/lib/explore/threads/threads-fixture.ts` the deck. `threads-plate` is the direction as of 2026-09-03, named by the ask, no collapse caret on the plate; the others stand until it is built. |
| `variants` | [spool-cloud#22](https://github.com/liamvinberg/spool-cloud/issues/22) | Variations as decisions. Twelve sub-questions, `shared/lib/explore/variants/variants-decision.ts` the model every take reads, `shared/ui/demo/tvarso-checkout.tsx` the document. Nothing decided. |

Explorations live until the work they decided is built: while a question is open, the rejected takes are what the next session reads to see what was already argued.
