import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join } from "node:path";
import type { Clip } from "../../.agents/skills/changelog/scripts/clip";
import { createSettingsStore } from "../../src/daemon/settings";

/**
 * 0.53.0, What's new: the first open on a new version brings the pill back as "Updated to Spool 0.53.0", which unfolds
 * into the highlights, steps through them and folds away into help.
 *
 * The card is spool.page's real changelog as someone coming from 0.51.2 sees it. It is served from here, `through`
 * moved up to 0.53.0 so the card pops as it does once the clips are in, and What's new itself kept out of the
 * highlights so the clip never plays inside itself.
 */
const PLAYED = "0.53.0";
const SEEN = "0.51.2";

const feed = createServer(async (_req, res) => {
	try {
		const live = (await (await fetch("https://spool.page/changelog.json")).json()) as {
			through?: string;
			releases: { version: string; entries: { highlight?: boolean; clip?: unknown }[] }[];
		};
		live.through = PLAYED;
		for (const entry of live.releases.find((release) => release.version === PLAYED)?.entries ?? []) {
			delete entry.highlight;
			delete entry.clip;
		}
		res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(live));
	} catch {
		res.writeHead(502).end();
	}
});
await new Promise<void>((done) => feed.listen(0, "127.0.0.1", done));
feed.unref();

/** kin's first screen at its real size, the canvas the card comes up over */
const kin = (screen: string) => `import { Kin } from "shared/kit/kin/kin";

export default function Frame() {
	return <Kin screen="${screen}" onNext={() => undefined} />;
}
`;

/** the window holds its ask for What's new until filming has begun */
let release = () => {};

export default {
	kit: ["kin"],
	files: {
		"design/frames/amount/frame.json": JSON.stringify({ x: 80, y: 80, w: 390, h: 844 }),
		"design/frames/amount/frame.tsx": kin("amount"),
	},
	env: {
		SPOOL_WHATS_NEW: PLAYED,
		SPOOL_CHANGELOG_URL: `http://127.0.0.1:${(feed.address() as AddressInfo).port}/changelog.json`,
	},
	viewport: { w: 1120, h: 700 },
	// this Mac last saw 0.51.2, as someone does who skipped a few releases; the window reopens on that
	prepare: async ({ page, root }) => {
		createSettingsStore(join(dirname(root), "state")).writeMany([
			{ key: "whatsNew.seen", value: SEEN },
			{ key: "whatsNew.from", value: null },
		]);
		const held = new Promise<void>((done) => {
			release = done;
		});
		await page.route("**/api/whats-new", async (route) => {
			await held;
			await route.continue();
		});
		await page.reload();
		await page.locator("img, iframe").first().waitFor({ timeout: 60_000 });
		await page.waitForTimeout(2500);
	},
	live: async ({ page, walk }) => {
		await walk([{ wait: 400 }]);
		release();
		await page.locator('section[aria-label="What\'s new"]').waitFor({ timeout: 15_000 });
		await walk([
			{ wait: 1600 },
			{ click: 'role=button[name="Next"]', ms: 600 },
			{ wait: 900 },
			{ press: "ArrowRight" },
			{ wait: 900 },
			{ press: "ArrowRight" },
			{ wait: 900 },
			{ press: "ArrowRight" },
			{ wait: 1500 },
			{ click: 'role=button[name="Dismiss (esc)"]', ms: 500 },
			{ wait: 1100 },
			// where it went: help's menu keeps it for as long as this version runs
			{ click: '[data-bar-end="help"]', ms: 700 },
			{ move: "text=What's new", ms: 400 },
			{ wait: 1000 },
		]);
	},
} satisfies Clip;
