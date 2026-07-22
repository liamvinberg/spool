import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DaemonStatus } from "./daemon/lifecycle";
import { makeTempDir } from "./test-helpers";
import { planUpgrade, requestUpgrade, runUpgrade, type UpgradeIo } from "./upgrade";

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

	it("restarts a running daemon even when it already reports the installed version", async () => {
		const { io, calls } = fakeIo({ statuses: [{ running: true, url: "http://x", pid: 1, version: "0.2.0" }] });

		const outcome = await runUpgrade(makeTempDir(), "0.2.0", io);

		expect(calls.stops).toBe(1);
		expect(calls.ensures).toEqual([["/opt/homebrew/bin/node", NEW_CLI, "serve", "--foreground"]]);
		expect(outcome).toEqual({
			kind: "done",
			from: "0.2.0",
			to: "0.2.0",
			daemon: { running: true, url: "http://127.0.0.1:7766", restarted: true },
		});
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

describe("requestUpgrade", () => {
	it("refuses from the checkout instead of spawning", () => {
		// the test runner itself is never an npm/pnpm-global spool install
		const outcome = requestUpgrade(join(makeTempDir(), ".spool"));

		expect(outcome.ok).toBe(false);
		if (!outcome.ok) expect(outcome.error.length).toBeGreaterThan(0);
	});
});
