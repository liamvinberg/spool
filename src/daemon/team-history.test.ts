import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { fakeTeam, TEAM_ORIGIN, teamWriter } from "../team-sync-test-harness";
import { makeApp, makeTempDir, until, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * A team project's history as this Mac's canvas reads it through its daemon (spool#187): the stretches of the whole
 * project, or of one frame, which the daemon widens to the shared files the frame imports, so a frame's history is
 * its own saves and those to what it imports, and nothing else.
 */

const NINE = Date.UTC(2026, 9, 21, 9);
const BUTTON =
	'import { Icon } from "shared/ui/icon";\n\nexport const OrderButton = () => <button type="button"><Icon />Order</button>;\n';
const MINUTE = 60_000;

async function team() {
	const cloud = fakeTeam();
	let now = NINE;
	cloud.clock(() => now);
	const ana = cloud.machine("ana");
	const ben = cloud.machine("ben");
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
	// cart imports the order button, which imports an icon; menu and the badge are another frame's
	writeDesignFile(root, "shared/ui/icon.tsx", "export const Icon = () => <i>*</i>;\n");
	writeDesignFile(root, "shared/ui/order-button.tsx", BUTTON);
	writeDesignFile(root, "shared/ui/badge.tsx", "export const Badge = () => <b>new</b>;\n");
	writeFrame(
		root,
		"cart",
		'import { OrderButton } from "shared/ui/order-button";\n\nexport default function Cart() {\n\treturn <OrderButton />;\n}\n',
	);
	writeFrame(
		root,
		"menu",
		'import { Badge } from "shared/ui/badge";\n\nexport default function Menu() {\n\treturn <Badge />;\n}\n',
	);
	const app = makeApp(spoolDir, { cloud: ana.cloud, teamNotice: () => {} });
	await until(() => cloud.file("checkout", "frames/menu/frame.tsx") !== undefined, 15_000);
	const bens = await teamWriter(cloud, ben, "checkout");
	return {
		app,
		/** Ben saves a file minutes past nine, the order button still importing the icon. */
		benSaves: async (path: string, minutes: number) => {
			now = NINE + minutes * MINUTE;
			await bens.save(path, `${path.endsWith("order-button.tsx") ? BUTTON : ""}// ben at ${minutes}\n`);
		},
		read: async (query: string) => {
			const response = await app.request(`/api/p/checkout/history/${query}`);
			return { status: response.status, body: (await response.json()) as Record<string, unknown> };
		},
	};
}

type Days = { day: number; stretches: { by: { accountId: string }; paths: string[]; saves: number }[] }[];

it("reads a frame's history as its own saves and those to the shared files it imports, nothing else", {
	timeout: 60_000,
}, async () => {
	const { benSaves, read } = await team();
	await benSaves("shared/ui/order-button.tsx", 30);
	await benSaves("shared/ui/badge.tsx", 31);
	await benSaves("frames/menu/frame.tsx", 32);
	await benSaves("shared/ui/icon.tsx", 33);

	expect((await read("imports?frame=cart")).body).toEqual({
		paths: ["shared/ui/icon.tsx", "shared/ui/order-button.tsx"],
	});

	const cart = await read("stretches?frame=cart&tz=0");
	expect(cart.status).toBe(200);
	const stretches = (cart.body.days as Days).flatMap((day) => day.stretches);
	expect(stretches.map((one) => [one.by.accountId, [...one.paths].sort(), one.saves])).toEqual([
		["ben", ["shared/ui/icon.tsx", "shared/ui/order-button.tsx"], 2],
		["ana", ["frames/cart/frame.tsx", "shared/ui/icon.tsx", "shared/ui/order-button.tsx"], 3],
	]);

	// the project's history is everyone's every save
	const project = await read("stretches?tz=0");
	const all = (project.body.days as Days).flatMap((day) => day.stretches);
	expect(all.map((one) => [one.by.accountId, one.saves])).toEqual([
		["ben", 4],
		["ana", expect.any(Number)],
	]);
	expect(all[1]?.paths).toContain("frames/menu/frame.tsx");

	// a stretch's files, read the frame's way
	const ben = stretches[0] as unknown as { from: number; to: number };
	const files = await read(
		`stretch?frame=cart&from=${ben.from}&to=${ben.to}&account=ben&device=${encodeURIComponent("ben's Mac")}`,
	);
	expect((files.body.files as { path: string }[]).map((file) => file.path)).toEqual([
		"shared/ui/icon.tsx",
		"shared/ui/order-button.tsx",
	]);

	// a frame the project doesn't have has no history to read
	expect((await read("stretches?frame=nowhere&tz=0")).status).toBe(404);
});
