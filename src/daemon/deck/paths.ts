import { existsSync } from "node:fs";
import { join, sep } from "node:path";
import { frameOfPath } from "../events";
import { isPageFolder } from "../projection";

/**
 * A deck's page changed as a deck (spool#265): its `deck.json`, or a slide's `notes.md`. Never a frame's own change,
 * so no document reloads for it: a frame never imports its notes. Said only while the `deck` experiment is on.
 */
export interface DeckPageChange {
	kind: "deck";
	page: string;
}

/**
 * The deck a design-relative path changes, when it is a page's `deck.json` or the `notes.md` of a frame on a page
 * holding one; the files' staging names while they are written whole are the same change.
 */
export function deckOfPath(designDir: string, filename: string | null): DeckPageChange | undefined {
	if (filename === null) return undefined;
	const parts = filename.split(sep);
	const leaf = parts.at(-1) ?? "";
	if (parts[0] !== "frames" || parts.length < 3) return undefined;
	if (leaf.startsWith("deck.json")) {
		const page = parts.slice(1, -1);
		return isPageFolder(join(designDir, "frames", ...page)) ? { kind: "deck", page: page.join("/") } : undefined;
	}
	if (!leaf.startsWith("notes.md") || parts.length < 4) return undefined;
	const owner = frameOfPath(designDir, parts);
	if (owner === undefined || owner.rest.length !== 1) return undefined;
	const page = owner.frame.split("/").slice(0, -1);
	if (page.length === 0 || !existsSync(join(designDir, "frames", ...page, "deck.json"))) return undefined;
	return { kind: "deck", page: page.join("/") };
}
