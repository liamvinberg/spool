# The spool skill

What `spool skill` prints and every agent spool spawns reads first.

- `overview.md` is the overview, which rides in every agent's system prompt: keep it to what every turn needs, and put depth in a topic. `{{topics}}` becomes the topic index.
- `topics/<name>.md` is `spool skill <name>`. Its front matter holds `summary:`, its line in the index, and `experiment:` when it teaches an experiment from `src/settings/experiments.ts`; while that experiment is off on a machine, the index leaves the topic out.
- `{{package}}` becomes the installed package's `package.json` path, for drivers that load spool's own Playwright.

Every claim describes shipped behaviour, so a change to the runtime changes its text in the same commit.
