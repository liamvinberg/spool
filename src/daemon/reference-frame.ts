import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReferenceCapture } from "../reference-wire";
import { besideField, GUTTER, overlaps, type Rect } from "./placement";
import type { ReferencePage } from "./reference-page";

/**
 * A reference as a frame (spool#241): a folder under `frames/references/` whose frame.tsx hands the captured page
 * to an iframe of its own. The page keeps the site's CSS, class names and all, so it is isolated from spool's own
 * styles by being its own document, sandboxed with none of the site's scripts (one of spool's own does what they did
 * that a reference needs, `reference-live.ts`); it renders at the tab's width, so its media queries resolve as they
 * did, and the frame clips it to the size it was taken at. Its images and fonts sit beside it, and
 * reach the page through the frame's imports, which is how a project serves its files wherever the frame plays.
 */

/** The page every reference lands on. */
export const REFERENCES_PAGE = "references";

/** How long a folder name a reference takes may be. */
const SLUG_CHARS = 48;

/** A folder name for the capture, free among those already in references/: its host, then what was picked. */
export function referenceSlug(
	capture: Pick<ReferenceCapture, "url" | "label" | "whole">,
	taken: ReadonlySet<string>,
): string {
	let host = "page";
	try {
		host = new URL(capture.url).hostname.replace(/^www\./, "");
	} catch {
		// a URL the tab had but Node can't read names nothing
	}
	const words = (text: string) =>
		text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "");
	const label = words(capture.label);
	const what = capture.whole || label === "" || label === words(host) ? "page" : label;
	const base = `${words(host)}-${what}`.slice(0, SLUG_CHARS).replace(/-+$/, "") || "reference";
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const next = `${base}-${n}`;
		if (!taken.has(next)) return next;
	}
}

/** The folder names already under references/, dot folders aside. */
export function takenReferenceNames(designDir: string): Set<string> {
	try {
		return new Set(readdirSync(join(designDir, "frames", REFERENCES_PAGE)).filter((name) => !name.startsWith(".")));
	} catch {
		return new Set();
	}
}

/** The one line a reference says about itself: where it came from, and what didn't come with it. */
export function referenceNote(capture: ReferenceCapture, missed: number, when: Date): string {
	let where = capture.url;
	try {
		const url = new URL(capture.url);
		where = `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
	} catch {
		// the URL as the tab had it
	}
	const what = capture.whole ? "The whole page" : capture.label;
	const left = [...capture.notes.map((note) => note.trim()).filter((note) => note !== "")];
	if (missed > 0) left.push(`${missed} ${missed === 1 ? "file" : "files"} the site would not give`);
	const leftOut = left.length === 0 ? "" : ` Left out: ${left.join("; ")}.`;
	const line = `${what} of ${where}, sent from Chrome on ${when.toISOString().slice(0, 10)}.${leftOut}`;
	return line.replace(/\s+/g, " ").replace(/\*\//g, "* /").slice(0, 400);
}

/** The files of a reference's folder, by their path in it. */
export function referenceFiles(
	capture: ReferenceCapture,
	page: ReferencePage,
	geometry: Rect,
	when: Date,
): Map<string, string | Buffer> {
	const files = new Map<string, string | Buffer>();
	const names = [...page.assets.keys()].sort();
	for (const name of names) files.set(`assets/${name}`, page.assets.get(name) ?? Buffer.alloc(0));
	files.set("page.html", page.html);
	files.set(
		"assets.ts",
		[
			"// The site's images and fonts, as this project serves them: page.html names each by its file here.",
			...names.map((name, at) => `import file${at} from "./assets/${name}";`),
			"",
			`export const assets: Record<string, string> = {${names.map((name, at) => `\n\t"assets/${name}": file${at},`).join("")}${names.length === 0 ? "" : "\n"}};`,
			"",
		].join("\n"),
	);
	files.set("frame.json", `${JSON.stringify(geometry, null, "\t")}\n`);
	const title = JSON.stringify(capture.whole ? capture.title || capture.label : capture.label);
	files.set(
		"frame.tsx",
		`/**
 * A reference: ${referenceNote(capture, page.missed, when)}
 * Read it for ideas (layout, type, motion, colour); never copy it as it is, and never edit it.
 */
import { assets } from "./assets";
import page from "./page.html";

/** The tab's viewport when it was taken: the page renders at its width, so its media queries resolve as they did. */
const VIEWPORT = ${JSON.stringify({ w: Math.round(capture.viewport.w), h: Math.round(capture.viewport.h) })};

/** The page, its images and fonts pointed at the project's copies of them. */
const document = page.replace(/assets\\/[\\w-]+\\.[a-z0-9]+/g, (file) => assets[file] ?? file);

export default function Reference() {
	return (
		<div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
			<iframe
				title=${`{${title}}`}
				srcDoc={document}
				sandbox="allow-scripts"
				style={{ display: "block", width: VIEWPORT.w, height: "100%", border: 0 }}
			/>
		</div>
	);
}
`,
	);
	return files;
}

/**
 * Write a reference's folder in one move: made aside under a dot name the canvas never reads, then renamed into
 * place, so the frame appears whole, its size already said, rather than file by file.
 */
export function writeReferenceFolder(
	designDir: string,
	slug: string,
	files: ReadonlyMap<string, string | Buffer>,
): string {
	const page = join(designDir, "frames", REFERENCES_PAGE);
	const aside = join(page, `.${slug}-${process.pid}-${Date.now()}`);
	const folder = join(page, slug);
	mkdirSync(aside, { recursive: true });
	try {
		for (const [path, content] of files) {
			const file = join(aside, path);
			mkdirSync(join(file, ".."), { recursive: true });
			writeFileSync(file, content);
		}
		renameSync(aside, folder);
	} catch (error) {
		rmSync(aside, { recursive: true, force: true });
		throw error;
	}
	return folder;
}

/**
 * Where a reference lands: inside the part of its page the canvas last showed, at the first place in reading order
 * that touches nothing already there, a gutter clear of it; when the view has no room, at the free place nearest it,
 * so the canvas only has a short way to fly; beside everything on the page when nobody has looked at the page yet.
 */
export function placeReference(field: readonly Rect[], view: Rect | undefined, size: { w: number; h: number }): Rect {
	const w = Math.round(size.w);
	const h = Math.round(size.h);
	const spot = view === undefined ? undefined : (spotInView(field, view, { w, h }) ?? spotNear(field, view, { w, h }));
	const { x, y } = spot ?? besideField(field);
	return { x: Math.round(x), y: Math.round(y), w, h };
}

/** The free place nearest the view's middle, right of or below what is on the page: where the canvas flies least. */
function spotNear(
	field: readonly Rect[],
	view: Rect,
	size: { w: number; h: number },
): { x: number; y: number } | undefined {
	const xs = [view.x, ...field.flatMap((one) => [one.x, one.x + one.w + GUTTER])];
	const ys = [view.y, ...field.flatMap((one) => [one.y, one.y + one.h + GUTTER])];
	const mx = view.x + view.w / 2;
	const my = view.y + view.h / 2;
	const half = GUTTER / 2;
	let best: { x: number; y: number; d: number } | undefined;
	for (const y of ys) {
		for (const x of xs) {
			const free = !field.some((one) =>
				overlaps(
					{ x: x - half, y: y - half, w: size.w + GUTTER, h: size.h + GUTTER },
					{ x: one.x - half, y: one.y - half, w: one.w + GUTTER, h: one.h + GUTTER },
				),
			);
			if (!free) continue;
			// how far its nearest point is from the view's middle
			const dx = Math.max(x - mx, 0, mx - (x + size.w));
			const dy = Math.max(y - my, 0, my - (y + size.h));
			const d = dx * dx + dy * dy;
			if (best === undefined || d < best.d || (d === best.d && (y < best.y || (y === best.y && x < best.x)))) {
				best = { x, y, d };
			}
		}
	}
	return best;
}

function spotInView(
	field: readonly Rect[],
	view: Rect,
	size: { w: number; h: number },
): { x: number; y: number } | undefined {
	const inset = Math.min(GUTTER, view.w / 10, view.h / 10);
	const xs = [view.x + inset, ...field.flatMap((one) => [one.x, one.x + one.w + GUTTER])];
	const ys = [view.y + inset, ...field.flatMap((one) => [one.y, one.y + one.h + GUTTER])];
	const right = view.x + view.w;
	const bottom = view.y + view.h;
	// as much of it as the view can hold must be in it: all of a small one, the top-left of one bigger than the view
	const seenW = Math.min(size.w, view.w - inset * 2);
	const seenH = Math.min(size.h, view.h - inset * 2);
	const half = GUTTER / 2;
	const spots = ys
		.flatMap((y) => xs.map((x) => ({ x, y })))
		.filter(({ x, y }) => x >= view.x && y >= view.y && x + seenW <= right && y + seenH <= bottom)
		.filter(
			({ x, y }) =>
				!field.some((one) =>
					overlaps(
						{ x: x - half, y: y - half, w: size.w + GUTTER, h: size.h + GUTTER },
						{ x: one.x - half, y: one.y - half, w: one.w + GUTTER, h: one.h + GUTTER },
					),
				),
		)
		.sort((a, b) => a.y - b.y || a.x - b.x);
	return spots[0];
}
