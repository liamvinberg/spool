import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import type { Page } from "playwright-core";
import { renderClip } from "../../../../src/daemon/record";
import type { RecordedInput } from "../../../../src/runtime/record-protocol";

/**
 * One changelog clip: spool's real window on a project made for it, driven by a
 * script of steps, rendered frame by frame into an MP4 by spool's own recorder.
 * The script is kept (changelog/clips/<id>.ts) so the clip can be made again
 * when the window changes.
 */
export interface Clip {
	/** Files over a fresh `spool init` project, path to content: design/frames/…/frame.tsx and its frame.json. */
	files: Readonly<Record<string, string>>;
	/** The window's size in CSS pixels; 1440×900 by default, the page's 16:10. */
	viewport?: { w: number; h: number };
	steps: readonly Step[];
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
/** twice the 560 px the changelog shows a clip at */
const WEB_WIDTH = 1120;
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
export async function rehearse(
	page: Page,
	steps: readonly Step[],
): Promise<{ inputs: RecordedInput[]; duration: number }> {
	const inputs: RecordedInput[] = [];
	let t = 500;
	let at = START;
	const real = async (moves: RecordedInput[]) => {
		for (const move of moves) if (move.kind === "move") await page.mouse.move(move.x, move.y);
	};
	inputs.push({ t: 0, kind: "move", x: at.x, y: at.y, button: 0 });
	await page.mouse.move(at.x, at.y);
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
			for (const move of moves) {
				if (move.kind === "move") await page.mouse.move(move.x, move.y);
				inputs.push(move);
			}
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
				t += per;
			}
			t += 200;
		} else if ("press" in step) {
			const key = keyOf(step.press);
			inputs.push({ t, kind: "key-down", ...key }, { t: t + 60, kind: "key-up", ...key, text: "" });
			await page.keyboard.press(step.press);
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
	return { inputs, duration: t + 800 };
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
async function withLane<T>(clip: Clip, keep: boolean, use: (url: string) => Promise<T>): Promise<T> {
	const lane = mkdtempSync(join(tmpdir(), "spool-changelog-clip-"));
	const project = join(lane, "clip");
	const env = { SPOOL_DIR: join(lane, "state"), SPOOL_PORT: String(await free()) };
	try {
		// with history, as a person's project has it: without, the first hand edit says nothing is catching it
		spawnSync("git", ["init", "-q", project]);
		const made = spool(["init", "--local", "--history", project], env);
		if (made.status !== 0) throw new Error(`spool init failed: ${made.stdout}${made.stderr}`);
		for (const [path, content] of Object.entries(clip.files)) {
			mkdirSync(dirname(join(project, path)), { recursive: true });
			writeFileSync(join(project, path), content);
		}
		const served = spool(["serve"], env);
		if (served.status !== 0) throw new Error(`spool did not start: ${served.stdout}${served.stderr}`);
		return await use(`http://127.0.0.1:${env.SPOOL_PORT}/p/clip`);
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
	const { chromium } = await import("playwright-core");
	const { inputs, duration } = await withLane(clip, values.keep, async (url) => {
		const browser = await chromium.launch({ channel: "chromium-headless-shell" });
		try {
			const page = await browser.newPage({ viewport: { width: viewport.w, height: viewport.h } });
			// the window holds its daemon's socket open, so it never goes network-idle: wait for a frame to draw
			await page.goto(url);
			await page.locator("img, iframe").first().waitFor({ timeout: 60_000 });
			await page.waitForTimeout(2000);
			await page.screenshot({ path: out.replace(/\.mp4$/, ".start.png") });
			const rehearsed = await rehearse(page, clip.steps);
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
		// the page shows it 560 wide: twice that, silent, starting to play before it has all arrived
		const web = spawnSync("ffmpeg", [
			...["-loglevel", "error", "-y", "-i", raw, "-an", "-vf", `scale=${WEB_WIDTH}:-2:flags=lanczos`],
			...["-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out],
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
			"3",
			poster,
		]);
		process.stdout.write(`\n${out} and ${poster}, rendered in ${Math.round((Date.now() - started) / 1000)} s\n`);
	});
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
