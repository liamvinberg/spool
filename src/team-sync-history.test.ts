import { describe, expect, it } from "vitest";
import { fakeTeam, TEAM_COLORS, TEAM_ORIGIN, teamWriter } from "./team-sync-test-harness";

/**
 * The fake spool.page reads its team history as spool.page does (spool#187): stretches by the asker's day, a stretch's
 * files with whose save stood over each set aside, and the moved-in line. Saves arrive on sync connections of their
 * own, one person a machine, with the team's clock turned between them; assertions are on what the history answers.
 */

const MINUTE = 60_000;
/** Midnight UTC on a day in October: the day the saves are made. */
const DAY = Date.UTC(2026, 9, 21);
const at = (hours: number, minutes = 0, seconds = 0) => DAY + hours * 3_600_000 + minutes * MINUTE + seconds * 1000;

async function team() {
	const cloud = fakeTeam();
	let now = at(8);
	cloud.clock(() => now);
	const ana = cloud.machine("ana");
	const made = await ana.request.fetch?.(`${TEAM_ORIGIN}/api/teams/devosurf/projects`, {
		method: "POST",
		headers: { authorization: `Bearer ${await ana.cloud.vault.read()}`, "content-type": "application/json" },
		body: JSON.stringify({ name: "checkout" }),
	});
	if (made?.status !== 201) throw new Error("no project");
	const history = () => cloud.history("checkout");

	/** A person's own connection, each save at a moment on the team's clock. */
	const writer = async (name: string, options: { moving?: boolean } = {}) => {
		const own = await teamWriter(cloud, name === "ana" ? ana : cloud.machine(name), "checkout", options);
		let saves = 0;
		return {
			async save(path: string, when: number, base?: number | null) {
				now = when;
				await own.save(path, `${name} ${++saves}\n`, base);
			},
		};
	};

	const read = async (route: string, query: Record<string, string | string[]>) => {
		const search = new URLSearchParams();
		for (const [key, value] of Object.entries(query))
			for (const one of Array.isArray(value) ? value : [value]) search.append(key, one);
		const response = await ana.request.fetch?.(
			`${TEAM_ORIGIN}/api/teams/devosurf/projects/checkout/history${route}?${search}`,
			{ headers: { authorization: `Bearer ${await ana.cloud.vault.read()}` } },
		);
		if (response === undefined) throw new Error("no answer");
		return { status: response.status, body: (await response.json()) as Record<string, unknown> };
	};
	return { cloud, writer, read, history, ana };
}

interface Stretch {
	from: number;
	to: number;
	start: number;
	end: number;
	by: { accountId: string; name: string; color: string; device: string };
	saves: number;
	setAside: number;
	paths: string[];
	more: number;
}
type Days = { day: number; stretches: Stretch[] }[];

/** A stretch as a line a person reads: who, from when to when, how many saves. */
const said = (days: Days) =>
	days.map(({ day, stretches }) => ({
		day,
		stretches: stretches.map(
			(one) =>
				`${one.by.name} ${new Date(one.start).toISOString().slice(11, 19)}–${new Date(one.end).toISOString().slice(11, 19)} ${one.saves}`,
		),
	}));

describe("the fake team's history, as stretches", { timeout: 60_000 }, () => {
	it("reads 2,000 saves in a day from three people as one row per stretch, newest first by end", async () => {
		const { writer, read } = await team();
		const ana = await writer("ana");
		const ben = await writer("ben");
		const cara = await writer("cara");
		// Ana works 09:00–09:39:57 and Ben 09:10–09:29:58 at once, then Ana again after 20 quiet minutes, Cara after lunch
		const plan: { who: typeof ana; at: number }[] = [];
		for (let save = 0; save < 800; save += 1) plan.push({ who: ana, at: at(9, 0, save * 3) });
		for (let save = 0; save < 600; save += 1) plan.push({ who: ben, at: at(9, 10, save * 2) });
		for (let save = 0; save < 200; save += 1) plan.push({ who: ana, at: at(10, 0, save * 3) });
		for (let save = 0; save < 400; save += 1) plan.push({ who: cara, at: at(13, 0, save * 3) });
		plan.sort((a, b) => a.at - b.at);
		for (const [index, step] of plan.entries()) await step.who.save(`frames/f${index % 7}/frame.tsx`, step.at);

		const { status, body } = await read("/stretches", { tz: "0", prefix: "frames/" });
		expect(status).toBe(200);
		expect(said(body.days as Days)).toEqual([
			{
				day: DAY,
				stretches: [
					"cara 13:00:00–13:19:57 400",
					"ana 10:00:00–10:09:57 200",
					"ana 09:00:00–09:39:57 800",
					"ben 09:10:00–09:29:58 600",
				],
			},
		]);
		const [first] = (body.days as Days)[0]?.stretches ?? [];
		expect(first?.by).toEqual({ accountId: "cara", name: "cara", color: TEAM_COLORS[2], device: "cara's Mac" });
		expect(first?.paths).toHaveLength(7);
		expect(body.next).toBeNull();
		// one person's, the others folded away
		const bens = await read("/stretches", { tz: "0", prefix: "frames/", person: "ben" });
		expect(said(bens.body.days as Days)).toEqual([{ day: DAY, stretches: ["ben 09:10:00–09:29:58 600"] }]);
	});

	it("makes two people saving at once two interleaved stretches, and ends one at a 10-minute gap", async () => {
		const { writer, read } = await team();
		const ana = await writer("ana");
		const ben = await writer("ben");
		for (let minute = 0; minute < 6; minute += 1) {
			await ana.save("frames/cart/frame.tsx", at(9, minute * 2));
			await ben.save("frames/menu/frame.tsx", at(9, minute * 2 + 1));
		}
		// 10 minutes after Ana's last is still hers; a minute more starts another
		await ana.save("frames/cart/frame.tsx", at(9, 20));
		await ana.save("frames/cart/frame.tsx", at(9, 31));
		const { body } = await read("/stretches", { tz: "0", path: "frames/cart/frame.tsx", prefix: "frames/menu/" });
		expect(said(body.days as Days)).toEqual([
			{
				day: DAY,
				stretches: ["ana 09:31:00–09:31:00 1", "ana 09:00:00–09:20:00 7", "ben 09:01:00–09:11:00 6"],
			},
		]);
	});

	it("never runs a stretch across the asker's midnight, and reads a few days at a time", async () => {
		const { writer, read } = await team();
		const ana = await writer("ana");
		await ana.save("frames/cart/frame.tsx", at(-26));
		await ana.save("frames/cart/frame.tsx", at(22, 55));
		await ana.save("frames/cart/frame.tsx", at(23, 5));
		// in Stockholm, an hour ahead, 23:05 UTC is past midnight
		const { body } = await read("/stretches", { tz: "60", prefix: "frames/", days: "2" });
		const stockholm = (day: number) => day - 60 * MINUTE;
		expect(said(body.days as Days)).toEqual([
			{ day: stockholm(DAY + 86_400_000), stretches: ["ana 23:05:00–23:05:00 1"] },
			{ day: stockholm(DAY), stretches: ["ana 22:55:00–22:55:00 1"] },
		]);
		expect(body.next).toBe(stockholm(DAY));
		const older = await read("/stretches", { tz: "60", prefix: "frames/", before: String(body.next) });
		expect(said(older.body.days as Days)).toEqual([
			{ day: stockholm(DAY - 2 * 86_400_000), stretches: ["ana 22:00:00–22:00:00 1"] },
		]);
		expect(older.body.next).toBeNull();
	});

	it("names a stretch's files, and whose save stood over each one set aside", async () => {
		const { writer, read, history } = await team();
		const ana = await writer("ana");
		const ben = await writer("ben");
		await ana.save("shared/ui/go.tsx", at(9));
		const built = history().at(-1)?.version ?? null;
		await ana.save("shared/ui/go.tsx", at(9, 1));
		// Ben built on the version Ana's second save replaced: his loses
		await ben.save("shared/ui/go.tsx", at(9, 2), built);
		await ben.save("frames/cart/frame.tsx", at(9, 3));
		const { body } = await read("/stretches", { tz: "0", prefix: "shared/", path: "frames/cart/frame.tsx" });
		const [bens] = (body.days as Days)[0]?.stretches ?? [];
		expect(bens).toMatchObject({ saves: 2, setAside: 1, paths: ["frames/cart/frame.tsx", "shared/ui/go.tsx"] });
		const files = await read("/stretch", {
			from: String(bens?.from),
			to: String(bens?.to),
			account: "ben",
			device: "ben's Mac",
			prefix: "shared/",
			path: "frames/cart/frame.tsx",
		});
		expect(files.body).toMatchObject({
			files: [
				{ path: "frames/cart/frame.tsx", saves: 1, setAside: [] },
				{
					path: "shared/ui/go.tsx",
					saves: 1,
					setAside: [{ at: at(9, 2), stood: { at: at(9, 1), by: { accountId: "ana", name: "ana" } } }],
				},
			],
			next: null,
		});
	});

	it("keeps when and by whom a project moved in, and its commit once reported", async () => {
		const { writer, read, ana: anaMachine } = await team();
		expect((await read("/stretches", { tz: "0" })).body.movedIn).toBeNull();
		const ana = await writer("ana", { moving: true });
		await ana.save("frames/cart/frame.tsx", at(9));
		await ana.save("frames/menu/frame.tsx", at(9, 1));
		expect((await read("/stretches", { tz: "0" })).body.movedIn).toEqual({
			at: at(9),
			by: { accountId: "ana", name: "ana" },
			commit: null,
		});
		const report = async (commit: string) =>
			(
				await anaMachine.request.fetch?.(`${TEAM_ORIGIN}/api/teams/devosurf/projects/checkout/history/moved-in`, {
					method: "PUT",
					headers: {
						authorization: `Bearer ${await anaMachine.cloud.vault.read()}`,
						"content-type": "application/json",
					},
					body: JSON.stringify({ commit }),
				})
			)?.status;
		expect(await report("not a commit")).toBe(400);
		expect(await report("4e1c9a2".padEnd(40, "0"))).toBe(204);
		expect(await report("ffffff".padEnd(40, "0"))).toBe(204);
		expect(((await read("/stretches", { tz: "0" })).body.movedIn as { commit: string }).commit).toBe(
			"4e1c9a2".padEnd(40, "0"),
		);
	});
});
