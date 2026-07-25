import type { FlowEdge, Geometry, ProjectedFrame } from "../api";
import { type Box, boundsOf } from "./camera";

/**
 * Tidy: a layered drawing of the navigation graph (#34) over the frames the
 * canvas already holds — Sugiyama's four passes. Reverse the edges that close
 * a cycle so the graph reads one way, rank every frame by its longest walk
 * from an entry, order each rank so the threads cross as little as possible,
 * then place the frames along it. Groups that never link are laid out apart
 * and packed side by side, largest first.
 *
 * Sizes are never touched and nothing here talks to the daemon: tidy moves
 * frames, so it returns one gesture's worth of rects and the ordinary geometry
 * undo (#23) answers ⌘Z.
 */

export interface ArrangeOptions {
	/** World gap between neighbouring frames inside a rank. */
	gapX: number;
	/** World gap between ranks — room for the labels frames wear above them. */
	gapY: number;
	/** World gap between groups that never link, wider so the split reads. */
	gapGroup: number;
	/** Ordering sweeps; each walks the ranks once, alternating direction. */
	sweeps: number;
}

/** The hand-placed convention on Spool's own canvas is a 100-unit gutter. */
export const ARRANGE_DEFAULTS: ArrangeOptions = { gapX: 100, gapY: 200, gapGroup: 300, sweeps: 8 };

/** Shelves fill to a screen's proportion before wrapping, never a bare strip. */
const SHELF_ASPECT = 16 / 9;

/** No frame name holds it, so link keys never collide and lane ids stay apart. */
const SEP = "\u0000";
const key = (from: string, to: string) => `${from}${SEP}${to}`;

interface Link {
	from: string;
	to: string;
}

/** A rank slot: a frame, or the placeholder a long edge parks in one rank down. */
interface Slot {
	id: string;
	w: number;
	h: number;
	rank: number;
	/** Centre x, in the group's own space. */
	x: number;
}

function pushInto(map: Map<string, string[]>, at: string, value: string): void {
	const list = map.get(at);
	if (list === undefined) map.set(at, [value]);
	else list.push(value);
}

/** Both directions of one group's slot graph, keyed by slot id. */
function adjacency(edges: readonly Link[]): { above: Map<string, string[]>; below: Map<string, string[]> } {
	const above = new Map<string, string[]>();
	const below = new Map<string, string[]>();
	for (const edge of edges) {
		pushInto(above, edge.to, edge.from);
		pushInto(below, edge.from, edge.to);
	}
	return { above, below };
}

/**
 * The drawable graph: frame-to-frame links with both ends on the field, self
 * walks dropped and parallel walks merged. A declared destination no frame
 * answers to has no end to place, so it cannot shape the layout.
 */
function linksOf(names: ReadonlySet<string>, edges: readonly FlowEdge[]): Link[] {
	const seen = new Set<string>();
	const links: Link[] = [];
	for (const edge of edges) {
		if (edge.from === edge.to) continue;
		if (!names.has(edge.from) || !names.has(edge.to)) continue;
		if (seen.has(key(edge.from, edge.to))) continue;
		seen.add(key(edge.from, edge.to));
		links.push({ from: edge.from, to: edge.to });
	}
	return links;
}

/**
 * Pass one: lay the frames in a line that as few walks as possible run against,
 * then reverse the walks that still do — so the rest of the layout reads a DAG.
 * The line is the greedy Eades-Lin-Smyth sequence: peel off the frames nothing
 * leaves, then the frames nothing enters, and when neither exists take the one
 * with the most walks out for its walks in. A hub the whole prototype returns
 * to therefore stays an entry instead of being ranked as a destination.
 *
 * Ties are real — two frames that only walk to each other carry no direction of
 * their own — so `names` breaks them, and it arrives in the order the canvas
 * already reads. The reversal is a layout fiction that never leaves this
 * module: the canvas still draws every walk as it was declared.
 */
function acyclic(names: readonly string[], links: readonly Link[]): Link[] {
	const out = new Map<string, Set<string>>(names.map((name) => [name, new Set()]));
	const into = new Map<string, Set<string>>(names.map((name) => [name, new Set()]));
	for (const link of links) {
		out.get(link.from)?.add(link.to);
		into.get(link.to)?.add(link.from);
	}

	const left: string[] = [];
	const right: string[] = [];
	const live = new Set(names);
	const drop = (node: string) => {
		live.delete(node);
		for (const child of out.get(node) ?? []) into.get(child)?.delete(node);
		for (const parent of into.get(node) ?? []) out.get(parent)?.delete(node);
	};
	const degree = (node: string) => (out.get(node)?.size ?? 0) - (into.get(node)?.size ?? 0);

	while (live.size > 0) {
		const remaining = names.filter((name) => live.has(name));
		const sink = remaining.find((name) => out.get(name)?.size === 0);
		if (sink !== undefined) {
			right.unshift(sink);
			drop(sink);
			continue;
		}
		const source = remaining.find((name) => into.get(name)?.size === 0);
		if (source !== undefined) {
			left.push(source);
			drop(source);
			continue;
		}
		// Every frame both walks and is walked to: take the most source-like.
		// A hub ties on the difference with each screen returning to it — four
		// out, four back — so the count of walks out settles it, which is the
		// frame the prototype fans from.
		const best = remaining.reduce((a, b) => {
			const gap = degree(b) - degree(a);
			if (gap !== 0) return gap > 0 ? b : a;
			return (out.get(b)?.size ?? 0) > (out.get(a)?.size ?? 0) ? b : a;
		});
		left.push(best);
		drop(best);
	}

	const line = new Map([...left, ...right].map((name, at) => [name, at]));
	// reversing can land on a walk that already exists the other way: merge
	const forward = new Set<string>();
	const result: Link[] = [];
	for (const link of links) {
		const flip = (line.get(link.from) ?? 0) > (line.get(link.to) ?? 0);
		const from = flip ? link.to : link.from;
		const to = flip ? link.from : link.to;
		if (from === to || forward.has(key(from, to))) continue;
		forward.add(key(from, to));
		result.push({ from, to });
	}
	return result;
}

/** Pass two: each frame sits one rank below its deepest source — longest path. */
function ranksOf(names: readonly string[], links: readonly Link[]): Map<string, number> {
	const children = new Map<string, string[]>(names.map((name) => [name, []]));
	const pending = new Map<string, number>(names.map((name) => [name, 0]));
	for (const link of links) {
		children.get(link.from)?.push(link.to);
		pending.set(link.to, (pending.get(link.to) ?? 0) + 1);
	}
	const ranks = new Map<string, number>();
	const queue = names.filter((name) => pending.get(name) === 0);
	for (const name of queue) ranks.set(name, 0);
	for (let head = 0; head < queue.length; head += 1) {
		const node = queue[head];
		if (node === undefined) continue;
		const rank = ranks.get(node) ?? 0;
		for (const child of children.get(node) ?? []) {
			ranks.set(child, Math.max(ranks.get(child) ?? 0, rank + 1));
			const left = (pending.get(child) ?? 0) - 1;
			pending.set(child, left);
			if (left === 0) queue.push(child);
		}
	}
	// acyclic() guarantees every frame drains; a stray one still gets a rank
	for (const name of names) if (!ranks.has(name)) ranks.set(name, 0);
	return ranks;
}

/** The groups that never link, largest first — each is laid out on its own. */
function groupsOf(names: readonly string[], links: readonly Link[]): string[][] {
	const parent = new Map<string, string>(names.map((name) => [name, name]));
	const find = (node: string): string => {
		let root = node;
		while (parent.get(root) !== root) root = parent.get(root) ?? root;
		let walk = node;
		while (walk !== root) {
			const next = parent.get(walk) ?? root;
			parent.set(walk, root);
			walk = next;
		}
		return root;
	};
	for (const link of links) parent.set(find(link.from), find(link.to));

	const groups = new Map<string, string[]>();
	for (const name of names) {
		const root = find(name);
		const group = groups.get(root);
		if (group === undefined) groups.set(root, [name]);
		else group.push(name);
	}
	// biggest first, and a stable sort past that: the groups were collected in
	// the order the canvas reads, so frames the graph says nothing about keep
	// the order the hands gave them
	return [...groups.values()].sort((a, b) => b.length - a.length);
}

/**
 * The ranks of one group as ordered slots, with a placeholder parked in every
 * rank a long edge crosses. Placeholders carry no width but hold a lane open,
 * so a long walk gets its own corridor instead of cutting over frames.
 */
function slotRanks(
	group: readonly string[],
	links: readonly Link[],
	ranks: ReadonlyMap<string, number>,
	sizes: ReadonlyMap<string, Geometry>,
): { rows: Slot[][]; edges: Link[] } {
	const here = new Set(group);
	const depth = Math.max(...group.map((name) => ranks.get(name) ?? 0)) + 1;
	const rows: Slot[][] = Array.from({ length: depth }, () => []);
	for (const name of group) {
		const size = sizes.get(name);
		const rank = ranks.get(name) ?? 0;
		if (size === undefined) continue;
		rows[rank]?.push({ id: name, w: size.w, h: size.h, rank, x: 0 });
	}

	const edges: Link[] = [];
	let spacer = 0;
	for (const link of links.filter((link) => here.has(link.from))) {
		const from = ranks.get(link.from) ?? 0;
		const to = ranks.get(link.to) ?? 0;
		let previous = link.from;
		for (let rank = from + 1; rank < to; rank += 1) {
			const id = `${SEP}lane${spacer}`;
			spacer += 1;
			rows[rank]?.push({ id, w: 0, h: 0, rank, x: 0 });
			edges.push({ from: previous, to: id });
			previous = id;
		}
		edges.push({ from: previous, to: link.to });
	}
	return { rows, edges };
}

/** Adjacent-rank crossings for one ordering — the number the sweeps drive down. */
function crossings(rows: readonly Slot[][], above: ReadonlyMap<string, string[]>): number {
	let total = 0;
	for (let rank = 1; rank < rows.length; rank += 1) {
		const row = rows[rank] ?? [];
		const previous = new Map((rows[rank - 1] ?? []).map((slot, index) => [slot.id, index]));
		const pairs: [number, number][] = [];
		row.forEach((slot, index) => {
			for (const parent of above.get(slot.id) ?? []) {
				const at = previous.get(parent);
				if (at !== undefined) pairs.push([at, index]);
			}
		});
		for (let i = 0; i < pairs.length; i += 1) {
			for (let j = i + 1; j < pairs.length; j += 1) {
				const a = pairs[i];
				const b = pairs[j];
				if (a === undefined || b === undefined) continue;
				if ((a[0] - b[0]) * (a[1] - b[1]) < 0) total += 1;
			}
		}
	}
	return total;
}

const median = (values: readonly number[], fallback: number): number => {
	if (values.length === 0) return fallback;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	const low = sorted[mid - 1];
	const high = sorted[mid];
	if (sorted.length % 2 === 1) return high ?? fallback;
	return low === undefined || high === undefined ? fallback : (low + high) / 2;
};

/**
 * Pass three: sweep the ranks, putting each slot at the median position of its
 * neighbours in the rank just fixed. Every sweep is kept only if it crossed
 * fewer threads than the best ordering so far — the heuristic can wander, so
 * the best one seen wins rather than the last.
 */
function order(rows: Slot[][], edges: readonly Link[], sweeps: number): Slot[][] {
	const { above, below } = adjacency(edges);

	let current = rows.map((row) => [...row]);
	let best = current.map((row) => [...row]);
	let fewest = crossings(best, above);

	for (let sweep = 0; sweep < sweeps; sweep += 1) {
		const down = sweep % 2 === 0;
		const ranks = current.map((_, rank) => rank);
		for (const rank of down ? ranks.slice(1) : ranks.slice(0, -1).reverse()) {
			const fixed = new Map((current[down ? rank - 1 : rank + 1] ?? []).map((slot, at) => [slot.id, at]));
			const neighbours = down ? above : below;
			const keys = new Map(
				(current[rank] ?? []).map((slot, at) => {
					const seen = (neighbours.get(slot.id) ?? [])
						.map((id) => fixed.get(id))
						.filter((value): value is number => value !== undefined);
					return [slot.id, median(seen, at)];
				}),
			);
			current[rank] = [...(current[rank] ?? [])].sort((a, b) => (keys.get(a.id) ?? 0) - (keys.get(b.id) ?? 0));
		}
		const count = crossings(current, above);
		if (count < fewest) {
			fewest = count;
			best = current.map((row) => [...row]);
		}
		current = current.map((row) => [...row]);
	}
	return best;
}

/**
 * The closest feasible centres to where a rank's slots want to sit: least
 * squares under the ordering and the minimum gutter. Subtracting the running
 * minimum turns the gutter constraints into plain monotonicity, which
 * pool-adjacent-violators then solves exactly in one pass.
 */
export function packRank(desired: readonly number[], widths: readonly number[], gap: number): number[] {
	const floors: number[] = [];
	let running = 0;
	for (let i = 0; i < widths.length; i += 1) {
		if (i > 0) running += (widths[i - 1] ?? 0) / 2 + gap + (widths[i] ?? 0) / 2;
		floors.push(running);
	}

	const blocks: { sum: number; count: number }[] = [];
	for (const [i, want] of desired.entries()) {
		blocks.push({ sum: want - (floors[i] ?? 0), count: 1 });
		while (blocks.length > 1) {
			const last = blocks[blocks.length - 1];
			const prior = blocks[blocks.length - 2];
			if (last === undefined || prior === undefined) break;
			if (prior.sum / prior.count <= last.sum / last.count) break;
			blocks.length -= 2;
			blocks.push({ sum: prior.sum + last.sum, count: prior.count + last.count });
		}
	}

	const out: number[] = [];
	for (const block of blocks) {
		const mean = block.sum / block.count;
		for (let i = 0; i < block.count; i += 1) out.push(mean);
	}
	return out.map((value, i) => value + (floors[i] ?? 0));
}

const mean = (values: readonly number[], fallback: number): number =>
	values.length === 0 ? fallback : values.reduce((sum, value) => sum + value, 0) / values.length;

/** Pass four: settle each rank's centres toward its neighbours', order held. */
function place(rows: Slot[][], edges: readonly Link[], options: ArrangeOptions): void {
	const { above, below } = adjacency(edges);

	for (const row of rows) {
		const packed = packRank(
			row.map(() => 0),
			row.map((slot) => slot.w),
			options.gapX,
		);
		row.forEach((slot, i) => {
			slot.x = packed[i] ?? 0;
		});
	}

	const centres = new Map<string, number>();
	const readCentres = () => {
		centres.clear();
		for (const row of rows) for (const slot of row) centres.set(slot.id, slot.x);
	};

	for (let sweep = 0; sweep < options.sweeps; sweep += 1) {
		const down = sweep % 2 === 0;
		readCentres();
		const ranks = rows.map((_, rank) => rank);
		for (const rank of down ? ranks.slice(1) : ranks.slice(0, -1).reverse()) {
			const row = rows[rank];
			if (row === undefined) continue;
			const neighbours = down ? above : below;
			const desired = row.map((slot) =>
				mean(
					(neighbours.get(slot.id) ?? [])
						.map((id) => centres.get(id))
						.filter((value): value is number => value !== undefined),
					slot.x,
				),
			);
			const packed = packRank(
				desired,
				row.map((slot) => slot.w),
				options.gapX,
			);
			row.forEach((slot, i) => {
				slot.x = packed[i] ?? 0;
				centres.set(slot.id, slot.x);
			});
		}
	}
}

/** One group's frames as rects in the group's own space, top-left at the origin. */
function layoutGroup(
	group: readonly string[],
	links: readonly Link[],
	ranks: ReadonlyMap<string, number>,
	sizes: ReadonlyMap<string, Geometry>,
	options: ArrangeOptions,
): Record<string, Geometry> {
	const { rows, edges } = slotRanks(group, links, ranks, sizes);
	const ordered = order(rows, edges, options.sweeps);
	place(ordered, edges, options);

	const rects: Record<string, Geometry> = {};
	let top = 0;
	for (const row of ordered) {
		const height = Math.max(0, ...row.map((slot) => slot.h));
		for (const slot of row) {
			const size = sizes.get(slot.id);
			if (size === undefined) continue; // a lane holds space, never a rect
			rects[slot.id] = { x: slot.x - slot.w / 2, y: top + (height - slot.h) / 2, w: size.w, h: size.h };
		}
		top += height + options.gapY;
	}

	const boxes = Object.values(rects);
	if (boxes.length === 0) return rects;
	const bounds = boundsOf(boxes);
	for (const [name, rect] of Object.entries(rects)) {
		rects[name] = { ...rect, x: rect.x - bounds.x, y: rect.y - bounds.y };
	}
	return rects;
}

/**
 * The groups packed into shelves rather than one endless row: a page whose
 * frames barely link would otherwise become a strip tens of thousands of units
 * wide, which is worse to read than the hand-placed field it replaced. The
 * shelf width follows the total area, so the result keeps roughly the shape of
 * a screen however many groups there are.
 */
function shelve(
	groups: readonly { laid: Record<string, Geometry>; box: Box }[],
	options: ArrangeOptions,
): Record<string, Geometry> {
	if (groups.length === 0) return {};
	const widest = Math.max(...groups.map((group) => group.box.w));

	// groups differ in size, so no column count predicts the result: pack at
	// every candidate width and keep whichever field came out closest to shape
	let best: Record<string, Geometry> = {};
	let closest = Number.POSITIVE_INFINITY;
	for (let columns = 1; columns <= groups.length; columns += 1) {
		const packed = shelfPack(groups, columns * (widest + options.gapGroup) - options.gapGroup, options);
		const box = boundsOf(Object.values(packed));
		if (box.h <= 0) return packed;
		const miss = Math.abs(Math.log(box.w / box.h / SHELF_ASPECT));
		if (miss < closest) {
			closest = miss;
			best = packed;
		}
	}
	return best;
}

/** The groups laid left to right, wrapping to a new shelf past `width`. */
function shelfPack(
	groups: readonly { laid: Record<string, Geometry>; box: Box }[],
	width: number,
	options: ArrangeOptions,
): Record<string, Geometry> {
	const rects: Record<string, Geometry> = {};
	let left = 0;
	let top = 0;
	let shelf = 0;
	for (const { laid, box } of groups) {
		if (left > 0 && left + box.w > width) {
			top += shelf + options.gapGroup;
			left = 0;
			shelf = 0;
		}
		for (const [name, rect] of Object.entries(laid)) {
			rects[name] = { ...rect, x: rect.x + left, y: rect.y + top };
		}
		left += box.w + options.gapGroup;
		shelf = Math.max(shelf, box.h);
	}
	return rects;
}

/**
 * Tidy the given frames: same sizes, new places. The result keeps the
 * selection's top-left corner where it was, so the camera stays useful, and it
 * is deterministic — the same frames and edges always land the same way.
 */
export function arrange(
	frames: readonly ProjectedFrame[],
	edges: readonly FlowEdge[],
	overrides: Partial<ArrangeOptions> = {},
): Record<string, Geometry> {
	const options = { ...ARRANGE_DEFAULTS, ...overrides };
	if (frames.length === 0) return {};

	// the order the canvas already reads: it decides nothing the graph can
	// decide, and breaks the ties the graph genuinely cannot
	const names = [...frames]
		.sort((a, b) => a.y - b.y || a.x - b.x || a.name.localeCompare(b.name))
		.map((frame) => frame.name);
	const sizes = new Map(frames.map((frame) => [frame.name, { x: frame.x, y: frame.y, w: frame.w, h: frame.h }]));
	const links = linksOf(new Set(names), edges);
	const flowing = acyclic(names, links);
	const ranks = ranksOf(names, flowing);

	const laid = groupsOf(names, links)
		.map((group) => layoutGroup(group, flowing, ranks, sizes, options))
		.filter((group) => Object.keys(group).length > 0)
		.map((group) => ({ laid: group, box: boundsOf(Object.values(group)) }));
	const rects = shelve(laid, options);

	// land where the frames already were: tidy rearranges, it never travels
	const was = boundsOf(frames.map((frame) => ({ x: frame.x, y: frame.y, w: frame.w, h: frame.h })));
	const now = boundsOf(Object.values(rects));
	for (const [name, rect] of Object.entries(rects)) {
		rects[name] = {
			x: Math.round(rect.x - now.x + was.x),
			y: Math.round(rect.y - now.y + was.y),
			w: Math.round(rect.w),
			h: Math.round(rect.h),
		};
	}
	return rects;
}
