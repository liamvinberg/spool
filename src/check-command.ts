import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { checkProject } from "./check";
import { altReaders, describeAltReader } from "./check-alt";
import { describeSlowFrame, slowFrames } from "./check-pace";
import { checkStylesheets } from "./check-stylesheets";
import { checkDecks, type DeckCheck, type Talk, talksOf } from "./daemon/deck/check";
import { realDesignDir } from "./daemon/design-path";
import { followedLink, OUTSIDE_LAYOUT, staysOnThisMac, TOO_BIG } from "./daemon/team-sync";
import { scanBrokenFrames } from "./daemon/thumbs";
import { type ExperimentId, experimentDefault } from "./settings/experiments";

/** What `spool check [paths…]` says: diagnostics and notes on stderr, the count line on stdout. */
export interface CheckOutput {
	stderr: string[];
	stdout: string[];
	ok: boolean;
	/** design-relative files of a team project that stay on this Mac, each said as an error */
	staying?: string[];
}

/** Where the walk-up to the project starts: the first named path that exists, else the cwd. */
export function checkStart(cwd: string, paths: string[]): string {
	for (const path of paths) {
		const absolute = resolve(cwd, path);
		if (!existsSync(absolute)) continue;
		return statSync(absolute).isDirectory() ? absolute : dirname(absolute);
	}
	return cwd;
}

/**
 * Check the frames the paths name (a path on disk, or a frame's name under
 * design/frames), or every frame when none is named. Slow frames are spelled
 * out only for frames named one by one; the rest are one line after the
 * diagnostics. `spool` is the version checking, whose booth's failed covers are the frames it names broken on the
 * canvas. `on` says which experiments this machine has on: an experiment's own rules are checked only with it on.
 */
export async function runCheck(
	root: string,
	cwd: string,
	paths: string[],
	{ spool, on = experimentDefault }: { spool: string; on?: (id: ExperimentId) => boolean },
): Promise<CheckOutput> {
	const designDir = realDesignDir(root);
	const framesDir = join(designDir, "frames");
	const stderr: string[] = [];
	const scope: string[] = [];
	const given = new Map<string, string>();
	for (const path of paths) {
		const absolute = [resolve(cwd, path), join(framesDir, path)].find((candidate) => existsSync(candidate));
		if (absolute === undefined) {
			stderr.push(`${path}: no such file, and no frame is named that`);
			continue;
		}
		const real = realpathSync(absolute);
		scope.push(real);
		given.set(real, path);
	}
	if (stderr.length > 0) return { stderr, stdout: [], ok: false };
	const report = await checkProject(root, paths.length === 0 ? undefined : scope);
	if (report.unmatched.length > 0) {
		for (const path of report.unmatched) {
			const shown = given.get(path) ?? path;
			stderr.push(
				extname(path).toLowerCase() === ".tsx"
					? `${shown} is not a frame: a frame is design/frames/<name>/frame.tsx`
					: `${shown} holds no frame: name a frame's folder, its frame.tsx, or a folder of frames`,
			);
		}
		return { stderr, stdout: [], ok: false };
	}
	if (!report.ran && report.notChecked.length > 0) return { stderr: report.notChecked, stdout: [], ok: false };
	for (const diagnostic of report.diagnostics) {
		stderr.push(
			`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`,
		);
	}
	// a deck's own rules (spool#265): its errors fail the check as a typecheck's do, its warnings are notes
	const decks: DeckCheck = on("deck")
		? checkDecks(root, paths.length === 0 ? undefined : report.frames)
		: { errors: [], warnings: [] };
	for (const found of decks.errors) stderr.push(`${found.path}:${found.line}:${found.column} deck: ${found.message}`);
	for (const found of decks.warnings)
		stderr.push(`${found.path}:${found.line}:${found.column} deck warning: ${found.message}`);
	// what the stylesheet compile will refuse, which the typecheck never reads (spool#323)
	const stylesheets = report.ran ? checkStylesheets(designDir, report.frames, report.stylesheetsOf) : [];
	for (const found of stylesheets)
		stderr.push(`${found.path}:${found.line}:${found.column} stylesheet: ${found.message}`);
	stderr.push(...report.notChecked);
	for (const stray of report.strays) {
		stderr.push(
			stray.endsWith("/frame.tsx")
				? `${stray} is not a frame: it is inside another frame's folder, and a frame folder can't hold a frame`
				: `${stray} is not a frame: a frame is design/frames/<name>/frame.tsx`,
		);
	}
	// a frame named on its own gets the whole note; any other is one line, since
	// a pace is from whatever machine last timed it and rarely the question asked
	const named = new Set(
		scope.flatMap((path) => {
			const folder = path.endsWith("frame.tsx") ? dirname(path) : path;
			return existsSync(join(folder, "frame.tsx")) ? [relative(framesDir, folder).split("\\").join("/")] : [];
		}),
	);
	const checked = new Set(report.frames);
	const slow = slowFrames(root, report.sourcesOf).filter((frame) => checked.has(frame.frame));
	// a slide of a talk is said whole, by its place in the talk, whether it or its talk is checked: a talk is
	// meant to run smoothly, and a slide that lags is the question asked of it (spool#318)
	const talks: Talk[] = on("deck") ? talksOf(root) : [];
	const slides = new Map(talks.flatMap((talk) => talk.slides.map((slide, at) => [slide, at + 1] as const)));
	const slowSlides = new Map<string, number>();
	for (const talk of talks) {
		for (const frame of slow) {
			const at = talk.slides.indexOf(frame.frame);
			if (at < 0) continue;
			stderr.push(describeSlowFrame(frame, at + 1));
			slowSlides.set(talk.page, (slowSlides.get(talk.page) ?? 0) + 1);
		}
	}
	const others = slow.filter((frame) => !slides.has(frame.frame));
	for (const frame of others) if (named.has(frame.frame)) stderr.push(describeSlowFrame(frame));
	const unnamed = others.filter((frame) => !named.has(frame.frame)).map((frame) => frame.frame);
	if (unnamed.length > 0) {
		const listed =
			unnamed.length > 5 ? `${unnamed.slice(0, 5).join(", ")} and ${unnamed.length - 5} more` : unnamed.join(", ");
		stderr.push(
			`${count(unnamed.length, "frame")} timed slow (${listed}); name one, as in spool check design/frames/${unnamed[0]}, to see why`,
		);
	}
	// a note, never a failure: a frame may mean to keep ⌥ for itself
	if (report.ran) for (const reader of altReaders(root, report.frames)) stderr.push(describeAltReader(reader));
	const errors = report.diagnostics.length + decks.errors.length + stylesheets.length;
	if (!report.ran) return { stderr, stdout: [`not checked: ${count(errors, "error")} stopped it`], ok: false };
	// what the canvas shows broken, which a typecheck can not see all of (a frame
	// that throws as it starts) and an agent should hear of in the same answer.
	// A note rather than a failure: it is as of the canvas's last picture, which
	// an edit since may have made moot
	const broken = [...(await scanBrokenFrames(root, spool))].filter(([frame]) => checked.has(frame));
	for (const [frame, { kind, error }] of broken.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
		const said = error.split("\n").find((line) => line.trim() !== "") ?? error;
		stderr.push(
			`design/frames/${frame}/frame.tsx: broken on the canvas: ${kind === "compile" ? `failed to compile: ${said.trim()}` : said.trim()}`,
		);
	}
	// a team project's file that stays on this Mac is missing for every teammate: an error, said on every check
	// until it is moved, shrunk or gone, so an agent that left a screenshot in design/ cleans it up
	const staying = followedLink(root) === undefined ? [] : staysOnThisMac(root);
	for (const { path, why } of staying)
		stderr.push(`design/${path}: stays on this Mac, teammates never get it: ${why}${fixOf(why)}`);
	const batches = report.batches > 1 ? ` in ${report.batches} batches` : "";
	const shown = broken.length > 0 ? `; ${broken.length} broken on the canvas` : "";
	const stays =
		staying.length > 0
			? `; ${count(staying.length, "file")} ${staying.length === 1 ? "stays" : "stay"} on this Mac`
			: "";
	const lagging = talks
		.filter((talk) => slowSlides.has(talk.page))
		.map(
			(talk) =>
				`; ${slowSlides.get(talk.page)} of the ${count(talk.slides.length, "slide")} in ${talk.page} timed slow`,
		)
		.join("");
	return {
		stderr,
		stdout: [
			`checked ${count(report.frames.length, "frame")} (${count(report.sources, "source file")})${batches}, ${count(errors, "error")}${shown}${stays}${lagging}`,
		],
		ok: errors === 0 && report.notChecked.length === 0 && staying.length === 0,
		...(staying.length > 0 ? { staying: staying.map(({ path }) => path) } : {}),
	};
}

/** What to do about a file that stays on this Mac, by why it stays. */
function fixOf(why: string): string {
	if (why === OUTSIDE_LAYOUT)
		return "; move it under frames/ or shared/ if the design uses it, or out of design/ if it is scratch (a screenshot, a script)";
	if (why === TOO_BIG) return "; shrink it on this Mac (spool skill team says how)";
	return "; put the file itself there instead";
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
