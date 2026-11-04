import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { spool } from "./cli-test-helpers";
import { makeTempDir } from "./test-helpers";

// `spool experiments` writes the switch Settings shows, and refuses an id there is none of.
it("lists the experiments, switches one, and refuses an id it does not know", { timeout: 30_000 }, () => {
	const home = makeTempDir();

	const listed = spool(["experiments"], home);
	expect(listed.status).toBe(0);
	expect(listed.stdout).toMatch(/^fast-refresh {2,}off {2}experimental$/m);
	expect(listed.stdout).toMatch(/^knobs {2,}on {3}beta$/m);

	const switched = spool(["experiments", "on", "fast-refresh"], home);
	expect(switched.stdout).toContain("fast-refresh is on");
	expect(JSON.parse(readFileSync(join(home, ".spool", "config.json"), "utf8"))).toEqual({
		experimental: { "fast-refresh": true },
	});
	expect(spool(["experiments", "list"], home).stdout).toMatch(/^fast-refresh {2,}on {3}experimental$/m);

	const refused = spool(["experiments", "off", "agent-panel"], home);
	expect(refused.status).not.toBe(0);
	expect(refused.stderr).toContain('no experiment named "agent-panel"');
});
