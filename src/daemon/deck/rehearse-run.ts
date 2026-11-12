import { type Dirent, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { dirname, join, relative } from "node:path";
import type { BrowserContext, BrowserContextOptions } from "playwright-core";
import type { Rehearsal } from "../../deck/rehearsal";
import type { RehearseOutcome } from "../../rehearse-report";
import { realDesignDir } from "../design-path";
import type { FramePace } from "../thumbs";
import { deckReadOf, readPage } from "./disk";
import { composeSheets, type RehearseTalk, type RehearseTiming, rehearse, sheetCells } from "./rehearse";
import { breaks, type Finding, findingsOf } from "./rehearse-rules";
import { stageOf } from "./stage-play";

/**
 * `spool rehearse` on the daemon's side (spool#322): which talk a name means, the talk played in a tab the photo booth
 * lends, what it found, and its pictures written where the CLI reads them: `design/.spool/rehearse/<page>/`, made new
 * on every rehearsal of the page, so nothing in it is from before the last.
 */

/** The slides a rehearsal asks for, by number from 1, both ends included. */
export interface SlidesAsked {
	readonly from: number;
	readonly to: number;
}

/** The talk a name rehearses, and which of its slides: a deck page whole or in part, or one slide of one. */
export function talkOf(
	root: string,
	name: string,
	asked?: SlidesAsked,
): { talk: RehearseTalk; from: number; to: number } | { message: string } {
	const own = readPage(root, name);
	const deckHere = own === undefined ? undefined : deckReadOf(own);
	const parent = name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : undefined;
	const page = deckHere !== undefined ? name : parent;
	const found = page === undefined ? undefined : readPage(root, page);
	const deck = found === undefined ? undefined : deckReadOf(found);
	if (page === undefined || found === undefined || deck === undefined || "why" in deck)
		return { message: `no talk "${name}" to rehearse: name a deck's page, or one of its slides` };
	const stage = stageOf(root, page);
	if ("message" in stage) return stage;
	const read = new Map(deck.slides.map((slide) => [slide.name, slide]));
	const slides = stage.slides.map((slide) => {
		const beats = read.get(slide.frame)?.beats ?? [];
		return {
			frame: slide.frame,
			beats: beats.length === 0 ? [""] : [...beats],
			...(read.get(slide.frame)?.live === true ? { live: true } : {}),
		};
	});
	const talk: RehearseTalk = { page, size: stage.size, slides };
	if (deckHere === undefined) {
		const at = slides.findIndex((slide) => slide.frame === name);
		if (at < 0) return { message: `"${name}" is no slide of the talk "${page}": its deck.json does not list it` };
		if (asked !== undefined) return { message: "--slides picks slides of a talk: name its page, not one slide" };
		return { talk, from: at, to: at };
	}
	if (asked === undefined) return { talk, from: 0, to: slides.length - 1 };
	if (asked.from < 1 || asked.to > slides.length || asked.from > asked.to)
		return {
			message: `the talk "${page}" has ${slides.length === 1 ? "1 slide" : `slides 1 to ${slides.length}`}: --slides ${asked.from === asked.to ? asked.from : `${asked.from}-${asked.to}`} is not among them`,
		};
	return { talk, from: asked.from - 1, to: asked.to - 1 };
}

export interface RunDeps {
	readonly root: string;
	readonly project: string;
	/** spool's own origin, where the talk's play address is */
	readonly controlOrigin: string;
	/** a tab of the booth's browser (`booth.lend`) */
	readonly lend: <T>(
		options: BrowserContextOptions,
		narrate: (line: string) => void,
		work: (tab: { context: BrowserContext; software: boolean }) => Promise<T>,
	) => Promise<T>;
	/** the booth's last timing of each frame alone (`thumbs.ts`) */
	readonly paces: (root: string) => ReadonlyMap<string, FramePace>;
	readonly narrate: (line: string) => void;
	readonly timing?: Partial<RehearseTiming>;
}

/** Rehearse a talk, write its pictures, and say what it found. */
export async function runRehearsal(
	deps: RunDeps,
	{ talk, from, to }: { talk: RehearseTalk; from: number; to: number },
): Promise<RehearseOutcome> {
	const started = Date.now();
	const address = `${deps.controlOrigin}/play/${encodeURIComponent(deps.project)}?${new URLSearchParams({ deck: talk.page })}`;
	const { rehearsed, findings, sheets } = await deps.lend(
		{ viewport: { width: talk.size.w, height: talk.size.h }, deviceScaleFactor: 1, reducedMotion: "no-preference" },
		deps.narrate,
		async ({ context, software }) => {
			const rehearsed = await rehearse({
				context,
				address,
				talk,
				from,
				to,
				software,
				machine: () => ({ load: loadavg()[0] ?? 0, cores: availableParallelism() }),
				narrate: deps.narrate,
				...(deps.timing === undefined ? {} : { timing: deps.timing }),
			});
			const changed = changedSince(deps.root, talk.page, started);
			const findings = findingsOf(rehearsed.rehearsal, { changed, paces: deps.paces(deps.root) });
			deps.narrate("drawing the sheet");
			const cells = sheetCells(rehearsed.rehearsal, (at) => markOf(findings, at));
			const sheets = await composeSheets(
				context,
				cells,
				rehearsed.stills,
				talk.size,
				`${talk.page}, ${from === to ? `slide ${from + 1}` : `slides ${from + 1} to ${to + 1}`}`,
			);
			return { rehearsed, findings, sheets };
		},
	);
	const folder = writeRehearsal(deps.root, talk.page, {
		stills: rehearsed.stills,
		sheets,
		record: { ...withoutLayouts(rehearsed.rehearsal), findings },
	});
	const { rehearsal } = rehearsed;
	return {
		page: talk.page,
		slides: talk.slides,
		size: talk.size,
		from,
		to,
		beats: rehearsal.beats.length,
		ms: Date.now() - started,
		findings,
		folder,
		sheets: sheets.map((_, at) => sheetName(at)),
	};
}

/** What the sheet marks at a beat, or at the move from a slide into the next. */
function markOf(
	findings: readonly Finding[],
	at: { slide: number; beat?: number; move?: true },
): "broken" | "note" | undefined {
	const here = findings.filter((finding) => {
		if (at.move === true)
			return (
				((finding.kind === "move-failed" || finding.kind === "move-cut") && finding.from === at.slide) ||
				(finding.kind === "lag" && finding.move && !finding.place.back && finding.place.slide === at.slide + 1)
			);
		if (!("place" in finding) || finding.place.slide !== at.slide || finding.place.back) return false;
		if (finding.kind === "lag" && finding.move) return false;
		return finding.place.beat === undefined || finding.place.beat === at.beat;
	});
	if (here.length === 0) return undefined;
	return here.some(breaks) ? "broken" : "note";
}

const sheetName = (at: number) => `sheet-${at + 1}.png`;

/** The record kept beside the pictures, without each beat's whole layout, which only the rules need. */
function withoutLayouts(rehearsal: Rehearsal) {
	return {
		...rehearsal,
		beats: rehearsal.beats.map(({ left: _, ...beat }) => ({ ...beat, look: { ...beat.look, layout: [] } })),
	};
}

/** The folder a page's rehearsal goes in, from the project's root. */
export function rehearsalFolder(page: string): string {
	return join("design", ".spool", "rehearse", ...page.split("/"));
}

/**
 * The rehearsal's pictures and record, in place of the last: written aside first and swapped in whole, so a reader
 * never sees half of one, and two rehearsals of one page each leave a whole one.
 */
function writeRehearsal(
	root: string,
	page: string,
	files: { stills: readonly { name: string; png: Buffer }[]; sheets: readonly Buffer[]; record: unknown },
): string {
	const designDir = realDesignDir(root);
	const target = join(designDir, ".spool", "rehearse", ...page.split("/"));
	const aside = `${target}.${process.pid}-${Date.now()}.new`;
	mkdirSync(join(aside, "stills"), { recursive: true });
	for (const still of files.stills) writeFileSync(join(aside, "stills", still.name), still.png);
	for (const [at, sheet] of files.sheets.entries()) writeFileSync(join(aside, sheetName(at)), sheet);
	writeFileSync(join(aside, "rehearsal.json"), `${JSON.stringify(files.record, null, "\t")}\n`);
	const old = `${target}.${process.pid}-${Date.now()}.old`;
	mkdirSync(dirname(target), { recursive: true });
	try {
		renameSync(target, old);
	} catch {}
	renameSync(aside, target);
	rmSync(old, { recursive: true, force: true });
	return rehearsalFolder(page);
}

/** The talk's files saved since `since`, epoch ms, under design/: its page's own, and what every page shares. */
function changedSince(root: string, page: string, since: number): string[] {
	const designDir = realDesignDir(root);
	const changed: string[] = [];
	const walk = (dir: string) => {
		let entries: Dirent[];
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) walk(path);
			else if (entry.isFile() && entry.name !== "frame.json") {
				try {
					if (statSync(path).mtimeMs > since) changed.push(relative(designDir, path).split("\\").join("/"));
				} catch {}
			}
		}
	};
	walk(join(designDir, "frames", ...page.split("/")));
	walk(join(designDir, "shared"));
	return changed.sort();
}
