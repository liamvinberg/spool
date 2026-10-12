# Handoff: ui (spec 136, moving projects between teams)

Branch `spec-136-ui`, from `f2d1e94` (the tip of `136-run-the-grilling-skill-grilling-on`).

## What I built

- **Home's cover menu** (`src/ui/home.tsx`). `Home` and `ProjectGrid` take `moveItems: MoveItems` (`(card) => MoveItem[]`, each `{ label, end?, onClick }`) in place of `onMoveToTeam`. Items without `end` sit where "Move to team…" sat. `end` items sit between "Hide from Spool" and "Move to Trash…", drawn destructive.
- **`useCoverMoves`** (`src/ui/team-moves.tsx`) builds those items and draws the sheet one opens:
  - a project in no team: today's "Move to team…" (today's move-in sheet, via `onMoveIn`), while the account edits in a team;
  - a team copy: "Move to team…" for an admin of the copy's team who is an editor or admin somewhere else; "Move into a checkout…" when `card.team.inRepo === false`, for anyone holding the copy; "Move out of <team>…" for an admin of the copy's team (`end`).
- **Dimmed covers** (`TeamProjectsAway`): for an admin of the team, a "…" button beside Get it, with "Move to team…" (when there's another team to move to) and "Move out of <team>…" (destructive). Editors and viewers get no "…". A project moved away leaves the list.
- **Sheets**, all on `ConfirmDialog`:
  - `MoveTeamSheet` (`src/ui/team-move.tsx`, which pulls in no Mac-only code, so spool.page's bundle stays small): a Team select of the asker's other teams where they're editor or admin, and Name prefilled. It asks for a preview as it opens and again 250 ms after typing stops, then shows the losing line, the commit line(s) and the folder line. Refusals show in place: `name_taken` and `invalid_input` by Name, the rest of A2's codes under Team. The confirm button is disabled while a refusal stands. A refusal from the POST shows in the same place and the sheet stays open.
  - `MoveOutSheet`: danger button. The description changes for a copy in a checkout, a copy in no repo, and no copy on this Mac (from the dimmed cover). It names the team's other editors and admins, read from People. While the POST is out, it shows the catch-up progress from `GET /api/cloud/move/progress?path=`.
  - `IntoCheckoutSheet`: a read-only Checkout field with Choose… (today's location picker). It is prefilled with the first of `TeamProjectOnMac.checkouts` (the clone of the project's repo), with the hint "Your clone of <repo>". It says the old folder goes to the Trash. D4's codes show under Checkout and keep the sheet open.
- **After each move:** a toast at the foot of Home (`useMovedToast`). Commits waiting for git get the existing commit line, now also drawn above a team page's covers. Home then shows where the project went: the new team after a team move, Your projects after a move out of a copy here, and where it was for into-checkout or a move out from a dimmed cover.
- **Ended cover line:** `today · out of <team> · pull its repo` when the card has `movedOut`. Otherwise `no longer synced with <team>`, as before.
- **Browser** (`src/ui/viewer/team-home.tsx`): an admin with another team to move to gets "Move to team…" on spool.page/<team>'s covers, opening the same sheet against spool.page's own A1/A2 routes. On success it shows a toast and goes to `/<target>`. Move out and into-checkout aren't offered there.
- `ConfirmDialog` takes `RefusedInPlace` thrown from `onConfirm`: the sheet stays open with no notice under it, since the sheet already says why next to the field.

## What the other sessions meet

- **Daemon, D1/D2:** called through the `TeamsSource` (`teamsAt`). `movePreview(team, project, to, name?)` makes `GET {base}/teams/:team/projects/:project/move?to=&name=` (`name` only when it differs from the current one). `move(...)` makes `POST {base}/teams/:team/projects/:project/move` with `{ to, name? }`. On the Mac, base is `/api/cloud`; in the browser it is `/api` (spool.page's A1/A2 directly). Missing `commits`/`folder`/`roots`/`committed`/`commitWaiting` read as empty, which is what spool.page answers.
- **Daemon, D3/D4:** `moveProjectOut(team, project, path?)` and `moveProjectInto(team, project, path, checkout)` in `src/ui/api.ts`. They POST to `/api/cloud/teams/:team/projects/:project/out` (body `{ path }` or `{}`) and `/into` (body `{ path, checkout }`).
- **Refusals:** read as `TeamActionRefused(code, said)`. A body with `code` is the daemon's (`error` is its sentence). A body with only `error` is spool.page's code. Existing daemon team routes (which send `{ error: code }`) read as before.
- **D5:** read as `card.team.inRepo` and `card.movedOut`. I didn't touch `src/daemon/projection.ts`. Instead, `src/ui/api.ts` widens the card type it re-exports (`ProjectCard = DaemonProjectCard & { team?: { inRepo?: boolean }; movedOut?: string }`), so my branch and the daemon session's don't conflict there. Once the daemon's own `ProjectCard` carries both fields, that intersection can go. A card without `inRepo` is treated as in a repo (no "Move into a checkout…").
- **`useTeamHome`:** returns `show(address | null)`. Its `away` callback gets the account's teams as a third argument. It takes `note` (a node drawn above a team page's covers).
- **`fakeTeamsSource`:** takes `projects` (by team), `losing` (by target) and `mac` (`commits`, `folder`, `roots`, `committed`, `commitWaiting`), and refuses a move in A2's order.

## Where I departed from the brief, and why

- **Dimmed covers:** only admins of the team get the "…" menu, so "Move to team…" there is admin-only, as on Home. The brief read as though "Move to team…" were for more people, but A2 refuses everyone but admins of the team the project leaves.
- **Move-out names:** the sheet lists the team's other editors and admins, not "who has copies": no route says who holds a copy. So the copy reads "<names> edit in <team>. Any copy they have stops syncing…", not the prototype's "<names> have copies."
- **Into-checkout toast:** says "spool.json is committed." instead of "spool.json and AGENTS.md are committed.", since the line may go to CLAUDE.md, or nowhere when the file is ignored.
- **Unpaid refusal:** uses the prototype's words ("<team>’s trial has ended. It takes projects again once an admin pays for it.") even for a team that once paid. `CloudTeam.billing` alone doesn't say which.
- **Waiting commit:** said as "<project> moved to <team>. Its commit in <root> waits for git, and spool makes it the next time it starts." The prototype draws no such state.

## What I couldn't do or run

- No daemon routes exist here yet. Everything is driven through the fake source and stubbed fetch, so the daemon's real answers are untested against the screens.
- The browser suites need the headless shell `playwright-core` 1.61 expects (revision 1228). Its download is blocked here, so I pointed `PLAYWRIGHT_BROWSERS_PATH` at the preinstalled revision 1194 under the expected name.
- Full `pnpm test` here: 3992 passed, 304 failed, 9 skipped, in 59 files. Every failing file is outside `src/ui` (daemon, runtime, compile, publication, CLI publication and verification), plus `src/ui/typography-browser.test.ts`. I reran five of them (`compile-entry`, `cloud-publication`, `runtime/canvas-shim`, `ui/typography-browser`, `daemon/assets`) alone on the starting commit `f2d1e94`: the same 54 tests fail the same way there, so they come from this environment, not this branch. Every suite this branch touches passes, browser suites included. `pnpm typecheck` and `pnpm check` are clean.
- No canvas work (`design/` isn't here). `design/frames/app/` will want the new menu items and sheets.

## Open questions for Liam

1. Should "Move to team…" on Home or on a dimmed cover show to an editor of the team it leaves (who'd then be refused), or stay admin-only as built?
2. Move out of a project with no copy on this Mac, from a dimmed cover, as the brief asks: nobody's `design/` comes back into git, because no commit is made anywhere. Keep offering it?
3. The move-out sheet can only name the team's editors and admins, not who actually holds a copy. Is that wording right, or should spool.page say who holds copies?
