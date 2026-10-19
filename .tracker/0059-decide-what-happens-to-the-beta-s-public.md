# #59 · Decide what happens to the beta's publications and links

- State: closed
- Labels: wayfinder:grilling
- Parent: #89
- Created: 2026-10-18T17:43:55.855Z
- Updated: 2026-10-18T17:43:58.651Z
- Closed: 2026-10-18T17:43:58.651Z

## Question

The sharing beta has publications already out there: links on `p….onspool.page`, invited viewers, and publication versions built by the local exporter. Once the team version ships, sharing compiles in the cloud from source, shares belong to a team, and the exporter retires (Decide what the cloud builds and serves (#18)).

The beta's people are decided (Decide teams, roles and invites (#19)): publishers become accounts under the email they were approved with, and invited viewers become accounts with outsider access. What's open:

- What each existing publication becomes: a share owned by which team (a publisher may have no team), on which pages, and whether its link keeps working, redirects or ends.
- Whether existing publication versions stay served as fixed sets until the project is shared again, or are recompiled from source the cloud doesn't have.
- Whether **publication** and **publication version** stay words in the glossary at all.
- The cutover itself: Better Auth research found beta sessions can't be imported, so everyone signs in once. What the beta's viewers and publishers see on the day.
- Whether `spool cloud publish` and the other beta verbs stay, change or go.

Blocks the cloud compile, serving and sharing spec.

*From Linear DEV-173.*

Related: #64, #68, #78, #90, #19, #18, #3

Plane: SPOOL-59

## Comments

### agent, 2026-10-18T17:43:58.634Z

**Liam, 2026-10-10:** Input from Decide what Spool Cloud costs and what stays free (#90) (2026-10-09): personal (solo) share links go away at launch. Sharing is part of a team. This ticket decides what happens to the links already out there.

### agent, 2026-10-18T17:43:58.643Z

**Liam, 2026-10-10:** ## Resolution (2026-10-10, with Cata)

Every beta publication ends. Nothing moves to the team version.

**What was out there.** All 11 publications lived in the beta environment (`beta.spool.page`, links on `*-beta.onspool.page`, D1 `spool-cloud-beta-test`), all published by Cata. Production (`spool-cloud-auth`) has none. 8 were already stopped; 3 were live: blockworks (invited: morgan.jonasson@gmail.com), sptk (anyone with the link) and eidra-steps (anyone with the link). The only other invited viewer, asim.syed@eidra.com, was on eidra-clock, already stopped.

**Done today.** The 3 live ones were stopped in place, as the beta's own stop does (`state='stopped'`, `access_generation` bumped so every session ends). All 11 links now answer 410 Gone. Nothing was deleted.

**The open points:**
\* **Each publication**: becomes nothing. No share, no team, no redirect. The link ends (410 today, gone once the beta is torn down).
\* **Publication versions**: neither kept as fixed sets nor recompiled. They're deleted with the beta's data when the exporter retires.
\* **Glossary**: publication, publication version, publication visit, publisher and invited viewer leave the glossary with the beta's code. Only the *Avoid* hint under Share ("publication (the beta's)") stays as a pointer. Entry frame stays only if shares still use it.
\* **Cutover**: none needed. Nobody but Cata published, so there's nothing to see on the day.
\* **Beta verbs**: `spool cloud publish`, `stop`, `list`, `status`, `invite` and `revoke` go, with no deprecation release: Cata was their only user. Sharing is done from the canvas.

**Why ending beats migrating**: shares belong to a team (Decide what Spool Cloud costs and what stays free (#90) ended solo links), and migrating would mean keeping a second serving path alive for one person's prototypes. Re-sharing any of them from a team project is a minute's work.
