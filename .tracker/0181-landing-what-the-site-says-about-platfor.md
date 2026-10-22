# #181 · Landing: what the site says about platforms

- State: closed (done: merged spool-cloud 9c18004)
- Labels: ready-for-agent
- Parent: #118
- Blocked by: #178, #179
- Tasks: task 205 (Spool feature gap analysis)
- Created: 2026-10-21T16:49:49.237Z
- Updated: 2026-10-21T18:05:09.520Z
- Closed: 2026-10-21T18:05:09.520Z

## Parent

Spec: the landing page, pricing and the legal pages (#118)

## What to build

What the landing says about platforms, once Decide whether Spool Cloud launches Mac only (#111) is decided. Spans **spool-cloud** only (its site and `vite.seo.ts`).

Bring every place the site names a platform in line with #111's answer: the nav and hero's Download for Mac, the Get it chapter's npm line ("on any machine with Node 22"), the Cloud chapter's spool column ("on your Mac") and Spool Cloud column (who can be an editor), the Terms' description of the service, and the structured data's `operatingSystem`.

## Acceptance criteria

- [ ] Every platform claim on the landing, the price and the Terms matches #111's resolution, quoted in this ticket's closing comment
- [ ] The structured data's `operatingSystem` and requirements match
- [ ] `scripts/check-site.mjs` asserts the Cloud column's platform words
- [ ] `pnpm test`, `pnpm test:site` and `pnpm check` pass

## Blocked by

- Decide whether Spool Cloud launches Mac only (#111)
- Landing: Spool Cloud's price beside free spool, and its measures (#178)
- Legal: the public pages and company details (#179)

## Comments

### agent, 2026-10-21T17:29:24.111Z

Removed the block on #111. This spec's brief settles the launch platform as Mac only: the Mac app holds Get it, Home and moving a project in, and the site never mentions the CLI on Linux. Every platform claim now comes from one module, spool-cloud `src/site/platform.ts` (`PLATFORM`), so another system later is a single edit: the download buttons, the hero line, the price's spool and Spool Cloud columns, the Get it lead, the Terms' description of the service, and the structured data's `operatingSystem`/`softwareRequirements`. If #111 decides otherwise, change that file.

### agent, 2026-10-21T18:00:07.736Z

Built on spool-cloud `205-b118` as 6bff46a, **held**: it edits #179's Terms page, which isn't merged.

- Every platform claim comes from `src/site/platform.ts`: the download buttons, the hero line, both price columns ("Editors work in spool on a Mac…"), the Get it lead (which no longer says "any machine with Node 22"), the Terms, and the structured data (`operatingSystem: macOS`, `softwareRequirements: macOS 14 or later`).
- check-site asserts the Cloud column's words and the schema, and that the landing says neither Linux nor Windows.

Merge it together with #179.

### agent, 2026-10-21T18:05:09.520Z

Merged into spool-cloud main in 9c18004. Resolution used (the brief, in place of #111): Spool Cloud launches Mac only. Editors work in spool on a Mac, viewers and share links open in any browser, and the site doesn't mention the CLI on other systems. Every claim comes from `src/site/platform.ts`.
