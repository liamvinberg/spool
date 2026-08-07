import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DaemonStatus } from "./daemon/lifecycle";
import { RefusedError, SpoolError } from "./errors";
import { makeTempDir, serveProject } from "./test-helpers";
import {
	describeSkew,
	planUpgrade,
	requestUpgrade,
	runUpgrade,
	selfUpgradeable,
	skewBehind,
	type UpgradeIo,
} from "./upgrade";

describe("planUpgrade", () => {
	it("classifies an npm-global install and resolves npm beside node", () => {
		const real = "/opt/homebrew/lib/node_modules/spool.page/dist/cli.js";
		const plan = planUpgrade(real, {
			execPath: "/opt/homebrew/bin/node",
			isFile: (p) => p === "/opt/homebrew/bin/npm",
		});

		expect(plan).toEqual({
			ok: true,
			manager: "npm",
			bin: "/opt/homebrew/bin/npm",
			args: ["install", "-g", "spool.page@latest"],
			packageDir: "/opt/homebrew/lib/node_modules/spool.page",
		});
	});

	it("treats an nvm prefix as plain npm", () => {
		const real = "/Users/liam/.nvm/versions/node/v22.1.0/lib/node_modules/spool.page/dist/cli.js";
		const plan = planUpgrade(real, {
			execPath: "/Users/liam/.nvm/versions/node/v22.1.0/bin/node",
			isFile: (p) => p === "/Users/liam/.nvm/versions/node/v22.1.0/bin/npm",
		});

		expect(plan.ok).toBe(true);
		if (plan.ok) expect(plan.manager).toBe("npm");
	});

	it("classifies pnpm's store path and repoints at the stable package dir", () => {
		const real = "/Users/liam/Library/pnpm/global/5/.pnpm/spool.page@0.1.0/node_modules/spool.page/dist/cli.js";
		const plan = planUpgrade(real, {
			env: { PNPM_HOME: "/Users/liam/Library/pnpm" },
			isFile: (p) => p === "/Users/liam/Library/pnpm/pnpm",
		});

		expect(plan).toEqual({
			ok: true,
			manager: "pnpm",
			bin: "/Users/liam/Library/pnpm/pnpm",
			args: ["add", "-g", "spool.page@latest"],
			packageDir: "/Users/liam/Library/pnpm/global/5/node_modules/spool.page",
		});
	});

	it("finds pnpm by walking up when PNPM_HOME is absent (launchd's bare env)", () => {
		const real = "/Users/liam/Library/pnpm/global/5/.pnpm/spool.page@0.1.0/node_modules/spool.page/dist/cli.js";
		const plan = planUpgrade(real, { env: {}, isFile: (p) => p === "/Users/liam/Library/pnpm/pnpm" });

		expect(plan.ok).toBe(true);
		if (plan.ok) expect(plan.bin).toBe("/Users/liam/Library/pnpm/pnpm");
	});

	it("refuses the checkout, naming the path and the fix", () => {
		for (const real of ["/Users/liam/projects/spool/src/cli.ts", "/Users/liam/projects/spool/dist/cli.js"]) {
			const plan = planUpgrade(real, { isFile: () => true });
			expect(plan.ok).toBe(false);
			if (!plan.ok) {
				expect(plan.message).toContain("checkout");
				expect(plan.message).toContain(real);
				expect(plan.message).toContain("git pull");
			}
		}
	});

	it("refuses an unrecognized manager, printing what it resolved", () => {
		const real = "/Users/liam/.bun/install/global/node_modules/spool.page/dist/cli.js";
		const plan = planUpgrade(real, { isFile: () => true });

		expect(plan.ok).toBe(false);
		if (!plan.ok) {
			expect(plan.message).toContain(real);
			expect(plan.message).toContain("npm install -g spool.page@latest");
		}
	});

	it("refuses when the owning manager's binary cannot be found", () => {
		const npm = planUpgrade("/opt/homebrew/lib/node_modules/spool.page/dist/cli.js", {
			execPath: "/opt/homebrew/bin/node",
			isFile: () => false,
		});
		expect(npm.ok).toBe(false);
		if (!npm.ok) expect(npm.message).toContain("npm install -g spool.page@latest");

		const pnpm = planUpgrade("/x/global/5/.pnpm/spool.page@0.1.0/node_modules/spool.page/dist/cli.js", {
			env: {},
			isFile: () => false,
		});
		expect(pnpm.ok).toBe(false);
		if (!pnpm.ok) expect(pnpm.message).toContain("pnpm add -g spool.page@latest");
	});
});

const NPM_CLI = "/opt/homebrew/lib/node_modules/spool.page/dist/cli.js";
const NEW_CLI = "/opt/homebrew/lib/node_modules/spool.page/dist/cli.js";

interface FakeCalls {
	installs: string[][];
	stops: number;
	ensures: string[][];
	rebakes: string[];
}

/** io for a healthy npm install; tests override what each scenario bends. */
function fakeIo(overrides: Partial<UpgradeIo> & { statuses?: DaemonStatus[] }): { io: UpgradeIo; calls: FakeCalls } {
	const calls: FakeCalls = { installs: [], stops: 0, ensures: [], rebakes: [] };
	const statuses = overrides.statuses ?? [{ running: false }];
	let statusCalls = 0;
	const { statuses: _drop, ...rest } = overrides;
	const io: UpgradeIo = {
		cliPath: NPM_CLI,
		execPath: "/opt/homebrew/bin/node",
		execArgv: [],
		resolveReal: (p) => p,
		isFile: (p) => p === "/opt/homebrew/bin/npm",
		plistExists: () => false,
		runInstall: (bin, args) => {
			calls.installs.push([bin, ...args]);
			return 0;
		},
		readInstalledVersion: () => "0.2.0",
		fetchLatest: async () => "0.2.0",
		status: async () => statuses[Math.min(statuses.length - 1, statusCalls++)] as DaemonStatus,
		stop: async () => {
			calls.stops++;
			return { stopped: true };
		},
		ensure: async (command) => {
			calls.ensures.push(command);
			return { url: "http://127.0.0.1:7766" };
		},
		reinstallAutostart: (cliPath) => {
			calls.rebakes.push(cliPath);
		},
		pollMs: 50,
		...rest,
	};
	return { io, calls };
}

describe("runUpgrade", () => {
	it("refuses before touching anything when the plan refuses", async () => {
		const { io, calls } = fakeIo({ cliPath: "/Users/liam/projects/spool/src/cli.ts" });

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(outcome.kind).toBe("refused");
		expect(calls.installs).toEqual([]);
		expect(calls.stops).toBe(0);
	});

	it("fails without restarting when the manager exits nonzero", async () => {
		const { io, calls } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.1.0" }],
			runInstall: () => 1,
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(outcome).toEqual({ kind: "failed", message: "npm exited with 1 — nothing was restarted" });
		expect(calls.stops).toBe(0);
	});

	it("installs, stops and hands the daemon to the new cli by explicit path", async () => {
		const { io, calls } = fakeIo({ statuses: [{ running: true, url: "http://x", pid: 1, version: "0.1.0" }] });

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(calls.installs).toEqual([["/opt/homebrew/bin/npm", "install", "-g", "spool.page@latest"]]);
		expect(calls.stops).toBe(1);
		expect(calls.ensures).toEqual([["/opt/homebrew/bin/node", NEW_CLI, "serve", "--foreground"]]);
		expect(outcome).toEqual({
			kind: "done",
			from: "0.1.0",
			to: "0.2.0",
			daemon: { running: true, url: "http://127.0.0.1:7766", restarted: true },
		});
	});

	it("installs nothing and leaves the daemon alone when the registry offers no more", async () => {
		const { io, calls } = fakeIo({ statuses: [{ running: true, url: "http://x", pid: 1, version: "0.2.0" }] });

		const outcome = await runUpgrade(makeTempDir(), "0.2.0", io);

		expect(outcome).toEqual({ kind: "current", latest: "0.2.0", cli: "0.2.0", daemon: "0.2.0" });
		expect(calls.installs).toEqual([]);
		expect(calls.stops).toBe(0);
		expect(calls.ensures).toEqual([]);
	});

	it("refuses to reinstall under a daemon that is already ahead of the registry", async () => {
		// the publish lag that downgraded a live machine: cli and registry agree
		// on 0.3.0 while the daemon is already serving 0.4.0
		const { io, calls } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.4.0" }],
			fetchLatest: async () => "0.3.0",
		});

		const outcome = await runUpgrade(makeTempDir(), "0.3.0", io);

		expect(outcome).toEqual({ kind: "current", latest: "0.3.0", cli: "0.3.0", daemon: "0.4.0" });
		expect(calls.installs).toEqual([]);
		expect(calls.stops).toBe(0);
	});

	it("refuses when only the cli would move and the daemon would go backwards", async () => {
		const { io, calls } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.4.0" }],
			fetchLatest: async () => "0.3.0",
		});

		const outcome = await runUpgrade(makeTempDir(), "0.2.0", io);

		expect(outcome.kind).toBe("current");
		expect(calls.installs).toEqual([]);
		expect(calls.stops).toBe(0);
	});

	it("upgrades anyway when the registry cannot be reached", async () => {
		const { io, calls } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.1.0" }],
			fetchLatest: async () => undefined,
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(outcome.kind).toBe("done");
		expect(calls.installs.length).toBe(1);
		expect(calls.stops).toBe(1);
	});

	it("asks before the restart, naming the version and the daemon it takes down", async () => {
		const asked: string[] = [];
		const { io, calls } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.1.0" }],
			confirm: async (question) => {
				asked.push(question);
				return true;
			},
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(asked).toEqual([
			"upgrade to v0.2.0 — this stops the daemon (v0.1.0) and everything running under it. continue?",
		]);
		expect(outcome.kind).toBe("done");
		expect(calls.stops).toBe(1);
	});

	it("installs nothing when the human declines", async () => {
		const { io, calls } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.1.0" }],
			confirm: async () => false,
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(outcome).toEqual({ kind: "declined" });
		expect(calls.installs).toEqual([]);
		expect(calls.stops).toBe(0);
	});

	it("does not ask when nothing is running and no plist would be re-baked", async () => {
		let asked = 0;
		const { io } = fakeIo({
			statuses: [{ running: false }],
			confirm: async () => {
				asked++;
				return true;
			},
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(asked).toBe(0);
		expect(outcome.kind).toBe("done");
	});

	it("asks before re-baking a launch agent even with no daemon answering", async () => {
		const asked: string[] = [];
		const { io } = fakeIo({
			statuses: [{ running: false }, { running: true, url: "http://y", pid: 2, version: "0.2.0" }],
			plistExists: () => true,
			confirm: async (question) => {
				asked.push(question);
				return true;
			},
		});

		await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(asked).toEqual(["upgrade to v0.2.0 — this re-bakes the launch agent. continue?"]);
	});

	it("with autostart on: stops, re-bakes the plist onto the new cli, waits for the new version", async () => {
		const { io, calls } = fakeIo({
			statuses: [
				{ running: true, url: "http://x", pid: 1, version: "0.1.0" },
				{ running: true, url: "http://y", pid: 2, version: "0.2.0" },
			],
			plistExists: () => true,
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(calls.stops).toBe(1);
		expect(calls.rebakes).toEqual([NEW_CLI]);
		expect(calls.ensures).toEqual([]);
		expect(outcome).toEqual({
			kind: "done",
			from: "0.1.0",
			to: "0.2.0",
			daemon: { running: true, url: "http://y", restarted: true },
		});
	});

	it("with autostart on: reports what the plist install said, not just a missing daemon", async () => {
		// the put-back happens inside installAutostart; the upgrade's job is to say
		// what it said instead of blaming the daemon that never came up
		const said = "launchctl bootstrap failed: 5: I/O error — the previous launch agent was put back";
		const { io } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.1.0" }],
			plistExists: () => true,
			reinstallAutostart: () => {
				throw new SpoolError(said);
			},
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(outcome).toEqual({ kind: "failed", message: said });
	});

	it("with autostart on: fails loud when no new-version daemon comes up", async () => {
		const { io } = fakeIo({
			statuses: [{ running: true, url: "http://x", pid: 1, version: "0.1.0" }],
			plistExists: () => true,
			pollMs: 30,
		});

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(outcome.kind).toBe("failed");
		if (outcome.kind === "failed") expect(outcome.message).toContain("daemon.log");
	});

	it("installs and stops there when nothing ran and no plist exists", async () => {
		const { io, calls } = fakeIo({ statuses: [{ running: false }] });

		const outcome = await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(calls.installs.length).toBe(1);
		expect(calls.stops).toBe(0);
		expect(calls.ensures).toEqual([]);
		expect(outcome).toEqual({ kind: "done", from: "0.1.0", to: "0.2.0", daemon: { running: false } });
	});

	it("narrates the manager it chose", async () => {
		const lines: string[] = [];
		const { io } = fakeIo({ narrate: (line) => lines.push(line) });

		await runUpgrade(makeTempDir(), "0.1.0", io);

		expect(lines.some((line) => line.includes("npm"))).toBe(true);
	});
});

describe("selfUpgradeable", () => {
	const globalCli = "/opt/homebrew/lib/node_modules/spool.page/dist/cli.js";

	it("is true for an install a package manager owns", () => {
		expect(
			selfUpgradeable({
				cliPath: globalCli,
				resolveReal: (path) => path,
				execPath: "/opt/homebrew/bin/node",
				isFile: (p) => p === "/opt/homebrew/bin/npm",
			}),
		).toBe(true);
	});

	it("is false for the checkout, whose only upgrade is git", () => {
		expect(selfUpgradeable({ cliPath: "/Users/liam/projects/spool/src/cli.ts", resolveReal: (path) => path })).toBe(
			false,
		);
	});

	it("is false when the manager that owns the install cannot be found", () => {
		expect(
			selfUpgradeable({
				cliPath: globalCli,
				resolveReal: (path) => path,
				execPath: "/opt/homebrew/bin/node",
				isFile: () => false,
			}),
		).toBe(false);
	});

	it("is false when the running cli path cannot be resolved", () => {
		expect(
			selfUpgradeable({
				cliPath: globalCli,
				resolveReal: () => {
					throw new Error("ENOENT");
				},
			}),
		).toBe(false);
	});
});

describe("requestUpgrade", () => {
	it("refuses from the checkout instead of spawning", () => {
		// the test runner itself is never an npm/pnpm-global spool install
		const outcome = requestUpgrade(join(makeTempDir(), ".spool"));

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.error.length).toBeGreaterThan(0);
	});
});

/**
 * A skewed cli is refused with the same 401 a bad token gets, and used to be
 * left there: `spool shot` said only `unauthenticated` while `spool status`
 * knew the real story (#155). One sentence now, wherever a skew surfaces.
 */
describe("describeSkew", () => {
	it("says nothing when the daemon and the cli are the same version", () => {
		expect(describeSkew("0.4.0", "0.4.0")).toBe("");
	});

	it("names the cli's version and a way out when they differ", () => {
		const line = describeSkew("0.4.0", "0.3.0");

		expect(line).toContain("cli is v0.3.0");
		// the checkout arm: no package manager owns the test runner's install
		expect(line).toContain("restart it to catch it up");
	});
});

describe("skewBehind", () => {
	it("names the skew behind a refusal, asking the daemon that refused", async () => {
		const { url } = await serveProject();

		expect(await skewBehind(new RefusedError("unauthenticated", url), "9.9.9")).toContain("cli is v9.9.9");
	});

	it("adds nothing to a genuine auth failure against a daemon on the same version", async () => {
		const { url } = await serveProject();

		expect(await skewBehind(new RefusedError("unauthenticated", url), "0.0.0-test")).toBe("");
	});

	it("adds nothing to a failure that was never a refusal, and asks no daemon", async () => {
		expect(await skewBehind(new SpoolError('no frame "ghost" on the canvas'), "9.9.9")).toBe("");
	});

	it("adds nothing when nothing answers health", async () => {
		expect(await skewBehind(new RefusedError("unauthenticated", "http://127.0.0.1:1"), "9.9.9")).toBe("");
	});
});
