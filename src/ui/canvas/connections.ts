import type { FlowEdge, FlowUnreadable, ProjectedFrame } from "../api";
import { pageOf } from "./pages";

/**
 * The inspector rail's connections tab (#58): one frame's whole outbound list,
 * read straight from the derived graph (#34). Same-page and cross-page
 * destinations are treated identically — this list is the only complete one,
 * and the only home for destinations no arrow on the canvas can reach.
 * Nothing here walks the prototype: a row is a place on the canvas.
 */

export interface ConnectionRow {
	target: string;
	/** The page the target sits on; null when no frame answers to the name. */
	page: string | null;
	certainty: FlowEdge["certainty"];
	/** A real session has taken this link since the source last changed. */
	verified: boolean;
	/** A declared destination no frame answers to — real information, never hidden. */
	missing: boolean;
}

export interface ConnectionGroup {
	/** The page these rows land on; null is the group of missing destinations. */
	page: string | null;
	rows: ConnectionRow[];
}

/**
 * A walk the frame declares whose destination the parser cannot read. It has
 * no target and so no page, which is why it cannot be a ConnectionRow: a
 * missing destination is a name nothing answers to, this is no name at all.
 * Naming it is the whole point — an unresolvable walk that renders as nothing
 * is indistinguishable from a frame with no walks.
 */
export interface UnreadableRow {
	/** Design-relative source file of the site. */
	path: string;
	line: number;
}

/** The unresolvable walks one frame declares, in source order per file. */
export function unreadableRows(frame: string, unreadable: readonly FlowUnreadable[]): UnreadableRow[] {
	return unreadable
		.filter((site) => site.frame === frame)
		.map(({ path, line }) => ({ path, line }))
		.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/** How many destinations the rail would list for a frame — the pill's count. */
export function outboundCount(frame: string, edges: readonly FlowEdge[]): number {
	return edges.filter((edge) => edge.from === frame).length;
}

/**
 * One frame's outbound links, grouped by the page they land on — the frame's
 * own page is just another group, in page order like the tree's, with the
 * destinations nothing answers to last in their own.
 */
export function connectionGroups(
	frame: string,
	edges: readonly FlowEdge[],
	frames: readonly ProjectedFrame[],
): ConnectionGroup[] {
	const pageByName = new Map(frames.map((candidate) => [candidate.name, pageOf(candidate)]));
	const rows: ConnectionRow[] = edges
		.filter((edge) => edge.from === frame)
		.map((edge) => ({
			target: edge.to,
			page: pageByName.get(edge.to) ?? null,
			certainty: edge.certainty,
			verified: edge.verified === true,
			missing: edge.missing === true || !pageByName.has(edge.to),
		}));

	// page order, the root page first as everywhere else; missing has no page
	const pages = [...new Set(rows.map((row) => row.page))].filter((page): page is string => page !== null).sort();
	const order: (string | null)[] = rows.some((row) => row.page === null) ? [...pages, null] : pages;

	return order.map((page) => ({
		page,
		rows: rows.filter((row) => row.page === page).sort((a, b) => a.target.localeCompare(b.target)),
	}));
}
