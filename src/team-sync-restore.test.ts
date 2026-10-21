import { describe, expect, it } from "vitest";
import { fakeTeam, TEAM_ORIGIN, teamWriter } from "./team-sync-test-harness";

/**
 * The fake spool.page takes a restore as spool.page does (spool#188): a bundle carrying `restore` whose every save
 * must put its path back to what it held at `to`, refused as `restore_mismatch` otherwise; held to no fair-use limit
 * but the size caps; each save on its own base under the collision rule; the restore kept on each save and read as a
 * stretch of its own, with when the version it went back to was made.
 */

const MINUTE = 60_000;
const DAY = Date.UTC(2026, 9, 21);
const at = (hours: number, minutes = 0) => DAY + hours * 3_600_000 + minutes * MINUTE;

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
	const writer = async (name: string) => {
		const own = await teamWriter(cloud, name === "ana" ? ana : cloud.machine(name), "checkout");
		return {
			save: async (path: string, text: string, when: number, base?: number | null) => {
				now = when;
				await own.save(path, text, base);
				return cloud.history("checkout").at(-1)?.version ?? 0;
			},
			restore: async (...args: Parameters<typeof own.restore>) => {
				now += MINUTE;
				return own.restore(...args);
			},
		};
	};
	const read = async (route: string, query: Record<string, string>) => {
		const response = await ana.request.fetch?.(
			`${TEAM_ORIGIN}/api/teams/devosurf/projects/checkout/history${route}?${new URLSearchParams(query)}`,
			{ headers: { authorization: `Bearer ${await ana.cloud.vault.read()}` } },
		);
		return (await response?.json()) as Record<string, unknown>;
	};
	return { cloud, writer, read, file: (path: string) => cloud.file("checkout", path) };
}

const CART = "frames/shop/cart/frame.tsx";

describe("the fake team takes a restore", { timeout: 30_000 }, () => {
	it("applies saves that put back what each path held then, and keeps the restore on each", async () => {
		const { writer, read, file } = await team();
		const ana = await writer("ana");
		await ana.save(CART, "first\n", at(9));
		const then = await ana.save("frames/shop/cart/data.json", "{}\n", at(9, 1));
		await ana.save(CART, "second\n", at(9, 5));
		await ana.save("frames/shop/cart/extra.tsx", "new\n", at(9, 6));
		const restore = { id: "r1", kind: "frame" as const, target: "shop/cart", to: then };
		const answers = await ana.restore(restore, [
			{ path: CART, text: "first\n" },
			{ path: "frames/shop/cart/extra.tsx", text: null },
		]);
		expect(answers.map((answer) => answer.type)).toEqual(["saved", "saved"]);
		expect(file(CART)).toBe("first\n");
		expect(file("frames/shop/cart/extra.tsx")).toBeNull();
		const saves = await read("/saves", { path: CART });
		expect((saves.saves as { restore: unknown }[]).map((save) => save.restore)).toEqual([restore, null, null]);
		const stretches = await read("/stretches", { tz: "0" });
		const [restoring, working] = (stretches.days as { stretches: Record<string, unknown>[] }[])[0]?.stretches ?? [];
		// the restore is its own stretch, though Ana saved a minute before it
		expect(restoring).toMatchObject({ saves: 2, restore: { ...restore, toAt: at(9, 1) } });
		expect(working).toMatchObject({ saves: 4, restore: null });
	});

	it("refuses a save whose bytes the path didn't hold then, and takes a delete of what didn't exist", async () => {
		const { writer } = await team();
		const ana = await writer("ana");
		const then = await ana.save(CART, "first\n", at(9));
		await ana.save(CART, "second\n", at(9, 1));
		await ana.save("frames/shop/cart/extra.tsx", "new\n", at(9, 2));
		const answers = await ana.restore({ id: "r2", kind: "frame", target: "shop/cart", to: then }, [
			{ path: CART, text: "something else\n" },
			{ path: "frames/shop/cart/extra.tsx", text: null },
		]);
		expect(answers).toMatchObject([
			{ type: "refused", reason: "restore_mismatch" },
			{ type: "saved", path: "frames/shop/cart/extra.tsx" },
		]);
	});

	it("puts back a set-aside save: the one at exactly `to`", async () => {
		const { writer, file } = await team();
		const ana = await writer("ana");
		const ben = await writer("ben");
		const built = await ana.save(CART, "first\n", at(9));
		await ana.save(CART, "ana's\n", at(9, 1));
		const aside = await ben.save(CART, "ben's\n", at(9, 2), built);
		const answers = await ben.restore({ id: "r3", kind: "file", target: CART, to: aside }, [
			{ path: CART, text: "ben's\n" },
		]);
		expect(answers).toMatchObject([{ type: "saved" }]);
		expect(file(CART)).toBe("ben's\n");
	});

	it("sets aside a restore's save built on a version the team moved past", async () => {
		const { writer, file } = await team();
		const ana = await writer("ana");
		const ben = await writer("ben");
		const then = await ana.save(CART, "first\n", at(9));
		const seen = await ana.save(CART, "second\n", at(9, 1));
		await ben.save(CART, "ben's\n", at(9, 2));
		const answers = await ana.restore({ id: "r4", kind: "file", target: CART, to: then }, [
			{ path: CART, text: "first\n", base: seen },
		]);
		expect(answers).toMatchObject([{ type: "set-aside" }]);
		expect(file(CART)).toBe("ben's\n");
	});

	it("counts a checked restore against no fair-use limit, only the size caps", async () => {
		const { cloud, writer } = await team();
		const ana = await writer("ana");
		const then = await ana.save(CART, "first\n", at(9));
		const second = await ana.save(CART, "second\n", at(9, 1));
		cloud.bucket(0, 1, () => at(9, 2));
		cloud.limit("monthly_limit", 60);
		const restore = { id: "r5", kind: "file" as const, target: CART, to: then };
		expect(await ana.restore(restore, [{ path: CART, text: "first\n" }])).toMatchObject([{ type: "saved" }]);
		cloud.limit("project_full", 60);
		expect(
			await ana.restore({ ...restore, id: "r6", to: second }, [{ path: CART, text: "second\n" }]),
		).toMatchObject([{ type: "refused", reason: "project_full" }]);
	});
});
