import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { BrowserContext, Page, Worker } from "playwright-core";
import { renderClip } from "../../../../src/daemon/record";
import { createSettingsStore } from "../../../../src/daemon/settings";
import type { RecordedInput } from "../../../../src/runtime/record-protocol";
import { type Crop, openM1 } from "./m1";

/**
 * One changelog clip: spool's real window on a project made for it, driven by a
 * script of steps, rendered frame by frame into an MP4 by spool's own recorder.
 * The script is kept (changelog/clips/<id>.ts) so the clip can be made again
 * when the window changes.
 */
export interface Clip {
	/** Files over a fresh `spool init` project, path to content: design/frames/…/frame.tsx and its frame.json. */
	files: Readonly<Record<string, string>>;
	/** Demo products from changelog/kit/ the frames import, each copied to design/shared/kit/<name>/ (`import { Lope } from "shared/kit/lope/lope"`). */
	kit?: readonly string[];
	/** More environment for the clip's spool, such as SPOOL_WHATS_NEW to play What's new on a checkout. */
	env?: Readonly<Record<string, string>>;
	/** The window's size in CSS pixels; 1440×900 by default, the page's 16:10. */
	viewport?: { w: number; h: number };
	/** What the replayed take does; a live clip walks its own. */
	steps?: readonly Step[];
	/** The one turn a stand-in `claude` plays in this clip's spool, for a clip of the agent at work (fake-claude.mjs). */
	agent?: AgentTurn;
	/** Load spool's Chrome extension (built with --test) into the window's browser, its sends aimed at this clip's spool. */
	extension?: boolean;
	/**
	 * A clip the replayed take cannot make (an agent's turn, a dropped file, another site): walked once and filmed as
	 * it happens, on the wall clock, with the cursor drawn in the page. Runs instead of `steps`.
	 */
	live?: (take: Take) => Promise<void>;
	/** What a live clip sets up before filming starts. Filming then starts on the spool window, unless it filmed another page. */
	prepare?: (take: Take) => Promise<void>;
}

/** A turn for the stand-in agent: what it says, and each file it writes, its source streamed in over `ms`. */
export interface AgentTurn {
	name?: string;
	steps: readonly (
		| { say: string }
		| { write: string; content: string; json?: string; ms?: number }
		| { wait: number }
	)[];
}

/** What a live clip drives. */
export interface Take {
	/** the spool window, on the clip's canvas */
	page: Page;
	context: BrowserContext;
	/** the canvas's address, and the spool it is on */
	url: string;
	port: number;
	/** the clip project's folder */
	root: string;
	/** the extension's service worker, when the clip loads it */
	extension: Worker | null;
	/** walk steps on a page, the drawn cursor following the hand */
	walk(steps: readonly Step[], on?: Page): Promise<void>;
	/** film this page from now on, in front */
	film(page: Page): Promise<void>;
	/** wait for something slow the viewer needn't sit through (a send, a load): the take plays it in a blink */
	hurry<T>(work: Promise<T>): Promise<T>;
}

/**
 * Where a step points: a point in the window, or a Playwright selector (`text=Knobs`,
 * `role=button[name="Play"]`) found as the window stands at that moment, optionally
 * inside a frame's iframe, aimed at its centre plus an offset.
 */
export type Target = { x: number; y: number } | string | { selector: string; frame?: string; dx?: number; dy?: number };

export type Step =
	/** glide the pointer there */
	| { move: Target; ms?: number }
	/** glide there and click */
	| { click: Target; ms?: number }
	/** press there, glide to a target or by an offset from where it pressed, let go */
	| { drag: Target; to: Target; ms?: number }
	| { drag: Target; by: { dx: number; dy: number }; ms?: number }
	/** type text, one key at a time */
	| { type: string; perKeyMs?: number }
	/** one named key: Enter, Escape, ArrowDown… (the recorder carries no modifiers) */
	| { press: string }
	/** scroll the wheel at a target */
	| { scroll: Target; dy: number; ms?: number }
	| { wait: number };

const GLIDE_MS = 600;
/** X's widest, and over three times the 560 px the changelog shows a clip at, so a dense or zoomed screen stays sharp */
const WEB_WIDTH = 1920;
/** how long a hurried wait lasts in the take */
const HURRIED_S = 0.4;
const STEP_MS = 1000 / 60;
const START = { x: 720, y: 450 };

/** a key as the recorder replays it */
function keyOf(key: string): { key: string; code: string; text: string } {
	if (key.length === 1) {
		const upper = key.toUpperCase();
		const code = /[a-z]/i.test(key) ? `Key${upper}` : /\d/.test(key) ? `Digit${key}` : key === " " ? "Space" : "";
		return { key, code, text: key };
	}
	return { key, code: key, text: "" };
}

/** ease in and out, so the pointer moves as a hand does */
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** the moves of one glide, a frame apart */
export function glide(
	from: { x: number; y: number },
	to: { x: number; y: number },
	t: number,
	ms: number,
	button = 0,
): RecordedInput[] {
	const moves: RecordedInput[] = [];
	const frames = Math.max(1, Math.round(ms / STEP_MS));
	for (let i = 1; i <= frames; i++) {
		const p = ease(i / frames);
		moves.push({
			t: Math.round(t + (i * ms) / frames),
			kind: "move",
			x: Math.round(from.x + (to.x - from.x) * p),
			y: Math.round(from.y + (to.y - from.y) * p),
			button,
		});
	}
	return moves;
}

/** a target's point in the window as it stands */
async function pointOf(page: Page, target: Target): Promise<{ x: number; y: number }> {
	if (typeof target !== "string" && "x" in target) return target;
	const spec = typeof target === "string" ? { selector: target } : target;
	const scope = spec.frame === undefined ? page : page.frameLocator(spec.frame);
	const box = await scope.locator(spec.selector).first().boundingBox({ timeout: 15_000 });
	if (box === null) throw new Error(`${spec.selector} is not on screen`);
	const dx = typeof target === "string" ? 0 : (target.dx ?? 0);
	const dy = typeof target === "string" ? 0 : (target.dy ?? 0);
	return { x: Math.round(box.x + box.width / 2 + dx), y: Math.round(box.y + box.height / 2 + dy) };
}

/**
 * Walk the steps once in an ordinary browser, doing each for real so the window opens
 * what the next step points at, and write down the inputs with their times. The
 * recorder then plays the same inputs into a fresh window on its own clock.
 */
/** a live take's drawn cursor */
type Hand = {
	to(x: number, y: number): Promise<void>;
	glide(moves: readonly { t: number; x: number; y: number }[]): Promise<void>;
};

export async function rehearse(
	page: Page,
	steps: readonly Step[],
	/** a live take's drawn cursor: put at a point, or sent on a whole glide it draws by itself, frame by frame */
	hand?: Hand,
	from = START,
): Promise<{ inputs: RecordedInput[]; duration: number; at: { x: number; y: number } }> {
	const inputs: RecordedInput[] = [];
	let t = 500;
	let at = from;
	const move = async (x: number, y: number) => {
		await page.mouse.move(x, y);
		await hand?.to(x, y);
	};
	/**
	 * A live take is filmed on the wall clock, so its glide keeps to its own times, dropping a move it fell behind on;
	 * a rehearsal records the times and may take as long as it likes. The drawn cursor glides in the page on its own
	 * frames, and the mouse follows it for what hovers: a move costs a round trip to the browser, which the m1's is
	 * far enough away for a cursor moved by them to step.
	 */
	const real = async (moves: RecordedInput[]) => {
		const began = Date.now();
		const first = moves[0]?.t ?? 0;
		const path = moves.flatMap((one) => (one.kind === "move" ? [{ t: one.t, x: one.x, y: one.y }] : []));
		await hand?.glide(path);
		for (const [i, one] of moves.entries()) {
			if (one.kind !== "move") continue;
			if (hand !== undefined) {
				const due = one.t - first - (Date.now() - began);
				if (due > 0) await page.waitForTimeout(due);
				const next = moves[i + 1];
				if (next !== undefined && next.t - first < Date.now() - began) continue;
			}
			await page.mouse.move(one.x, one.y);
		}
		const last = path.at(-1);
		if (hand !== undefined && last !== undefined) await hand.to(last.x, last.y);
	};
	/** a live take's pause for what a rehearsal only counts */
	const beat = async (ms: number) => {
		if (hand !== undefined) await page.waitForTimeout(ms);
	};
	inputs.push({ t: 0, kind: "move", x: at.x, y: at.y, button: 0 });
	await move(at.x, at.y);
	for (const step of steps) {
		if ("wait" in step) {
			await page.waitForTimeout(step.wait);
			t += step.wait;
		} else if ("move" in step || "click" in step) {
			const to = await pointOf(page, "move" in step ? step.move : step.click);
			const ms = step.ms ?? GLIDE_MS;
			const moves = glide(at, to, t, ms);
			await real(moves);
			inputs.push(...moves);
			t += ms;
			at = to;
			if ("click" in step) {
				inputs.push({ t: t + 60, kind: "down", ...to, button: 0 }, { t: t + 140, kind: "up", ...to, button: 0 });
				await page.mouse.down();
				await page.waitForTimeout(80);
				await page.mouse.up();
				t += 300;
				await page.waitForTimeout(220);
			}
		} else if ("drag" in step) {
			const from = await pointOf(page, step.drag);
			const glideIn = glide(at, from, t, GLIDE_MS);
			await real(glideIn);
			inputs.push(...glideIn);
			t += GLIDE_MS + 100;
			inputs.push({ t, kind: "down", ...from, button: 0 });
			await page.mouse.down();
			const to = "by" in step ? { x: from.x + step.by.dx, y: from.y + step.by.dy } : await pointOf(page, step.to);
			const ms = step.ms ?? 1200;
			const moves = glide(from, to, t, ms, 0);
			await real(moves);
			inputs.push(...moves);
			t += ms + 100;
			inputs.push({ t, kind: "up", ...to, button: 0 });
			await page.mouse.up();
			at = to;
			t += 300;
		} else if ("type" in step) {
			const per = step.perKeyMs ?? 90;
			for (const char of step.type) {
				const key = keyOf(char);
				inputs.push({ t, kind: "key-down", ...key }, { t: t + 40, kind: "key-up", ...key, text: "" });
				await page.keyboard.press(char);
				await beat(per);
				t += per;
			}
			t += 200;
		} else if ("press" in step) {
			const key = keyOf(step.press);
			inputs.push({ t, kind: "key-down", ...key }, { t: t + 60, kind: "key-up", ...key, text: "" });
			await page.keyboard.press(step.press);
			await beat(300);
			t += 300;
		} else if ("scroll" in step) {
			const to = await pointOf(page, step.scroll);
			const moves = glide(at, to, t, GLIDE_MS);
			await real(moves);
			inputs.push(...moves);
			t += GLIDE_MS;
			at = to;
			const ms = step.ms ?? 600;
			const ticks = Math.max(1, Math.round(ms / 50));
			for (let i = 0; i < ticks; i++) {
				inputs.push({ t: t + i * 50, kind: "wheel", ...to, dx: 0, dy: step.dy / ticks });
				await page.mouse.wheel(0, step.dy / ticks);
			}
			t += ms;
		}
		await page.waitForTimeout(60);
	}
	return { inputs, duration: t + 800, at };
}

/**
 * The window has drawn a frame: a still on the canvas's picture layer, or a document or image in the field. A frame
 * with no image of its own is only ever a picture until it is entered, so the field alone can wait forever.
 */
function frameDrawn(page: Page): Promise<unknown> {
	return page.waitForFunction(
		() => {
			const layer = document.querySelector<HTMLCanvasElement & { spoolPictures?: () => { drawn: unknown[] } }>(
				"[data-picture-layer]",
			);
			if ((layer?.spoolPictures?.().drawn.length ?? 0) > 0) return true;
			return [...document.querySelectorAll("img, iframe")].some((one) => one.checkVisibility());
		},
		undefined,
		{ timeout: 60_000 },
	);
}

const free = () =>
	new Promise<number>((done, fail) => {
		const server = createServer();
		server.once("error", fail);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			server.close(() =>
				typeof address === "object" && address !== null ? done(address.port) : fail(new Error("no port")),
			);
		});
	});

const CHECKOUT = resolve(dirname(new URL(import.meta.url).pathname), "../../../..");

const SCRIPTS = dirname(new URL(import.meta.url).pathname);
/** the demo products clips draw their frames from */
const KIT = join(CHECKOUT, "changelog/kit");

/** this checkout's spool, in its own lane so the shared daemon is never touched; run from the checkout, which its daemon builds the window from */
function spool(args: string[], env: NodeJS.ProcessEnv) {
	return spawnSync(
		process.execPath,
		[join(CHECKOUT, "node_modules/tsx/dist/cli.mjs"), join(CHECKOUT, "src/dev.ts"), ...args],
		{
			cwd: CHECKOUT,
			env: { ...process.env, ...env },
			encoding: "utf8",
			timeout: 120_000,
		},
	);
}

/** a fresh spool on the clip's project, in its own state and port, stopped and removed after */
async function withLane<T>(
	clip: Clip,
	keep: boolean,
	use: (url: string, lane: { root: string; port: number; dir: string }) => Promise<T>,
): Promise<T> {
	const lane = mkdtempSync(join(tmpdir(), "spool-changelog-clip-"));
	const project = join(lane, "clip");
	const env: NodeJS.ProcessEnv = { ...clip.env, SPOOL_DIR: join(lane, "state"), SPOOL_PORT: String(await free()) };
	if (clip.agent !== undefined) {
		// the stand-in is the only agent on the lane's PATH, so the pane offers it and nothing real
		const bin = join(lane, "bin");
		mkdirSync(bin);
		symlinkSync(join(SCRIPTS, "fake-claude.mjs"), join(bin, "claude"));
		symlinkSync(process.execPath, join(bin, "node"));
		writeFileSync(join(lane, "turn.json"), JSON.stringify(clip.agent));
		env.CLIP_AGENT_SCRIPT = join(lane, "turn.json");
		env.PATH = `${bin}:/usr/bin:/bin`;
	}
	try {
		// with history, as a person's project has it: without, the first hand edit says nothing is catching it
		spawnSync("git", ["init", "-q", project]);
		const made = spool(["init", "--local", "--history", project], env);
		if (made.status !== 0) throw new Error(`spool init failed: ${made.stdout}${made.stderr}`);
		for (const name of clip.kit ?? [])
			cpSync(join(KIT, name), join(project, "design/shared/kit", name), { recursive: true });
		for (const [path, content] of Object.entries(clip.files)) {
			mkdirSync(dirname(join(project, path)), { recursive: true });
			writeFileSync(join(project, path), content);
		}
		// a project the clip makes (New project, a dropped file) lands in the lane, never in ~/spool
		createSettingsStore(join(lane, "state")).write("projects.location", join(lane, "projects"));
		const served = spool(["serve"], env);
		if (served.status !== 0) throw new Error(`spool did not start: ${served.stdout}${served.stderr}`);
		return await use(`http://127.0.0.1:${env.SPOOL_PORT}/p/clip`, {
			root: project,
			port: Number(env.SPOOL_PORT),
			dir: lane,
		});
	} finally {
		spool(["stop"], env);
		if (keep) process.stdout.write(`kept ${lane}\n`);
		else rmSync(lane, { recursive: true, force: true });
	}
}

async function main() {
	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			out: { type: "string" },
			keep: { type: "boolean", default: false },
			rehearse: { type: "boolean", default: false },
			headless: { type: "boolean", default: false },
		},
	});
	const [script] = positionals;
	const out = values.out;
	if (script === undefined || out === undefined) {
		process.stderr.write(
			"usage: pnpm exec tsx .agents/skills/changelog/scripts/clip.ts <changelog/clips/id.ts> --out <id.mp4>\n",
		);
		process.exit(2);
	}
	const clip = ((await import(pathToFileURL(resolve(script)).href)) as { default: Clip }).default;
	const viewport = clip.viewport ?? { w: 1440, h: 900 };
	if (clip.live !== undefined) return live(clip, clip.live, viewport, out, values);
	const { chromium } = await import("playwright-core");
	const { inputs, duration } = await withLane(clip, values.keep, async (url) => {
		const browser = await chromium.launch({ channel: "chromium-headless-shell" });
		try {
			const page = await browser.newPage({ viewport: { width: viewport.w, height: viewport.h } });
			// the window holds its daemon's socket open, so it never goes network-idle: wait for a frame to draw
			await page.goto(url);
			await frameDrawn(page);
			await page.waitForTimeout(2000);
			await page.screenshot({ path: out.replace(/\.mp4$/, ".start.png") });
			const rehearsed = await rehearse(page, clip.steps ?? []);
			await page.screenshot({ path: out.replace(/\.mp4$/, ".end.png") });
			return rehearsed;
		} finally {
			await browser.close();
		}
	});
	process.stdout.write(`rehearsed: ${inputs.length} inputs over ${(duration / 1000).toFixed(1)} s\n`);
	if (values.rehearse) return;
	// the take, in a fresh lane: nothing the rehearsal moved or tuned carries over
	await withLane(clip, values.keep, async (url) => {
		const started = Date.now();
		const bytes = await renderClip(
			{ url, viewport, inputs, duration, aspect: "frame" },
			// one tab: spool writes what the steps tune into the project, which parallel tabs would all read
			{ progress: (done) => process.stdout.write(`\rrendering ${Math.round(done * 100)}%`), workers: 1 },
		);
		const raw = out.replace(/\.mp4$/, ".raw.mp4");
		writeFileSync(raw, bytes);
		// silent, sharp enough that the window's small text survives, starting to play before it has all arrived
		const web = spawnSync("ffmpeg", [
			...["-loglevel", "error", "-y", "-i", raw, "-an", "-vf", `scale=${WEB_WIDTH}:-2:flags=lanczos`],
			...["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
		]);
		if (web.status !== 0) throw new Error(`ffmpeg could not make the web copy: ${web.stderr}`);
		rmSync(raw);
		const poster = out.replace(/\.mp4$/, ".jpg");
		spawnSync("ffmpeg", [
			"-loglevel",
			"error",
			"-y",
			"-sseof",
			"-0.5",
			"-i",
			out,
			"-frames:v",
			"1",
			"-q:v",
			"2",
			poster,
		]);
		process.stdout.write(`\n${out} and ${poster}, rendered in ${Math.round((Date.now() - started) / 1000)} s\n`);
	});
}

/**
 * The cursor a live take draws in the page, as the recorder draws it over a replayed one: the Mac's arrow at 1.5 times
 * its size, or its pointing hand over what points, fading out once the hand rests.
 */
const CURSOR = `(() => {
	if (window.top !== window) return;
	const arrow = '<path d="M0 0v16.6l4.2-4 2.9 6.6 2.8-1.2-2.8-6.4h5.8Z" fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round" paint-order="stroke"/>';
	const hand = '<path d="M-1.5 10.5V1.5a1.5 1.5 0 0 1 3 0V8V7a1.5 1.5 0 0 1 3 0v1.5V8a1.5 1.5 0 0 1 3 0v1.5v-.2a1.3 1.3 0 0 1 2.6 0v5.2c0 3.3-2 5.5-5.1 5.5h-2c-1.9 0-3.2-.8-4.3-2.4l-3.6-5a1.4 1.4 0 0 1 2.2-1.7Z" fill="#fff" stroke="#000" stroke-width="1.1" stroke-linejoin="round"/><path d="M1.5 8v3.2M4.5 8.5v2.7M7.5 9.5v2.2" stroke="#000" stroke-linecap="round"/>';
	let element, idle, shown = "";
	window.__clipHand = (x, y) => {
		if (!element) {
			element = document.createElement("div");
			element.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:opacity 300ms;filter:drop-shadow(0 1.5px 2px rgba(0,0,0,.4))";
			document.documentElement.append(element);
		}
		const under = document.elementFromPoint(x, y);
		const kind = under && getComputedStyle(under).cursor === "pointer" ? "hand" : "arrow";
		if (kind !== shown) {
			shown = kind;
			element.innerHTML = '<svg width="36" height="36" viewBox="-4 -2 24 24" style="overflow:visible;margin:-3px 0 0 -6px">' + (kind === "hand" ? hand : arrow) + "</svg>";
		}
		element.style.transform = "translate(" + x + "px," + y + "px)";
		// a thing the clip has the hand carry, such as a file dragged in from outside the window
		const held = document.querySelector("[data-clip-held]");
		if (held) held.style.transform = "translate(" + x + "px," + y + "px)";
		element.style.transition = "opacity 100ms";
		element.style.opacity = "1";
		clearTimeout(idle);
		idle = setTimeout(() => { element.style.transition = "opacity 300ms"; element.style.opacity = "0"; }, 1200);
	};
	// a glide drawn on the page's own frames, on its times from now
	let gliding = 0;
	window.__clipGlide = (path) => {
		if (path.length === 0) return;
		const run = ++gliding;
		const began = performance.now() - path[0].t;
		const frame = (now) => {
			if (run !== gliding) return;
			const t = now - began;
			let i = 0;
			while (i < path.length - 1 && path[i + 1].t <= t) i++;
			const a = path[i], b = path[Math.min(i + 1, path.length - 1)];
			const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
			window.__clipHand(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
			if (t < path[path.length - 1].t) requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	};
})()`;

/**
 * A live clip: one lane, walked once on the wall clock while the page is filmed. The take is filmed on the m1, a real
 * Chrome window on a real screen at 60 fps (m1.ts); --headless films it here instead, with Chrome's screencast, whose
 * pictures come as fast as a GPU-less machine draws them, so a heavy page plays choppy. A rehearsal walks it here.
 */
async function live(
	clip: Clip,
	act: (take: Take) => Promise<void>,
	viewport: { w: number; h: number },
	out: string,
	options: { keep: boolean; rehearse: boolean; headless: boolean },
): Promise<void> {
	const { chromium } = await import("playwright-core");
	const onM1 = !options.headless && !options.rehearse;
	const work = mkdtempSync(join(tmpdir(), "spool-changelog-live-"));
	const shots: { at: number; data: string }[] = [];
	const hurried: { from: number; to: number }[] = [];
	let filmed: { video: string; startedAt: number; crop: Crop | null } | null = null;
	await withLane(clip, options.keep, async (url, lane) => {
		const size = { viewport: { width: viewport.w, height: viewport.h }, deviceScaleFactor: 2 };
		const unpacked = join(CHECKOUT, "extension/dist");
		const m1 = onM1
			? await openM1({ port: lane.port, extension: clip.extension === true ? unpacked : undefined, viewport })
			: null;
		// a persistent context owns its browser; a plain one leaves it running unless closed too
		const browser =
			m1 !== null || clip.extension === true ? null : await chromium.launch({ channel: "chromium-headless-shell" });
		const context =
			m1 !== null
				? m1.context
				: browser === null
					? await chromium.launchPersistentContext(join(lane.dir, "profile"), {
							channel: "chromium",
							headless: true,
							args: [`--disable-extensions-except=${unpacked}`, `--load-extension=${unpacked}`],
							...size,
						})
					: await browser.newContext(size);
		try {
			await context.addInitScript(CURSOR);
			let extension: Worker | null = null;
			if (clip.extension === true) {
				extension = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
				await extension.evaluate(
					(port) =>
						(
							globalThis as unknown as { chrome: { storage: { local: { set(items: object): Promise<void> } } } }
						).chrome.storage.local.set({ ports: [port] }),
					lane.port,
				);
			}
			const page = context.pages()[0] ?? (await context.newPage());
			await page.goto(url);
			await frameDrawn(page);
			await page.waitForTimeout(2000);
			await page.screenshot({ path: out.replace(/\.mp4$/, ".start.png") });
			let screencast = null as { stop: () => Promise<void> } | null;
			let filming: Page | null = null;
			const film = async (on: Page) => {
				filming = on;
				if (m1 !== null) return m1.film(on);
				await screencast?.stop();
				await on.bringToFront();
				if (options.rehearse) return;
				const cdp = await context.newCDPSession(on);
				cdp.on("Page.screencastFrame", (frame) => {
					shots.push({ at: frame.metadata.timestamp ?? Date.now() / 1000, data: frame.data });
					void cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
				});
				await cdp.send("Page.startScreencast", {
					format: "jpeg",
					quality: 92,
					maxWidth: viewport.w * 2,
					maxHeight: viewport.h * 2,
					everyNthFrame: 1,
				});
				screencast = { stop: () => cdp.send("Page.stopScreencast").catch(() => {}) as Promise<void> };
			};
			const hands = new Map<Page, { x: number; y: number }>();
			const walk = async (steps: readonly Step[], on: Page = page) => {
				const walked = await rehearse(
					on,
					steps,
					{
						to: (x, y) =>
							on.evaluate(
								(at) => (window as { __clipHand?: (x: number, y: number) => void }).__clipHand?.(at.x, at.y),
								{ x, y },
							),
						glide: (moves) =>
							on.evaluate(
								(path) => (window as { __clipGlide?: (path: unknown) => void }).__clipGlide?.(path),
								moves,
							),
					},
					hands.get(on) ?? START,
				);
				hands.set(on, walked.at);
			};
			const hurry = async <T>(slow: Promise<T>): Promise<T> => {
				const from = Date.now();
				try {
					return await slow;
				} finally {
					hurried.push({ from, to: Date.now() });
				}
			};
			const take: Take = { page, context, url, port: lane.port, root: lane.root, extension, walk, film, hurry };
			await clip.prepare?.(take);
			if (filming === null) await film(page);
			try {
				await act(take);
			} catch (error) {
				await (context.pages().at(-1) ?? page).screenshot({ path: out.replace(/\.mp4$/, ".fail.png") });
				throw error;
			}
			if (m1 !== null) filmed = await m1.stop(work);
			await screencast?.stop();
			await (filming ?? page).screenshot({ path: out.replace(/\.mp4$/, ".end.png") });
		} finally {
			if (m1 !== null) await m1.close();
			else await context.close();
			await browser?.close();
		}
	});
	try {
		if (options.rehearse) return;
		if (filmed === null) {
			// each still holds until the next, the last for a beat
			const lines = ["ffconcat version 1.0"];
			shots.sort((a, b) => a.at - b.at);
			shots.forEach((shot, i) => {
				writeFileSync(join(work, `${i}.jpg`), Buffer.from(shot.data, "base64"));
				const next = shots[i + 1]?.at ?? shot.at + 0.8;
				lines.push(`file ${i}.jpg`, `duration ${(next - shot.at).toFixed(4)}`);
			});
			lines.push(`file ${shots.length - 1}.jpg`);
			writeFileSync(join(work, "list.ffconcat"), `${lines.join("\n")}\n`);
			const video = join(work, "screencast.mp4");
			const raw = spawnSync("ffmpeg", [
				...["-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(work, "list.ffconcat"), "-an"],
				...["-vf", "fps=60", "-c:v", "libx264", "-preset", "veryfast", "-crf", "10", "-pix_fmt", "yuv420p", video],
			]);
			if (raw.status !== 0) throw new Error(`ffmpeg could not join the screencast: ${raw.stderr}`);
			filmed = { video, startedAt: (shots[0]?.at ?? 0) * 1000, crop: null };
		}
		pace(filmed, hurried, out);
		process.stdout.write(`${out} and ${out.replace(/\.mp4$/, ".jpg")}, filmed ${onM1 ? "on the m1" : "here"}\n`);
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

/**
 * The web copy of a live take: hurried waits squeezed to a blink, the page cut out of the window, at 60 fps and
 * X's width, sharp enough that the window's small text survives, starting to play before it has all arrived; and its
 * last picture for the poster.
 */
function pace(
	filmed: { video: string; startedAt: number; crop: Crop | null },
	hurried: readonly { from: number; to: number }[],
	out: string,
): void {
	// each hurried stretch of the take, in seconds from its first picture, runs HURRIED_S long; the rest keeps its pace
	const squeeze = hurried
		.map(({ from, to }) => ({ a: Math.max(0, (from - filmed.startedAt) / 1000), b: (to - filmed.startedAt) / 1000 }))
		.filter(({ a, b }) => b - a > HURRIED_S)
		.map(
			({ a, b }) =>
				`(clip(T,${a.toFixed(3)},${b.toFixed(3)})-${a.toFixed(3)})*${(1 - HURRIED_S / (b - a)).toFixed(4)}`,
		);
	const { crop } = filmed;
	const filters = [
		"setpts=PTS-STARTPTS",
		...(squeeze.length > 0 ? [`setpts='(T-${squeeze.join("-")})/TB'`] : []),
		...(crop === null ? [] : [`crop=${crop.w}:${crop.h}:${crop.x}:${crop.y}`]),
		`scale=${WEB_WIDTH}:-2:flags=lanczos`,
		"fps=60",
		"format=yuv420p",
	];
	const web = spawnSync("ffmpeg", [
		...["-loglevel", "error", "-y", "-i", filmed.video, "-an", "-vf", filters.join(",")],
		...["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-movflags", "+faststart", out],
	]);
	if (web.status !== 0) throw new Error(`ffmpeg could not make the web copy: ${web.stderr}`);
	spawnSync("ffmpeg", [
		...["-loglevel", "error", "-y", "-sseof", "-0.5", "-i", out],
		...["-frames:v", "1", "-q:v", "2", out.replace(/\.mp4$/, ".jpg")],
	]);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
