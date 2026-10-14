import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { diff3Merge } from "node-diff3";
import { writeAtomic } from "../atomic-write";
import { resolveDesignPath } from "./design-path";

/**
 * Merging a save the team set aside, the way git merges two branches: this machine's file and the team's, each
 * compared line by line with the version both were built on. Where they changed different lines, both changes
 * stand and nobody is asked anything. Where they changed the same lines, nothing is merged and the save stays set
 * aside, for its person to choose.
 *
 * The version both were built on is the one this copy last had from the team, so a copy keeps the bytes of each
 * text file it has from the team in `design/.spool/base`, which never travels, named by their hash.
 */

/** Bigger files than this are never merged, nor kept to merge with: a frame's source is a few kilobytes. */
export const MERGE_LIMIT_BYTES = 512_000;

function basesDir(designDir: string): string {
	return resolveDesignPath(designDir, join(designDir, ".spool", "base"));
}

/** A file's text, or nothing where it isn't text, or is too big to merge. */
function textOf(bytes: Uint8Array): string | undefined {
	if (bytes.byteLength > MERGE_LIMIT_BYTES || bytes.includes(0)) return undefined;
	try {
		return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
	} catch {
		return undefined;
	}
}

/** Keep the team's bytes of a file under their hash, to merge with later; only text is kept. */
export function keepBase(designDir: string, hash: string, bytes: Uint8Array): void {
	if (textOf(bytes) === undefined) return;
	const file = join(basesDir(designDir), hash);
	if (!existsSync(file)) writeAtomic(file, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}

/** The kept bytes of a version, by its hash. */
export function baseOf(designDir: string, hash: string): Buffer | undefined {
	try {
		return readFileSync(join(basesDir(designDir), hash));
	} catch {
		return undefined;
	}
}

/** Let go of every kept version but these. */
export function pruneBases(designDir: string, keep: ReadonlySet<string>): void {
	const dir = basesDir(designDir);
	let names: string[];
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of names) if (!keep.has(name)) rmSync(join(dir, name), { force: true });
}

/** A text's lines, each with its own ending, so joining them gives the text back exactly. */
function linesOf(text: string): string[] {
	return text.length === 0 ? [] : text.split(/(?<=\n)/);
}

/**
 * Both sides' changes to the version they were built on, as one file; nothing where either isn't text, or where
 * they changed the same lines differently.
 */
export function mergeText(base: Uint8Array, mine: Uint8Array, team: Uint8Array): Buffer | undefined {
	const o = textOf(base);
	const a = textOf(mine);
	const b = textOf(team);
	if (o === undefined || a === undefined || b === undefined) return undefined;
	const merged: string[] = [];
	for (const region of diff3Merge(linesOf(a), linesOf(o), linesOf(b), { excludeFalseConflicts: true })) {
		if (region.conflict !== undefined) return undefined;
		merged.push(...(region.ok ?? []));
	}
	return Buffer.from(merged.join(""), "utf8");
}
