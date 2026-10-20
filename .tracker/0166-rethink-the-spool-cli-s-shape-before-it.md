# #166 · Rethink the spool CLI's shape before it grows

- State: open
- Labels: ready-for-human
- Created: 2026-10-19T19:46:43.914Z
- Updated: 2026-10-19T19:46:43.914Z

Liam wants to rethink the CLI later, by hand: which verbs exist, where the seams are, and what foundation lets new surfaces (like comments) fit in without bloating it into a long flat list.

Prompted by [Decide how agents read, act on and answer comments (#164)](https://devobee.tail9e5223.ts.net/spool/tickets/164), which adds `spool comments`, the first verb that writes (reply, resolve, new Team comment). It was kept to one verb with subcommands for that reason, but the overall shape is open: read verbs vs lifecycle commands vs Cloud commands (`login`, `move`, now `comments`), grouping, and how agents discover them through `spool skill`.

Today's commands: login, logout, init, open, remove, check, selection, flows, shot, logs, url, move, skill, serve, autostart, upgrade, status, stop. Law: [ADR-0005](https://github.com/liamvinberg/spool/blob/main/docs/adr/0005-agents-author-files-verbs-stay-read-only.md).
