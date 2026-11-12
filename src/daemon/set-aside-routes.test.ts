import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseProjectLink, writeProjectLink } from "../team-project";
import { makeTempDir } from "../test-helpers";
import { recordMark } from "./set-aside";
import { marksOnDisk, setAsideTold } from "./set-aside-routes";

/**
 * Whose save a mark lost to, told from this copy's own account: two local copies signed in as the same account
 * collide like two people, and are told as two copies of one person, never as a teammate.
 */
it("tells a save that lost to another copy of the same account as that copy's, naming its machine", async () => {
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
