/**
 * Every first path segment spool's daemon serves or the Mac app routes as one of its own places. The Mac app shows a
 * team at `/<team>`, the same path as spool.page/<team>, so no team may take one of these as its address: spool.page
 * reserves every one, reading this list from `spool.page/sync-protocol`. A daemon route under a new first segment
 * fails `app-paths.test.ts` until it is added here.
 */
export const APP_PATH_SEGMENTS: readonly string[] = [
	// Home's own places in the Mac app
	"recent",
	"account",
	// a project's canvas, and the daemon's own routes
	"p",
	"api",
	"capture",
	"covers",
	"favicon.svg",
	"icons",
	"play",
	"player-assets",
	"thumbnails",
	"ui",
	"vendor",
	// the daemon's API beneath /api, kept clear so a team's address never reads as one of them
	"abs",
	"cloud",
	"events",
	"fs",
	"health",
	"projects",
	"session",
	"settings",
	"upgrade",
];
