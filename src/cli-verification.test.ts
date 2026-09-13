import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { describe, expect, it, onTestFinished } from "vitest";
import { spool, spoolAsync } from "./cli-test-helpers";
import { serveDaemon } from "./daemon/server";
import { makeProject, makeTempDir, markProject, writeDesignFile, writeFrame, writePageFrame } from "./test-helpers";

// Each case runs the real CLI in an isolated home. Separate files let CI share the process startup work.
describe("spool cli verification", { timeout: 30_000 }, () => {
	it("checks every html frame from a nested directory without registering or writing", () => {
		const home = makeTempDir();
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'import { Card } from "../../shared/ui/card";\nexport default function Home() { return <Card />; }\n',
		);
		writeDesignFile(
			root,
			"shared/ui/card.tsx",
			'export function Card() { return <main aria-label="home">home</main>; }\n',
		);
		writePageFrame(root, "account", "settings", "export default function Settings() { return <p>settings</p>; }\n");
		const nested = join(root, "src", "feature");
		mkdirSync(nested, { recursive: true });

		const result = spool(["check"], home, nested);

		expect(result.status).toBe(0);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("");
		expect(existsSync(join(home, ".spool"))).toBe(false);
		expect(existsSync(join(root, "design", ".spool"))).toBe(false);
		expect(existsSync(join(root, "design", "frames", "home", "frame.json"))).toBe(false);
	});

	it("refuses a FIFO frame without blocking", () => {
		const root = makeTempDir();
		markProject(root);
		const frame = join(root, "design", "frames", "home", "frame.tsx");
		mkdirSync(join(root, "design", "frames", "home"), { recursive: true });
		const fifo = spawnSync("mkfifo", [frame], { encoding: "utf8" });
		expect(fifo.status).toBe(0);

		// a read of a FIFO that is never written blocks forever, so any finite timeout
		// tells the refusal from the hang; ten seconds is so that a `tsx` cold start
		// under a saturated suite (see the describe above) is not mistaken for one
		const result = spool(["check", root], makeTempDir(), undefined, {}, 10_000);

		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe(
			"design/frames/home/frame.tsx:1:1 TS5083: Filesystem read refused (non-regular file)\n",
		);
	});

	it("prints sorted, deduplicated TypeScript diagnostics for frame and shared source", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'import { broken } from "../../shared/ui/broken";\nexport default function Home() { return <main>{broken}</main>; }\n',
		);
		writePageFrame(
			root,
			"account",
			"settings",
			"export default function Settings() { return <p>{unknownName}</p>; }\n",
		);
		writeDesignFile(root, "shared/ui/broken.ts", "export const broken: string = 1;\n");

		const result = spool(["check", root], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("design/frames/account/settings/frame.tsx:1:");
		expect(result.stderr).toContain("TS2304: Cannot find name 'unknownName'.");
		expect(result.stderr).toContain("design/shared/ui/broken.ts:1:");
		expect(result.stderr).toContain("TS2322: Type 'number' is not assignable to type 'string'.");
		expect(result.stderr).not.toContain(root);
		expect(result.stderr.split("\n").filter(Boolean)).toEqual([
			...new Set(result.stderr.split("\n").filter(Boolean)),
		]);
	});

	it("treats import-map packages as untyped while reporting unmapped packages", () => {
		const root = makeTempDir();
		markProject(root);
		writeDesignFile(
			root,
			"shared/importmap.json",
			'{ "imports": { "charting": "https://example.test/charting.js" } }\n',
		);
		writeFrame(
			root,
			"home",
			'import charting from "charting";\nimport missing from "missing";\nexport default function Home() { return <main>{String(charting ?? missing)}</main>; }\n',
		);

		const result = spool(["check", root], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("TS2307: Cannot find module 'missing'");
		expect(result.stderr).not.toContain("charting");
	});

	it.each(['import value from "../../shared/\\0secret";\nvoid value;\n', "void import(`../../shared/\\0secret`);\n"])(
		"reports a cooked NUL module specifier without a stack or absolute path",
		(source) => {
			const root = makeTempDir();
			markProject(root);
			writeFrame(root, "home", source);

			const result = spool(["check", root], makeTempDir());

			expect(result.status).toBe(1);
			expect(result.stdout).toBe("");
			expect(result.stderr).toContain("TS2307: Cannot find module '../../shared/\\u0000secret'");
			expect(result.stderr).not.toContain("\0");
			expect(result.stderr).not.toContain(root);
			expect(result.stderr).not.toContain("ERR_INVALID_ARG_VALUE");
			expect(result.stderr).not.toContain(" at ");
			expect(result.stderr.split("\n").filter(Boolean)).toHaveLength(1);
		},
	);

	it("reports parser exhaustion as one source-local diagnostic without a stack", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/cli-parser-exhaustion-secret.ts";
		const nested = `${"[".repeat(500)}0${"]".repeat(500)}`;
		writeFrame(root, "home", `const nested = ${nested};\nimport ${JSON.stringify(secret)};\nvoid nested;\n`);

		const result = spool(["check", root], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely\n");
		expect(result.stderr).not.toContain(root);
		expect(result.stderr).not.toContain(secret);
		expect(result.stderr).not.toContain("RangeError");
		expect(result.stderr).not.toContain(" at ");
	});

	it("reports policy traversal exhaustion as one source-local diagnostic without a stack", () => {
		const root = makeTempDir();
		markProject(root);
		const secret = "/private/cli-traversal-exhaustion-secret.ts";
		const memberChain = `value${".x".repeat(20_000)}`;
		writeFrame(
			root,
			"home",
			`${memberChain};\nimport ${JSON.stringify(secret)};\nexport default function Home() { return null; }\n`,
		);

		const result = spool(["check", root], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toBe("design/frames/home/frame.tsx:1:1 TS1003: Source syntax cannot be inspected safely\n");
		expect(result.stderr).not.toContain(root);
		expect(result.stderr).not.toContain(secret);
		expect(result.stderr).not.toContain("RangeError");
		expect(result.stderr).not.toContain(" at ");
	});

	it.each([
		[["shot", "cart", "--viewport", "390-by-844"], "--viewport must be <width>x<height> with positive integers"],
		[["shot", "cart", "--viewport", "0x844"], "--viewport must be <width>x<height> with positive integers"],
		[["shot", "cart", "--at", "soon"], "--at must be whole milliseconds"],
		[["shot", "cart", "--scenario", "review/error"], "--scenario must be a scenario name"],
		[["logs", "cart", "--scenario", ".private"], "--scenario must be a scenario name"],
	] as const)("rejects an invalid verification option before resolving the project", (args, message) => {
		const result = spool([...args], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(message);
	});

	it("lists every verification control on its owning command", () => {
		const shot = spool(["shot", "--help"], makeTempDir());
		const logs = spool(["logs", "--help"], makeTempDir());
		const url = spool(["url", "--help"], makeTempDir());

		expect(shot.stdout).toContain("--viewport <width>x<height>");
		expect(shot.stdout).toContain("--at <milliseconds>");
		expect(shot.stdout).toContain("--scenario <name>");
		expect(logs.stdout).toContain("--scenario <name>");
		expect(url.stdout).toContain("--raw");
	});

	/**
	 * The daemon turns a skewed cli away with the same 401 it gives a bad token.
	 * `spool status` always knew the real story; the verb that actually broke used
	 * to say only `unauthenticated` and send you looking at credentials (#155).
	 */
	it("names a version skew on the verb that breaks, not just on status", async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const { root } = makeProject(spoolDir);
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main>; }\n");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		// the cli holds a key this daemon will not take, which is exactly the shape
		// a skew arrives in: the token is stale because the daemon is a different build
		const stateFile = join(spoolDir, "daemon.json");
		const state = JSON.parse(readFileSync(stateFile, "utf8")) as Record<string, unknown>;
		writeFileSync(stateFile, JSON.stringify({ ...state, controlToken: "stale-key" }));

		const result = await spoolAsync(["shot", "quiet"], home, root);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unauthenticated");
		expect(result.stderr).toContain("cli is v");
		expect(result.stderr).toMatch(/spool upgrade|restart it to catch it up/);
	});

	it("prints only shot paths on stdout and content height on stderr", async () => {
		try {
			const browser = await chromium.launch({ channel: "chromium-headless-shell", headless: true });
			await browser.close();
		} catch {
			return;
		}
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const { root } = makeProject(spoolDir);
		writeFrame(
			root,
			"tall",
			"export default function Tall() { return <main style={{ height: 1800 }}>tall</main>; }\n",
		);
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		const result = await spoolAsync(["shot", "tall", "--viewport", "160x120"], home, root, {
			// Keep Playwright's browser cache while isolating all spool state.
			HOME: process.env.HOME ?? home,
			SPOOL_DIR: spoolDir,
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toBe(`${join(root, "design", ".spool", "verify", "tall.png")}\n`);
		expect(result.stderr).toBe('spool: "tall" content height: 1800px\n');
	});

	it("says a replayed cache matches current compiled source", async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const { root, name } = makeProject(spoolDir);
		writeFrame(root, "quiet", "export default function Quiet() { return <main>quiet</main>; }\n");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		const verify = await fetch(`${daemon.url}/api/p/${name}/verify/quiet`, {
			headers: { "X-Spool-Control": daemon.controlToken },
		});
		const { etag } = (await verify.json()) as { etag: string };
		const cacheDir = join(root, "design", ".spool", "verify");
		mkdirSync(cacheDir, { recursive: true });
		writeFileSync(
			join(cacheDir, "quiet.logs.json"),
			`${JSON.stringify({ etag, scenario: "default", entries: [] })}\n`,
		);

		const result = await spoolAsync(["logs", "quiet"], home, root);

		expect(result.status).toBe(0);
		expect(result.stderr).toContain("cache matches current compiled source");
	});
});
