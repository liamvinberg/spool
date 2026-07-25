import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { writeAtomic } from "../atomic-write";
import { SpoolError } from "../errors";

/**
 * The managed terminal toolchain (#42): spool's own pinned bun plus the
 * pinned OpenTUI runtime, provisioned idempotently under ~/.spool/toolchain
 * on first terminal-frame use — the headless-shell precedent, one directory
 * over. design/ never learns any of this exists: resolution rides NODE_PATH
 * into the toolchain's node_modules, so a project gains no package manifest.
 */

export const BUN_VERSION = "1.3.14";

/** The pinned terminal runtime — exact versions, the slot React occupies for HTML frames. */
export const TERM_PINS: Record<string, string> = {
	"@opentui/core": "0.4.5",
	"@opentui/react": "0.4.5",
	react: "19.2.7",
};

export function packagesManifest(): string {
	return `${JSON.stringify({ name: "spool-term-toolchain", private: true, dependencies: TERM_PINS }, null, "\t")}\n`;
}

const BUN_TARGETS: Record<string, string> = {
	"darwin-arm64": "darwin-aarch64",
	"darwin-x64": "darwin-x64",
	"linux-x64": "linux-x64",
	"linux-arm64": "linux-aarch64",
	"win32-x64": "windows-x64",
};

export function bunTarget(platform: string, arch: string): string {
	const target = BUN_TARGETS[`${platform}-${arch}`];
	if (target === undefined) throw new SpoolError(`terminal frames are not supported on ${platform}-${arch} yet`);
	return target;
}

export function bunDownloadUrl(target: string): string {
	return `https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-${target}.zip`;
}

export interface ToolchainPaths {
	root: string;
	bunDir: string;
	bunBin: string;
	packagesDir: string;
	packagesModules: string;
	helpersModules: string;
	supervisor: string;
}

export function toolchainPaths(spoolDir: string): ToolchainPaths {
	const root = join(spoolDir, "toolchain");
	const bunDir = join(root, `bun-${BUN_VERSION}`);
	const hash = createHash("sha256").update(packagesManifest()).digest("hex").slice(0, 8);
	const packagesDir = join(root, `packages-${hash}`);
	return {
		root,
		bunDir,
		bunBin: join(bunDir, process.platform === "win32" ? "bun.exe" : "bun"),
		packagesDir,
		packagesModules: join(packagesDir, "node_modules"),
		helpersModules: join(root, "helpers", "node_modules"),
		supervisor: join(root, "supervisor.ts"),
	};
}

export interface Toolchain {
	bunBin: string;
	/** NODE_PATH for spawned terminal apps: pinned packages, then spool's helpers. */
	nodePath: string;
	supervisor: string;
}

export interface ToolchainEffects {
	narrate: (line: string) => void;
	download: (url: string, dest: string) => Promise<void>;
	unzip: (archive: string, dest: string) => Promise<void>;
	run: (bin: string, args: string[], cwd: string) => Promise<void>;
}

export async function ensureToolchain(spoolDir: string, effects: ToolchainEffects): Promise<Toolchain> {
	const paths = toolchainPaths(spoolDir);

	if (!existsSync(paths.bunBin)) {
		const target = bunTarget(process.platform, process.arch);
		effects.narrate(
			`first terminal frame on this machine — fetching the pinned bun ${BUN_VERSION} (one-time, ~40 MB)`,
		);
		const archive = join(paths.root, `bun-${target}.zip.tmp`);
		const staging = join(paths.root, "bun-staging");
		mkdirSync(paths.root, { recursive: true });
		rmSync(staging, { recursive: true, force: true });
		await effects.download(bunDownloadUrl(target), archive);
		await effects.unzip(archive, staging);
		renameSync(join(staging, `bun-${target}`), paths.bunDir);
		chmodSync(paths.bunBin, 0o755);
		rmSync(archive, { force: true });
		rmSync(staging, { recursive: true, force: true });
		effects.narrate("bun ready — cached for every future terminal frame");
	}

	const ready = join(paths.packagesDir, ".ready");
	if (!existsSync(ready)) {
		effects.narrate(`installing the pinned terminal runtime (OpenTUI ${TERM_PINS["@opentui/react"]})`);
		writeAtomic(join(paths.packagesDir, "package.json"), packagesManifest());
		try {
			await effects.run(paths.bunBin, ["install"], paths.packagesDir);
		} catch (error) {
			throw new SpoolError(
				`installing the terminal runtime failed — ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		writeAtomic(ready, `${new Date().toISOString()}\n`);
	}

	const helper = join(paths.helpersModules, "spool");
	writeAtomic(
		join(helper, "package.json"),
		`${JSON.stringify({ name: "spool", version: "0.0.0", type: "module", exports: { "./term": "./term.js" } }, null, "\t")}\n`,
	);
	writeAtomic(join(helper, "term.js"), HELPER_SOURCE);
	writeAtomic(paths.supervisor, SUPERVISOR_SOURCE);

	return {
		bunBin: paths.bunBin,
		nodePath: `${paths.packagesModules}${delimiter}${paths.helpersModules}`,
		supervisor: paths.supervisor,
	};
}

/** Production effects: fetch to disk, the platform's unzip, bun with stderr passthrough. */
export function toolchainEffects(narrate: (line: string) => void): ToolchainEffects {
	return {
		narrate,
		async download(url, dest) {
			mkdirSync(dirname(dest), { recursive: true });
			const res = await fetch(url);
			if (!res.ok || res.body === null) throw new SpoolError(`fetching ${url} failed (${res.status})`);
			await pipeline(
				Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream),
				createWriteStream(dest),
			);
		},
		async unzip(archive, dest) {
			mkdirSync(dest, { recursive: true });
			const result =
				process.platform === "win32"
					? spawnSync("powershell", ["-Command", `Expand-Archive -Force '${archive}' '${dest}'`], {
							stdio: ["ignore", 2, 2],
						})
					: spawnSync("unzip", ["-oq", archive, "-d", dest], { stdio: ["ignore", 2, 2] });
			if (result.error !== undefined || result.status !== 0) {
				throw new SpoolError("unpacking bun failed — is `unzip` installed?");
			}
		},
		async run(bin, args, cwd) {
			const result = spawnSync(bin, args, { cwd, stdio: ["ignore", 2, 2] });
			if (result.error !== undefined || result.status !== 0)
				throw new Error("bun install failed — see output above");
		},
	};
}

const HELPER_SOURCE = `/** spool's terminal navigation helper: the walk rides one private escape over stdout. */
export const term = {
	go(target) {
		process.stdout.write("\\u001b]7770;go;" + target + "\\u0007");
	},
};
`;

const SUPERVISOR_SOURCE = `// spool's PTY supervisor: runs under the pinned bun, owns the terminal, and
// bridges it to the daemon over stdio frames — [type u8][len u32 BE][payload],
// type 0 raw terminal bytes, type 1 JSON control (in: resize/signal, out: exit).
const DATA = 0;
const CONTROL = 1;
const [entry, cols, rows] = process.argv.slice(2);
function send(type, payload) {
	const frame = new Uint8Array(5 + payload.length);
	frame[0] = type;
	new DataView(frame.buffer).setUint32(1, payload.length);
	frame.set(payload, 5);
	process.stdout.write(frame);
}
const term = new Bun.Terminal({
	cols: Number(cols),
	rows: Number(rows),
	data(_, chunk) {
		send(DATA, new Uint8Array(chunk));
	},
});
const proc = Bun.spawn({
	cmd: [process.execPath, "run", "--no-install", entry],
	terminal: term,
	env: process.env,
	cwd: process.cwd(),
});
proc.exited.then((code) => {
	send(CONTROL, new TextEncoder().encode(JSON.stringify({ exit: { code } })));
	term.close();
	process.exit(0);
});
// The supervisor owns the app's life. Dying without taking it down leaves a
// project process reparented to init, holding a core forever with nothing left
// to read it — so every way this process can be told to stop kills the app
// first, and a SIGTERM that finds it wedged still escalates.
let leaving = false;
function leave(code) {
	if (leaving) return;
	leaving = true;
	try { proc.kill("SIGTERM"); } catch {}
	const hard = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} }, 1000);
	Promise.race([proc.exited, new Promise((r) => setTimeout(r, 1500))]).finally(() => {
		clearTimeout(hard);
		try { term.close(); } catch {}
		process.exit(code);
	});
}
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) process.on(sig, () => leave(0));
let pending = new Uint8Array(0);
const reader = Bun.stdin.stream().getReader();
for (;;) {
	const { done, value } = await reader.read();
	if (done) break;
	const buffer = new Uint8Array(pending.length + value.length);
	buffer.set(pending);
	buffer.set(value, pending.length);
	let offset = 0;
	while (buffer.length - offset >= 5) {
		const type = buffer[offset];
		const length = new DataView(buffer.buffer, buffer.byteOffset + offset + 1, 4).getUint32(0);
		if (buffer.length - offset - 5 < length) break;
		const payload = buffer.slice(offset + 5, offset + 5 + length);
		offset += 5 + length;
		if (type === DATA) {
			term.write(payload);
		} else {
			const message = JSON.parse(new TextDecoder().decode(payload));
			if (message.resize) {
				term.resize(message.resize.cols, message.resize.rows);
				// the kernel signals only the terminal's foreground group, and the
				// spawned app may not be it — deliver the winch by hand
				proc.kill("SIGWINCH");
			}
			if (message.signal) proc.kill(message.signal);
		}
	}
	pending = buffer.slice(offset);
}
leave(0);
`;
