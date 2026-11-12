import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseProjectLink, writeProjectLink } from "../team-project";
import { makeTempDir } from "../test-helpers";
import { recordMark } from "./set-aside";
import { createSetAside, marksOnDisk, setAsideTold } from "./set-aside-routes";

/** A team project's local copy synced as `liam`, with set-aside marks of its own. */
function teamCopy() {
	const root = makeTempDir();
	const link = parseProjectLink("https://cloud.test/devosurf/checkout");
	if (link === undefined) throw new Error("no link");
	writeProjectLink(root, link);
	const designDir = join(root, "design");
	mkdirSync(join(designDir, ".spool"), { recursive: true });
	writeFileSync(join(designDir, ".spool", "sync.json"), JSON.stringify({ project: link.url, account: "liam" }));
	const mark = (path: string, accountId: string, device: string) =>
		recordMark(
			designDir,
			{ path, kind: "set-aside", version: 2, by: { accountId, device }, batch: "one" },
			new TextEncoder().encode("mine\n"),
		);
	return { root, mark };
}

/**
 * Whose save a mark lost to, told from this copy's own account: two local copies signed in as the same account
 * collide like two people, and are told as two copies of one person, never as a teammate.
 */
it("tells a save that lost to another copy of the same account as that copy's, naming its machine", async () => {
	const { root, mark } = teamCopy();
	mark("frames/a/frame.tsx", "liam", "Liam's MacBook Pro");
	mark("shared/data.ts", "asim", "Asim's Mac");

	const [copy, teammate] = await marksOnDisk(root);
	expect(copy).toMatchObject({ self: true, by: null, device: "Liam's MacBook Pro", frames: ["a"] });
	expect(teammate).toMatchObject({ self: false, by: null, device: null });
	expect(setAsideTold(copy as NonNullable<typeof copy>)).toMatch(
		/^your change to design\/frames\/a\/frame\.tsx was set aside: another copy of you on Liam's MacBook Pro changed the same lines and reached the team first, so the file on disk is that copy's now and yours is kept in design\/\.spool\/set-aside\/[0-9a-f-]+\/frame\.tsx\./u,
	);
	expect(setAsideTold(teammate as NonNullable<typeof teammate>)).toContain(
		"set aside: a teammate changed the same lines",
	);
});

/**
 * An agent's command waits on the daemon five seconds at most: with spool.page slow, every mark is still told within
 * one short wait, as "a teammate", and none counts as told until the command says it printed them.
 */
it("tells every mark within one wait when names are slow, and again until it is said to have been printed", async () => {
	const { root, mark } = teamCopy();
	for (const name of ["asim", "cata", "theo"]) mark(`frames/${name}/frame.tsx`, name, `${name}'s Mac`);
	const stalled: typeof fetch = (_input, init) =>
		new Promise((_done, fail) => init?.signal?.addEventListener("abort", () => fail(init.signal?.reason)));
	const marks = createSetAside({
		spoolDir: makeTempDir(),
		request: { origin: "https://cloud.test", vault: { read: async () => "t".repeat(43) }, fetch: stalled },
		resolve: () => ({ root }),
		framesUsing: async () => [],
		changed: () => {},
	});

	const start = Date.now();
	const told = await marks.untold(root);
	expect(Date.now() - start).toBeLessThan(3_000);
	expect(told).toHaveLength(3);
	expect(told.every(({ line }) => line.includes("set aside: a teammate changed the same lines"))).toBe(true);
	// the command never said it printed them: the next is told them again
	expect((await marks.untold(root)).map(({ id }) => id).sort()).toEqual(told.map(({ id }) => id).sort());
	const [first, ...rest] = told;
	marks.told(root, first === undefined ? [] : [first.id]);
	expect((await marks.untold(root)).map(({ id }) => id).sort()).toEqual(rest.map(({ id }) => id).sort());
	marks.told(
		root,
		rest.map(({ id }) => id),
	);
	expect(await marks.untold(root)).toEqual([]);
});
