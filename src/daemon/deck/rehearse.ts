import type { BrowserContext, Frame } from "playwright-core";
import type {
	BeatAtRest,
	ConsoleLine,
	FailedRequest,
	LaidOut,
	Machine,
	MoveRecord,
	MoveStills,
	Pass,
	Rehearsal,
	RehearsedSlide,
	RestLook,
	StepCensus,
	StepRecord,
	Visit,
} from "../../deck/rehearsal";
import type { At } from "../../deck/stage-session";
import type { SlideReadiness, StageShown } from "../../deck/stage-wire";
import { frameShims } from "../frame-shims";

/**
 * A talk rehearsed (spool#322): played in the real stage, at its own play address, in a tab of the photo booth's
 * browser, by the keys a presenter presses. Forward from the first beat to the last, each step timed from its key to
 * the change and to rest, each beat at rest read and pictured; each move between slides played once more, held still
 * at its start, middle and end to be pictured; then back to the first beat, timed. What it saw goes to the rules
 * whole; the pictures go to the sheet (`rehearse-sheet.ts`).
 */

export interface RehearseTalk {
	readonly page: string;
	readonly size: { readonly w: number; readonly h: number };
	readonly slides: readonly RehearsedSlide[];
}

export interface RehearseTiming {
	/** for the talk's first slide to be shown */
	openMs: number;
	/** for the stage to show a step once its key went */
	stepMs: number;
	/** for a step to come to rest once shown */
	restMs: number;
	/** what a presenter gives the next slide to be ready before pressing on regardless */
	pauseMs: number;
}

const TIMING: RehearseTiming = { openMs: 60_000, stepMs: 30_000, restMs: 6000, pauseMs: 10_000 };

export interface RehearseInput {
	readonly context: BrowserContext;
	/** the talk's play address, on spool's own origin */
	readonly address: string;
	readonly talk: RehearseTalk;
	/** the slides to rehearse, by place from 0, both ends included */
	readonly from: number;
	readonly to: number;
	readonly software: boolean;
	readonly machine: () => { load: number; cores: number };
	readonly narrate: (line: string) => void;
	readonly timing?: Partial<RehearseTiming>;
	/** aborts when whoever asked for the rehearsal went: it stops at the next key */
	readonly signal?: AbortSignal;
}

export interface Still {
	readonly name: string;
	readonly png: Buffer;
}

export interface Rehearsed {
	readonly rehearsal: Rehearsal;
	readonly stills: readonly Still[];
}

/** How long a move played again to be pictured has to begin before the slide's own entrance is held instead. */
const CATCH_MS = 1500;
/** How long one picture may take: a slide drawing on several canvases in software, on a busy machine, takes long. */
export const STILL_MS = 120_000;
/** A rehearsal stops when this many steps in a row never showed. */
const STUCK_IN_A_ROW = 2;
/** The frames a slide at rest is watched for a requestAnimationFrame loop of its own: it asks for one every frame. */
const LOOP_FRAMES = 10;

const PROBES = `window[Symbol.for("spool.rehearse")]`;

interface Said {
	readonly at: number;
	readonly data: { readonly spool?: string; readonly shown?: StageShown; readonly slides?: SlideReadiness[] };
}

class Stopped extends Error {}

export async function rehearse(input: RehearseInput): Promise<Rehearsed> {
	const timing: RehearseTiming = { ...TIMING, ...input.timing };
	const { talk, from, to } = input;
	const started = Date.now();
	const page = await input.context.newPage();
	const stills: Still[] = [];
	const steps: StepRecord[] = [];
	const visits: Visit[] = [];
	const press = async (key: "ArrowLeft" | "ArrowRight", to: At, pass: Pass) => {
		input.signal?.throwIfAborted();
		visits.push({ at: Date.now(), to, pass });
		await page.keyboard.press(key);
	};
	const beats: BeatAtRest[] = [];
	const moves: MoveStills[] = [];
	const consoled: ConsoleLine[] = [];
	const requests: FailedRequest[] = [];
	const said: Said[] = [];
	let documents = 0;
	let listening = true;
	// spool's own window, which holds the stage and is none of the talk's
	const controlHost = new URL(input.address).host;

	// what an empty page manages on this machine, before the talk is anywhere near it
	const idle = (await page.evaluate(`(${frameShims.rehearseProbes}).idle(500)`)) as number[];
	const { load, cores } = input.machine();
	const machine: Machine = { software: input.software, load, cores, idle };

	/** A request of the talk's: not the window's around it, nor spool's own calls, nor the tab's icon. */
	const ofTalk = (url: string) => {
		try {
			const parsed = new URL(url);
			if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
			return (
				parsed.host !== controlHost && !parsed.pathname.startsWith("/api/") && parsed.pathname !== "/favicon.svg"
			);
		} catch {
			return false;
		}
	};
	// whose code said a line or asked for a file, asked of the stage at once, while what tells is still there
	const asking: Promise<void>[] = [];
	const whose = (stack: string, url: string | undefined, told: (frame: string) => void) => {
		const asked = `${PROBES}.whose(${JSON.stringify(stack)}${url === undefined ? "" : `, ${JSON.stringify(url)}`})`;
		asking.push(
			inStage<string | null>(asked).then(
				(frame) => {
					if (frame !== null) told(frame);
				},
				() => {},
			),
		);
	};
	page.on("console", (message) => {
		if (!listening || message.type() !== "error") return;
		const text = message.text();
		// a failed request is said once, as a request
		if (text.startsWith("Failed to load resource")) return;
		const { url, lineNumber, columnNumber } = message.location();
		try {
			if (new URL(url).host === controlHost) return;
		} catch {}
		const line = { text, at: Date.now() };
		const at = consoled.push(line) - 1;
		whose(`${url}:${lineNumber}:${columnNumber}`, undefined, (frame) => (consoled[at] = { ...line, frame }));
	});
	page.on("pageerror", (error) => {
		if (!listening) return;
		const line = { text: error.message, at: Date.now() };
		const at = consoled.push(line) - 1;
		whose(error.stack ?? "", undefined, (frame) => (consoled[at] = { ...line, frame }));
	});
	const failed = (request: FailedRequest) => {
		const at = requests.push(request) - 1;
		whose("", request.url, (frame) => (requests[at] = { ...request, frame }));
	};
	page.on("requestfailed", (request) => {
		if (!listening || !ofTalk(request.url())) return;
		const why = request.failure()?.errorText ?? "failed";
		if (why === "net::ERR_ABORTED") return;
		failed({ url: request.url(), status: why, at: Date.now() });
	});
	page.on("response", (response) => {
		if (!listening || response.status() < 400 || !ofTalk(response.url())) return;
		failed({ url: response.url(), status: response.status(), at: Date.now() });
	});

	const host = async () => {
		const heard = (await page.evaluate(`${PROBES}.heard(${said.length})`)) as {
			said: Said[];
			keys: { key: string; at: number }[];
			documents: number;
		};
		said.push(...heard.said);
		documents = heard.documents;
		return heard;
	};
	const lastSlides = (): readonly SlideReadiness[] => {
		for (let at = said.length - 1; at >= 0; at--) {
			const data = said[at]?.data;
			if (data?.spool === "stage-slides" && data.slides !== undefined) return data.slides;
		}
		return [];
	};
	const shownSince = (mark: number, at: At) =>
		said
			.slice(mark)
			.find(
				(heard) =>
					heard.data.spool === "stage-shown" &&
					heard.data.shown?.at.slide === at.slide &&
					heard.data.shown.at.beat === at.beat,
			);
	const waitShown = async (mark: number, at: At, ms: number): Promise<Said | undefined> => {
		await page.evaluate(`${PROBES}.shown(${mark}, ${at.slide}, ${at.beat}, ${ms})`);
		await host();
		return shownSince(mark, at);
	};
	/** The stage document showing the talk now: the newest, when a save brought another. */
	const stage = (): Frame => {
		const found = page.frames().filter((frame) => {
			try {
				return new URL(frame.url()).searchParams.get("shell") === "1";
			} catch {
				return false;
			}
		});
		const newest = found.at(-1);
		if (newest === undefined) throw new Stopped("the stage's document went away");
		return newest;
	};
	const inStage = async <T>(expression: string): Promise<T> => (await stage().evaluate(expression)) as T;
	const shot = async (name: string) => {
		// the caret left as it is: hiding it restyles every document of the tab first
		stills.push({ name, png: await page.screenshot({ type: "png", caret: "initial", timeout: STILL_MS }) });
		return name;
	};

	const nameOf = (slide: number) => talk.slides[slide]?.frame.split("/").at(-1) ?? String(slide + 1);
	const beatsOf = (slide: number) => talk.slides[slide]?.beats.length ?? 1;
	const beatStill = (at: At) =>
		`${pad(at.slide + 1)}-${slug(nameOf(at.slide))}-${at.beat + 1}-${slug(talk.slides[at.slide]?.beats[at.beat] ?? "")}.png`;
	const moveStill = (slide: number, label: string) => `${pad(slide + 1)}-${pad(slide + 2)}-move-${label}.png`;

	/** One key, and what came of it once the slide rested. */
	const step = async (
		key: "ArrowLeft" | "ArrowRight",
		now: At,
		next: At,
		pass: Pass,
		loading?: number,
	): Promise<StepRecord> => {
		const mark = said.length;
		const { keys: before } = await host();
		const pressed = Date.now();
		await press(key, next, pass);
		const heardKey = (await host()).keys[before.length];
		const keyAt = heardKey?.at ?? pressed;
		const shown = await waitShown(mark, next, timing.stepMs);
		if (shown?.data.shown === undefined) {
			return {
				pass,
				from: now,
				to: next,
				key: keyAt,
				...(loading === undefined ? {} : { loading }),
				rest: Date.now(),
				frames: [],
			};
		}
		const rested = await inStage<{ at: number }>(`${PROBES}.rest(${timing.restMs})`);
		const seen = await inStage<{ frames: number[]; moves: MoveRecord[]; censuses: (StepCensus & { at: number })[] }>(
			`${PROBES}.since(${keyAt - 20})`,
		);
		await host();
		const move = seen.moves.find((made) => made.held !== true);
		const census = seen.censuses.at(-1);
		return {
			pass,
			from: now,
			to: next,
			key: keyAt,
			...(loading === undefined ? {} : { loading }),
			shownAt: shown.at,
			shown: shown.data.shown,
			rest: rested.at,
			frames: seen.frames.filter((frame) => frame <= rested.at),
			...(move === undefined ? {} : { move }),
			...(census === undefined ? {} : { census: { frame: census.frame, census: census.census } }),
			slides: lastSlides(),
		};
	};

	/** The beat on screen, read and pictured. */
	const atRest = async (at: At, shownAt: number) => {
		const look = await inStage<RestLook | null>(`${PROBES}.look(${shownAt})`);
		const asked = await inStage<number>(`${PROBES}.asked(${LOOP_FRAMES})`);
		const still = await shot(beatStill(at));
		const frame = talk.slides[at.slide]?.frame ?? "";
		// a slide that broke leaves the room on another's picture, which is none of this slide's to answer for
		const own =
			look !== null && look.frame === frame
				? look
				: { frame, size: talk.size, words: [], layout: [], names: [], webgl: 0, late: [] };
		beats.push({ at, look: own, shownAt, loop: asked >= LOOP_FRAMES / 2, still });
	};

	/** The move from the slide before `next` into it, played again and held still at its start, middle and end. */
	const holdMove = async (next: At) => {
		const back: At = { slide: next.slide - 1, beat: beatsOf(next.slide - 1) - 1 };
		const mark = said.length;
		await press("ArrowLeft", back, "forward");
		if ((await waitShown(mark, back, timing.stepMs)) === undefined) throw new Stopped("going back to picture a move");
		await inStage(`${PROBES}.rest(${timing.restMs})`);
		await inStage(`${PROBES}.arm()`);
		const again = said.length;
		const pressed = Date.now();
		await press("ArrowRight", next, "forward");
		if ((await waitShown(again, next, timing.stepMs)) === undefined) throw new Stopped("playing a move again");
		// the move freezes the moment it begins; one that never did leaves the slide's own entrance to hold
		const end = await inStage<number>(`${PROBES}.caught(${pressed - 20}, ${CATCH_MS})`);
		const pictures: MoveStills["stills"][number][] = [];
		if (end > 0) {
			for (const [label, at] of [
				["start", 0],
				["middle", end / 2],
				["end", end],
			] as const) {
				await inStage(`${PROBES}.seek(${at})`);
				pictures.push({ label, still: await shot(moveStill(back.slide, label)) });
			}
		} else {
			pictures.push({ label: "cut", still: await shot(moveStill(back.slide, "cut")) });
		}
		await inStage(`${PROBES}.release()`);
		await inStage(`${PROBES}.rest(${timing.restMs})`);
		moves.push({ from: back.slide, runs: end, stills: pictures });
	};

	let openMs: number | undefined;
	let openSlides: readonly SlideReadiness[] | undefined;
	let stopped: string | undefined;
	try {
		await page.addInitScript({ content: `(${frameShims.rehearseProbes}).record();` });
		// the tab is no canvas: it plays the talk as it opened, and following the project's changes as a canvas does
		// would have the daemon compose the whole canvas's player for it, a stylesheet for every frame, ahead of the stage
		await page.route(`${new URL(input.address).origin}/api/p/*/events`, (route) => route.fulfill({ status: 204 }));
		const first = talk.slides[from]?.frame;
		const address =
			from === 0 || first === undefined ? input.address : `${input.address}&frame=${encodeURIComponent(first)}`;
		const opening = Date.now();
		await page.goto(address, { waitUntil: "domcontentloaded", timeout: timing.openMs });
		const start: At = { slide: from, beat: 0 };
		const opened = await waitShown(0, start, timing.openMs);
		if (opened === undefined)
			throw new Stopped(`the talk showed nothing within ${Math.round(timing.openMs / 1000)} s`);
		openMs = opened.at - opening;
		input.narrate(`playing ${talk.page} from slide ${from + 1} to ${to + 1}`);
		await inStage(`${PROBES}.rest(${timing.restMs})`);
		await atRest(start, opened.at);
		openSlides = lastSlides();

		// forward, a presenter's keys, from the first beat to the last
		let at = start;
		let stuck = 0;
		const last: At = { slide: to, beat: beatsOf(to) - 1 };
		while (!same(at, last)) {
			const next: At =
				at.beat + 1 < beatsOf(at.slide) ? { slide: at.slide, beat: at.beat + 1 } : { slide: at.slide + 1, beat: 0 };
			let loading: number | undefined;
			if (next.slide !== at.slide) {
				input.narrate(`slide ${next.slide + 1} of ${to + 1}`);
				const frame = talk.slides[next.slide]?.frame ?? "";
				const waitFrom = Date.now();
				const ready = (await page.evaluate(
					`${PROBES}.settled(${JSON.stringify(frame)}, ${timing.pauseMs})`,
				)) as boolean;
				await host();
				if (!ready) loading = Date.now() - waitFrom;
			}
			if (next.slide === at.slide) {
				const left = await inStage<LaidOut[] | null>(`${PROBES}.layoutNow()`);
				const resting = beats.at(-1);
				if (left !== null && resting !== undefined && same(resting.at, at))
					beats[beats.length - 1] = { ...resting, left };
			}
			const record = await step("ArrowRight", at, next, "forward", loading);
			steps.push(record);
			if (record.shownAt === undefined) {
				if (++stuck >= STUCK_IN_A_ROW)
					throw new Stopped(`the stage stopped showing steps after slide ${at.slide + 1}`);
				at = next;
				continue;
			}
			stuck = 0;
			await atRest(next, record.shownAt);
			if (next.slide !== at.slide && record.shown?.held !== true) await holdMove(next);
			at = next;
		}

		// and back to the first, timed
		input.narrate("and back");
		while (!same(at, start)) {
			const previous: At =
				at.beat > 0
					? { slide: at.slide, beat: at.beat - 1 }
					: { slide: at.slide - 1, beat: beatsOf(at.slide - 1) - 1 };
			const record = await step("ArrowLeft", at, previous, "back");
			steps.push(record);
			if (record.shownAt === undefined) {
				if (++stuck >= STUCK_IN_A_ROW)
					throw new Stopped(`the stage stopped showing steps going back from slide ${at.slide + 1}`);
			} else {
				stuck = 0;
			}
			at = previous;
		}
	} catch (error) {
		stopped = error instanceof Error ? error.message : String(error);
	} finally {
		listening = false;
		await host().catch(() => {});
		await Promise.all(asking);
		await page.close().catch(() => {});
	}
	return {
		rehearsal: {
			page: talk.page,
			size: talk.size,
			slides: talk.slides,
			from,
			to,
			machine,
			...(openMs === undefined ? {} : { openMs }),
			...(openSlides === undefined ? {} : { opened: openSlides }),
			steps,
			visits,
			beats,
			moves,
			console: consoled,
			requests,
			...(stopped === undefined ? {} : { stopped }),
			documents,
			ms: Date.now() - started,
		},
		stills,
	};
}

const same = (a: At, b: At) => a.slide === b.slide && a.beat === b.beat;
const pad = (n: number) => String(n).padStart(2, "0");
const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "") || "beat";
