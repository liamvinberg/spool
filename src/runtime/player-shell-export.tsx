import { mountPlayerShell, type NamedGeometry, type PlayerGeometrySource, type PlayerShellHost } from "./player-shell";

/**
 * The player shell's export host (spool#304): an exported HTML file opened from
 * disk, with nothing behind it. The geometry is the file's own and never
 * changes, nothing is reported, repaired or recorded, and there is nothing to
 * close back to, so the bar is the frame's name and its size. The played
 * document is in the file too, and gets the file's one import map, so React
 * rides in it once for both documents.
 */

/** What the file says about itself, beside the played document it holds. */
export interface ExportedPlayer {
	project: string;
	start: string;
	/** Every frame in the file, at its authored box. */
	frames: Record<string, { w: number; h: number }>;
}

declare global {
	interface Window {
		__SPOOL_EXPORT__?: ExportedPlayer;
	}
}

/** The template holding the played document, and the import map both documents share. */
const PLAYED_TEMPLATE_ID = "spool-played";

/** Boot the exported file's player from what the file holds. */
export function bootExportedPlayer(): void {
	const config = window.__SPOOL_EXPORT__;
	const root = document.getElementById("root");
	const played = document.getElementById(PLAYED_TEMPLATE_ID);
	const importMap = document.querySelector('script[type="importmap"]')?.textContent ?? "";
	if (config === undefined || root === null || !(played instanceof HTMLTemplateElement)) {
		throw new Error("spool: this file's player is missing a part");
	}
	mountPlayerShell(
		root,
		{
			project: config.project,
			start: config.start,
			frames: { ...config.frames },
			innerDocument: playedDocument(importMap, played.innerHTML),
		},
		exportHost(config.frames, touchFirst()),
	);
}

/** The played document: the file's import map first, so its modules find React before any of them loads. */
function playedDocument(importMap: string, body: string): string {
	const map = importMap.replaceAll("<", "\\u003c");
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><script type="importmap">${map}</script>${body}`;
}

/**
 * What the file offers the shell: its fixed geometry, and links that open a tab of their own. On a touch screen it
 * wears no bar, since there is nothing there to pull and the screen is all the room there is; the live player keeps
 * its bar however narrow it gets.
 */
function exportHost(frames: Record<string, { w: number; h: number }>, touch: boolean): PlayerShellHost {
	return { geometry: fixedGeometry(frames), popups: true, ...(touch ? { bare: true as const } : {}) };
}

/** Geometry that never changes: answered again, at a newer revision, whenever the shell asks. */
function fixedGeometry(frames: Record<string, { w: number; h: number }>): PlayerGeometrySource {
	const named: NamedGeometry[] = Object.entries(frames).map(([name, { w, h }]) => ({ name, w, h }));
	let revision = 0;
	let sink: Parameters<PlayerGeometrySource["follow"]>[0] | undefined;
	return {
		follow(next) {
			sink = next;
			return () => {
				sink = undefined;
			};
		},
		refresh() {
			sink?.applied(++revision, named);
		},
	};
}

/** The viewer's primary input is a finger. */
function touchFirst(): boolean {
	return window.matchMedia("(pointer: coarse)").matches;
}
