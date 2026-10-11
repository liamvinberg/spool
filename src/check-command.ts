import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { checkProject } from "./check";
import { describeSlowFrame, slowFrames } from "./check-pace";
import { realDesignDir } from "./daemon/design-path";

/** What `spool check [paths…]` says: diagnostics and notes on stderr, the count line on stdout. */
export interface CheckOutput {
	stderr: string[];
	stdout: string[];
	ok: boolean;
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
 * diagnostics.
 */
export async function runCheck(root: string, cwd: string, paths: string[]): Promise<CheckOutput> {
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
	if (report.notChecked !== undefined) return { stderr: [report.notChecked], stdout: [], ok: false };
	for (const diagnostic of report.diagnostics) {
		stderr.push(
			`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`,
		);
	}
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
	const slow = slowFrames(root).filter((frame) => checked.has(frameName(frame.path)));
	for (const frame of slow) if (named.has(frameName(frame.path))) stderr.push(describeSlowFrame(frame));
	const unnamed = slow.filter((frame) => !named.has(frameName(frame.path))).map((frame) => frameName(frame.path));
	if (unnamed.length > 0) {
		const listed =
			unnamed.length > 5 ? `${unnamed.slice(0, 5).join(", ")} and ${unnamed.length - 5} more` : unnamed.join(", ");
		stderr.push(
			`${count(unnamed.length, "frame")} timed slow (${listed}); name one, as in spool check design/frames/${unnamed[0]}, to see why`,
		);
	}
	const errors = report.diagnostics.length;
	if (!report.ran) return { stderr, stdout: [`not checked: ${count(errors, "error")} stopped it`], ok: false };
	return {
		stderr,
		stdout: [
			`checked ${count(report.frames.length, "frame")} (${count(report.sources, "source file")}), ${count(errors, "error")}`,
		],
		ok: errors === 0,
	};
}

/** `design/frames/shop/checkout/frame.tsx` → `shop/checkout`. */
function frameName(path: string): string {
	return path.replace(/^design\/frames\//u, "").replace(/\/frame\.tsx$/u, "");
}

function count(n: number, noun: string): string {
	return `${n} ${noun}${n === 1 ? "" : "s"}`;
}
