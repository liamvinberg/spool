import { spawn } from "node:child_process";
import { accessSync, constants, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Browser, BrowserServer } from "playwright-core";

/**
 * Spool's own Chrome (#12): the chromium headless-shell build pinned by
 * playwright-core, fetched into playwright's shared machine cache the first
 * time it is needed. The fetch rides playwright's own installer, so the reuse
 * runs both ways: a build any tool already fetched launches here without a
 * download, and spool's fetch serves every other playwright on the machine.
 * Never a near-miss local Chrome.
 *
 * The daemon's photo booth is its one driver (`daemon/booth.ts`): every frame
 * cover and every `spool shot` is a page in it.
 */

/**
 * The flags a shell launches with when nothing checks what it drew on: the
 * recorder's, and the tests' own browsers. On a Mac that is the GPU through
 * ANGLE's Metal backend, which no Mac lacks; elsewhere Chrome's own defaults,
 * SwiftShader, since a GPU there may not be usable and only the booth looks.
 */
export function headlessShellArgs(platform: NodeJS.Platform = process.platform): string[] {
	return platform === "darwin" ? (gpuShellArgs(platform) ?? []) : [];
}

/**
 * The flags that put the shell on the machine's GPU, or nothing when there is
 * no GPU to try or `SPOOL_BOOTH_GPU=0` asks for software.
 *
 * Chrome's default in a headless shell is SwiftShader: WebGL and raster on the
 * CPU. It draws a `backdrop-filter` backdrop mirrored on a Mac and under-draws
 * WebGL fields, and on a Linux server five agents' edits held its GPU process
 * at nearly three cores (#225). Each platform's ANGLE backend is the one that
 * draws without a display: Metal on a Mac, D3D11 on Windows, and on Linux GLES
 * over EGL on a render node, which on an Intel iGPU drew a canvas of a few
 * hundred gradients at 60 frames a second where Vulkan drew 15 and SwiftShader
 * under one. Whether a GPU really drew is `launchHeadlessShell`'s to check.
 */
export function gpuShellArgs(
	platform: NodeJS.Platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
	renderNode: () => boolean = hasRenderNode,
): string[] | undefined {
	if (env.SPOOL_BOOTH_GPU === "0") return undefined;
	const backend =
		platform === "darwin"
			? "metal"
			: platform === "win32"
				? "d3d11"
				: platform === "linux" && renderNode()
					? "gles-egl"
					: undefined;
	return backend === undefined ? undefined : ["--enable-gpu", `--use-angle=${backend}`, "--ignore-gpu-blocklist"];
}

/** A DRM render node this user may open, which is what GLES over EGL draws through. */
function hasRenderNode(): boolean {
	try {
		return readdirSync("/dev/dri")
			.filter((name) => name.startsWith("renderD"))
			.some((name) => {
				try {
					accessSync(join("/dev/dri", name), constants.R_OK | constants.W_OK);
					return true;
				} catch {
					return false;
				}
			});
	} catch {
		return false;
	}
}

/** What the browser reports of its GPU, as CDP's `SystemInfo.getInfo` gives it. */
export interface GpuReport {
	featureStatus: Record<string, string>;
	auxAttributes: Record<string, unknown>;
}

/**
 * Whether a browser's drawing is on the CPU: compositing or WebGL fell back to
 * software, or the GL it reports is a software one (SwiftShader, Mesa's
 * llvmpipe, Windows' basic render driver).
 */
export function drawsInSoftware(gpu: GpuReport): boolean {
	const enabled = (feature: string) => gpu.featureStatus[feature]?.startsWith("enabled") === true;
	if (!enabled("gpu_compositing") || !enabled("webgl")) return true;
	const renderer = String(gpu.auxAttributes.glRenderer ?? "");
	return /swiftshader|llvmpipe|softpipe|lavapipe|basic render/iu.test(renderer);
}

/** The pinned build is not in the machine's cache yet. */
export class MissingHeadlessShellError extends Error {
	constructor() {
		super("the pinned Chromium headless-shell is not installed");
		this.name = "MissingHeadlessShellError";
	}
}

/**
 * The shell is on disk but cannot run here: the machine lacks the system
 * libraries it links against, as a bare Linux server does. Nothing the daemon
 * retries changes that; an install does, so the message names it.
 */
export class HeadlessShellCannotRunError extends Error {
	constructor(readonly library: string) {
		super(
			`this machine is missing ${library} and other libraries Chromium needs; install them with \`npx playwright-core@${playwrightVersion()} install-deps chromium-headless-shell\` (it asks for sudo) and restart spool`,
		);
		this.name = "HeadlessShellCannotRunError";
	}
}

/** The shared library a launch's log says the shell could not load, if that is why it died. */
export function missingLibrary(launchLog: string): string | undefined {
	return /error while loading shared libraries: ([^:\s]+)/u.exec(launchLog)?.[1];
}

function playwrightVersion(): string {
	const require = createRequire(import.meta.url);
	return (require("playwright-core/package.json") as { version: string }).version;
}

/** One running shell: the browser to drive, and two ways to end its process. */
export interface HeadlessShell {
	browser: Browser;
	/** It draws on the CPU, so how fast a frame redraws in it says nothing of a person's machine. */
	software: boolean;
	/** Close the browser and wait for its process to end. */
	close(): Promise<void>;
	/** End its process outright, whether or not it answers. */
	kill(): Promise<void>;
}

/**
 * Launch the shell as a server playwright then connects to, rather than as a
 * browser it owns. The difference is the handle: a server can always be killed
 * by its process, whatever the browser itself is doing, and a browser whose
 * close never returns (seen on M1 Macs) or whose renderer is wedged must never
 * be able to keep the memory it holds.
 *
 * It draws on the GPU `gpuShellArgs` names when one launches and really draws
 * there, and on Chrome's defaults otherwise.
 */
export async function launchHeadlessShell(): Promise<HeadlessShell> {
	const gpu = gpuShellArgs();
	if (gpu !== undefined) {
		try {
			const shell = await launchWith(gpu);
			if (!shell.software) return shell;
			await shell.kill();
		} catch (error) {
			if (error instanceof MissingHeadlessShellError || error instanceof HeadlessShellCannotRunError) throw error;
		}
	}
	// the GPU would not start or drew in software anyway: Chrome's own defaults,
	// which are what every machine draws with
	return await launchWith([]);
}

async function launchWith(args: string[]): Promise<HeadlessShell> {
	// loaded on the first launch: every CLI verb would otherwise pay for it at start
	const { chromium } = await import("playwright-core");
	let server: BrowserServer;
	try {
		server = await chromium.launchServer({ channel: "chromium-headless-shell", headless: true, args });
	} catch (error) {
		// playwright's stable phrasing for a build that is not in the cache
		if (error instanceof Error && error.message.includes("Executable doesn't exist")) {
			throw new MissingHeadlessShellError();
		}
		// playwright's launch log carries the loader's own line, under a first
		// line that only says the browser closed (`Protocol error (Browser.getVersion)`)
		const library = error instanceof Error ? missingLibrary(error.message) : undefined;
		if (library !== undefined) throw new HeadlessShellCannotRunError(library);
		throw error;
	}
	try {
		const browser = await chromium.connect(server.wsEndpoint());
		const session = await browser.newBrowserCDPSession();
		const { gpu } = (await session.send("SystemInfo.getInfo")) as { gpu: GpuReport };
		await session.detach();
		return { browser, software: drawsInSoftware(gpu), close: () => server.close(), kill: () => server.kill() };
	} catch (error) {
		await server.kill();
		throw error;
	}
}

/**
 * playwright-core's own `install chromium-headless-shell`, as a child that
 * never holds the caller's event loop: the daemon runs this, and a download of
 * ninety megabytes is not something every request it serves should wait out.
 * The installer's own progress goes to stderr, which is the daemon's log.
 *
 * It runs on the same node as the caller with the same flags. In the Mac app
 * that node is Electron's binary, and `process.execArgv` carries the `-r` shim
 * that makes it behave as node for any command-line program it runs, the
 * installer included (`desktop/shim/electron-argv.js`). The version pin is
 * playwright-core's browsers.json; the destination is the shared cache,
 * honoring PLAYWRIGHT_BROWSERS_PATH. Playwright's installer locks that cache,
 * so two installs at once wait for each other rather than tearing a build.
 */
export function fetchHeadlessShell(): Promise<void> {
	const packageJson = createRequire(import.meta.url).resolve("playwright-core/package.json");
	const cli = join(dirname(packageJson), "cli.js");
	return new Promise((done, fail) => {
		const child = spawn(process.execPath, [...process.execArgv, cli, "install", "chromium-headless-shell"], {
			stdio: ["ignore", 2, 2],
		});
		child.once("error", fail);
		child.once("exit", (code) => {
			if (code === 0) done();
			else fail(new Error(`fetching the headless-shell failed (exit ${code ?? "signal"})`));
		});
	});
}
