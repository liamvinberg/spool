import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUTOSTART_LABEL, installAutostart, launchAgentPath, launchAgentPlist, removeAutostart } from "./autostart";
import { SpoolError } from "./errors";
import { makeTempDir } from "./test-helpers";

const spec = {
	execPath: "/opt/node/bin/node",
	execArgv: [],
	cliPath: "/opt/spool/dist/cli.js",
	logFile: "/home/liam/.spool/daemon.log",
};

/** A launchctl stand-in that records calls and answers success. */
function fakeLaunchctl(failOn?: string) {
	const calls: string[][] = [];
	const run = (args: string[]) => {
		calls.push(args);
		if (failOn !== undefined && args[0] === failOn) return { status: 5, stderr: "Bootstrap failed: 5: I/O error" };
		return { status: 0, stderr: "" };
	};
	return { calls, run };
}

describe("launchAgentPlist", () => {
	it("runs serve --foreground with baked absolute paths, at load, revived only on crash", () => {
		const plist = launchAgentPlist(spec);

		expect(plist).toContain(`<string>${AUTOSTART_LABEL}</string>`);
		const programArgs = plist.slice(plist.indexOf("ProgramArguments"));
		const order = ["/opt/node/bin/node", "/opt/spool/dist/cli.js", "serve", "--foreground"].map(
			(arg) => `<string>${arg}</string>`,
		);
		let cursor = 0;
		for (const line of order) {
			const at = programArgs.indexOf(line, cursor);
			expect(at, `${line} in order`).toBeGreaterThan(-1);
			cursor = at + line.length;
		}
		expect(plist).toContain("<key>RunAtLoad</key>");
		// crash-only KeepAlive: a clean stop stays stopped, a stand-down is not a crash
		expect(plist).toMatch(/<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>/);
		expect(plist).toContain("<string>/home/liam/.spool/daemon.log</string>");
	});

	it("carries a dev checkout's loader flags", () => {
		const plist = launchAgentPlist({ ...spec, execArgv: ["--import", "tsx"] });

		expect(plist.indexOf("<string>--import</string>")).toBeLessThan(plist.indexOf("<string>tsx</string>"));
		expect(plist.indexOf("<string>--import</string>")).toBeGreaterThan(-1);
	});

	it("escapes xml in paths", () => {
		const plist = launchAgentPlist({ ...spec, cliPath: "/tmp/a & b/<cli>.js" });

		expect(plist).toContain("<string>/tmp/a &amp; b/&lt;cli&gt;.js</string>");
		expect(plist).not.toContain("a & b");
	});

	it.runIf(process.platform === "darwin")("is a valid property list by plutil", () => {
		const lint = spawnSync("plutil", ["-lint", "-"], { input: launchAgentPlist(spec), encoding: "utf8" });

		expect(lint.stdout).toContain("OK");
		expect(lint.status).toBe(0);
	});
});

describe("installAutostart", () => {
	it("writes the agent, then bootout, enable, bootstrap in the gui domain", () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const { calls, run } = fakeLaunchctl();

		const plist = installAutostart({ home, uid: 501, spec, spoolDir, run });

		expect(plist).toBe(launchAgentPath(home));
		expect(readFileSync(plist, "utf8")).toContain(AUTOSTART_LABEL);
		expect(existsSync(spoolDir)).toBe(true); // the log file's directory must exist for launchd
		expect(calls).toEqual([
			["bootout", `gui/501/${AUTOSTART_LABEL}`],
			["enable", `gui/501/${AUTOSTART_LABEL}`],
			["bootstrap", "gui/501", plist],
		]);
	});

	it("ignores a failing bootout — there was nothing to clear", () => {
		const home = makeTempDir();
		const { run } = fakeLaunchctl("bootout");

		expect(() => installAutostart({ home, uid: 501, spec, spoolDir: join(home, ".spool"), run })).not.toThrow();
	});

	it("fails loud when bootstrap fails, with launchctl's own words", () => {
		const home = makeTempDir();
		const { run } = fakeLaunchctl("bootstrap");

		expect(() => installAutostart({ home, uid: 501, spec, spoolDir: join(home, ".spool"), run })).toThrow(
			/Bootstrap failed: 5/,
		);
		expect(() => installAutostart({ home, uid: 501, spec, spoolDir: join(home, ".spool"), run })).toThrow(SpoolError);
	});
});

describe("removeAutostart", () => {
	it("boots the job out and deletes the agent", () => {
		const home = makeTempDir();
		const { calls, run } = fakeLaunchctl();
		installAutostart({ home, uid: 501, spec, spoolDir: join(home, ".spool"), run });
		calls.length = 0;

		const result = removeAutostart({ home, uid: 501, run });

		expect(result).toEqual({ removed: true, plist: launchAgentPath(home) });
		expect(existsSync(launchAgentPath(home))).toBe(false);
		expect(calls).toEqual([["bootout", `gui/501/${AUTOSTART_LABEL}`]]);
	});

	it("removing what is not installed is goal-state, still booting out strays", () => {
		const home = makeTempDir();
		const { calls, run } = fakeLaunchctl();

		expect(removeAutostart({ home, uid: 501, run })).toEqual({ removed: false });
		expect(calls).toEqual([["bootout", `gui/501/${AUTOSTART_LABEL}`]]);
	});
});
