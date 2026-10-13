import type { FrameCopy } from "../../daemon/explorer";
import type { Geometry } from "../../daemon/geometry";
import { ROOT_PAGE } from "../../page-path";
import { type Box, boundsOf, intersects } from "./camera";

/** how far each fresh copy steps off the frame it was made from (#229) */
export const COPY_CASCADE_PX = 24;
/** how many steps a copy walks looking for a spot no frame already sits on */
const MAX_STEPS = 64;

interface Placed {
	readonly name: string;
	readonly page?: string | undefined;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/**
 * Where fresh copies stand.
 *
 * A duplicate copies the geometry sidecar verbatim (#228), so a copy left
 * where it came from would sit exactly on top of its original. The copies
 * step off their sources together, one step for the whole group so its
 * layout holds, and keep stepping while a frame already sits on any of the
 * spots, so a second ⌘D or ⌘V does not land on the first one.
 *
 * A paste onto the page in view whose sources are nowhere in sight (another
 * page, or scrolled away) lands in the middle of the view instead, its frames
 * keeping their places relative to each other: that is where the person is
 * looking when they press it.
 */
export function placeCopies(
	copies: readonly FrameCopy[],
	frames: readonly Placed[],
	how: { readonly beside: boolean; readonly viewPage: string; readonly view: Box | null },
): Record<string, Geometry> {
	const sources: { copy: FrameCopy; from: Placed }[] = [];
	for (const copy of copies) {
		const from = frames.find((frame) => frame.name === copy.from);
		if (from !== undefined) sources.push({ copy, from });
	}
	if (sources.length === 0) return {};

	const view = how.view;
	const centred =
		!how.beside &&
		view !== null &&
		sources.every(({ copy }) => (copy.page ?? ROOT_PAGE) === how.viewPage) &&
		!sources.some(({ from }) => (from.page ?? ROOT_PAGE) === how.viewPage && intersects(from, view));

	let dx = 0;
	let dy = 0;
	if (centred && view !== null) {
		const group = boundsOf(sources.map(({ from }) => from));
		dx = view.x + view.w / 2 - (group.x + group.w / 2);
		dy = view.y + view.h / 2 - (group.y + group.h / 2);
	}

	const taken = (page: string, x: number, y: number) =>
		frames.some(
			(frame) => (frame.page ?? ROOT_PAGE) === page && Math.round(frame.x) === x && Math.round(frame.y) === y,
		);
	// the group moves as one, so several copies keep the layout they had
	const at = (from: Placed, steps: number) => {
		const step = COPY_CASCADE_PX * steps;
		return { x: Math.round(from.x + dx + step), y: Math.round(from.y + dy + step) };
	};
	let steps = centred ? 0 : 1;
	while (
		steps < MAX_STEPS &&
		sources.some(({ copy, from }) => {
			const spot = at(from, steps);
			return taken(copy.page ?? ROOT_PAGE, spot.x, spot.y);
		})
	) {
		steps++;
	}

	const rects: Record<string, Geometry> = {};
	sources.forEach(({ copy, from }) => {
		rects[copy.to] = { ...at(from, steps), w: Math.round(from.w), h: Math.round(from.h) };
	});
	return rects;
}
