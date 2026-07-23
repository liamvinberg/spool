# Agents author files; the CLI verbs stay read-only

There is no `spool new` and no write verb: a frame is born by writing `frames/<name>/frame.tsx`, and the CLI only observes (`selection`, `flows`, `shot`, `logs`, `url`, `skill`) (#6). Multi-agent safety is by construction, no locks, one law: agents never write app-owned files, hands never write source. Any future authoring convenience must stay filesystem-first rather than becoming an API agents contend on.
