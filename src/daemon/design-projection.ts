import { join } from "node:path";
import { isSafeName, pageUnder, ROOT_PAGE } from "../page-path";
import { type CanvasOrder, type CanvasPlaces, parseOrder, parsePlaces } from "./canvas-fields";
import type { DesignFiles } from "./design-files";
import { besideField, DEFAULT_FOOTPRINT, pageObjectsOn, placePages } from "./placement";
import { type Footprint, type Geometry, parseSidecar } from "./sidecar";

/** One frame on the canvas: its name (its path under frames/), its page, and where it stands. */
export interface DesignFrame extends Geometry {
	name: string;
	/** The path of the page holding the frame's folder; absent on the root page. */
	page?: string;
}

/** What the canvas draws of a design folder: its pages, where they stand, its frames and the rail's order. */
export interface DesignProjection {
	/** Every named page's path, sorted; the root page is implied. */
	pages: string[];
	places: CanvasPlaces;
	frames: DesignFrame[];
	order: CanvasOrder;
}

/**
 * The canvas's reading of a design folder held anywhere (`projection.ts` is the
 * daemon's, on its disk): a folder holding frame.tsx is a frame, one holding
 * frame.json and no folders is a frame on its way and no page, every other
 * safe-named folder under frames/ is a page, and each frame stands where its
 * sidecar says. A frame or page nobody placed is placed as the daemon places
 * it, and nothing is written: the daemon that finds it first writes the place,
 * and its save brings the same coordinates back.
 */
export function projectDesign(designDir: string, files: DesignFiles): DesignProjection {
	const found: { name: string; page: string | undefined; dir: string }[] = [];
	const pages: string[] = [];
	/** the frames on their way that have a place, which new frames stand clear of as the daemon's do */
	const waiting: (Geometry & { page: string | undefined })[] = [];
	const walk = (dir: string, page: string): void => {
		for (const entry of files.list(dir) ?? []) {
			if (entry.kind !== "directory" || !isSafeName(entry.name)) continue;
			const child = join(dir, entry.name);
			if (files.kind(join(child, "frame.tsx")) !== undefined) {
				found.push({ name: pageUnder(page, entry.name), page: page === ROOT_PAGE ? undefined : page, dir: child });
				continue;
			}
			// a sidecar and no entry yet is a frame on its way, never a page, unless it holds folders
			if (
				files.kind(join(child, "frame.json")) !== undefined &&
				!(files.list(child) ?? []).some((inner) => inner.kind === "directory")
			) {
				const sidecar = parseSidecar(readJson(files, join(child, "frame.json")));
				if (sidecar.kind === "placed")
					waiting.push({ ...sidecar.geometry, page: page === ROOT_PAGE ? undefined : page });
				continue;
			}
			const inner = pageUnder(page, entry.name);
			pages.push(inner);
			walk(child, inner);
		}
	};
	walk(join(designDir, "frames"), ROOT_PAGE);
	found.sort((a, b) => a.name.localeCompare(b.name));
	pages.sort((a, b) => a.localeCompare(b));

	const canvas = readJson(files, join(designDir, "canvas.json"));
	const fields = typeof canvas === "object" && canvas !== null && !Array.isArray(canvas) ? canvas : {};
	const stored = parsePlaces((fields as Record<string, unknown>).places) ?? {};
	const order = parseOrder((fields as Record<string, unknown>).order) ?? {};

	const placed: DesignFrame[] = [];
	const unplaced: { frame: (typeof found)[number]; footprint: Footprint }[] = [];
	for (const frame of found) {
		const sidecar = parseSidecar(readJson(files, join(frame.dir, "frame.json")));
		if (sidecar.kind === "placed") placed.push(designFrame(frame, sidecar.geometry));
		else unplaced.push({ frame, footprint: sidecar.kind === "sized" ? sidecar.footprint : DEFAULT_FOOTPRINT });
	}
	for (const { frame, footprint } of unplaced) {
		const field = [...placed, ...waiting]
			.filter((candidate) => candidate.page === frame.page)
			.map(({ x, y, w, h }) => ({ x, y, w, h }));
		for (const { at, box } of pageObjectsOn(frame.page ?? ROOT_PAGE, pages, placed, stored))
			field.push({ ...at, ...box });
		const { x, y } = besideField(field);
		placed.push(designFrame(frame, rounded({ x, y, ...footprint })));
	}
	placed.sort((a, b) => a.name.localeCompare(b.name));
	return { pages, places: placePages(pages, placed, stored).places, frames: placed, order };
}

function designFrame(frame: { name: string; page: string | undefined }, geometry: Geometry): DesignFrame {
	return { name: frame.name, ...(frame.page === undefined ? {} : { page: frame.page }), ...geometry };
}

/** A placement as the daemon writes it to the sidecar: whole numbers. */
function rounded({ x, y, w, h }: Geometry): Geometry {
	return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function readJson(files: DesignFiles, path: string): unknown {
	const bytes = files.read(path);
	if (bytes === undefined) return undefined;
	try {
		return JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		return undefined;
	}
}
