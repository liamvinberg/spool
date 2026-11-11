import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright-core";

/**
 * A live take filmed on the m1, Liam's Mac: a real Chrome window on its screen, drawn by its GPU at Retina size,
 * filmed at 60 fps by ScreenCaptureKit (record-window.swift), so a take plays as smoothly as the page does. The
 * window's own pixels are filmed, so what covers it on the Mac (a notification, another app) never shows, and the Mac
 * stays usable while it records. The clip's spool keeps running here; the window reaches it through an SSH tunnel on
 * the same port, so the canvas address and the extension's sends are the ones the clip knows.
 */
export interface M1Take {
	context: BrowserContext;
	/** start filming the window, if it is not yet, with this tab in front */
	film(page: Page): Promise<void>;
	/** stop filming and bring the film here: its file, when its first picture was taken here, and the page's rectangle in it */
	stop(dir: string): Promise<{ video: string; startedAt: number; crop: Crop }>;
	close(): Promise<void>;
}

export interface Crop {
	x: number;
	y: number;
	w: number;
	h: number;
}

const HOST = "m1";
/** room around the page in the window, clear of its rounded corners */
const MARGIN = 64;
const SCRIPTS = dirname(new URL(import.meta.url).pathname);

function ssh(command: string, timeout = 120_000): string {
	const run = spawnSync("ssh", ["-o", "ConnectTimeout=8", HOST, command], { encoding: "utf8", timeout });
	if (run.status !== 0) throw new Error(`the m1 said no to \`${command.slice(0, 80)}\`: ${run.stderr || run.stdout}`);
	return run.stdout;
}

function free(): Promise<number> {
	return new Promise((done, fail) => {
		const server = createServer();
		server.once("error", fail);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() =>
				typeof address === "object" && address !== null ? done(address.port) : fail(new Error("no port")),
			);
		});
	});
}

/** what a child prints, line by line, kept so a line that came early still answers a later wait for it */
function linesOf(child: ChildProcess) {
	const seen: string[] = [];
	let partial = "";
	const waiters = new Set<() => void>();
	child.stdout?.on("data", (chunk: Buffer) => {
		const parts = (partial + chunk.toString()).split("\n");
		partial = parts.pop() ?? "";
		seen.push(...parts);
		if (process.env.CLIP_DEBUG) process.stderr.write(parts.map((one) => `m1: ${one}\n`).join(""));
		for (const wake of waiters) wake();
	});
	let exited: number | null | undefined;
	child.once("exit", (code) => {
		exited = code;
		for (const wake of waiters) wake();
	});
	return (pattern: RegExp, ms: number) =>
		new Promise<RegExpMatchArray>((done, fail) => {
			const check = () => {
				for (const line of seen) {
					const match = line.match(pattern);
					if (match === null) continue;
					finish();
					done(match);
					return;
				}
				if (exited !== undefined) {
					finish();
					fail(new Error(`the m1's ${pattern} never came: it exited ${exited}`));
				}
			};
			const timer = setTimeout(() => {
				finish();
				fail(new Error(`the m1 did not say ${pattern} within ${ms} ms`));
			}, ms);
			const finish = () => {
				clearTimeout(timer);
				waiters.delete(check);
			};
			waiters.add(check);
			check();
		});
}

/** the Chrome for Testing this checkout's Playwright drives, on the m1, installed there the first time */
function chromeOnM1(): string {
	const browsers = JSON.parse(
		readFileSync(join(SCRIPTS, "../../../../node_modules/playwright-core/browsers.json"), "utf8"),
	) as { browsers: { name: string; revision: string }[] };
	const revision = browsers.browsers.find((one) => one.name === "chromium")?.revision;
	const version = (
		JSON.parse(readFileSync(join(SCRIPTS, "../../../../node_modules/playwright-core/package.json"), "utf8")) as {
			version: string;
		}
	).version;
	const app = `$HOME/Library/Caches/ms-playwright/chromium-${revision}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
	return ssh(
		`f="${app}"; [ -x "$f" ] || PATH=/opt/homebrew/bin:$PATH npx -y playwright-core@${version} install chromium >/dev/null; [ -x "$f" ] && echo "$f"`,
		600_000,
	).trim();
}

/** record-window, built on the m1 the first time its source changes */
function recorderOnM1(dir: string): string {
	const source = readFileSync(join(SCRIPTS, "record-window.swift"));
	const binary = `$HOME/.cache/spool-clip/record-window-${createHash("sha256").update(source).digest("hex").slice(0, 12)}`;
	spawnSync("scp", ["-q", join(SCRIPTS, "record-window.swift"), `${HOST}:${dir}/main.swift`]);
	return ssh(
		`f="${binary}"; [ -x "$f" ] || { mkdir -p "$(dirname "$f")" && xcrun swiftc -O -swift-version 5 ${dir}/main.swift -o "$f" >&2; }; echo "$f"`,
		600_000,
	).trim();
}

export async function openM1(options: {
	/** the clip's spool, which the window reaches on the same port */
	port: number;
	/** the unpacked extension to load, when the clip wants it */
	extension?: string | undefined;
	viewport: { w: number; h: number };
}): Promise<M1Take> {
	const check = spawnSync("ssh", ["-o", "ConnectTimeout=8", HOST, "true"], { timeout: 20_000 });
	if (check.status !== 0)
		throw new Error("the m1 is not reachable: wake it, or film here with --headless (a choppier take)");
	const dir = `/tmp/spool-clip-${randomBytes(4).toString("hex")}`;
	ssh(`mkdir -p ${dir}`);
	const children: ChildProcess[] = [];
	let browser: Browser | null = null;
	const close = async () => {
		await browser?.close().catch(() => {});
		for (const child of children) child.kill();
		spawnSync("ssh", [HOST, `pkill -f -- '--user-data-dir=${dir}/profile'; rm -rf ${dir}`], { timeout: 30_000 });
	};
	try {
		const chrome = chromeOnM1();
		if (chrome === "") throw new Error("Chrome for Testing could not be installed on the m1");
		const recorder = recorderOnM1(dir);
		if (options.extension !== undefined)
			spawnSync("scp", ["-qr", options.extension, `${HOST}:${dir}/extension`], { timeout: 120_000 });
		const remoteDebugging = 20_000 + Math.floor(Math.random() * 10_000);
		const local = await free();
		// the debugging port comes here; the clip's spool goes there, on its own port
		const tunnel = spawn(
			"ssh",
			[
				...["-N", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=10"],
				...["-L", `${local}:127.0.0.1:${remoteDebugging}`, "-R", `${options.port}:127.0.0.1:${options.port}`],
				HOST,
			],
			{ stdio: "ignore" },
		);
		children.push(tunnel);
		const extension =
			options.extension === undefined
				? []
				: [`--disable-extensions-except=${dir}/extension`, `--load-extension=${dir}/extension`];
		const args = [
			`--user-data-dir=${dir}/profile`,
			`--remote-debugging-port=${remoteDebugging}`,
			...["--no-first-run", "--no-default-browser-check", "--use-mock-keychain", "--password-store=basic"],
			...["--test-type", "--hide-crash-restore-bubble", "--disable-search-engine-choice-screen"],
			"--disable-features=Translate,MediaRouter,OptimizationHints",
			// it keeps drawing while other windows cover it, which is what the recorder films
			...["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
			"--disable-background-timer-throttling",
			...extension,
			"--window-position=60,60",
			`--window-size=${options.viewport.w},${options.viewport.h + 120}`,
			"about:blank",
		];
		const quoted = [chrome, ...args].map((one) => `'${one.replaceAll("'", "'\\''")}'`).join(" ");
		// inside the Mac's desktop session, where windows show; it ends when this connection does
		children.push(spawn("ssh", [HOST, `~/.agent-hub/m1/gui ${quoted}`], { stdio: "ignore" }));
		const { chromium } = await import("playwright-core");
		const deadline = Date.now() + 60_000;
		while (browser === null) {
			try {
				browser = await chromium.connectOverCDP(`http://127.0.0.1:${local}`, { timeout: 5_000 });
			} catch (error) {
				if (Date.now() > deadline) throw error;
				await new Promise((done) => setTimeout(done, 500));
			}
		}
		const context = browser.contexts()[0];
		if (context === undefined) throw new Error("the m1's Chrome has no context");
		const pid = ssh(
			`pgrep -f -- '--user-data-dir=${dir}/profile' | while read p; do c=$(ps -o command= -p $p); case "$c" in *--type=*|*agent-hub*) ;; *) echo $p;; esac; done | head -1`,
		).trim();
		let recording: ChildProcess | null = null;
		let waitFor: ReturnType<typeof linesOf> | null = null;
		let startedAt = 0;
		let window = { x: 0, y: 0, w: 0, h: 0, scale: 2 };

		// The window is the viewport and a margin, and each page is held to the viewport in its top left: a macOS
		// window rounds its bottom corners, which would show in the take's.
		const first = context.pages()[0] ?? (await context.newPage());
		const cdp = await context.newCDPSession(first);
		const { windowId } = await cdp.send("Browser.getWindowForTarget");
		const want = { w: options.viewport.w + MARGIN, h: options.viewport.h + MARGIN };
		let frame = { top: 0, left: 0 };
		for (let i = 0; i < 4; i++) {
			const size = await first.evaluate(() => ({
				w: innerWidth,
				h: innerHeight,
				outerW: outerWidth,
				outerH: outerHeight,
			}));
			frame = { top: size.outerH - size.h, left: (size.outerW - size.w) / 2 };
			if (size.w === want.w && size.h === want.h) break;
			await cdp.send("Browser.setWindowBounds", {
				windowId,
				bounds: { width: want.w + size.outerW - size.w, height: want.h + size.outerH - size.h },
			});
			await first.waitForTimeout(300);
		}
		await cdp.detach();
		const hold = (page: Page) => page.setViewportSize({ width: options.viewport.w, height: options.viewport.h });
		for (const page of context.pages()) await hold(page);
		context.on("page", (page) => void hold(page).catch(() => {}));

		return {
			context,
			async film(page) {
				await page.bringToFront();
				if (recording !== null) return;
				const child = spawn("ssh", [HOST, `~/.agent-hub/m1/gui ${recorder} ${pid} ${dir}/take.mov`], {
					stdio: ["pipe", "pipe", "inherit"],
				});
				children.push(child);
				recording = child;
				waitFor = linesOf(child);
				const framed = await waitFor(/^window (-?\d+) (-?\d+) (\d+) (\d+) ([\d.]+)/, 30_000);
				window = {
					x: Number(framed[1]),
					y: Number(framed[2]),
					w: Number(framed[3]),
					h: Number(framed[4]),
					scale: Number(framed[5]),
				};
				// ScreenCaptureKit sends a picture only when the window changes: a speck no one sees changes it until one comes
				const first = waitFor(/^first \d+/, 30_000);
				let pictured = false;
				void first.then(
					() => {
						pictured = true;
					},
					() => {},
				);
				while (!pictured) {
					await page.evaluate(() => {
						const speck = document.createElement("div");
						speck.style.cssText =
							"position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;background:#808080;pointer-events:none;z-index:2147483647";
						document.documentElement.append(speck);
						setTimeout(() => speck.remove(), 120);
					});
					await Promise.race([first, page.waitForTimeout(250)]);
				}
				await first;
				// this machine's clock, which the take's marks are on
				startedAt = Date.now();
			},
			async stop(local) {
				const child = recording;
				if (child === null || waitFor === null) throw new Error("the take never started filming");
				const done = waitFor(/^done/, 120_000);
				child.stdin?.write("q\n");
				await done;
				const video = join(local, "m1-take.mov");
				const copied = spawnSync("scp", ["-q", `${HOST}:${dir}/take.mov`, video], { timeout: 600_000 });
				if (copied.status !== 0) throw new Error(`the take could not be copied from the m1: ${copied.stderr}`);
				// the page sits under the window's tabs and toolbar, in its top left
				const s = window.scale;
				const crop = {
					x: Math.round(frame.left * s),
					y: Math.round(frame.top * s),
					w: Math.round(options.viewport.w * s),
					h: Math.round(options.viewport.h * s),
				};
				return { video, startedAt, crop };
			},
			close,
		};
	} catch (error) {
		await close();
		throw error;
	}
}
