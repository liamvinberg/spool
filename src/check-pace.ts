import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DesignBoundaryError, realDesignDir, resolveDesignPath } from "./daemon/design-path";
import { type FramePace, SLOW_PER_SECOND, scanPaces } from "./daemon/thumbs";

/** A frame the photo booth timed below `SLOW_PER_SECOND`. */
export interface SlowFrame extends FramePace {
	/** The frame's entry, relative to the project root. */
	path: string;
	/** Whether its folder changed after it was timed, so the booth owes it a new timing. */
	editedSince: boolean;
}

/**
 * Every frame whose last timing (booth.ts) was slow. Only a running daemon times
 * a frame, after an edit; this reads what it recorded, so the check itself
 * stays offline and a project nobody has opened has nothing to say here.
 */
export function slowFrames(root: string): SlowFrame[] {
	const designDir = realDesignDir(root);
	const slow: SlowFrame[] = [];
	for (const [frame, { timedAt, ...pace }] of scanPaces(root)) {
		if (pace.perSecond >= SLOW_PER_SECOND) continue;
		let folder: string;
		try {
			folder = resolveDesignPath(designDir, join(designDir, "frames", frame));
		} catch (error) {
			if (error instanceof DesignBoundaryError) continue;
			throw error;
		}
		const changed = lastChange(folder);
		// a pace outliving its frame is of nothing
		if (changed === undefined) continue;
		slow.push({ ...pace, path: join("design", "frames", frame, "frame.tsx"), editedSince: changed > timedAt });
	}
	return slow.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/** When any source directly in the frame's folder last changed, or nothing when it is no frame now. */
function lastChange(folder: string): number | undefined {
	try {
		const files = readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile());
		if (!files.some((entry) => entry.name === "frame.tsx")) return undefined;
		// the sidecar is where the frame sits on the canvas, which no timing is of
		const sources = files.filter((entry) => entry.name !== "frame.json");
		return Math.max(...sources.map((entry) => statSync(join(folder, entry.name)).mtimeMs));
	} catch {
		return undefined;
	}
}

/** The line `spool check` prints for one slow frame. */
export function describeSlowFrame(frame: SlowFrame): string {
	const density = frame.scale === 2 ? "at Retina density" : `at ${frame.scale}x density`;
	const rate = frame.perSecond < 1 ? "under 1 frame" : `${frame.perSecond} frames`;
	const stale = frame.editedSince ? " Timed before its latest edit." : "";
	return `${frame.path}: slow: drew ${rate} a second ${density} when last timed (smooth is 60; its longest took ${frame.slowestMs} ms). While it plays it holds back the whole canvas.${stale}`;
}
