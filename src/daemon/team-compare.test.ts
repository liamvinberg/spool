import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fakeTeam, TEAM_ORIGIN, teamWriter } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * Compare with now (spool#189), as the daemon serves it: a frame as it stood at a team version, compiled from what
 * the team history held then, its own files and the shared files those old bytes imported, served at its own
 * address beside today's. Nothing is written into design/; what was read is kept in the machine's history cache,
 * read once for the same moment and bounded in size.
 */

const BUTTON = 'export const OrderButton = () => <button type="button">Order then</button>;\n';
const BADGE = "export const Badge = () => <b>badge then</b>;\n";
const CART_THEN =
	'import { OrderButton } from "shared/ui/order-button";\nimport { Badge } from "shared/ui/badge";\n\nexport default function Cart() {\n\treturn <main><h1>cart then</h1><Badge /><OrderButton /></main>;\n}\n';
const CART_NOW =
	'import { OrderButton } from "shared/ui/order-button";\n\nexport default function Cart() {\n\treturn <main><h1>cart now</h1><OrderButton /></main>;\n}\n';

/** Every design file under a folder, by its path, with its bytes: what must not change. Sync's own state aside. */
function tree(dir: string): Record<string, string> {
	const files: Record<string, string> = {};
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true }))
		if (entry.isFile() && !join(entry.parentPath, entry.name).startsWith(join(dir, ".spool"))) {
			const file = join(entry.parentPath, entry.name);
			files[file.slice(dir.length)] = readFileSync(file, "utf8");
		}
	return files;
}

function sizeOf(dir: string): number {
	if (!existsSync(dir)) return 0;
	let total = 0;
	for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true }))
		if (entry.isFile()) total += statSync(join(entry.parentPath, entry.name)).size;
	return total;
}

async function team(options: { historyCacheBytes?: number } = {}) {
	const cloud = fakeTeam();
	const ana = cloud.machine("ana");
	const spoolDir = join(makeTempDir(), ".spool");
	const checkout = join(makeTempDir(), "checkout");
	mkdirSync(checkout);
	execFileSync("git", ["init", "--quiet", "."], { cwd: checkout });
	const { root } = await initTeamProject(realpathSync(checkout), spoolDir, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: ana.request,
		openSocket: ana.openSocket,
	});
	// then: cart imports the order button and a badge; menu stands beside it
	writeDesignFile(root, "shared/ui/order-button.tsx", BUTTON);
	writeDesignFile(root, "shared/ui/badge.tsx", BADGE);
	writeFrame(root, "cart", CART_THEN);
	writeDesignFile(root, "frames/cart/frame.json", '{ "x": 0, "y": 0, "w": 480, "h": 320 }\n');
	writeFrame(root, "menu", "export default function Menu() {\n\treturn <h1>menu then</h1>;\n}\n");
	writeDesignFile(root, "frames/menu/frame.json", '{ "x": 600, "y": 40, "w": 400, "h": 300 }\n');
	const app = makeApp(spoolDir, { cloud: ana.cloud, teamNotice: () => {}, ...options });
	await until(() => cloud.file("checkout", "frames/menu/frame.json") !== undefined, 15_000);
	await until(() => cloud.file("checkout", "shared/ui/badge.tsx") !== undefined, 15_000);
	const moment = cloud.history("checkout").at(-1)?.version ?? 0;
	// since: cart and the button change, the badge goes, menu is deleted and promo is made
	writeFrame(root, "cart", CART_NOW);
	writeDesignFile(root, "shared/ui/order-button.tsx", BUTTON.replace("then", "now"));
	rmSync(join(root, "design/shared/ui/badge.tsx"));
	rmSync(join(root, "design/frames/menu"), { recursive: true });
	writeFrame(root, "promo", "export default function Promo() {\n\treturn <h1>promo</h1>;\n}\n");
	await until(() => cloud.file("checkout", "frames/cart/frame.tsx") === CART_NOW, 15_000);
	await until(() => cloud.file("checkout", "shared/ui/badge.tsx") === null, 15_000);
	await until(() => cloud.file("checkout", "frames/menu/frame.tsx") === null, 15_000);
	await until(() => cloud.file("checkout", "frames/promo/frame.tsx") !== undefined, 15_000);
	const compare = async (frame: string, at: number) => {
		const response = await app.request(
			`/api/p/checkout/history/compare?${new URLSearchParams({ frame, at: String(at) })}`,
		);
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	};
	const document = async (url: string) => {
		const response = await app.request(url);
		return { status: response.status, html: await response.text() };
	};
	return { cloud, app, root, spoolDir, moment, compare, document, ben: cloud.machine("ben") };
}

it("serves a frame as it stood, its own file and the shared files it imported then, today's unchanged, a deleted one in its old place, and an absent one as absent", {
	timeout: 60_000,
}, async () => {
	const { cloud, app, root, moment, compare, document } = await team();
	const before = tree(join(root, "design"));
	const head = cloud.history("checkout").at(-1)?.version;
	const then = await compare("cart", moment);
	expect(then).toEqual({
		status: 200,
		body: {
			state: "ready",
			url: `/p/checkout/history/${moment}/frames/cart`,
			place: { x: 0, y: 0, w: 480, h: 320 },
		},
	});
	const old = await document(String(then.body.url));
	expect(old.status).toBe(200);
	expect(old.html).toContain("cart then");
	expect(old.html).toContain("Order then");
	// the badge is gone today, and the old cart's own bytes still reach it
	expect(old.html).toContain("badge then");
	expect(old.html).not.toContain("cart now");

	const today = await (await app.request("/p/checkout/frames/cart")).text();
	expect(today).toContain("cart now");
	expect(today).toContain("Order now");
	expect(today).not.toContain("badge then");
	// nothing was written into the local copy, nor reached the team
	expect(tree(join(root, "design"))).toEqual(before);
	expect(cloud.file("checkout", "frames/cart/frame.tsx")).toBe(CART_NOW);
	expect(cloud.history("checkout").at(-1)?.version).toBe(head);

	// a frame deleted since is served in its old place, and one that didn't exist then is said not to have
	const menu = await compare("menu", moment);
	expect(menu.body).toMatchObject({ state: "ready", place: { x: 600, y: 40, w: 400, h: 300 } });
	expect((await document(String(menu.body.url))).html).toContain("menu then");
	expect((await compare("promo", moment)).body).toEqual({ state: "absent" });
	expect((await document(`/p/checkout/history/${moment}/frames/promo`)).status).toBe(404);
});

it("reads a moment from the team history once, and keeps what it read within its size", {
	timeout: 60_000,
}, async () => {
	const { cloud, spoolDir, moment, compare, document } = await team({ historyCacheBytes: 64 * 1024 });
	const asked = () => cloud.historyReads("checkout").length;
	const first = asked();
	await document(String((await compare("cart", moment)).body.url));
	const read = asked();
	expect(read).toBeGreaterThan(first);
	// the same moment again and its document: nothing more is read
	await document(String((await compare("cart", moment)).body.url));
	expect(asked()).toBe(read);
	// another frame of it reads only its own bytes, never the moment's files again
	await compare("menu", moment);
	expect(
		cloud
			.historyReads("checkout")
			.slice(read)
			.filter((ask) => !ask.startsWith("/history/blobs/")),
	).toEqual([]);
	expect(sizeOf(join(spoolDir, "history-cache"))).toBeGreaterThan(0);
	expect(sizeOf(join(spoolDir, "history-cache"))).toBeLessThanOrEqual(64 * 1024);
});

it("compares at a set-aside save with that save's own file, not what the team applied", {
	timeout: 60_000,
}, async () => {
	const { cloud, app, ben, document } = await team();
	const bens = await teamWriter(cloud, ben, "checkout");
	// Ben's cart, built on the version before today's, loses to it and is set aside
	const today = [...cloud.history("checkout")].reverse().find((row) => row.path === "frames/cart/frame.tsx");
	await bens.save("frames/cart/frame.tsx", CART_NOW.replace("cart now", "ben's cart"), (today?.version ?? 1) - 1);
	const aside = cloud.history("checkout").at(-1);
	expect(aside?.outcome).toBe("set_aside");
	const query = new URLSearchParams({
		frame: "cart",
		at: String(aside?.version),
		path: "frames/cart/frame.tsx",
		hash: aside?.hash ?? "",
	});
	const body = (await (await app.request(`/api/p/checkout/history/compare?${query}`)).json()) as { url: string };
	const html = (await document(body.url)).html;
	expect(html).toContain("ben's cart");
	expect(html).toContain("Order now");
	// the same version as the team applied it is today's cart
	const applied = (await (
		await app.request(`/api/p/checkout/history/compare?frame=cart&at=${aside?.version}`)
	).json()) as { url: string };
	expect((await document(applied.url)).html).toContain("cart now");
});

it("reads a version for the History pane: its frames on a page, what it did, and what a restore of it changes", {
	timeout: 60_000,
}, async () => {
	const { cloud, app, moment } = await team();
	const version = async (at: number, before: number, page = "") => {
		const response = await app.request(
			`/api/p/checkout/history/version?${new URLSearchParams({ at: String(at), before: String(before), page })}`,
		);
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	};
	const then = await version(moment, -1);
	expect(then.status).toBe(200);
	expect(then.body).toEqual({
		frames: [
			{
				name: "cart",
				now: true,
				same: false,
				did: "added",
				stood: { url: `/p/checkout/history/${moment}/frames/cart`, place: { x: 0, y: 0, w: 480, h: 320 } },
				before: null,
			},
			{
				name: "menu",
				now: false,
				same: false,
				did: "added",
				stood: { url: `/p/checkout/history/${moment}/frames/menu`, place: { x: 600, y: 40, w: 400, h: 300 } },
				before: null,
			},
			{ name: "promo", now: true, same: false, did: null, stood: null, before: null },
		],
		differs: [
			{ frame: "cart", change: "changed" },
			{ frame: "menu", change: "back" },
			{ frame: "promo", change: "gone" },
		],
		shared: ["shared/ui/badge.tsx", "shared/ui/order-button.tsx"],
	});
	// the newest version, from the one we compared at: menu was deleted since, served as it stood just before
	const head = cloud.history("checkout").at(-1)?.version ?? 0;
	const now = await version(head, moment);
	const menu = (now.body.frames as { name: string; did: string | null; before: unknown }[]).find(
		(frame) => frame.name === "menu",
	);
	expect(menu).toMatchObject({
		did: "deleted",
		before: { url: `/p/checkout/history/${moment}/frames/menu`, place: { x: 600, y: 40, w: 400, h: 300 } },
	});
	expect(now.body.differs).toEqual([]);
	expect(now.body.shared).toEqual([]);
	expect((await version(moment, moment + 1)).status).toBe(400);
});
