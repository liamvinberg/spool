# #54 · Idea: cloud agents drawing on a team canvas

- State: open
- Created: 2026-10-18T17:43:55.808Z
- Updated: 2026-10-23T05:12:01.668Z

Taken out of the Spool Cloud for teams map on 2026-10-04 by Decide how a project becomes a team project and reaches each member's machine (#43): the first paid version accepts that agents running in the cloud can't work on a team project.

The idea (Liam): a Claude Code routine, Claude Code on the web, Codex cloud or a Cursor agent draws straight onto the team's live canvas, so teammates watch a prototype appear. "A game changer."

## Decided (grilling with Liam, 2026-10-22, agent-hub task 222)

**The foundation is the CLI, for any environment, not a vendor integration.** Anything with a shell, network to spool.page and a token can work on a team project: Claude Code routines and web, Codex cloud, Cursor, Copilot, CI, a box over SSH. No vendor gets code of its own; vendors differ only in where the token and the allowlist are set.

```
clone repo → any spool verb finds spool.json, no design/ → fetches design/
agent edits frames → spool sync (and the daemon, while it lives) → teammates see it
run ends → sandbox thrown away; nothing lost, it was already synced
```

- **Real files, the clone way.** The CLI in the sandbox fetches `design/` and sends saves back; the agent edits ordinary files and `spool check`, skills and compile work as on a Mac. Ruled out: a Spool MCP connector (no real files, a second write path to keep in step; it could come later as a sign-in helper) and going through git (undoes taking `design/` out of git, nothing shows until a push).
- **Every run starts fresh.** Each run fetches the whole `design/` (spool's own canvas: 19 MB in 1,606 files). Accepted for now; measured when building, and a partial fetch only if it is slow. Vendor build caches are not used for `design/`.
- **Who the agent is:** its person. An **agent token** made on spool.page under the account's devices: for one team, it may fetch, sync and read history and nothing else (no invites, shares or deletes). Named ("Claude routine"), listed as a device with last used, revoked like one, no expiry by default. Set as `SPOOL_TOKEN` in the vendor's secrets, never pasted into a transcript. No extra seat. Copilot has only repo or org secrets, so there one person's token serves the repo.
- **Where it writes:** straight onto the live canvas, under the same rules as a local agent: the collision rule, the save limits, and history and restore (#57) as the safety net. No draft or review step.
- **The primitive is `spool sync`**: pull and push in one, safe to run at any time. It sends every changed file with the version it was built on, takes teammates' changes, and prints what happened; a set-aside save names the file, says the disk now holds the team's version, and tells the agent to redo its change on top. It exits non-zero when anything didn't land. Every other verb syncs too, so a forgetful agent mostly gets through. The one-off sync behind fetch (`syncLocalCopy`) is most of it already.
- **Live where the sandbox allows it.** The sandbox's daemon, which `spool check` and the other verbs already start, syncs in the background while the sandbox keeps it alive (Cursor documents this; Claude likely). `spool sync` is the guarantee everywhere. Hooks (Claude Code Stop, Cursor `stop`/`afterFileEdit`, Copilot `sessionEnd`) are optional extras, never required.
- **The CLI tells the agent.** A fetch made with a token, not a signed-in machine, prints "This is a cloud copy. Run `spool sync` after each change, and before you finish." `spool skill` says the same. The cloud-agent refusal in `src/open.ts` gives way when `SPOOL_TOKEN` is set, and without it points at the docs.
- **Setup is one docs page**, "Use Spool from a cloud agent", three steps the same everywhere: the token in `SPOOL_TOKEN`, allow spool.page (npm is on every vendor's default list, so `npx spool.page` needs no install step), optionally a line in `AGENTS.md`. Then a short "where to click" per vendor and optional hooks for Claude and Cursor. No command that writes hook files into a repo.
- **Projects with no repo:** `spool open https://spool.page/<team>/<project>` fetches by link into an empty folder, so a routine's prompt can name a project that lives in no repo.
- **What teammates see:** the agent's own presence, with no person beside it ("Liam's agent · Claude routine" on the frame it draws), while syncs keep arriving, gone a few minutes after the last one. History names the device ("Liam, Claude routine"). Today an agent shows only riding its person's presence (`PresenceAgent` on a person's presence), so this is new; its look is decided in the prototype.

## Next

- #215: Prototype a cloud agent drawing on a team canvas, the whole flow. Liam sees it first; started as its own task on his word.
- This stays an idea until the prototype is seen, then becomes a spec.

## Evidence

- `spool-cloud/research/157-cloud-agents-fetching-design.md` (`6cd145a`): a documentation read of four vendors, not a test on real accounts.
- Found in the grilling: Claude Code scheduled tasks (formerly routines) run as full cloud sessions on a cloud environment, with its network policy and variables; MCP connector traffic goes through Anthropic's servers and needs no allowed domain ([docs](https://code.claude.com/docs/en/routines)). Cursor cloud agents take HTTP MCP servers from the dashboard.

*From Linear DEV-168.*

Related: #65, #43, #3, #38, #57

Plane: SPOOL-54

## Comments

### agent, 2026-10-23T05:12:01.668Z

Grilled with Liam on 2026-10-22 (agent-hub task 222). Decisions are in the body; the prototype is spool#215.
