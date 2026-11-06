import { mkdtempSync, rmSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, CDPSession, Page } from "playwright-core";
import {
	HeadlessShellCannotRunError,
	headlessShellArgs,
	MissingHeadlessShellError,
	missingLibrary,
} from "../headless-shell";
import { type ClipAspect, clipWindow, RECORD_LIMIT_MS, type RecordedInput } from "../runtime/record-protocol";
import { cursorTrack } from "./record-cursor";

/**
 * The recorder (spool#221): a recording played back into a fresh copy of the
 * frame and rendered one frame at a time into an MP4.
 *
 * It runs in its own process of the pinned headless shell, launched in
 * deterministic mode: the shell is the one Chromium build that still lets a
 * caller own the clock. The frame's tab is made with BeginFrame control, so it
 * draws only when told to, and runs on virtual time, so `performance.now`,
 * `Date`, timers and rAF move exactly one frame per frame. Each frame the
 * inputs due by then are sent, the clock advances 1/60 s, and one BeginFrame
 * draws and photographs it. A frame that takes 40 ms to draw still lands 16.7
 * ms after the one before, so the clip is smooth however slow the machine is.
 *
 * The frame's sound is kept the same way: every AudioContext the frame makes
 * is an OfflineAudioContext on the virtual clock, so a sound started on a
 * click is scheduled at the click's moment, and the contexts are rendered and
 * mixed once the frames are done.
 *
 * Encoding is H.264 through WebCodecs in a second, ordinary tab of the same
 * browser, the only H.264 encoder the shell ships, with the cursor drawn over
 * each frame there. Audio is AAC through mediabunny's WASM build of FFmpeg's
 * encoder, since no headless build carries one, and mediabunny writes the MP4.
 */

export interface ClipRequest {
	/** The frame's recording document on the render origin: the player with no chrome. */
	url: string;
	/** The size the frame was played at, in CSS pixels. */
	viewport: { w: number; h: number };
	inputs: readonly RecordedInput[];
	/** How long the session ran, ms. */
	duration: number;
	aspect: ClipAspect;
}

export const CLIP_FPS = 60;
const STEP_MS = 1000 / CLIP_FPS;
const AUDIO_RATE = 48_000;
/** How many pictures may wait on the encoder while the next one is taken. */
const PUSH_AHEAD = 3;
/**
 * The frame's clock while it loads, from its document's time origin: past the
 * origin, since a BeginFrame from before it hands rAF a timestamp of 0 and
 * stops every transition.
 */
const LOADED_AT_MS = 1000;
const CLOCK_KEY = "__spoolRecordClock";
/** How long a BeginFrame may take before it is drawn without the page's work. */
const FRAME_PATIENCE_MS = 5000;
/**
 * Each picture as a JPEG at a quality an H.264 encode never shows the
 * difference from: a PNG of a full-size frame takes several times as long to
 * make and to read back.
 */
const SHOT = { format: "jpeg", quality: 95 } as const;
/** Kept under what Discord carries, so an agent can hand a clip over in chat. */
const CLIP_BYTES = 18 * 1024 * 1024;
const MAX_BITRATE = 16_000_000;
/** A sharper frame than 3x is the encoder's bits spent on nothing. */
const MAX_SCALE = 3;
/** How long a frame may take to arrive before the recording gives up on it. */
const LOAD_MS = 30_000;
/** H.264 High at level 4.2: up to 1920x1080 at 60 fps, which every clip shape stays inside. */
const H264 = "avc1.64002a";

/** Where the frame sits in the clip: the clip's size, and the frame's scale and offset inside it. */
export interface ClipLayout {
	width: number;
	height: number;
	scale: number;
	x: number;
	y: number;
}

/**
 * A post's shape holds the frame centred and as large as fits, on the frame's
 * own background. The frame's own shape is the frame alone, as large as a
 * 1080p clip's pixel count allows. H.264 wants even sides.
 */
export function clipLayout(viewport: { w: number; h: number }, aspect: ClipAspect): ClipLayout {
	const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
	const { w, h } = viewport;
	let width: number;
	let height: number;
	if (aspect === "16:9") [width, height] = [1920, 1080];
	else if (aspect === "1:1") [width, height] = [1080, 1080];
	else {
		const fit = Math.min(1920 / Math.max(w, h), Math.sqrt((1920 * 1080) / (w * h)));
		[width, height] = [even(w * fit), even(h * fit)];
	}
	const scale = Math.min(width / w, height / h, MAX_SCALE);
	return {
		width,
		height,
		scale,
		x: Math.round((width - w * scale) / 2),
		y: Math.round((height - h * scale) / 2),
	};
}

/** The deterministic shell: drawn on request, on the compositor's own thread order. */
const DETERMINISTIC_ARGS = [
	"--deterministic-mode",
	"--enable-begin-frame-control",
	"--run-all-compositor-stages-before-draw",
	"--disable-threaded-animation",
	"--disable-threaded-scrolling",
	"--disable-checker-imaging",
];

export interface RecorderDeps {
	/** The browser the clip is made in, drawing at `scale`; the deterministic shell unless a test says otherwise. */
	launch?(scale: number): Promise<BrowserContext>;
	/** How long one clip may take from launch to file. */
	deadlineMs?: number;
	/** Told how far the clip has got, 0 to 1, as its frames are drawn. */
	progress?(done: number): void;
	/**
	 * How many tabs share the frames, each replaying the inputs up to its part. One
	 * when the page writes what the inputs do somewhere the others read, as spool's
	 * own window does to its project.
	 */
	workers?: number;
}

/** Render one recording to an MP4's bytes. */
export async function renderClip(request: ClipRequest, deps: RecorderDeps = {}): Promise<Uint8Array<ArrayBuffer>> {
	const { start, end } = clipWindow(request.inputs, request.duration);
	const layout = clipLayout(request.viewport, request.aspect);
	const deadlineMs = deps.deadlineMs ?? LOAD_MS + 20 * (end + 2000);
	const launch = deps.launch ?? launchRecorder;
	const contexts: BrowserContext[] = [];
	const closeAll = () => Promise.all(contexts.map((context) => context.close().catch(() => {})));
	let timer: NodeJS.Timeout | undefined;
	const deadline = new Promise<never>((_, fail) => {
		timer = setTimeout(() => {
			fail(new Error(`the recording took longer than ${Math.round(deadlineMs / 1000)} s to render`));
			void closeAll();
		}, deadlineMs);
	});
	const opened = async () => {
		const context = await launch(layout.scale);
		contexts.push(context);
		return context;
	};
	try {
		return await Promise.race([
			render(opened, request, layout, start, end, deps.progress, deps.workers ?? RECORD_WORKERS),
			deadline,
		]);
	} finally {
		clearTimeout(timer);
		await closeAll();
	}
}

/**
 * The shell for one clip. The frame draws at the clip's scale from the start,
 * by the browser's own device scale: a BeginFrame's picture is taken at the
 * window's scale, and an emulated one never reaches it.
 */
async function launchRecorder(scale: number): Promise<BrowserContext> {
	const { chromium } = await import("playwright-core");
	const profile = mkdtempSync(join(tmpdir(), "spool-record-"));
	try {
		const context = await chromium.launchPersistentContext(profile, {
			channel: "chromium-headless-shell",
			headless: true,
			viewport: null,
			args: [...headlessShellArgs(), ...DETERMINISTIC_ARGS, `--force-device-scale-factor=${scale}`],
		});
		context.once("close", () => rmSync(profile, { recursive: true, force: true }));
		return context;
	} catch (error) {
		rmSync(profile, { recursive: true, force: true });
		if (error instanceof Error && error.message.includes("Executable doesn't exist")) {
			throw new MissingHeadlessShellError();
		}
		const library = error instanceof Error ? missingLibrary(error.message) : undefined;
		if (library !== undefined) throw new HeadlessShellCannotRunError(library);
		throw error;
	}
}

interface EncodedVideo {
	config: { codec: string; codedWidth: number; codedHeight: number; description?: string };
	chunks: { key: boolean; ts: number; dur: number; data: string }[];
}

/**
 * The clip in parts, rendered side by side (spool#221): each part replays the
 * recording from its beginning in a browser of its own (BeginFrame control is
 * one frame at a time per browser), quickly and without
 * pictures up to where its part starts, and photographs and encodes only its
 * part. The replay is deterministic, so where one part ends the next carries
 * on as if one tab had made both. The last part also keeps the sound, since it
 * is the one tab that plays the whole recording.
 */
async function render(
	launch: () => Promise<BrowserContext>,
	request: ClipRequest,
	layout: ClipLayout,
	start: number,
	end: number,
	progress: (done: number) => void = () => {},
	workers = RECORD_WORKERS,
): Promise<Uint8Array<ArrayBuffer>> {
	const first = Math.floor(start / STEP_MS);
	const last = Math.ceil(end / STEP_MS);
	const bitrate = Math.min(MAX_BITRATE, Math.floor((CLIP_BYTES * 8) / Math.max(1, (end - start) / 1000)));
	const parts = clipParts(first, last + 1, workers);
	// the work is every part's replay up to its start and its pictures after, weighed as clipParts weighs them
	const work = parts.reduce((sum, part) => sum + part.from * REPLAY_COST + (part.to - part.from), 0);
	let done = 0;
	const drew = (frames: number) => {
		done += frames;
		// the last few hundredths are the sound and the file
		progress(Math.min(0.97, done / work));
	};
	const made = await Promise.all(
		parts.map((part, index) =>
			launch().then((context) =>
				renderPart(context, request, {
					layout,
					bitrate,
					first,
					part,
					sound: index === parts.length - 1,
					start,
					end,
					drew,
				}),
			),
		),
	);
	const [head] = made;
	if (head === undefined) throw new Error("the clip had no frames");
	if (made.some((one) => one.video.config.description !== head.video.config.description)) {
		throw new Error("the clip's parts were encoded differently");
	}
	const video = { config: head.video.config, chunks: made.flatMap((one) => one.video.chunks) };
	return await mux(video, made.at(-1)?.sound ?? null);
}

/** How many browsers a clip is rendered in at once: each takes a few cores to draw and encode. */
const RECORD_WORKERS = Math.max(1, Math.min(6, Math.floor(availableParallelism() / 4)));
/** The shortest part worth a tab of its own, in frames. */
const PART_MIN = CLIP_FPS;
/** What replaying a frame without its picture costs, against taking and encoding one. */
const REPLAY_COST = 0.15;

/**
 * The clip's frames `[from, to)` split into at most `workers` parts of about
 * equal work. A part also replays every frame before it, cheaply, so the later
 * a part starts the fewer frames it photographs.
 */
export function clipParts(from: number, to: number, workers: number): { from: number; to: number }[] {
	const count = to - from;
	const k = Math.max(1, Math.min(workers, Math.floor(count / PART_MIN)));
	if (k === 1) return [{ from, to }];
	// the work every part gets, found by halving: the least that covers the clip in k parts
	const covers = (work: number) => {
		let at = 0;
		for (let i = 0; i < k; i++) at += Math.max(1, work - REPLAY_COST * (from + at));
		return at >= count;
	};
	let low = count / k;
	let high = count + REPLAY_COST * to;
	for (let i = 0; i < 40; i++) {
		const mid = (low + high) / 2;
		if (covers(mid)) high = mid;
		else low = mid;
	}
	const parts: { from: number; to: number }[] = [];
	let at = from;
	for (let i = 0; i < k && at < to; i++) {
		const next = i === k - 1 ? to : Math.min(to, at + Math.max(1, Math.round(high - REPLAY_COST * at)));
		parts.push({ from: at, to: next });
		at = next;
	}
	return parts;
}

interface PartPlan {
	layout: ClipLayout;
	bitrate: number;
	/** The clip's first frame, which its time counts from. */
	first: number;
	part: { from: number; to: number };
	sound: boolean;
	start: number;
	end: number;
	/** Told of each frame drawn: a replayed one weighs what it costs against a photographed one. */
	drew(weight: number): void;
}

async function renderPart(
	context: BrowserContext,
	request: ClipRequest,
	plan: PartPlan,
): Promise<{ video: EncodedVideo; sound: { left: string; right: string } | null }> {
	const { layout, bitrate, first, part, start, end } = plan;
	const encoder = await context.newPage();
	// WebCodecs is only on a secure origin, and this page is nothing but the encoder
	await encoder.route(ENCODER_URL, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
	await encoder.goto(ENCODER_URL);
	await encoder.evaluate(ENCODER_SOURCE);
	await encoder.evaluate(clipCall("start", { ...layout, codec: H264, fps: CLIP_FPS, bitrate }));
	// pushed over a session of its own: Playwright's evaluate loses track of several at once
	const drawer = await context.newCDPSession(encoder);

	const { page, cdp } = await openFrameTab(context, encoder, request);
	let ticks = 0;
	let held = true;
	const frame = (screenshot: boolean) => {
		if (!held) ticks += STEP_MS;
		return cdp.send("HeadlessExperimental.beginFrame", {
			frameTimeTicks: ticks,
			// as long as a frame may take: a frame drawn past its deadline leaves the page's own work behind
			interval: FRAME_PATIENCE_MS,
			...(screenshot ? { screenshot: SHOT } : { noDisplayUpdates: true }),
		});
	};

	// The frame loads on virtual time, which stands still while anything it
	// fetches is on its way and otherwise moves a frame at a time: so however
	// busy the machine, it has loaded at the same reading of its clock in every
	// part, and every part's replay begins in the same state.
	await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
	void cdp.send("Page.navigate", { url: request.url });
	const loading = Date.now() + LOAD_MS;
	let committed = false;
	while (!committed) {
		if (Date.now() > loading) throw new Error("the frame did not start loading for its recording");
		committed = await evaluate<boolean>(cdp, `location.protocol !== "about:"`).catch(() => false);
		if (!committed) await new Promise((done) => setTimeout(done, 10));
	}
	// The frames drawn meanwhile keep one reading too, counted from the
	// document's time origin, so every animation it starts on them starts at the
	// same moment. That origin is read off one frame drawn while the document is
	// still empty.
	const step = async () => {
		const expired = once(cdp, "Emulation.virtualTimeBudgetExpired");
		await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pauseIfNetworkFetchesPending", budget: STEP_MS });
		await expired;
	};
	await evaluate(cdp, `requestAnimationFrame((at) => { window.${CLOCK_KEY} = at; })`);
	ticks = monotonicMs();
	await step();
	await frame(false);
	const read = await evaluate<number | undefined>(cdp, `window.${CLOCK_KEY}`);
	if (read === undefined || read <= 0) throw new Error("the frame's clock could not be read for its recording");
	ticks = ticks - read + Math.max(LOADED_AT_MS, read + STEP_MS);
	for (;;) {
		await step();
		await frame(false);
		if (await evaluate<boolean>(cdp, ARRIVED)) break;
		if (Date.now() > loading) throw new Error("the frame did not finish loading for its recording");
	}
	held = false;
	let still = (await frame(true)).screenshotData;
	const origin = await evaluate<number>(cdp, "performance.now()");
	await evaluate(cdp, `${SOUND}?.ends(${origin + end})`);

	const hands = createHands(cdp);
	const track = cursorTrack(request.inputs, part.to, STEP_MS);
	let next = 0;
	const pushing: Promise<unknown>[] = [];
	for (let index = 0; index < part.to; index++) {
		const t = index * STEP_MS;
		const sent: Promise<unknown>[] = [];
		while (next < request.inputs.length && (request.inputs[next] as RecordedInput).t <= t) {
			sent.push(hands.send(request.inputs[next] as RecordedInput));
			next++;
		}
		const expired = once(cdp, "Emulation.virtualTimeBudgetExpired");
		await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: STEP_MS });
		await expired;
		// a frame with nothing new to draw returns no picture, so the one before
		// the part is photographed too: the part's first frame must have one
		const drawn = await frame(index >= part.from - 1);
		await Promise.all(sent);
		if (drawn.screenshotData !== undefined) still = drawn.screenshotData;
		plan.drew(index < part.from ? REPLAY_COST : 1);
		if (index < part.from) continue;
		if (still === undefined) throw new Error("the recording drew no picture");
		// the encoder draws while the next frame is taken; a few pictures ahead at most
		const at = (index - first) * STEP_MS;
		const place = track[index] ?? null;
		const pointer = hands.pointer();
		// the Mac's hand over whatever the frame says can be pressed, read where the real pointer is
		const hand =
			place !== null && place.opacity > 0 && pointer !== null
				? await evaluate<boolean>(cdp, `${POINTS_AT}(${pointer.x}, ${pointer.y})`)
				: false;
		const cursor = place === null || place.opacity === 0 ? null : { ...place, hand };
		pushing.push(evaluate(drawer, clipCall("push", still, cursor, at, index === part.from), true));
		if (pushing.length > PUSH_AHEAD) await pushing.shift();
	}
	await Promise.all(pushing);
	const video = await evaluate<EncodedVideo>(drawer, clipCall("finish"), true);

	let sound: { left: string; right: string } | null = null;
	if (plan.sound) {
		// The sound renders on the real clock: an offline render finishes on a task virtual time would hold.
		await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance" });
		sound = await evaluate(cdp, `${SOUND}?.finish(${origin + start}, ${end - start}) ?? null`, true);
	}
	await page.close().catch(() => {});
	await encoder.close().catch(() => {});
	return { video, sound };
}

/** The frame's tab: made with BeginFrame control, at the played size, its sound kept. */
async function openFrameTab(
	context: BrowserContext,
	opener: Page,
	request: ClipRequest,
): Promise<{ page: Page; cdp: CDPSession }> {
	const session = await context.newCDPSession(opener);
	const arriving = context.waitForEvent("page");
	await session.send("Target.createTarget", {
		url: "about:blank",
		width: request.viewport.w,
		height: request.viewport.h,
		enableBeginFrameControl: true,
	});
	const page = await arriving;
	const cdp = await context.newCDPSession(page);
	await cdp.send("Page.enable");
	await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: RANDOM_SOURCE });
	await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_SOURCE });
	return { page, cdp };
}

/** Whether the frame shows a pointing hand at a point: its own `cursor: pointer`, as a browser would. */
const POINTS_AT = `((x, y) => { const at = document.elementFromPoint(x, y); return at !== null && getComputedStyle(at).cursor === "pointer"; })`;

/** The frame is in: loaded, its fonts in, the player's screen mounted. */
const ARRIVED = `document.readyState === "complete" && document.fonts.status === "loaded" && document.getElementById("root")?.firstElementChild != null`;

/** The hands, replayed: inputs to the frame through CDP, and where the pointer is for the cursor. */
function createHands(cdp: CDPSession) {
	let pointer: { x: number; y: number } | null = null;
	let buttons = 0;
	let lastDown: { t: number; x: number; y: number; count: number } | undefined;
	const buttonName = (button: number) => (button === 1 ? "middle" : button === 2 ? "right" : "left");
	const buttonBit = (button: number) => (button === 1 ? 4 : button === 2 ? 2 : 1);
	return {
		pointer: () => pointer,
		send(input: RecordedInput): Promise<unknown> {
			switch (input.kind) {
				case "move":
				case "down":
				case "up": {
					pointer = { x: input.x, y: input.y };
					if (input.kind === "move") {
						return cdp.send("Input.dispatchMouseEvent", {
							type: "mouseMoved",
							x: input.x,
							y: input.y,
							buttons,
							button: buttons === 0 ? "none" : buttonName(input.button),
						});
					}
					if (input.kind === "down") {
						// a second press soon after and close by is a double click, as the OS would count it
						const near =
							lastDown !== undefined &&
							input.t - lastDown.t < 500 &&
							Math.hypot(input.x - lastDown.x, input.y - lastDown.y) < 5;
						lastDown = { t: input.t, x: input.x, y: input.y, count: near ? (lastDown?.count ?? 0) + 1 : 1 };
						buttons |= buttonBit(input.button);
					} else {
						buttons &= ~buttonBit(input.button);
					}
					return cdp.send("Input.dispatchMouseEvent", {
						type: input.kind === "down" ? "mousePressed" : "mouseReleased",
						x: input.x,
						y: input.y,
						buttons,
						button: buttonName(input.button),
						clickCount: lastDown?.count ?? 1,
					});
				}
				case "wheel":
					pointer = { x: input.x, y: input.y };
					return cdp.send("Input.dispatchMouseEvent", {
						type: "mouseWheel",
						x: input.x,
						y: input.y,
						deltaX: input.dx,
						deltaY: input.dy,
					});
				case "key-down":
				case "key-up": {
					const virtual = KEY_CODES[input.key];
					const text = input.key === "Enter" ? "\r" : input.text;
					return cdp.send("Input.dispatchKeyEvent", {
						type: input.kind === "key-up" ? "keyUp" : text === "" ? "rawKeyDown" : "keyDown",
						key: input.key,
						code: input.code,
						...(input.kind === "key-down" && text !== "" ? { text, unmodifiedText: text } : {}),
						...(virtual === undefined ? {} : { windowsVirtualKeyCode: virtual }),
					});
				}
				case "leave":
					return Promise.resolve();
			}
		},
	};
}

/** The keys whose effect Chromium reads from the virtual key code rather than the text. */
const KEY_CODES: Readonly<Record<string, number>> = {
	Backspace: 8,
	Tab: 9,
	Enter: 13,
	Escape: 27,
	" ": 32,
	PageUp: 33,
	PageDown: 34,
	End: 35,
	Home: 36,
	ArrowLeft: 37,
	ArrowUp: 38,
	ArrowRight: 39,
	ArrowDown: 40,
	Delete: 46,
};

async function evaluate<T>(cdp: CDPSession, expression: string, awaitPromise = false): Promise<T> {
	const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise,
	});
	if (exceptionDetails !== undefined)
		throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
	return result.value as T;
}

function once(cdp: CDPSession, event: "Emulation.virtualTimeBudgetExpired"): Promise<void> {
	return new Promise((done) => cdp.once(event, () => done()));
}

/** Renderer TimeTicks: the monotonic clock in ms, as Chromium keeps its own. */
function monotonicMs(): number {
	return Number(process.hrtime.bigint() / 1000n) / 1000;
}

async function mux(
	video: EncodedVideo,
	sound: { left: string; right: string } | null,
): Promise<Uint8Array<ArrayBuffer>> {
	const media = await import("mediabunny");
	const output = new media.Output({
		format: new media.Mp4OutputFormat({ fastStart: "in-memory" }),
		target: new media.BufferTarget(),
	});
	const track = new media.EncodedVideoPacketSource("avc");
	output.addVideoTrack(track, { frameRate: CLIP_FPS });
	let audio: InstanceType<typeof media.AudioSampleSource> | undefined;
	if (sound !== null) {
		const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
		if (!(await media.canEncodeAudio("aac"))) registerAacEncoder();
		audio = new media.AudioSampleSource({ codec: "aac", bitrate: 192_000 });
		output.addAudioTrack(audio);
	}
	await output.start();
	const { description, ...config } = video.config;
	let first = true;
	for (const chunk of video.chunks) {
		const packet = new media.EncodedPacket(
			Buffer.from(chunk.data, "base64"),
			chunk.key ? "key" : "delta",
			chunk.ts / 1000,
			chunk.dur / 1000,
		);
		await track.add(
			packet,
			first
				? {
						decoderConfig: {
							...config,
							...(description === undefined ? {} : { description: Buffer.from(description, "base64") }),
						},
					}
				: undefined,
		);
		first = false;
	}
	if (audio !== undefined && sound !== null) {
		const left = floats(sound.left);
		const right = floats(sound.right);
		const data = new Float32Array(left.length + right.length);
		data.set(left);
		data.set(right, left.length);
		await audio.add(
			new media.AudioSample({
				data,
				format: "f32-planar",
				numberOfChannels: 2,
				sampleRate: AUDIO_RATE,
				timestamp: 0,
			}),
		);
	}
	await output.finalize();
	const buffer = (output.target as InstanceType<typeof media.BufferTarget>).buffer;
	if (buffer === null) throw new Error("the clip came out empty");
	return new Uint8Array(buffer);
}

function floats(base64: string): Float32Array {
	const bytes = Buffer.from(base64, "base64");
	return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

// --- in the browser ----------------------------------------------------------

const ENCODER_URL = "https://record.spool.invalid/";

/**
 * One call into the encoder tab, as an expression: functions handed to
 * `evaluate` carry whatever helpers the bundler wrapped them in.
 */
function clipCall(
	method: "start" | "push" | "finish",
	...args: readonly (string | number | boolean | object | null)[]
): string {
	return `window.__spoolClip.${method}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}

/**
 * The encoder tab's code, as source, for the same reason as {@link clipCall}.
 *
 * Each frame's picture is drawn centred on the clip at the frame's scale, on
 * the colour of the frame's own top-left pixel, and the cursor over it at 1.5
 * times its size: the Mac's arrow, black with rounded corners and a white
 * edge, or its pointing hand, white with a black edge, so it reads on any
 * frame.
 */
const ENCODER_SOURCE = `(() => {
	let canvas, g, encoder, layout, config, failure;
	let queue = Promise.resolve();
	const background = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
	const chunks = [];
	// each with its hot spot at 0,0
	const arrow = new Path2D("M0 0v16.6l4.2-4 2.9 6.6 2.8-1.2-2.8-6.4h5.8Z");
	const hand = new Path2D("M-1.5 10.5V1.5a1.5 1.5 0 0 1 3 0V8V7a1.5 1.5 0 0 1 3 0v1.5V8a1.5 1.5 0 0 1 3 0v1.5v-.2a1.3 1.3 0 0 1 2.6 0v5.2c0 3.3-2 5.5-5.1 5.5h-2c-1.9 0-3.2-.8-4.3-2.4l-3.6-5a1.4 1.4 0 0 1 2.2-1.7Z");
	const fingers = new Path2D("M1.5 8v3.2M4.5 8.5v2.7M7.5 9.5v2.2");
	const base64 = (bytes) => {
		let text = "";
		for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
		return btoa(text);
	};
	window.__spoolClip = {
		start(given) {
			layout = given;
			canvas = new OffscreenCanvas(given.width, given.height);
			g = canvas.getContext("2d");
			encoder = new VideoEncoder({
				output(chunk, meta) {
					if (meta && meta.decoderConfig && config === undefined) {
						const { codec, codedWidth, codedHeight, description } = meta.decoderConfig;
						config = { codec, codedWidth, codedHeight };
						if (description) config.description = base64(new Uint8Array(description instanceof ArrayBuffer ? description : description.buffer));
					}
					const data = new Uint8Array(chunk.byteLength);
					chunk.copyTo(data);
					chunks.push({ key: chunk.type === "key", ts: chunk.timestamp / 1000, dur: (chunk.duration ?? 0) / 1000, data: base64(data) });
				},
				error(error) { failure = error; },
			});
			encoder.configure({
				codec: given.codec, width: given.width, height: given.height, framerate: given.fps,
				bitrate: given.bitrate, latencyMode: "quality", avc: { format: "avc" },
			});
		},
		// pictures arrive while earlier ones are still drawing, and are drawn in the order they came
		push(picture, cursor, at, opens) {
			const drawn = queue.then(() => this.draw(picture, cursor, at, opens));
			queue = drawn.catch(() => {});
			return drawn;
		},
		async draw(picture, cursor, at, opens) {
			if (failure) throw failure;
			const bytes = Uint8Array.from(atob(picture), (c) => c.charCodeAt(0));
			const image = await createImageBitmap(new Blob([bytes]));
			// the surround is the screen's own colour, taken again every picture so a walk takes it along
			background.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
			const [r, gr, b] = background.getImageData(0, 0, 1, 1).data;
			g.fillStyle = "rgb(" + r + "," + gr + "," + b + ")";
			g.fillRect(0, 0, layout.width, layout.height);
			g.drawImage(image, layout.x, layout.y);
			image.close();
			if (cursor) {
				const size = layout.scale * 1.5;
				g.save();
				g.translate(layout.x + cursor.x * layout.scale, layout.y + cursor.y * layout.scale);
				g.scale(size, size);
				g.globalAlpha = cursor.opacity;
				g.shadowColor = "rgba(0,0,0,0.4)";
				g.shadowBlur = 1.5 * size;
				g.shadowOffsetY = 1 * size;
				g.lineJoin = "round";
				g.lineCap = "round";
				if (cursor.hand) {
					g.fillStyle = "#fff";
					g.fill(hand);
					g.shadowColor = "transparent";
					g.lineWidth = 1.1;
					g.strokeStyle = "#000";
					g.stroke(hand);
					g.lineWidth = 1;
					g.stroke(fingers);
				} else {
					g.lineWidth = 1.6;
					g.strokeStyle = "#fff";
					g.stroke(arrow);
					g.shadowColor = "transparent";
					g.fillStyle = "#000";
					g.fill(arrow);
				}
				g.restore();
			}
			const step = 1e6 / layout.fps;
			const frame = new VideoFrame(canvas, { timestamp: Math.round(at * 1000), duration: Math.round(step) });
			const index = Math.round((at * 1000) / step);
			// a part opens on a key frame, so the parts join into one stream
			encoder.encode(frame, { keyFrame: opens || index % (layout.fps * 2) === 0 });
			frame.close();
			while (encoder.encodeQueueSize > 4) await new Promise((done) => encoder.addEventListener("dequeue", done, { once: true }));
		},
		async finish() {
			await queue;
			await encoder.flush();
			if (failure) throw failure;
			return { config, chunks };
		},
	};
})()`;

/**
 * Math.random from one seed, the same in every part, so a frame that draws
 * from it draws the same in each and the parts join without a jump. It cannot
 * be what the frame drew while it was recorded: the clip's random is its own.
 */
const RANDOM_SOURCE = `(() => {
	let seed = 0x5bd1e995;
	Math.random = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
})()`;

export const AUDIO_KEY = "__spoolRecordedSound";
const SOUND = `window[${JSON.stringify(AUDIO_KEY)}]`;

/**
 * The frame tab's sound, as source, evaluated before any of the frame's own
 * scripts. Every AudioContext is an OfflineAudioContext that says it is
 * running, whose clock is the page's (virtual) performance clock since it was
 * made, and all of them are rendered once the recording is played.
 *
 * An offline context is only ever at its beginning before it renders, so
 * whatever means "now" to a live one would land at the start: a node started
 * with no time, a param's value set, a past time, a disconnect. Every such call
 * is moved to the moment it was made instead (spool#221). Connections go
 * through a gain of their own, open from the moment of connecting and shut at
 * the moment of disconnecting, since an offline graph can only be wired once.
 * At the end each context is mixed into one stereo track at the moment it was
 * made, cut to the clip. A frame that never made one has no sound and no
 * track. Sound played through media elements is not caught.
 */
export const AUDIO_SOURCE = `(() => {
	const RATE = ${AUDIO_RATE};
	const Offline = window.OfflineAudioContext;
	if (typeof Offline !== "function") return;
	// how long a context made before the recording's end was known renders for
	const FALLBACK_MS = ${RECORD_LIMIT_MS + 10_000};
	let ends;
	const made = [];
	const born = new WeakMap();
	const contextOf = new WeakMap();
	let latest;
	const nowIn = (context) => {
		const at = context === undefined ? undefined : born.get(context);
		return at === undefined ? undefined : (performance.now() - at) / 1000;
	};

	const proto = BaseAudioContext.prototype;
	const node = AudioNode.prototype;
	const param = AudioParam.prototype;
	const raw = {
		connect: node.connect,
		disconnect: node.disconnect,
		createGain: proto.createGain,
		setValueAtTime: param.setValueAtTime,
		valueGet: Object.getOwnPropertyDescriptor(param, "value").get,
		valueSet: Object.getOwnPropertyDescriptor(param, "value").set,
	};

	function RecordedAudioContext() {
		const at = performance.now();
		const until = ends === undefined ? at + FALLBACK_MS : ends;
		const length = Math.max(128, Math.ceil(((until - at) / 1000) * RATE) + 128);
		const context = new Offline({ numberOfChannels: 2, length, sampleRate: RATE });
		born.set(context, at);
		latest = context;
		made.push({ context, at });
		const define = (name, get) => Object.defineProperty(context, name, { get, configurable: true });
		define("currentTime", () => nowIn(context));
		define("state", () => "running");
		define("baseLatency", () => 0);
		define("outputLatency", () => 0);
		context.resume = () => Promise.resolve();
		context.suspend = () => Promise.resolve();
		context.close = () => Promise.resolve();
		context.getOutputTimestamp = () => ({ contextTime: nowIn(context), performanceTime: performance.now() });
		return context;
	}
	RecordedAudioContext.prototype = Offline.prototype;
	window.AudioContext = RecordedAudioContext;
	window.webkitAudioContext = RecordedAudioContext;

	// a param knows its node's context once a node made in one is touched
	const claim = (made) => {
		if (!(made instanceof AudioNode) || born.get(made.context) === undefined) return made;
		for (const key in made) {
			const value = made[key];
			if (value instanceof AudioParam) contextOf.set(value, made.context);
		}
		if (made.parameters instanceof Map || typeof made.parameters?.forEach === "function") {
			made.parameters.forEach((value) => contextOf.set(value, made.context));
		}
		return made;
	};
	for (const name of Object.getOwnPropertyNames(proto)) {
		if (!name.startsWith("create") || typeof proto[name] !== "function") continue;
		const create = proto[name];
		proto[name] = function (...args) { return claim(create.apply(this, args)); };
	}
	const paramNow = (target) => nowIn(contextOf.get(target) ?? latest);

	// sources start and stop no earlier than the moment they were told to
	const timed = (owner, name) => {
		if (!Object.prototype.hasOwnProperty.call(owner, name)) return;
		const call = owner[name];
		owner[name] = function (when, ...rest) {
			const now = nowIn(this.context);
			if (now !== undefined) when = Math.max(Number(when) || 0, now);
			return call.call(this, when, ...rest);
		};
	};
	for (const owner of [AudioScheduledSourceNode.prototype, AudioBufferSourceNode.prototype]) {
		timed(owner, "start");
		timed(owner, "stop");
	}

	// a param's events land no earlier than now; what it was last told is what it reads as
	const told = new WeakMap();
	const stateOf = (target) => {
		let state = told.get(target);
		if (state === undefined) told.set(target, (state = { value: undefined, last: undefined }));
		return state;
	};
	const held = (target) => stateOf(target).value ?? raw.valueGet.call(target);
	Object.defineProperty(param, "value", {
		configurable: true,
		get() { return held(this); },
		set(value) {
			const now = paramNow(this);
			if (now === undefined) raw.valueSet.call(this, value);
			else param.setValueAtTime.call(this, value, now);
		},
	});
	const event = (name, shape) => {
		const call = param[name];
		param[name] = function (...args) {
			const now = paramNow(this);
			if (now === undefined) return call.apply(this, args);
			return shape(this, now, args, (...shaped) => call.apply(this, shaped));
		};
	};
	event("setValueAtTime", (target, now, [value, time], call) => {
		const at = Math.max(Number(time) || 0, now);
		Object.assign(stateOf(target), { value, last: at });
		return call(value, at);
	});
	for (const name of ["linearRampToValueAtTime", "exponentialRampToValueAtTime"]) {
		event(name, (target, now, [value, time], call) => {
			const state = stateOf(target);
			// a ramp with nothing before it starts from now, at what the param holds
			if (state.last === undefined) raw.setValueAtTime.call(target, held(target), now);
			const at = Math.max(Number(time) || 0, now);
			Object.assign(state, { value, last: at });
			return call(value, at);
		});
	}
	event("setTargetAtTime", (target, now, [value, time, constant], call) => {
		const at = Math.max(Number(time) || 0, now);
		Object.assign(stateOf(target), { value, last: at });
		return call(value, at, constant);
	});
	event("setValueCurveAtTime", (target, now, [curve, time, duration], call) => {
		const at = Math.max(Number(time) || 0, now);
		Object.assign(stateOf(target), { value: curve[curve.length - 1], last: at + duration });
		return call(curve, at, duration);
	});
	for (const name of ["cancelScheduledValues", "cancelAndHoldAtTime"]) {
		if (typeof param[name] !== "function") continue;
		event(name, (target, now, [time], call) => {
			const at = Math.max(Number(time) || 0, now);
			const state = stateOf(target);
			if (state.last !== undefined && at <= state.last) state.last = name === "cancelAndHoldAtTime" ? at : undefined;
			return call(at);
		});
	}

	// a connection is a gain shut until it is made and shut again when it is undone
	const wired = new WeakMap();
	node.connect = function (destination, output = 0, input = 0) {
		const now = nowIn(this.context);
		if (now === undefined) return raw.connect.apply(this, arguments);
		let links = wired.get(this);
		if (links === undefined) wired.set(this, (links = []));
		if (links.some((link) => link.destination === destination && link.output === output && link.input === input)) {
			return destination;
		}
		const gate = raw.createGain.call(this.context);
		raw.setValueAtTime.call(gate.gain, 0, 0);
		raw.setValueAtTime.call(gate.gain, 1, now);
		raw.connect.call(this, gate, output);
		if (destination instanceof AudioParam) raw.connect.call(gate, destination, 0);
		else raw.connect.call(gate, destination, 0, input);
		links.push({ destination, output, input, gate });
		return destination;
	};
	node.disconnect = function (...args) {
		const now = nowIn(this.context);
		const links = wired.get(this);
		if (now === undefined || links === undefined) return raw.disconnect.apply(this, args);
		const [first, output, input] = args;
		const matches = (link) =>
			args.length === 0 ||
			(typeof first === "number"
				? link.output === first
				: link.destination === first &&
					(output === undefined || link.output === output) &&
					(input === undefined || link.input === input));
		for (const link of links.filter(matches)) {
			raw.setValueAtTime.call(link.gate.gain, 0, Math.max(now, 0));
			links.splice(links.indexOf(link), 1);
		}
	};

	const base64 = (floats) => {
		const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
		let text = "";
		for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
		return btoa(text);
	};
	Object.defineProperty(window, ${JSON.stringify(AUDIO_KEY)}, {
		value: {
			ends(at) { ends = at; },
			async finish(from, length) {
				if (made.length === 0) return null;
				const frames = Math.max(1, Math.round((length / 1000) * RATE));
				const left = new Float32Array(frames);
				const right = new Float32Array(frames);
				for (const { context, at } of made) {
					const buffer = await context.startRendering();
					const offset = Math.round(((at - from) / 1000) * RATE);
					const l = buffer.getChannelData(0);
					const r = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : l;
					const begin = Math.max(0, -offset);
					const stop = Math.min(l.length, frames - offset);
					for (let i = begin; i < stop; i++) {
						left[i + offset] += l[i];
						right[i + offset] += r[i];
					}
				}
				return { left: base64(left), right: base64(right) };
			},
		},
	});
})()`;
