# #210 · A whole-project share of a very big project settles every page in one request

- State: open
- Labels: needs-triage
- Created: 2026-10-21T19:14:37.979Z
- Updated: 2026-10-21T19:14:37.979Z

Found building #182 (task 205). Creating a whole-project share settles every page inside the one request that makes it, so a very large project could hit the compile object's CPU limit. Pages shares carry the same risk but stop at 100 pages. Settle a whole share's pages in batches after the share is made (or through the 5-minute run), and test with a project of a few hundred pages.

Related: #182, #115
