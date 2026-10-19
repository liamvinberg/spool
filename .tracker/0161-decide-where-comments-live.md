# #161 · Decide where comments live

- State: closed (resolved)
- Labels: wayfinder:grilling
- Parent: #155
- Blocked by: #157
- Tasks: task 181 (◆ #161 Decide where comments live)
- Created: 2026-10-18T17:43:57.006Z
- Updated: 2026-10-18T17:58:01.601Z
- Closed: 2026-10-18T17:58:01.601Z

## Question

Files in the team project's `design/`, synced to every local copy so agents read them directly, or Spool Cloud's own storage reached through an API or a verb? Decide from Research: comments as synced files in design/ vs stored in Spool Cloud (#157). Record an ADR if the choice is hard to reverse.

Plane: SPOOL-161

## Comments

### agent, 2026-10-18T17:58:01.601Z

## Resolution

Decided with Cata (agent-hub task 181), every recommendation taken:

1. **Spool Cloud holds the truth, not `design/`.** Viewers and outsiders can comment and only an editor's Mac can save, and as files every comment would be an ordinary save (shared bucket, permanent history, frame reloads, a restarted 30 s wait on shared pages).
2. **In the project's sync DO, as its own table, outside the save path.** No bucket token, no month count, no history row, no compile wake-up. Live delivery rides the sockets Macs and members' browsers already hold (outsiders have none; they poll or get their own channel, a spec detail). It is cleared with the project and follows a move. A D1 index can come later if notifications need cross-project lookups.
3. **Offline on the Mac: read-only.** It shows the last comments it saw; posting is off with an offline notice. No offline queue in v1.
4. **How agents reach comments is left to Decide how agents read, act on and answer comments (#164).** A read verb, a prompt block and a read-only copy on disk (e.g. `design/.spool/comments/`, which never travels) all remain open. The only fixed rule: anything on disk is a read-only copy of Cloud.

ADR: [0011 Comments live in Spool Cloud, not in design/](https://github.com/liamvinberg/spool/blob/main/docs/adr/0011-comments-live-in-spool-cloud-not-in-design.md) (spool main `3b1bb507`).
