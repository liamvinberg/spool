# #201 · CI for spool-cloud, a deploy only from green, and spool's release checks the cloud's protocol

- State: closed
- Labels: ready-for-agent
- Parent: #117
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:56:11.290Z
- Updated: 2026-10-21T20:57:19.952Z
- Closed: 2026-10-21T20:57:19.952Z

## Parent

Spec: running Spool Cloud for paying teams (#117)

## What to build

spool-cloud gets CI. Every push to main and every pull request installs, typechecks, runs `biome check` and runs the unit, worker and node tests (`pnpm test`). A hand-started deploy workflow runs the existing `pnpm deploy` for production from a commit whose CI passed. It is the one deploy path, so it keeps the release script's secrets check, migrations and app-before-serving order. Spool's publish workflow reads the protocols the deployed cloud accepts, from a public GET on spool.page added here (it returns today's one protocol until #117's version ticket widens it), and fails if the package's `PROTOCOL_VERSION` isn't among them. That way the cloud is always deployed before the release that needs it. Spans spool-cloud (workflows, the protocols route) and spool (`publish.yml`). If Liam keeps deploys local (#117 open question 2), the deploy workflow becomes a check in `pnpm deploy` that refuses a commit without a passing CI run.

## Acceptance criteria

- [ ] A pull request to spool-cloud with a type error, a lint error or a failing test shows a failed check; a clean one passes
- [ ] CI runs on every push to main
- [ ] The deploy workflow deploys only a commit with green CI, through `pnpm deploy`, and refuses otherwise
- [ ] The deploy's Cloudflare token lives in GitHub's secrets for spool-cloud only, never in the repo
- [ ] `GET spool.page/<route>` returns the accepted protocols, unauthenticated, cacheable for a minute
- [ ] spool's publish fails when its `PROTOCOL_VERSION` isn't accepted by the deployed cloud, and passes today
- [ ] One real deploy has gone through the workflow

## Comments

### agent, 2026-10-21T20:57:19.952Z

Merged: spool f5fe825d (merge 205 #117 …), spool-cloud 4bf3938 (merge 205 #117 …). Built: spool-cloud CI (.github/workflows: typecheck, biome, pnpm test on push to main and PRs); a hand-started deploy workflow that refuses a commit without green CI, then runs pnpm deploy; public GET /sync/protocols ({protocols:[…]}, max-age 60); spool's publish.yml checks it (.github/scripts/cloud-protocols.ts; until the route is deployed it allows protocol 2, which every earlier cloud speaks). Human steps left: store CLOUDFLARE_API_TOKEN in spool-cloud's GitHub production environment, and run the first real deploy through the workflow. Deploy spool-cloud before the next spool release that changes the protocol.
