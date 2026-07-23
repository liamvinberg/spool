import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SpoolError } from "../errors";
import { makeTempDir } from "../test-helpers";
import {
	BUN_VERSION,
	bunDownloadUrl,
	bunTarget,
	ensureToolchain,
	packagesManifest,
	TERM_PINS,
	toolchainPaths,
} from "./term-toolchain";

function fakeEffects(spoolDir: string) {
	const calls: string[] = [];
	const paths = toolchainPaths(spoolDir);
	return {
		calls,
		effects: {
			narrate: (line: string) => calls.push(`narrate:${line}`),
			download: async (url: string, dest: string) => {
				calls.push(`download:${url}`);
				writeFileSync(dest, "zip");
			},
			unzip: async (archive: string, dest: string) => {
				calls.push("unzip");
				void archive;
				const inner = join(dest, `bun-${bunTarget(process.platform, process.arch)}`);
				mkdirSync(inner, { recursive: true });
				writeFileSync(join(inner, "bun"), "#!fake", { mode: 0o755 });
			},
			run: async (bin: string, args: string[], cwd: string) => {
				calls.push(`run:${args.join(" ")}`);
				void bin;
				mkdirSync(join(cwd, "node_modules"), { recursive: true });
			},
		},
		paths,
	};
}

describe("pins", () => {
	it("pins exact versions, never ranges", () => {
		expect(BUN_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
		for (const version of Object.values(TERM_PINS)) expect(version).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("spells the packages manifest from the pins alone", () => {
		const manifest = JSON.parse(packagesManifest());
		expect(manifest.dependencies).toEqual(TERM_PINS);
	});
});

describe("bun target", () => {
	it("maps this platform to a release target", () => {
		expect(bunTarget("darwin", "arm64")).toBe("darwin-aarch64");
		expect(bunTarget("linux", "x64")).toBe("linux-x64");
	});

	it("refuses an unsupported platform by name", () => {
		expect(() => bunTarget("sunos", "x64")).toThrow(SpoolError);
	});

	it("spells the pinned download url", () => {
		expect(bunDownloadUrl("darwin-aarch64")).toBe(
			`https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-darwin-aarch64.zip`,
		);
	});
});

describe("ensureToolchain", () => {
	it("provisions bun, installs the pinned packages, and materializes the helpers", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const { calls, effects, paths } = fakeEffects(spoolDir);

		const toolchain = await ensureToolchain(spoolDir, effects);

		expect(calls.some((c) => c.startsWith("download:https://github.com/oven-sh/bun/"))).toBe(true);
		expect(calls).toContain("run:install");
		expect(toolchain.bunBin).toBe(paths.bunBin);
		expect(existsSync(paths.supervisor)).toBe(true);
		expect(readFileSync(join(paths.helpersModules, "spool", "term.js"), "utf8")).toContain("7770;go;");
		expect(toolchain.nodePath.split(":")).toEqual([paths.packagesModules, paths.helpersModules]);
	});

	it("does nothing on a machine that already has the toolchain", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const first = fakeEffects(spoolDir);
		await ensureToolchain(spoolDir, first.effects);

		const second = fakeEffects(spoolDir);
		await ensureToolchain(spoolDir, second.effects);

		expect(second.calls.filter((c) => c.startsWith("download") || c.startsWith("run"))).toEqual([]);
	});

	it("retries a failed install instead of trusting a half-provisioned dir", async () => {
		const spoolDir = join(makeTempDir(), ".spool");
		const broken = fakeEffects(spoolDir);
		broken.effects.run = async () => {
			throw new Error("network down");
		};
		await expect(ensureToolchain(spoolDir, broken.effects)).rejects.toThrow(SpoolError);

		const retry = fakeEffects(spoolDir);
		await ensureToolchain(spoolDir, retry.effects);
		expect(retry.calls).toContain("run:install");
	});
});
