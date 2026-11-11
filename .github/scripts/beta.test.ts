import { describe, expect, it } from "vitest";
import { announcement, betaKey, betaVersion, prunable } from "./beta";

describe("Spool Beta's feed", () => {
	it("versions a beta as the next patch with its run number, refusing a version that is not a release", () => {
		expect(betaVersion("0.55.0", 12)).toBe("0.55.1-beta.12");
		expect(() => betaVersion("0.55.1-beta.3", 13)).toThrow(/not a released/);
		expect(() => betaVersion("0.55.0", 0)).toThrow(/run number/);
	});

	it("writes and deletes only under beta/, never the released app's files", () => {
		expect(betaKey("beta/latest-mac.yml")).toBe("beta/latest-mac.yml");
		for (const key of [
			"latest-mac.yml",
			"Spool.dmg",
			"Spool-0.55.0.dmg",
			"beta",
			"beta/",
			"beta/../Spool.dmg",
			"/beta/x",
		])
			expect(() => betaKey(key), key).toThrow(/only under beta\//);
	});

	it("deletes every file of the builds older than the newest five, and nothing else", () => {
		const build = (run: number) => [
			`beta/Spool-Beta-0.55.1-beta.${run}.dmg`,
			`beta/Spool-Beta-0.55.1-beta.${run}-arm64-mac.zip`,
			`beta/Spool-Beta-0.55.1-beta.${run}-arm64-mac.zip.blockmap`,
		];
		const keys = [
			"beta/latest-mac.yml",
			"beta/Spool-Beta.dmg",
			"beta/build.json",
			"beta/notes.txt",
			...[3, 9, 10, 11, 12, 20, 21].flatMap(build),
		];
		expect(prunable(keys)).toEqual([...build(3), ...build(9)]);
		expect(prunable(keys.slice(0, 4))).toEqual([]);
	});

	it("announces the version, the commits since the last beta and the download, within Discord's limit", () => {
		const said = announcement(
			"0.55.1-beta.12",
			"a4a5dbe0c0ffee",
			["deck: one", "canvas: two"],
			"https://x/beta/Spool-Beta.dmg",
		);
		expect(said).toBe(
			"**Spool Beta 0.55.1-beta.12** from `a4a5dbe`\n- deck: one\n- canvas: two\n\n[Download Spool Beta](<https://x/beta/Spool-Beta.dmg>)",
		);
		const long = announcement(
			"0.55.1-beta.12",
			"a4a5dbe",
			Array.from({ length: 300 }, (_, n) => `commit ${n} ${"x".repeat(40)}`),
			"https://x",
		);
		expect(long.length).toBeLessThanOrEqual(2000);
		expect(long).toMatch(/- and \d+ more\n\n\[Download/);
	});
});
