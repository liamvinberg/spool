import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext, CDPSession, Page } from "playwright-core";
import {
	HeadlessShellCannotRunError,
	headlessShellArgs,
	MissingHeadlessShellError,
	missingLibrary,
} from "../headless-shell";
import { type ClipAspect, clipWindow, RECORD_LIMIT_MS, type RecordedInput } from "../runtime/record-protocol";

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
}

/** Render one recording to an MP4's bytes. */
export async function renderClip(request: ClipRequest, deps: RecorderDeps = {}): Promise<Uint8Array<ArrayBuffer>> {
	const { start, end } = clipWindow(request.inputs, request.duration);
	const layout = clipLayout(request.viewport, request.aspect);
	const deadlineMs = deps.deadlineMs ?? LOAD_MS + 20 * (end + 2000);
	const context = await (deps.launch ?? launchRecorder)(layout.scale);
	let timer: NodeJS.Timeout | undefined;
	const deadline = new Promise<never>((_, fail) => {
		timer = setTimeout(() => {
			fail(new Error(`the recording took longer than ${Math.round(deadlineMs / 1000)} s to render`));
			void context.close().catch(() => {});
		}, deadlineMs);
	});
	try {
		return await Promise.race([render(context, request, layout, start, end), deadline]);
	} finally {
		clearTimeout(timer);
		await context.close().catch(() => {});
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

async function render(
	context: BrowserContext,
	request: ClipRequest,
	layout: ClipLayout,
	start: number,
	end: number,
): Promise<Uint8Array<ArrayBuffer>> {
	const encoder = context.pages()[0] ?? (await context.newPage());
	// WebCodecs is only on a secure origin, and this page is nothing but the encoder
	await encoder.route(ENCODER_URL, (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html>" }));
	await encoder.goto(ENCODER_URL);
	const bitrate = Math.min(MAX_BITRATE, Math.floor((CLIP_BYTES * 8) / Math.max(1, (end - start) / 1000)));
	await encoder.evaluate(ENCODER_SOURCE);
	await encoder.evaluate(clipCall("start", { ...layout, codec: H264, fps: CLIP_FPS, bitrate }));

	const { page, cdp } = await openFrameTab(context, encoder, request);
	let ticks = monotonicMs();
	const frame = (screenshot: boolean) => {
		ticks += STEP_MS;
		return cdp.send("HeadlessExperimental.beginFrame", {
			frameTimeTicks: ticks,
			interval: STEP_MS,
			...(screenshot ? { screenshot: { format: "png" as const } } : { noDisplayUpdates: true }),
		});
	};

	// The frame loads on the real clock: on a paused one its load never fires.
	void cdp.send("Page.navigate", { url: request.url });
	const loading = Date.now() + LOAD_MS;
	for (let pumped = 0; ; pumped++) {
		await frame(false);
		if (pumped % 6 === 0 && (await evaluate<boolean>(cdp, ARRIVED))) break;
		if (Date.now() > loading) throw new Error("the frame did not finish loading for its recording");
	}
	// Then the clock is the recorder's. `ticks` only ever moves forward from the
	// real now it started at: a BeginFrame from before the document's own time
	// origin hands rAF a timestamp of 0 and stops every transition.
	ticks = Math.max(ticks, monotonicMs());
	let still = (await frame(true)).screenshotData;
	await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
	const origin = await evaluate<number>(cdp, "performance.now()");
	await evaluate(cdp, `${SOUND}?.ends(${origin + end})`);

	const first = Math.floor(start / STEP_MS);
	const last = Math.ceil(end / STEP_MS);
	const hands = createHands(cdp);
	let next = 0;
	for (let index = 0; index <= last; index++) {
		const t = index * STEP_MS;
		const sent: Promise<unknown>[] = [];
		while (next < request.inputs.length && (request.inputs[next] as RecordedInput).t <= t) {
			sent.push(hands.send(request.inputs[next] as RecordedInput));
			next++;
		}
		const expired = once(cdp, "Emulation.virtualTimeBudgetExpired");
		await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: STEP_MS });
		await expired;
		// every frame is photographed, the lead-in too: a frame with nothing new
		// to draw returns no picture, and the clip's first frame must still have one
		const drawn = await frame(true);
		await Promise.all(sent);
		if (drawn.screenshotData !== undefined) still = drawn.screenshotData;
		if (index < first || still === undefined) continue;
		await encoder.evaluate(clipCall("push", still, hands.pointer(), (index - first) * STEP_MS));
	}
	const video = (await encoder.evaluate(clipCall("finish"))) as EncodedVideo;

	// The sound renders on the real clock: an offline render finishes on a task virtual time would hold.
	await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance" });
	const sound = await evaluate<{ left: string; right: string } | null>(
		cdp,
		`${SOUND}?.finish(${origin + start}, ${end - start}) ?? null`,
		true,
	);
	await page.close().catch(() => {});
	return await mux(video, sound);
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
	await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: AUDIO_SOURCE });
	return { page, cdp };
}

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
function clipCall(method: "start" | "push" | "finish", ...args: readonly (string | number | object | null)[]): string {
	return `window.__spoolClip.${method}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`;
}

/**
 * The encoder tab's code, as source, for the same reason as {@link clipCall}.
 *
 * Each frame's picture is drawn centred on the clip at the frame's scale, on
 * the colour of the frame's own top-left pixel, and the cursor over it: the
 * macOS arrow at 1.5 times its size, white-edged, so it reads on any frame.
 */
const ENCODER_SOURCE = `(() => {
	let canvas, g, encoder, layout, config, failure;
	const background = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
	const chunks = [];
	const arrow = new Path2D("M0 0L0 16.5L4 12.6L6.9 19.2L9.6 18.1L6.8 11.7L12.2 11.7Z");
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
		async push(picture, cursor, at) {
			if (failure) throw failure;
			const bytes = Uint8Array.from(atob(picture), (c) => c.charCodeAt(0));
			const image = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
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
				g.shadowColor = "rgba(0,0,0,0.25)";
				g.shadowBlur = 2 * size;
				g.shadowOffsetY = 0.5 * size;
				g.lineJoin = "round";
				g.lineWidth = 1.4;
				g.strokeStyle = "#fff";
				g.stroke(arrow);
				g.shadowColor = "transparent";
				g.fillStyle = "#000";
				g.fill(arrow);
				g.restore();
			}
			const step = 1e6 / layout.fps;
			const frame = new VideoFrame(canvas, { timestamp: Math.round(at * 1000), duration: Math.round(step) });
			const index = Math.round((at * 1000) / step);
			encoder.encode(frame, { keyFrame: index % (layout.fps * 2) === 0 });
			frame.close();
			while (encoder.encodeQueueSize > 4) await new Promise((done) => encoder.addEventListener("dequeue", done, { once: true }));
		},
		async finish() {
			await encoder.flush();
			if (failure) throw failure;
			return { config, chunks };
		},
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
