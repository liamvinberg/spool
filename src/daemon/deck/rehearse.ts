import type { BrowserContext, Frame } from "playwright-core";
import type {
	BeatAtRest,
	ConsoleLine,
	FailedRequest,
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
import { escapeHtml } from "../document";
import { frameShims } from "../frame-shims";

/**
 * A talk rehearsed (spool#322): played in the real stage, at its own play address, in a tab of the photo booth's
 * browser, by the keys a presenter presses. Forward from the first beat to the last, each step timed from its key to
 * the change and to rest, each beat at rest read and pictured; each move between slides played once more, held still
 * at its start, middle and end to be pictured; then back to the first beat, timed. What it saw goes to the rules
 * whole; the pictures go to the sheet (`composeSheets`).
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
}

export interface Still {
	readonly name: string;
	readonly png: Buffer;
}

export interface Rehearsed {
	readonly rehearsal: Rehearsal;
	readonly stills: readonly Still[];
}

/** A rehearsal stops when this many steps in a row never showed. */
const STUCK_IN_A_ROW = 2;
/** A slide that calls requestAnimationFrame more often than this a second once at rest runs a loop of its own. */
const LOOP_PER_SECOND = 20;

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
	page.on("console", (message) => {
		if (!listening || message.type() !== "error") return;
		const text = message.text();
		// a failed request is said once, as a request
		if (text.startsWith("Failed to load resource")) return;
		try {
			if (new URL(message.location().url).host === controlHost) return;
		} catch {}
		consoled.push({ text, at: Date.now() });
	});
	page.on("pageerror", (error) => {
		if (listening) consoled.push({ text: error.message, at: Date.now() });
	});
	page.on("requestfailed", (request) => {
		if (!listening || !ofTalk(request.url())) return;
		const why = request.failure()?.errorText ?? "failed";
		if (why === "net::ERR_ABORTED") return;
		requests.push({ url: request.url(), status: why, at: Date.now() });
	});
	page.on("response", (response) => {
		if (!listening || response.status() < 400 || !ofTalk(response.url())) return;
		requests.push({ url: response.url(), status: response.status(), at: Date.now() });
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
	const statusOf = (frame: string) => lastSlides().find((slide) => slide.frame === frame)?.status;
	const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
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
		const deadline = Date.now() + ms;
		while (Date.now() < deadline) {
			await host();
			const found = shownSince(mark, at);
			if (found !== undefined) return found;
			await pause(40);
		}
		return undefined;
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
		stills.push({ name, png: await page.screenshot({ type: "png" }) });
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
		const before = await inStage<number>(`${PROBES}.calls()`);
		const since = Date.now();
		const still = await shot(beatStill(at));
		const after = await inStage<number>(`${PROBES}.calls()`);
		const seconds = Math.max(0.1, (Date.now() - since) / 1000);
		const frame = talk.slides[at.slide]?.frame ?? "";
		// a slide that broke leaves the room on another's picture, which is none of this slide's to answer for
		const own =
			look !== null && look.frame === frame ? look : { frame, words: [], layout: [], names: [], webgl: 0, late: [] };
		beats.push({ at, look: own, shownAt, loop: (after - before) / seconds > LOOP_PER_SECOND, still });
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
		const deadline = Date.now() + 1500;
		for (;;) {
			const { frozen } = await inStage<{ frozen: boolean }>(`${PROBES}.held()`);
			if (frozen) break;
			const { moves: made } = await inStage<{ moves: MoveRecord[] }>(`${PROBES}.since(${pressed - 20})`);
			const over = made.some((move) => move.failed !== undefined || move.finished !== undefined);
			if (over || made.length === 0 || Date.now() > deadline) {
				await inStage(`${PROBES}.holdNow()`);
				break;
			}
			await pause(16);
		}
		const { end } = await inStage<{ end: number }>(`${PROBES}.held()`);
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
	let stopped: string | undefined;
	try {
		await page.addInitScript({ content: `(${frameShims.rehearseProbes}).record();` });
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
				while (statusOf(frame) === "loading" || statusOf(frame) === undefined) {
					if (Date.now() - waitFrom > timing.pauseMs) {
						loading = Date.now() - waitFrom;
						break;
					}
					await pause(50);
					await host();
				}
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

// --- the sheet ------------------------------------------------------------------------------------------------

/** One picture on a sheet, with what it is. */
export interface SheetCell {
	readonly still: string;
	readonly label: string;
	readonly move: boolean;
	/** something was found here: broken, or worth a note */
	readonly mark?: "broken" | "note";
}

/** Every beat at rest in order, and after each slide's last beat the move into the next, at its start, middle and end. */
export function sheetCells(
	rehearsal: Rehearsal,
	/** what was found at a beat, or with `move` in the move from a slide into the next */
	marks: (at: { slide: number; beat?: number; move?: true }) => SheetCell["mark"],
): SheetCell[] {
	const cells: SheetCell[] = [];
	const nameOf = (slide: number) => rehearsal.slides[slide]?.frame.split("/").at(-1) ?? "";
	for (const beat of rehearsal.beats) {
		const slide = rehearsal.slides[beat.at.slide];
		const beats = slide?.beats ?? [];
		const label =
			beats.length < 2
				? `${beat.at.slide + 1} · ${nameOf(beat.at.slide)}`
				: `${beat.at.slide + 1} · ${nameOf(beat.at.slide)} · beat ${beat.at.beat + 1} "${beats[beat.at.beat] ?? ""}"`;
		const mark = marks(beat.at);
		cells.push({ still: beat.still, label, move: false, ...(mark === undefined ? {} : { mark }) });
		if (beat.at.beat !== beats.length - 1) continue;
		const move = rehearsal.moves.find((each) => each.from === beat.at.slide);
		const moveMark = marks({ slide: beat.at.slide, move: true });
		for (const { label: when, still } of move?.stills ?? [])
			cells.push({
				still,
				label: `${beat.at.slide + 1} → ${beat.at.slide + 2} · ${when === "cut" ? "a cut, nothing moves" : when}`,
				move: true,
				...(moveMark === undefined ? {} : { mark: moveMark }),
			});
	}
	return cells;
}

/** How wide a sheet is, px: a vision model reads about this much without shrinking it. */
const SHEET_W = 1600;
const SHEET_GAP = 16;
const SHEET_HEAD = 44;
const LABEL_H = 22;
/** Sheet addresses the sheet's own page asks for, answered from memory. */
const SHEET_ORIGIN = "https://sheet.spool.invalid";

/** The sheet's pages: as many as hold every cell at a size each can be read at. */
export function sheetPages(cells: readonly SheetCell[], size: { w: number; h: number }) {
	const columns = size.w >= size.h ? 4 : 6;
	const cellW = Math.floor((SHEET_W - SHEET_GAP * (columns + 1)) / columns);
	const imageH = Math.round((cellW * size.h) / size.w);
	const rows = Math.max(1, Math.floor((SHEET_W - SHEET_HEAD) / (imageH + LABEL_H + SHEET_GAP)));
	const per = columns * rows;
	const pages: SheetCell[][] = [];
	for (let at = 0; at < cells.length; at += per) pages.push(cells.slice(at, at + per));
	return { columns, cellW, imageH, pages };
}

/** The sheet's pages pictured: each a grid of the pictures, labelled, drawn in the rehearsal's own browser. */
export async function composeSheets(
	context: BrowserContext,
	cells: readonly SheetCell[],
	stills: readonly Still[],
	size: { w: number; h: number },
	title: string,
): Promise<Buffer[]> {
	if (cells.length === 0) return [];
	const { columns, cellW, imageH, pages } = sheetPages(cells, size);
	const byName = new Map(stills.map((still) => [still.name, still.png]));
	const page = await context.newPage();
	try {
		await page.route(`${SHEET_ORIGIN}/**`, (route) => {
			const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
			const png = byName.get(name);
			return png === undefined
				? route.fulfill({ status: 404 })
				: route.fulfill({ body: png, contentType: "image/png" });
		});
		await page.setViewportSize({ width: SHEET_W, height: 800 });
		const sheets: Buffer[] = [];
		for (const [at, cellsOf] of pages.entries()) {
			const head = `${escapeHtml(title)} · sheet ${at + 1} of ${pages.length}`;
			const figures = cellsOf
				.map((cell) => {
					const border =
						cell.mark === "broken"
							? "#ff4d4f"
							: cell.mark === "note"
								? "#f5a623"
								: cell.move
									? "#3a3a3f"
									: "#26262a";
					return `<figure><img src="${SHEET_ORIGIN}/${encodeURIComponent(cell.still)}" style="border-color:${border}"><figcaption${cell.move ? ' class="move"' : ""}>${escapeHtml(cell.label)}${cell.mark === undefined ? "" : ` · ${cell.mark === "broken" ? "broken" : "note"}`}</figcaption></figure>`;
				})
				.join("");
			await page.setContent(
				`<!doctype html><html><head><style>
					html,body{margin:0;background:#111113;color:#e6e6e8;font:13px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
					header{height:${SHEET_HEAD}px;display:flex;align-items:center;padding:0 ${SHEET_GAP}px;font-size:14px;color:#bdbdc2}
					main{display:grid;grid-template-columns:repeat(${columns},${cellW}px);gap:${SHEET_GAP}px;padding:0 ${SHEET_GAP}px ${SHEET_GAP}px}
					figure{margin:0}
					img{display:block;width:${cellW}px;height:${imageH}px;object-fit:contain;background:#000;border:2px solid;box-sizing:border-box}
					figcaption{height:${LABEL_H}px;padding-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
					figcaption.move{color:#9a9aa2}
				</style></head><body style="width:${SHEET_W}px"><header>${head}</header><main>${figures}</main></body></html>`,
				{ waitUntil: "load" },
			);
			sheets.push(await page.screenshot({ type: "png", fullPage: true }));
		}
		return sheets;
	} finally {
		await page.close().catch(() => {});
	}
}
