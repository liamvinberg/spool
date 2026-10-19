# #7 · Research: keeping git and a hosted copy in step, and branch previews

- State: closed
- Labels: wayfinder:research
- Parent: #3
- Created: 2026-10-18T17:43:55.363Z
- Updated: 2026-10-18T17:43:57.249Z
- Closed: 2026-10-18T17:43:57.249Z

## Question

How do products keep a git repository and a hosted copy of the same files in step (Lovable, Bolt, v0, Replit, GitBook, Mintlify, TinaCMS, [Builder.io](http://Builder.io), Webflow, Obsidian), and how do branch previews get built and protected (Vercel, Netlify, Cloudflare, Chromatic, Render, Railway)? Who writes the commits, what triggers a sync, conflicts, uncommitted work, GitHub App permissions, building on push versus lazily on first open, access that mirrors repo permissions, and the GitHub API facts for listing branches and fetching one folder at a branch without a clone.

Report: `spool-cloud/research/106-git-and-hosted-copies/`.

*From Linear DEV-106.*

Related: #65

Plane: SPOOL-7

## Comments

### agent, 2026-10-18T17:43:57.244Z

**Liam, 2026-10-01:** ## Resolution

Report: `spool-cloud/research/106-git-and-hosted-copies/` (commit `925e32a`), with page copies and probe output under `evidence/`.

- Every product that keeps git and a hosted copy in step declares which side wins, and several document lost edits on the hosted side: Bolt overwrites, Lovable parks its work on a `lovable-sync` branch and replaces its copy, TinaCloud's re-index drops unpushed hosted changes, Obsidian Sync merges markdown and takes the newest file otherwise.
- None of Vercel, Netlify, Cloudflare, Chromatic, Render or Railway builds a branch on first visit. Previews are built on push or by a deliberate action (Mintlify's manual preview, Render's label, deploy hooks). No product publishes a first-visit build time.
- Only Chromatic mirrors GitHub repo permissions (read becomes Viewer, write becomes Developer), and its GitHub App has no access to the code because builds run in the customer's CI. The rest use their own accounts or passwords.
- GitHub does not retry failed webhooks, keeps deliveries visible for 3 days and may reorder them. Lovable, TinaCloud and Linear document stuck states; recoveries are polling, another push, or a manual re-sync.
- Spool's own `design/` is 1,920 files and 7.7 MB. Reading it at a branch is one recursive tree call (well under the limits), a 1.4 s tarball of the whole repo, or about 4.8 s as a sparse clone. One GraphQL query lists branches and the folder together.
- None of the studied products shows a local working tree and a git branch of the same project side by side.

Unverified: some app permissions (TinaCloud, Webflow, Builder.io), whether tarball downloads count against an app's rate limit, branch listing at scale. Timings are single runs.
