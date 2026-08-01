import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, onTestFinished } from "vitest";
import { readDaemonState } from "./daemon/lifecycle";
import { serveDaemon } from "./daemon/server";
import { makeProject, makeTempDir, markProject, writeDesignFile, writeFrame, writePageFrame } from "./test-helpers";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");
const cliPath = join(repoRoot, "src", "cli.ts");

function spool(args: string[], home: string, cwd?: string, env: Record<string, string> = {}, timeout?: number) {
	return spawnSync(tsxBin, [cliPath, ...args], {
		cwd: cwd ?? repoRoot,
		encoding: "utf8",
		timeout,
		// SPOOL_DIR emptied so a dev shell's dogfood split cannot leak past HOME
		env: { ...process.env, HOME: home, SPOOL_DIR: "", ...env },
	});
}

function spoolAsync(args: string[], home: string, cwd: string) {
	return new Promise<{ status: number | null; stdout: string; stderr: string }>((done, fail) => {
		const child = spawn(tsxBin, [cliPath, ...args], {
			cwd,
			env: { ...process.env, HOME: home, SPOOL_DIR: "" },
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.on("error", fail);
		child.on("close", (status) => done({ status, stdout, stderr }));
	});
}

/**
 * Every test in here runs the CLI as a real process, most of them more than once, and a
 * `tsx` cold start is the bulk of what that costs. Vitest's default five seconds is a
 * budget for a computation, not for three of those under a suite that is already using
 * every core — which is how `remove prunes the project from the machine session`, three
 * spawns with no override of its own, came to fail two runs in three while passing alone
 * every time. The two tests that had been given their own timeout keep it; this is the
 * same allowance for the twenty-nine that had not.
 */
describe("spool cli", { timeout: 30_000 }, () => {
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
		writeDesignFile(root, "frames/terminal/term.tsx", "this is never parsed;\n");
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

		const result = spool(["check", root], makeTempDir(), undefined, {}, 2_000);

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

	it("init scaffolds, registers and prints the root-config pointer", () => {
		const home = makeTempDir();
		const target = makeTempDir();

		const result = spool(["init", target], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`initialized spool project at ${realpathSync(target)}`);
		expect(result.stdout).toContain("design/ is a spool canvas");
		expect(existsSync(join(target, "design", "canvas.json"))).toBe(true);
		const registry = JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8"));
		expect(registry.projects[0].root).toBe(realpathSync(target));
	});

	it("open resolves by walk-up from the cwd", () => {
		const home = makeTempDir();
		const repo = makeTempDir();
		markProject(repo);
		const nested = join(repo, "src");
		mkdirSync(nested);

		const result = spool(["open"], home, nested);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(realpathSync(repo));
	});

	it("remove forgets a live project without deleting its files", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		spool(["init", project], home);

		const result = spool(["remove", project], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`removed ${realpathSync(project)}`);
		expect(existsSync(join(project, "design", "canvas.json"))).toBe(true);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toEqual([]);
	});

	it("remove forgets an absolute registered root after its folder vanished", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		spool(["init", project], home);
		const registeredRoot = realpathSync(project);
		rmSync(project, { recursive: true });

		const result = spool(["remove", registeredRoot], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`removed ${registeredRoot}`);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toEqual([]);
	});

	it("remove treats an unknown root as an honest goal-state success", () => {
		const project = makeTempDir();

		const result = spool(["remove", project], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`${realpathSync(project)} was not registered`);
	});

	it("remove leaves an ancestor registered when its nested path is named", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		const nested = join(project, "src");
		mkdirSync(nested);
		spool(["init", project], home);

		const result = spool(["remove", nested], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`${realpathSync(nested)} was not registered`);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toMatchObject([
			{ root: realpathSync(project) },
		]);
	});

	it("open registers a project again after remove", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		spool(["init", project], home);
		expect(spool(["remove", project], home).status).toBe(0);

		const result = spool(["open", project], home);

		expect(result.status).toBe(0);
		expect(JSON.parse(readFileSync(join(home, ".spool", "registry.json"), "utf8")).projects).toMatchObject([
			{ root: realpathSync(project) },
		]);
	});

	it("remove prunes the project from the machine session", () => {
		const home = makeTempDir();
		const project = makeTempDir();
		const other = makeTempDir();
		spool(["init", project], home);
		spool(["init", other], home);
		writeFileSync(
			join(home, ".spool", "session.json"),
			JSON.stringify({ open: [realpathSync(project), realpathSync(other)] }),
		);

		const result = spool(["remove", project], home);

		expect(result.status).toBe(0);
		expect(JSON.parse(readFileSync(join(home, ".spool", "session.json"), "utf8"))).toEqual({
			open: [realpathSync(other)],
		});
	});

	it("remove prunes an unknown project left open in the machine session", () => {
		const home = makeTempDir();
		const project = realpathSync(makeTempDir());
		mkdirSync(join(home, ".spool"));
		writeFileSync(join(home, ".spool", "session.json"), JSON.stringify({ open: [project] }));

		const result = spool(["remove", project], home);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(`${project} was not registered`);
		expect(JSON.parse(readFileSync(join(home, ".spool", "session.json"), "utf8"))).toEqual({ open: [] });
	});

	it("status reports a stopped daemon with a nonzero exit", () => {
		const result = spool(["status"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stdout).toContain("not running");
	});

	it("stop is goal-state: stopping a stopped daemon succeeds", () => {
		const result = spool(["stop"], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("was not running");
	});

	it("foreground serve stands down when the recorded spool daemon already holds the port", {
		timeout: 15_000,
	}, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		// spawn, not spawnSync — the port holder lives in this process and must
		// keep answering health while the child decides to stand down
		const result = await new Promise<{ status: number | null; stdout: string }>((done, fail) => {
			const child = spawn(tsxBin, [cliPath, "serve", "--foreground"], {
				cwd: repoRoot,
				env: { ...process.env, HOME: home, SPOOL_DIR: "", SPOOL_PORT: String(daemon.port) },
			});
			let stdout = "";
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.on("error", fail);
			child.on("close", (status) => done({ status, stdout }));
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("standing down");
		expect(readDaemonState(spoolDir)?.pid).toBe(process.pid);
	});

	it("foreground serve refuses an occupied daemon whose credential state is missing", {
		timeout: 15_000,
	}, async () => {
		const home = makeTempDir();
		const spoolDir = join(home, ".spool");
		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		rmSync(join(spoolDir, "daemon.json"));

		const result = await new Promise<{ status: number | null; stderr: string }>((done, fail) => {
			const child = spawn(tsxBin, [cliPath, "serve", "--foreground"], {
				cwd: repoRoot,
				env: { ...process.env, HOME: home, SPOOL_DIR: "", SPOOL_PORT: String(daemon.port) },
			});
			let stderr = "";
			child.stderr.setEncoding("utf8");
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});
			child.on("error", fail);
			child.on("close", (status) => done({ status, stderr }));
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("control credential is unavailable");
		expect(readDaemonState(spoolDir)).toBeUndefined();
	});

	it("foreground serve still fails loud when a stranger holds the port", async () => {
		const stranger = createServer();
		await new Promise<void>((ready) => stranger.listen(0, "127.0.0.1", ready));
		onTestFinished(() => new Promise<void>((done) => stranger.close(() => done())));
		const address = stranger.address();
		if (address === null || typeof address === "string") throw new Error("no port");

		const result = spool(["serve", "--foreground"], makeTempDir(), undefined, {
			SPOOL_PORT: String(address.port),
		});

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("already in use");
	});

	it("autostart rejects anything but on and off", () => {
		const result = spool(["autostart", "sideways"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain('"on" or "off"');
	});

	it.runIf(process.platform === "darwin")("autostart refuses a dogfood-split environment", () => {
		const result = spool(["autostart"], makeTempDir(), undefined, { SPOOL_DIR: makeTempDir() });

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unset SPOOL_DIR");
	});

	it("upgrade refuses the checkout, pointing at git (#30)", () => {
		const result = spool(["upgrade"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("checkout");
		expect(result.stderr).toContain("git");
	});

	it("status mentions a cached newer release without phoning home (#30)", () => {
		const home = makeTempDir();
		mkdirSync(join(home, ".spool"), { recursive: true });
		writeFileSync(
			join(home, ".spool", "update.json"),
			JSON.stringify({ latest: "99.0.0", checkedAt: new Date().toISOString() }),
		);

		const result = spool(["status"], home);

		expect(result.status).toBe(1); // daemon still not running
		expect(result.stdout).toContain("v99.0.0 available");
		expect(result.stdout).toContain("spool upgrade");
	});

	it("fails cleanly on an unknown command", () => {
		const result = spool(["frobnicate"], makeTempDir());

		expect(result.status).toBe(1);
		expect(result.stderr).toContain("unknown command");
	});

	it("prints a version", () => {
		const result = spool(["--version"], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("distinguishes html screenshots from terminal persisted-grid SVGs in shot help", () => {
		const result = spool(["shot", "--help"], makeTempDir());

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(
			"save an HTML headless screenshot or a terminal source-current persisted-grid SVG",
		);
	});
});
