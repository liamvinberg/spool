import { causesOf } from "./check-pace";
import { breaks, type Finding, type Place } from "./daemon/deck/rehearse-rules";
import { RENDER_HOST } from "./daemon/security";
import { REHEARSE, type RehearsedSlide } from "./deck/rehearsal";
import { PRESENTED_WEBGL, PRESENTED_WEBGL_APART } from "./deck/stage-wire";

/**
 * What `spool rehearse` says (spool#322), in the plain style of `spool check`: a line for each thing found wrong, at
 * its slide and beat, with the file to open and what to do, then one summary line and where the pictures are.
 */

/** What the daemon answers a rehearsal with: what it found, and where it put the pictures. */
export interface RehearseOutcome {
	readonly page: string;
	readonly slides: readonly RehearsedSlide[];
	readonly size: { readonly w: number; readonly h: number };
	/** the slides rehearsed, by place from 0, both ends included */
	readonly from: number;
	readonly to: number;
	/** beats played on the way forward */
	readonly beats: number;
	readonly ms: number;
	readonly findings: readonly Finding[];
	/** the folder holding its pictures, from the project's root */
	readonly folder: string;
	/** the contact sheets, in the folder, in order */
	readonly sheets: readonly string[];
}

/** A line of the daemon's answer to a rehearsal: a beat to show it is alive, where it is, or what came of it. */
export type RehearseLine =
	| { readonly beat: true }
	| { readonly narrate: string }
	| {
			readonly outcome:
				| ({ readonly kind: "rehearsed" } & RehearseOutcome)
				| { readonly kind: "failed"; readonly message: string };
	  };

/** A console line said this often is a slide saying it over and over, not once each time it came on. */
const OVER_AND_OVER = 10;

export interface RehearseReport {
	/** a line for each finding */
	readonly stderr: string[];
	/** the summary and where the pictures are */
	readonly stdout: string[];
	/** nothing broke */
	readonly ok: boolean;
}

/** The report of a rehearsal; `folder` is where its pictures are now, when they were copied somewhere asked for. */
export function reportOf(outcome: RehearseOutcome, folder: string = outcome.folder): RehearseReport {
	const stderr = outcome.findings.map((finding) => lineOf(outcome, finding));
	const broken = outcome.findings.filter(breaks).length;
	// that this machine could not judge lag is no fault of the talk's
	const notes = outcome.findings.filter((finding) => !breaks(finding) && finding.kind !== "unjudged").length;
	const range =
		outcome.from === 0 && outcome.to === outcome.slides.length - 1
			? count(outcome.slides.length, "slide")
			: outcome.from === outcome.to
				? `slide ${outcome.from + 1}`
				: `slides ${outcome.from + 1} to ${outcome.to + 1}`;
	const said =
		broken + notes === 0
			? "clean"
			: [broken > 0 ? `${broken} broken` : "", notes > 0 ? count(notes, "note") : ""].filter(Boolean).join(", ");
	const sheets = outcome.sheets.map((sheet, at) => (at === 0 ? `${folder}/${sheet}` : sheet)).join(", ");
	return {
		stderr,
		stdout: [
			`rehearsed ${outcome.page}, ${range} (${count(outcome.beats, "beat")}), forward and back in ${seconds(outcome.ms)}: ${said}`,
			...(outcome.sheets.length === 0
				? []
				: [
						`sheet: ${sheets} (every beat at rest in order, and each move between slides at its start, middle and end); every picture full size in ${folder}/stills/`,
					]),
		],
		ok: broken === 0,
	};
}

function lineOf(outcome: RehearseOutcome, finding: Finding): string {
	switch (finding.kind) {
		case "slow-open": {
			const at = { slide: outcome.from };
			return `${pathOf(outcome, at)}: ${where(outcome, at)}: the talk showed nothing for ${seconds(finding.ms)} after it opened, a black screen for the room; what its first slide loads, or what every slide imports, is slow`;
		}
		case "threw": {
			const head = `${pathOf(outcome, finding.place)}: ${where(outcome, finding.place)}`;
			const why = finding.why === "" ? "" : `: ${shortUrls(finding.why)}`;
			if (finding.when === "compile")
				return `${head}: does not compile, so the room keeps the slide before it on screen${why}`;
			if (finding.when === "load")
				return `${head}: never became ready, so the room keeps the slide before it on screen${why}`;
			if (finding.when === "mount")
				return `${head}: threw as it came on, so the room kept the slide before it${why}`;
			return `${head}: threw on screen, so the room froze on its last picture${why}`;
		}
		case "never-shown": {
			const head = `${pathOf(outcome, finding.place)}: ${where(outcome, finding.place)}`;
			return finding.loading
				? `${head}: never became ready: still loading ${seconds(finding.waited)} after its key, with the slide before it on screen`
				: `${head}: the stage never showed it, ${seconds(finding.waited)} after its key`;
		}
		case "loading": {
			const waited =
				finding.held > 0 ? `, and the room waited ${seconds(finding.held)} more on the slide before it` : "";
			return `${pathOf(outcome, finding.place)}: ${where(outcome, { slide: finding.place.slide })}: still loading when its key came, ${seconds(finding.waited)} after the slide before it was done${waited}; what it loads is heavy (its pictures, its faces, what it imports)`;
		}
		case "console": {
			// a slide says a line each time it comes on, and the rehearsal brings it on more than once
			const times = finding.times >= OVER_AND_OVER ? ` (${finding.times} times)` : "";
			return `${pathOf(outcome, finding.place)}: ${where(outcome, finding.place)}: console error${times}: ${finding.text}`;
		}
		case "request":
			return `${pathOf(outcome, finding.place)}: ${where(outcome, finding.place)}: a request failed: ${shortUrl(finding.url)} (${finding.status})`;
		case "move-failed": {
			const [first] = finding.twice;
			const path =
				first?.elements[0]?.source === undefined
					? pathOf(outcome, { slide: finding.from + 1 })
					: `design/${first.elements[0].source}`;
			const head = `${path}: ${moveOf(outcome, finding)} did not run`;
			if (finding.twice.length === 0) return `${head}: ${finding.why}`;
			const names = finding.twice
				.map(
					(twice) =>
						`view-transition-name "${twice.name}" is on ${twice.elements.length} elements of slide ${twice.slide + 1}, ${listed(twice.elements.map(elementOf))}`,
				)
				.join("; ");
			return `${head}: ${names}; give a name to one element per slide`;
		}
		case "move-cut": {
			const head = `${pathOf(outcome, { slide: finding.from + 1 })}: ${moveOf(outcome, finding)}`;
			return finding.ran === 0
				? `${head} was skipped before it began: another move started over it`
				: `${head} was cut short: it ran ${finding.ran} of its ${finding.runs} ms`;
		}
		case "late": {
			const head = `${pathOf(outcome, finding.place)}: ${where(outcome, finding.place)}`;
			const after = seconds(finding.file.after);
			return finding.file.kind === "picture"
				? `${head}: its picture ${shortUrl(finding.file.name)} came ${after} after the slide went on screen, so the slide showed without it; draw it from the slide's first beat, where the stage loads it before the slide comes on, or make it smaller`
				: `${head}: the face "${finding.file.name}" came ${after} after the slide went on screen, so its words drew in another face first; declare it with @font-face in a stylesheet the slide imports, not in another site's stylesheet, so the stage loads it before the slide comes on`;
		}
		case "cut": {
			const path =
				finding.words.source === undefined ? pathOf(outcome, finding.place) : `design/${finding.words.source}`;
			return `${path}: ${where(outcome, finding.place)}: words cut by the slide's ${finding.edge} edge, ${finding.past} px past it: "${finding.words.text}"; fit them in its ${finding.size.w} by ${finding.size.h}`;
		}
		case "layout": {
			const [first] = finding.causes;
			const path = first?.source === undefined ? pathOf(outcome, finding.place) : `design/${first.source}`;
			const why =
				finding.causes.length === 0
					? ""
					: `${listed(finding.causes.map((cause) => `${elementOf(cause)} ${cause.what}`))}, and `;
			return `${path}: ${where(outcome, finding.place)}: its layout moves: ${why}${count(finding.moved, "element")} moved, up to ${finding.shift} px; keep every beat's elements in the layout from the first beat and reveal them with opacity, transform or a clip`;
		}
		case "webgl": {
			const held =
				finding.before === 0
					? `holds ${finding.contexts} WebGL contexts`
					: `holds ${finding.contexts} WebGL contexts and the slide before it ${finding.before}`;
			return `${pathOf(outcome, finding.place)}: ${where(outcome, { slide: finding.place.slide })}: ${held}, past the ${finding.share} full screen and the presenter's slide keep for a slide and the one before it (the room keeps ${PRESENTED_WEBGL_APART.room} in a process of its own, ${PRESENTED_WEBGL.room} where it shares the presenter's), so they cannot ready this slide ahead: it compiles as it goes on and can lag there; draw on fewer canvases`;
		}
		case "endless":
			return `${pathOf(outcome, finding.place)}: ${where(outcome, finding.place)}: draws every frame without end once at rest, a requestAnimationFrame loop of its own, so it never rests and every step beside it shares the thread with it; stop the loop once its motion is done, unless the slide is about that motion`;
		case "lag": {
			const subject = finding.move
				? `the move from ${where(outcome, { slide: finding.place.slide - (finding.place.back ? -1 : 1) })} to ${where(outcome, finding.place)}`
				: where(outcome, finding.place);
			const what = [
				finding.keyMs === undefined
					? ""
					: `its change came ${finding.keyMs} ms after its key (smooth is under 150)`,
				finding.missed === undefined ? "" : `it missed ${finding.missed} of its ${finding.of} frames`,
			]
				.filter(Boolean)
				.join(", and ");
			const causes =
				finding.census === undefined ? [] : causesOf(finding.census, 1, "slide").map((cause) => `  ${cause}`);
			return [
				`${pathOf(outcome, finding.place)}: ${subject} lagged: ${what}`,
				...causes,
				`  ${aloneOf(outcome, finding)}`,
			].join("\n");
		}
		case "unjudged":
			if (finding.why === "software")
				return `lag not judged: the browser draws in software here, so every slide would look slow; ${REHEARSE} on a machine with a GPU to judge it`;
			if (finding.why === "busy")
				return `lag not judged: the machine is busy (load ${Math.round(finding.load)} on ${finding.cores} cores), so a slow step would say more of it than of the talk; ${REHEARSE} again when it is quieter`;
			return "lag not judged: an empty page missed frames here just before the talk played, so a slow step would say more of the machine than of the talk";
		case "saved": {
			const files = finding.files.length === 0 ? "" : ` (${listed(finding.files.map((file) => `design/${file}`))})`;
			return `design/frames/${outcome.page}: saved while the talk played${files}, so some of what played was from before the save; ${REHEARSE} again`;
		}
		case "stopped":
			return `design/frames/${outcome.page}: the rehearsal stopped before the end: ${finding.why}`;
	}
}

/** Where `spool check`'s own timing of the slide alone (spool#318) meets what the rehearsal saw. */
function aloneOf(outcome: RehearseOutcome, finding: Extract<Finding, { kind: "lag" }>): string {
	const check = `spool check design/frames/${outcome.page}`;
	if (finding.alone === undefined)
		return `${check} times each slide alone once spool sees it edited, and names what slows one that lags`;
	const rate = `${finding.alone.perSecond} frames a second`;
	return finding.alone.slow
		? `alone, it drew ${rate} when spool last timed it: ${check} names what slows it`
		: `alone, it drew ${rate} when spool last timed it, which is smooth: what lags is the stage around it, so look at the slides it readies beside it`;
}

/** A slide, and a beat of it when it has more than one, as a person reads them: by number, and by name. */
function where(outcome: RehearseOutcome, place: Place): string {
	const slide = outcome.slides[place.slide];
	const name = slide?.frame.split("/").at(-1);
	const head = `slide ${place.slide + 1}${name === undefined ? "" : ` "${name}"`}`;
	const beats = slide?.beats ?? [];
	const beat =
		place.beat === undefined || beats.length < 2
			? ""
			: `, beat ${place.beat + 1}${beats[place.beat] === undefined ? "" : ` "${beats[place.beat]}"`}`;
	return `${head}${beat}${place.back ? ", going back" : ""}`;
}

/** The move between a slide and the next, forward or, when only that went wrong, back. */
function moveOf(outcome: RehearseOutcome, move: { from: number; back?: true }): string {
	const [from, to] = move.back ? [move.from + 1, move.from] : [move.from, move.from + 1];
	return `the move ${move.back ? "back " : ""}from ${where(outcome, { slide: from })} to ${where(outcome, { slide: to })}`;
}

function pathOf(outcome: RehearseOutcome, place: { slide: number }): string {
	const slide = outcome.slides[place.slide];
	return slide === undefined ? `design/frames/${outcome.page}` : `design/frames/${slide.frame}/frame.tsx`;
}

function elementOf(element: { tag: string; source?: string }): string {
	return element.source === undefined ? element.tag : `${element.tag} at design/${element.source}`;
}

/** An address of the talk's own as its path, any other whole. */
function shortUrl(url: string): string {
	try {
		const parsed = new URL(url);
		return parsed.hostname === RENDER_HOST ? parsed.pathname : url;
	} catch {
		return url;
	}
}

/** The talk's own addresses in a line, as their paths. */
function shortUrls(text: string): string {
	return text.replace(/https?:\/\/[^\s,]+/g, shortUrl);
}

function seconds(ms: number): string {
	return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function listed(items: readonly string[]): string {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}
