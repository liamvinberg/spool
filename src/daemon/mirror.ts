import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join, posix } from "node:path";

/**
 * Mirrors (spool#232): a frame that shows another, written as code.
 *
 * A mirror's whole source is one re-export of another frame's entry,
 * `export { default } from "../../app/checkout/frame"`, beside a frame.json
 * of its own, so one screen stands in a client's folder or at a second width
 * without a copy to keep in step. There is no shortcut feature behind it:
 * spool only recognises the shape, so the rail can say whose mirror a row is,
 * and re-aims it when its original moves (`import-aim.ts`).
 */

/** Longer than any one-line re-export: a bigger entry is a frame of its own, and is not read past its size. */
const MIRROR_BYTES = 512;

const RE_EXPORT = /^export\s*\{\s*default\s*\}\s*from\s*(["'])(\.\.?\/[^"'\n]+)\1\s*;?$/;
const COMMENTS = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

/**
 * The frame a frame's source mirrors, by name, or undefined when it is not a
 * mirror: anything but the one re-export (comments aside), a specifier that
 * lands outside frames/ or on no frame's entry, or one naming itself.
 */
export function mirrorOf(source: string, frame: string, frames: ReadonlySet<string>): string | undefined {
	const spec = RE_EXPORT.exec(source.replace(COMMENTS, "").trim())?.[2];
	if (spec === undefined) return undefined;
	const target = posix.normalize(posix.join("frames", frame, spec)).replace(/\.tsx$/, "");
	if (!target.startsWith("frames/") || posix.basename(target) !== "frame") return undefined;
	const original = posix.dirname(target).slice("frames/".length);
	return original !== frame && frames.has(original) ? original : undefined;
}

/**
 * Every mirror among a project's frames, mirror to original. Each entry is
 * opened without following a link and read only when it is small enough to be
 * one line, so a project of large frames costs a stat per frame.
 */
export async function readMirrors(frames: readonly { name: string; dir: string }[]): Promise<Map<string, string>> {
	const names = new Set(frames.map((frame) => frame.name));
	const found = await Promise.all(
		frames.map(async (frame) => {
			const source = await smallEntry(frame.dir);
			const original = source === undefined ? undefined : mirrorOf(source, frame.name, names);
			return original === undefined ? [] : [[frame.name, original] as const];
		}),
	);
	return new Map(found.flat());
}

async function smallEntry(dir: string): Promise<string | undefined> {
	let handle: Awaited<ReturnType<typeof open>>;
	try {
		handle = await open(join(dir, "frame.tsx"), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
	} catch {
		return undefined;
	}
	try {
		if ((await handle.stat()).size > MIRROR_BYTES) return undefined;
		return await handle.readFile("utf8");
	} catch {
		return undefined;
	} finally {
		await handle.close();
	}
}
