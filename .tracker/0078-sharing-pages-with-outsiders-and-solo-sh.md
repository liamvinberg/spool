# #78 · Sharing pages with outsiders, and solo shares

- State: closed
- Labels: ready-for-agent
- Parent: #62
- Blocked by: #77
- Created: 2026-10-18T17:43:56.050Z
- Updated: 2026-10-18T17:43:59.405Z
- Closed: 2026-10-18T17:43:59.405Z

## Parent

#62

## What to build

Editors and admins share pages by right-clicking a page: with named people who sign in, or anyone with the link. A share belongs to the team, outlives its maker, and a link share gets a fresh unguessable URL on its own `onspool.page` host. Outsiders see only shared pages (others don't exist for them), one line saying who shared it and when it last updated, are invisible and see nobody. They get the settled version of each page (the writer's agent finished its turn, which daemons report, or about 30 s with no saves), the last version that compiled after a broken save, "This screen isn't ready yet" if none ever did, and "This screen isn't shared with you" elsewhere. The flow map warns about links leaving the shared pages, never blocking. The Shared control at the canvas's top right lists shares, opens to people (add, remove), maker, when, open count and Stop sharing (access stops at once); viewers can read but not change. A solo project shares the same way, its daemon uploading the source and covers the cloud lacks.

## Acceptance criteria

- [X] An outsider sees only shared pages; other frames say not shared
- [X] Outsiders see settled versions; members see every save
- [X] A broken save leaves outsiders on the last compiled version
- [X] Stopping a share ends access at once; a new share gets a new URL
- [X] Viewers can't change shares or copy links
- [X] A solo project's share works with no team
- [X] Outsiders appear nowhere

## Blocked by

- #77

*From Linear DEV-193.*

Related: #59

Plane: SPOOL-78

## Comments

### agent, 2026-10-18T17:43:59.387Z

**Liam, 2026-10-06:** Shipped in spool.page 0.30.0. 0.31.0 lets you share the top page too.

Decisions where the spec was silent:
- A people share has its own address, spool.page/shared/.
- A share shows exactly the pages chosen, not the pages under them.
- A page settles when the writer's agent ends its turn, or after 30 s with no saves.
- People named on a share aren't emailed. The sharer copies the link.
- Sharing starts on the Mac. In the browser, editors manage shares that exist.
- Each share's frames carry a key of their own. Outsiders read scenarios as they were at the last settle, and only while the share lives.
- A link counts an open only on its own pages.
- A new share of a page that is broken right now says "not ready" for that frame until it compiles.
- An account may start at most 50 solo projects. Solo uploads count against the 1 GB limit.

Left: beta publications don't become shares. That is #59 and #80 (Liam decides #59).

Checks for Liam:
- [ ] Someone outside the team signs in from a /shared link and lands on the share.
- [ ] A solo project's share from a real Mac uploads only the shared pages.
- [ ] A link share's open count rises once per open.

### agent, 2026-10-18T17:43:59.396Z

**Liam, 2026-10-15:** Follow-up shipped in agent-hub task 156 (Linear's free issue limit blocked a new ticket): sharing moved to a Share icon at the window bar's end, always present so the bar never shifts. One popover makes shares (link by default, the page you're on, a page tree with find for more), shows a QR code of the link for a phone, and lists the project's shares; the old share sheet and the Mac bar's "Shared N" button are gone. A page's right-click opens the same popover.
