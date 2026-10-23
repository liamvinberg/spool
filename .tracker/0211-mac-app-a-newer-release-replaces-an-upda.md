# #211 · Mac app: a newer release replaces an update already waiting, so one restart lands on the newest

- State: closed (fixed in 76d2030c)
- Labels: bug, ready-for-agent
- Created: 2026-10-22T06:01:07.614Z
- Updated: 2026-10-22T06:09:13.826Z
- Closed: 2026-10-22T06:09:13.826Z

## What happens
The Mac app downloads an update in the background and holds it until the next restart. If a newer release comes out before that restart, the app keeps the older one. Restarting installs that older version, and then it has to download and restart again for the newer one. That's two updates where one would do.

## Why
In `desktop/src/updates.ts`, `installUpdate` returns at once once a version has been downloaded and is waiting (`if (stagedVersion !== undefined) return stagedVersion`). The hourly check in `desktop/src/main.ts` still sees the newer release, but asking to install it hands back the old version that's already waiting. Nothing downloads the newer one until after the restart.

## What done looks like
- When a check finds a release newer than the one waiting, the app downloads that release in its place, and the next restart lands on the newest.
- When someone clicks Restart to update while a newer release than the waiting one is out, they end up on the newest, with one restart.
- If Squirrel won't take a second download in the same run (the comment on `relaunchToRetryUpdate` hints it sometimes can't cancel), the fallback must still avoid a second restart. Either way, settle it with a test against the Squirrel stand-in.
- The CLI's `spool upgrade` already installs the latest release from npm, so this ticket is only about the Mac app.

Raised by Cata in task 210.

## Comments

### agent, 2026-10-22T06:09:13.826Z

Fixed in 76d2030c (merged to main as 0eda86e8). An update that's waiting no longer stops the hourly check: a newer release downloads in its place. Restart to update also checks once more (5s deadline) and prepares a newer release before restarting. Squirrel does take a second download in the same run: electron-updater's setFeedURL makes a fresh SQRLUpdater, and ShipIt reads its request again after the app quits. That fresh updater clears the staged bundle as it starts, though. So a replacement that fails while downloading falls back to the waiting update, with one restart still. One that fails after the handoff to Squirrel leaves nothing staged, and the app offers Restart to Retry. Tests cover this against the Squirrel stand-in in updates.test.ts and the flow in update-flow.test.ts.
