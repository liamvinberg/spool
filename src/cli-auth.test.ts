import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spool } from "./cli-test-helpers";
import { makeTempDir } from "./test-helpers";

describe("Cloud account CLI", () => {
	it("signs out outside a project through the instance-specific Keychain entry", () => {
		const home = makeTempDir();
		const bin = join(home, "bin");
		const calls = join(home, "security-calls");
		mkdirSync(bin);
		writeFileSync(
			join(bin, "security"),
			`#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(calls)}
case "$1" in find-generic-password|delete-generic-password) exit 44;; esac
`,
		);
		chmodSync(join(bin, "security"), 0o755);
		const result = spool(["logout"], home, home, { PATH: `${bin}:${process.env.PATH ?? ""}` });
		expect(result.status).toBe(0);
		expect(result.stdout).toBe("signed out of spool Cloud\n");
		expect(result.stderr).toBe("");
		const invoked = readFileSync(calls, "utf8");
		expect(invoked).toContain("find-generic-password");
		expect(invoked).toContain("delete-generic-password");
		expect(invoked).toContain("spool.publisher-session.");
		expect(invoked).not.toMatch(/token|verifier|code=/u);
	});
});
