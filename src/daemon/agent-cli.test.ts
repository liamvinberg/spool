import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { agentEnv, shimDir, spoolShim, withPathFirst } from "./agent-cli";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const version = (JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { version: string }).version;

/** this checkout's CLI the way `pnpm dev` runs it: node, the tsx loader, the TypeScript entry */
const checkout = {
	execPath: process.execPath,
	execArgv: ["--import", import.meta.resolve("tsx")],
	cli: join(repo, "src", "cli.ts"),
};

describe("spool on the agent's PATH", () => {
	it("leads PATH once, ahead of everything the daemon had", () => {
		const env = withPathFirst({ PATH: ["/usr/bin", "/s/bin", "/bin"].join(delimiter), HOME: "/h" }, "/s/bin");
		expect(env.PATH).toBe(["/s/bin", "/usr/bin", "/bin"].join(delimiter));
		expect(env.HOME).toBe("/h");
		expect(withPathFirst({}, "/s/bin").PATH).toBe("/s/bin");
	});

	it("execs the daemon's own binary, flags and entry, quoted, with the agent's arguments", () => {
		const text = spoolShim({ execPath: "/opt/my node", execArgv: ["-r", "/a/it's.js"], cli: "/a/cli.js" });
		expect(text.startsWith("#!/bin/sh\n")).toBe(true);
		expect(text).toContain(`exec '/opt/my node' '-r' '/a/it'\\''s.js' '/a/cli.js' "$@"`);
	});

	it("writes an executable launcher into spool's state and leaves the rest of the environment alone", () => {
		const spoolDir = makeTempDir();
		const env = agentEnv(spoolDir, { PATH: "/usr/bin", SPOOL_PORT: "7999" }, () => checkout);
		const file = join(shimDir(spoolDir), "spool");
		expect(env.PATH).toBe([shimDir(spoolDir), "/usr/bin"].join(delimiter));
		expect(env.SPOOL_PORT).toBe("7999");
		expect(readFileSync(file, "utf8")).toBe(spoolShim(checkout));
		expect(statSync(file).mode & 0o111).not.toBe(0);
	});

	it("leaves the environment as it was when the launcher cannot be written", () => {
		const blocked = join(makeTempDir(), "file");
		execFileSync("touch", [blocked]);
		expect(agentEnv(blocked, { PATH: "/usr/bin" }, () => checkout)).toEqual({ PATH: "/usr/bin" });
	});

	it("runs this checkout's CLI as a bare `spool` from anywhere", { timeout: 60_000 }, () => {
		const spoolDir = makeTempDir();
		const env = agentEnv(spoolDir, { ...process.env, SPOOL_DIR: spoolDir }, () => checkout);
		const out = execFileSync("spool", ["--version"], { cwd: makeTempDir(), env, encoding: "utf8" });
		expect(out.trim()).toBe(version);
	});
});
