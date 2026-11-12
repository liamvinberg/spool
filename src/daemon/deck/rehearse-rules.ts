import type {
	BeatAtRest,
	Box,
	LaidOut,
	LateFile,
	Machine,
	NamedElement,
	Pass,
	Rehearsal,
	StepRecord,
	WordsAtEdge,
} from "../../deck/rehearsal";
import type { At } from "../../deck/stage-session";
import { type SlideReadiness, WEBGL_KEPT } from "../../deck/stage-wire";
import { type FrameCensus, type FramePace, SLOW_PER_SECOND } from "../thumbs";

/**
 * What a rehearsal (spool#322) found wrong, rule by rule, from what it saw (`rehearsal.ts`). Each finding is at a
 * place in the talk an agent can go to; `rehearse-report.ts` puts them in words. A rule that cannot tell a fault from
 * something a slide does on purpose says nothing.
 */

/** A slide by its place from 0, and a beat of it from 0 when the finding is of one beat; `back` on the way back. */
export interface Place {
	readonly slide: number;
	readonly beat?: number;
	readonly back?: true;
}

/** Why a step was or was not slow, beside the booth's own timing of the slide alone (spool#318). */
export interface Alone {
	/** frames a second the booth drew the slide at, alone, at rest and at its slowest beat */
	readonly perSecond: number;
	readonly slow: boolean;
}

/** An element that changed a beat's layout: it appeared, left, or changed size. */
export interface LayoutCause {
	readonly what: "appeared" | "left" | "grew" | "shrank";
	readonly tag: string;
	readonly source?: string;
}

export type Edge = "left" | "right" | "top" | "bottom";

export type Finding =
	/** a slide that threw: as it compiled, loaded, mounted or later on screen, with what it said */
	| {
			readonly kind: "threw";
			readonly place: Place;
			readonly when: NonNullable<SlideReadiness["when"]>;
			readonly why: string;
	  }
	/** a step the stage never showed: its slide still loading, or the stage stuck */
	| { readonly kind: "never-shown"; readonly place: Place; readonly waited: number; readonly loading: boolean }
	/** a slide still loading when its key came: `waited` before the key, `held` after it */
	| { readonly kind: "loading"; readonly place: Place; readonly waited: number; readonly held: number }
	| { readonly kind: "console"; readonly place: Place; readonly text: string; readonly times: number }
	| { readonly kind: "request"; readonly place: Place; readonly url: string; readonly status: number | string }
	/** the move between slides `from` and the next did not run; `twice` names what bore one name more than once */
	| {
			readonly kind: "move-failed";
			readonly from: number;
			readonly why: string;
			readonly twice: readonly {
				readonly name: string;
				readonly slide: number;
				readonly elements: readonly NamedElement[];
			}[];
	  }
	/** the move ran `ran` ms of its `runs` */
	| { readonly kind: "move-cut"; readonly from: number; readonly ran: number; readonly runs: number }
	| { readonly kind: "late"; readonly place: Place; readonly file: LateFile }
	| {
			readonly kind: "cut";
			readonly place: Place;
			readonly words: WordsAtEdge;
			readonly edge: Edge;
			readonly past: number;
	  }
	| {
			readonly kind: "layout";
			readonly place: Place;
			/** elements that moved, outermost only, and the furthest any went, px */
			readonly moved: number;
			readonly shift: number;
			readonly causes: readonly LayoutCause[];
	  }
	| { readonly kind: "webgl"; readonly place: Place; readonly contexts: number; readonly kept: number }
	/** a step that lagged: its change came `keyMs` after its key, or it drew `missed` frames fewer than its `of` */
	| {
			readonly kind: "lag";
			readonly place: Place;
			/** the step moved between slides */
			readonly move: boolean;
			readonly keyMs?: number;
			readonly missed?: number;
			readonly of?: number;
			readonly census?: FrameCensus;
			readonly alone?: Alone;
	  }
	/** lag was not judged on this machine, and why */
	| {
			readonly kind: "unjudged";
			readonly why: "software" | "busy" | "uneven";
			readonly load: number;
			readonly cores: number;
	  }
	| { readonly kind: "slow-open"; readonly ms: number }
	/** the talk was saved while it played: what played was partly from before */
	| { readonly kind: "saved"; readonly files: readonly string[] }
	| { readonly kind: "stopped"; readonly why: string };

/** What fails a rehearsal: a slide that threw or never showed, a move that cannot run, a rehearsal that could not finish. */
export function breaks(finding: Finding): boolean {
	return (
		finding.kind === "threw" ||
		finding.kind === "never-shown" ||
		finding.kind === "move-failed" ||
		finding.kind === "stopped"
	);
}

export interface RuleExtras {
	/** files of the talk saved while it played, under design/ */
	readonly changed?: readonly string[];
	/** the booth's last timing of each slide alone, by frame */
	readonly paces?: ReadonlyMap<string, FramePace>;
}

/** Every finding of a rehearsal, in the talk's order. */
export function findingsOf(rehearsal: Rehearsal, extras: RuleExtras = {}): Finding[] {
	// how long anything took says something of the talk only where the machine can keep time
	const judged = unjudgeable(rehearsal.machine) === undefined;
	const findings: Finding[] = [
		...(judged ? opening(rehearsal) : []),
		...thrown(rehearsal),
		...unshown(rehearsal),
		...heardWhilePlaying(rehearsal),
		...movesBetween(rehearsal),
		...lookedAt(rehearsal),
		...lagged(rehearsal, extras.paces ?? new Map()),
	];
	const changed = extras.changed ?? [];
	if (changed.length > 0 || rehearsal.documents > 1) findings.push({ kind: "saved", files: changed });
	if (rehearsal.stopped !== undefined) findings.push({ kind: "stopped", why: rehearsal.stopped });
	return findings.sort((a, b) => orderOf(a) - orderOf(b));
}

/** Where a finding falls in the talk, for its order: the opening first, the talk's whole last. */
function orderOf(finding: Finding): number {
	if (finding.kind === "slow-open") return -1;
	if ("place" in finding)
		return finding.place.slide * 1000 + (finding.place.beat ?? 0) + (finding.place.back ? 500 : 0);
	if ("from" in finding) return finding.from * 1000 + 999;
	return Number.MAX_SAFE_INTEGER;
}

/** A talk this long to show its first slide is a black screen for the room. */
export const SLOW_OPEN_MS = 5000;

function opening(rehearsal: Rehearsal): Finding[] {
	return rehearsal.openMs !== undefined && rehearsal.openMs > SLOW_OPEN_MS
		? [{ kind: "slow-open", ms: rehearsal.openMs }]
		: [];
}

function thrown(rehearsal: Rehearsal): Finding[] {
	const found: Finding[] = [];
	const seen = new Set<string>();
	for (const step of rehearsal.steps) {
		for (const slide of step.slides ?? []) {
			if (slide.status !== "broken" || seen.has(slide.frame)) continue;
			const index = rehearsal.slides.findIndex((each) => each.frame === slide.frame);
			if (index < rehearsal.from || index > rehearsal.to) continue;
			seen.add(slide.frame);
			const when = slide.when ?? "mount";
			// one that broke on screen broke on the beat the talk was on; any other broke before it was ever shown
			const place: Place =
				when === "later" && step.to.slide === index
					? { slide: index, beat: step.to.beat, ...(step.pass === "back" ? { back: true as const } : {}) }
					: { slide: index };
			found.push({ kind: "threw", place, when, why: firstLine(slide.why ?? "") });
		}
	}
	return found;
}

function unshown(rehearsal: Rehearsal): Finding[] {
	const found: Finding[] = [];
	for (const step of rehearsal.steps) {
		const place = placeOf(step.to, step.pass);
		const frame = rehearsal.slides[step.to.slide]?.frame;
		const status = step.slides?.find((slide) => slide.frame === frame)?.status;
		if (step.shownAt === undefined) {
			if (status === "broken") continue;
			found.push({ kind: "never-shown", place, waited: step.rest - step.key, loading: status !== "ready" });
			continue;
		}
		if (step.pass === "forward" && step.loading !== undefined && status !== "broken")
			found.push({ kind: "loading", place, waited: step.loading, held: step.shown?.waited ?? 0 });
	}
	return found;
}

function placeOf(at: At, pass: Pass): Place {
	return { slide: at.slide, beat: at.beat, ...(pass === "back" ? { back: true as const } : {}) };
}

function firstLine(text: string): string {
	return (text.split("\n").find((line) => line.trim() !== "") ?? text).trim();
}

/** Where the talk was at `at`, epoch ms: the step whose key came last before it, or its opening. */
function placeAt(rehearsal: Rehearsal, at: number): Place {
	let place: Place = { slide: rehearsal.from, beat: 0 };
	for (const visit of rehearsal.visits) {
		if (visit.at > at) break;
		place = placeOf(visit.to, visit.pass);
	}
	return place;
}

function heardWhilePlaying(rehearsal: Rehearsal): Finding[] {
	const found: Finding[] = [];
	const said = new Map<string, { place: Place; text: string; times: number }>();
	const twice = namesTwice(rehearsal);
	for (const line of rehearsal.console) {
		// the browser says so of every move it would not make; the move's own finding says which elements
		const named = DUPLICATE_NAME.exec(line.text)?.[1];
		if (named !== undefined && twice.has(named)) continue;
		const place = placeAt(rehearsal, line.at);
		// said again going back, or each time a move into it played again: one line still
		const key = `${place.slide}:${place.beat}:${line.text}`;
		const known = said.get(key);
		if (known !== undefined) known.times++;
		else said.set(key, { place, text: firstLine(line.text), times: 1 });
	}
	for (const { place, text, times } of said.values()) found.push({ kind: "console", place, text, times });
	const asked = new Set<string>();
	for (const request of rehearsal.requests) {
		if (asked.has(request.url)) continue;
		asked.add(request.url);
		found.push({ kind: "request", place: placeAt(rehearsal, request.at), url: request.url, status: request.status });
	}
	return found;
}

/** What Chrome says when two elements carry one `view-transition-name` as a move begins. */
const DUPLICATE_NAME = /^Unexpected duplicate view-transition-name: (.+)$/;

/** The view-transition names some beat of the talk gave more than one element. */
function namesTwice(rehearsal: Rehearsal): Set<string> {
	const twice = new Set<string>();
	for (const beat of rehearsal.beats) {
		const seen = new Set<string>();
		for (const { name } of beat.look.names) {
			if (seen.has(name)) twice.add(name);
			seen.add(name);
		}
	}
	return twice;
}

/** A move that ran less than this share of its length was cut short. */
const CUT_SHARE = 0.8;

function movesBetween(rehearsal: Rehearsal): Finding[] {
	const found: Finding[] = [];
	for (const step of rehearsal.steps) {
		if (step.pass !== "forward" || step.from.slide === step.to.slide || step.move === undefined) continue;
		const { move } = step;
		const from = step.from.slide;
		if (move.failed !== undefined) {
			if (/^AbortError/.test(move.failed)) {
				found.push({ kind: "move-cut", from, ran: 0, runs: move.runs ?? 0 });
				continue;
			}
			found.push({ kind: "move-failed", from, why: move.failed, twice: namedTwice(rehearsal, step) });
			continue;
		}
		if (move.ready === undefined || move.finished === undefined || move.runs === undefined || move.runs === 0)
			continue;
		const ran = Math.round(move.finished - move.ready);
		if (ran < move.runs * CUT_SHARE) found.push({ kind: "move-cut", from, ran, runs: move.runs });
	}
	return found;
}

/** The names a move's two slides each gave more than one element: a move between them cannot run. */
function namedTwice(rehearsal: Rehearsal, step: StepRecord) {
	const twice: { name: string; slide: number; elements: NamedElement[] }[] = [];
	const ends = [
		{ slide: step.from.slide, beat: step.from.beat },
		{ slide: step.to.slide, beat: step.to.beat },
	];
	for (const end of ends) {
		const look = rehearsal.beats.find((beat) => beat.at.slide === end.slide && beat.at.beat === end.beat)?.look;
		const byName = new Map<string, NamedElement[]>();
		for (const element of look?.names ?? []) byName.set(element.name, [...(byName.get(element.name) ?? []), element]);
		for (const [name, elements] of byName) if (elements.length > 1) twice.push({ name, slide: end.slide, elements });
	}
	return twice;
}

function lookedAt(rehearsal: Rehearsal): Finding[] {
	const found: Finding[] = [];
	const late = new Set<string>();
	const cut = new Set<string>();
	const webgl = new Map<number, { contexts: number; beat: number }>();
	let before: BeatAtRest | undefined;
	for (const beat of rehearsal.beats) {
		const place: Place = { slide: beat.at.slide, beat: beat.at.beat };
		for (const file of beat.look.late) {
			const key = `${beat.at.slide}:${file.kind}:${file.name}`;
			if (late.has(key)) continue;
			late.add(key);
			found.push({ kind: "late", place, file });
		}
		for (const words of beat.look.words) {
			const past = cutOf(words, rehearsal.size);
			const key = `${beat.at.slide}:${words.source ?? words.text}`;
			if (past === undefined || cut.has(key)) continue;
			cut.add(key);
			found.push({ kind: "cut", place, words, ...past });
		}
		// a live slide's prototype lays itself out as it is used: a beat may well move it
		if (before !== undefined && before.at.slide === beat.at.slide && rehearsal.slides[beat.at.slide]?.live !== true) {
			const moved = layoutMoved(before.look.layout, beat.look.layout, restless(before.look.layout, before.left));
			if (moved !== undefined) found.push({ kind: "layout", place, ...moved });
		}
		const most = webgl.get(beat.at.slide);
		if (beat.look.webgl > (most?.contexts ?? 0))
			webgl.set(beat.at.slide, { contexts: beat.look.webgl, beat: beat.at.beat });
		before = beat;
	}
	for (const [slide, { contexts, beat }] of webgl)
		if (contexts > WEBGL_KEPT) found.push({ kind: "webgl", place: { slide, beat }, contexts, kept: WEBGL_KEPT });
	return found;
}

/** Past the slide's edge by more than this, in its px, is cut: less is the browser's rounding, or a glyph's overhang. */
const CUT_PX = 3;
/**
 * Words this large against the slide's height are display type, which a slide often runs off its edge on purpose:
 * rehearse says nothing of them.
 */
const DISPLAY_SHARE = 0.2;

/**
 * Whether words at rest are cut by the slide's edge, and by how much at the worst. Words are cut when a line of them
 * shows on the slide and runs past its edge, and what holds them clips them no sooner than that edge: a box that
 * clips at the slide's own edge (`overflow: hidden` on the slide) cuts them just the same. Not cut: words a box inside
 * the slide clips before its edge (a window they scroll through), a line out of sight (parked off the slide to come
 * in), words that move on their own, and display type. Pictures and shapes are never named: a bleed off the edge is
 * too often meant.
 */
export function cutOf(words: WordsAtEdge, size: { w: number; h: number }): { edge: Edge; past: number } | undefined {
	if (words.moving || words.size >= DISPLAY_SHARE * size.h) return undefined;
	const slide: Box = { left: 0, top: 0, right: size.w, bottom: size.h };
	const clip = words.clip ?? slide;
	let worst: { edge: Edge; past: number } | undefined;
	for (const line of words.lines) {
		const seen = overlap(line, clip);
		if (seen === undefined || overlap(seen, slide) === undefined) continue;
		const past: [Edge, number][] = [
			["left", clip.left <= CUT_PX ? -line.left : 0],
			["right", clip.right >= size.w - CUT_PX ? line.right - size.w : 0],
			["top", clip.top <= CUT_PX ? -line.top : 0],
			["bottom", clip.bottom >= size.h - CUT_PX ? line.bottom - size.h : 0],
		];
		for (const [edge, px] of past)
			if (px > CUT_PX && (worst === undefined || px > worst.past)) worst = { edge, past: Math.round(px) };
	}
	return worst;
}

function overlap(a: Box, b: Box): Box | undefined {
	const box = {
		left: Math.max(a.left, b.left),
		top: Math.max(a.top, b.top),
		right: Math.min(a.right, b.right),
		bottom: Math.min(a.bottom, b.bottom),
	};
	return box.right > box.left && box.bottom > box.top ? box : undefined;
}

/** Layout moved by more than this, px, between two beats. */
const MOVED_PX = 2;
/** The most causes a layout finding names. */
const CAUSES_NAMED = 3;

/**
 * Whether a slide's layout moved between two of its beats, and why: elements laid out on both, at rest, that layout put
 * somewhere else (transforms left out, so a reveal by transform or opacity moves nothing), counted outermost only. The
 * causes are the outermost of what appeared or left, or failing those, the innermost of what changed size. Elements that
 * move on their own are left out. A beat that adds an element where nothing moves for it is no move.
 */
export function layoutMoved(
	before: readonly LaidOut[],
	after: readonly LaidOut[],
	restless: ReadonlySet<number> = new Set(),
): { moved: number; shift: number; causes: LayoutCause[] } | undefined {
	const was = new Map(before.map((element) => [element.id, element]));
	const is = new Map(after.map((element) => [element.id, element]));
	const still = (element: LaidOut) => element.shown && !element.moving && !restless.has(element.id);
	const sized = (element: LaidOut) => element.w > 0 && element.h > 0;
	const both = after.flatMap((element) => {
		const then = was.get(element.id);
		return then !== undefined && still(then) && still(element) ? [{ then, now: element }] : [];
	});
	const shifted = both.filter(
		({ then, now }) => Math.abs(now.x - then.x) > MOVED_PX || Math.abs(now.y - then.y) > MOVED_PX,
	);
	const shiftedIds = new Set(shifted.map(({ now }) => now.id));
	const moved = shifted.filter(({ now }) => now.parent === undefined || !shiftedIds.has(now.parent));
	if (moved.length === 0) return undefined;
	const shift = Math.round(
		Math.max(...moved.map(({ then, now }) => Math.max(Math.abs(now.x - then.x), Math.abs(now.y - then.y)))),
	);

	const outermost = (list: readonly LaidOut[]) => {
		const ids = new Set(list.map((element) => element.id));
		return list.filter((element) => element.parent === undefined || !ids.has(element.parent));
	};
	const appeared = after.filter((element) => still(element) && sized(element) && was.get(element.id)?.shown !== true);
	const left = before.filter((element) => still(element) && sized(element) && is.get(element.id)?.shown !== true);
	const cause = (what: LayoutCause["what"], element: LaidOut): LayoutCause => ({
		what,
		tag: element.tag,
		...(element.source === undefined ? {} : { source: element.source }),
	});
	let causes = [
		...outermost(appeared).map((element) => cause("appeared", element)),
		...outermost(left).map((element) => cause("left", element)),
	];
	if (causes.length === 0) {
		const resized = both.filter(
			({ then, now }) => Math.abs(now.w - then.w) > MOVED_PX || Math.abs(now.h - then.h) > MOVED_PX,
		);
		const holding = new Set(resized.flatMap(({ now }) => (now.parent === undefined ? [] : [now.parent])));
		causes = resized
			.filter(({ now }) => !holding.has(now.id))
			.map(({ then, now }) => cause(now.w * now.h >= then.w * then.h ? "grew" : "shrank", now));
	}
	return { moved: moved.length, shift, causes: causes.slice(0, CAUSES_NAMED) };
}

/**
 * The elements of a beat that moved, changed size, came or went between its rest and the key that left it: what a
 * slide's own code moves over time (a typewriter, a clock), which no beat answers for.
 */
export function restless(rested: readonly LaidOut[], left: readonly LaidOut[] | undefined): Set<number> {
	const found = new Set<number>();
	if (left === undefined) return found;
	const was = new Map(rested.map((element) => [element.id, element]));
	for (const element of left) {
		const then = was.get(element.id);
		if (
			then === undefined ||
			then.shown !== element.shown ||
			Math.abs(then.x - element.x) > MOVED_PX ||
			Math.abs(then.y - element.y) > MOVED_PX ||
			Math.abs(then.w - element.w) > MOVED_PX ||
			Math.abs(then.h - element.h) > MOVED_PX
		)
			found.add(element.id);
	}
	return found;
}

/** A step whose change came later than this after its key lagged. */
export const KEY_MS = 150;
/** A step that missed more than this many frames, and more than MISSED_SHARE of them, lagged. */
const MISSED_LEAST = 3;
const MISSED_SHARE = 0.1;
/** Load past this share of the cores, and every slide would look slow. */
const BUSY_SHARE = 0.75;
/** An empty page missing more than this share of its frames, and the machine cannot keep time. */
const UNEVEN_SHARE = 0.1;

/** How long a display frame is on this machine: the empty page's middle gap, or 60 Hz's. */
export function frameMs(machine: Machine): number {
	const gaps = machine.idle.slice(1).map((frame, at) => frame - (machine.idle[at] ?? frame));
	const sorted = gaps.filter((gap) => gap > 0).sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)] ?? 1000 / 60;
}

/** Frames missed among `frames`, drawn from `from` to `to`, epoch ms: each gap longer than one frame misses the rest. */
export function missedFrames(
	frames: readonly number[],
	from: number,
	to: number,
	ms: number,
): { missed: number; of: number } {
	const all = [from, ...frames.filter((frame) => frame > from && frame < to), to];
	let missed = 0;
	for (let at = 1; at < all.length; at++)
		missed += Math.max(0, Math.round(((all[at] ?? 0) - (all[at - 1] ?? 0)) / ms) - 1);
	return { missed, of: Math.max(1, Math.round((to - from) / ms)) };
}

/** Why this machine cannot judge lag, or nothing when it can. */
export function unjudgeable(machine: Machine): "software" | "busy" | "uneven" | undefined {
	if (machine.software) return "software";
	if (machine.load > machine.cores * BUSY_SHARE) return "busy";
	const ms = frameMs(machine);
	const first = machine.idle[0];
	const last = machine.idle.at(-1);
	if (first === undefined || last === undefined || last <= first) return "uneven";
	const { missed, of } = missedFrames(machine.idle, first, last, ms);
	return missed > of * UNEVEN_SHARE ? "uneven" : undefined;
}

function lagged(rehearsal: Rehearsal, paces: ReadonlyMap<string, FramePace>): Finding[] {
	const { machine } = rehearsal;
	const why = unjudgeable(machine);
	if (why !== undefined) return [{ kind: "unjudged", why, load: machine.load, cores: machine.cores }];
	const ms = frameMs(machine);
	const found: Finding[] = [];
	for (const step of rehearsal.steps) {
		const { shown, shownAt } = step;
		// a step held for its slide to load lags by its loading, said once as that
		if (shown === undefined || shownAt === undefined || !shown.ready || shown.held || shown.waited > 0) continue;
		if (step.loading !== undefined) continue;
		const keyMs = Math.round(shownAt - step.key);
		const { missed, of } = missedFrames(step.frames, step.key, step.rest, ms);
		const slowKey = keyMs > KEY_MS;
		const missing = missed > MISSED_LEAST && missed > of * MISSED_SHARE;
		if (!slowKey && !missing) continue;
		const frame = rehearsal.slides[step.to.slide]?.frame ?? "";
		const census = censusOf(rehearsal, step);
		const pace = paces.get(frame);
		found.push({
			kind: "lag",
			place: placeOf(step.to, step.pass),
			move: step.from.slide !== step.to.slide,
			...(slowKey ? { keyMs } : {}),
			...(missing ? { missed, of } : {}),
			...(census === undefined ? {} : { census }),
			...(pace === undefined ? {} : { alone: aloneOf(pace) }),
		});
	}
	return found;
}

/** What the slide was doing as the step came on, with what the look at rest counted that the census cannot. */
function censusOf(rehearsal: Rehearsal, step: StepRecord): FrameCensus | undefined {
	const taken = step.census;
	const frame = rehearsal.slides[step.to.slide]?.frame;
	if (taken === undefined || taken.frame !== frame) return undefined;
	const beat = rehearsal.beats.find((each) => each.at.slide === step.to.slide && each.at.beat === step.to.beat);
	return {
		...(taken.census as Omit<FrameCensus, "webgl" | "loop">),
		webgl: beat?.look.webgl ?? 0,
		loop: beat?.loop ?? false,
	};
}

/** The booth's timing of the slide alone, at its slowest: what `spool check` says of it. */
function aloneOf(pace: FramePace): Alone {
	const slowest = Math.min(pace.perSecond, ...(pace.beats ?? []).map((beat) => beat.perSecond));
	return { perSecond: slowest, slow: slowest < SLOW_PER_SECOND };
}
