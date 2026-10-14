import { Hono } from "hono";
import { validator } from "hono/validator";
import { writeAtomic } from "../atomic-write";
import { isFramePath } from "../page-path";
import { elementSite, type LaneDeps, type MoveAsk, readRungs, revertSpan, textSite, type WriteSite } from "./hand-lane";
import { uncaughtNotice } from "./hand-notice";
import { fingerprintOf, parseEditedNodes, parseStamps, spanBetween } from "./hand-write";
import { type ResolveProject, withProject } from "./project-route";

/**
 * A planned write, landed (#314, #317).
 *
 * Every hand write answers the same three things, so they are said in one
 * place: where it went, what the file hashes to now, how the stamps on the
 * patched lines moved, and the patch that takes it back. A write that says
 * what the file already said writes nothing at all.
 */
const written = (root: string, site: Extract<WriteSite, { kind: "ok" }>) => {
	const undo = site.undo ?? spanBetween(site.source, site.text);
	if (site.text !== site.source) writeAtomic(site.file, site.text);
	const after = fingerprintOf(site.text);
	return {
		ok: true as const,
		path: site.path,
		fingerprint: after,
		shifts: site.shifts,
		undo: { path: site.path, ...undo, fingerprint: after },
		// the one project with nothing catching a hand edit hears so once
		...(site.text !== site.source && uncaughtNotice(root) ? { uncaught: true as const } : {}),
	};
};

/** The selection's read (#256): one frame, and the ancestry's stamps, root first. */
const rungsBody = validator("json", (value, c) => {
	const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	const sources = parseStamps(body.sources);
	if (typeof body.frame !== "string" || !isFramePath(body.frame) || sources === undefined) {
		return c.text('a read is { "frame", "sources": [ "frames/…/frame.tsx:12:4" ] }', 400);
	}
	return { frame: body.frame, sources };
});

/**
 * A text commit (#314): one element's words as the frame has them now,
 * addressed by its stamp and measured against the file the element was read
 * from. A stamp is a place in a file the daemon is about to open, so the
 * shape is strict.
 */
const textBody = validator("json", (value, c) => {
	const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	const stamps = parseStamps([body.source, ...(body.owner === undefined ? [] : [body.owner])]);
	const nodes = parseEditedNodes(body.nodes);
	if (
		typeof body.frame !== "string" ||
		!isFramePath(body.frame) ||
		stamps === undefined ||
		nodes === undefined ||
		typeof body.fingerprint !== "string"
	) {
		return c.text('a text edit is { "frame", "source", "nodes", "owner"?, "fingerprint" }', 400);
	}
	if (body.ownerFingerprint !== undefined && typeof body.ownerFingerprint !== "string") {
		return c.text("a call site carries the fingerprint it was read at", 400);
	}
	const [source, owner] = stamps;
	if (source === undefined) return c.text("a text edit names the element it is on", 400);
	return {
		frame: body.frame,
		source,
		nodes,
		fingerprint: body.fingerprint,
		...(owner === undefined ? {} : { owner }),
		...(typeof body.ownerFingerprint === "string" ? { ownerFingerprint: body.ownerFingerprint } : {}),
	};
});

/**
 * A structural change (#317): a delete.
 *
 * The same shape as a text commit and for the same reasons — a stamp is a
 * place in a file the daemon is about to open, and the fingerprint is the
 * file the surface formed the gesture against. No call site rides along:
 * a delete of something that is all of a component refuses, and deleting
 * the call instead is its own gesture on the call's own stamp (#317).
 */
const elementBody = validator("json", (value, c) => {
	const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	const stamps = parseStamps(body.sources);
	const says = 'an element write is { "frame", "act": "delete" | "move", "sources": [ "…:12:4" ], "fingerprint" }';
	if (
		typeof body.frame !== "string" ||
		!isFramePath(body.frame) ||
		(body.act !== "delete" && body.act !== "move") ||
		stamps === undefined ||
		typeof body.fingerprint !== "string"
	) {
		return c.text(says, 400);
	}
	if (body.act === "move") {
		const move = moveOf(body, stamps);
		if (typeof move === "string") return c.text(move, 400);
		return { frame: body.frame, fingerprint: body.fingerprint, ...move };
	}
	// A multi-pick deletes as one write, so its stamps are one file's: one
	// write is one fingerprint and one span, which is what makes it one
	// press of undo (#323).
	const files = new Set(stamps.map((stamped) => stamped.replace(/:\d+:\d+$/, "")));
	if (files.size > 1) return c.text("an element write is one file's", 400);
	// The row a delete is about (#324): the stamp of the JSX a `.map()`
	// renders, where in the array it stood, and the fingerprint of that
	// stamp's own file. A body carrying half of one has not decided.
	const held = typeof body.item === "object" && body.item !== null ? (body.item as Record<string, unknown>) : null;
	let item: { source: string; index: number; fingerprint: string } | undefined;
	if (held !== null) {
		const index = held.index;
		if (
			typeof held.source !== "string" ||
			parseStamps([held.source]) === undefined ||
			typeof index !== "number" ||
			!Number.isInteger(index) ||
			index < 0 ||
			typeof held.fingerprint !== "string" ||
			held.fingerprint === ""
		) {
			return c.text('a delete of one row is { "item": { "source", "index", "fingerprint" } }', 400);
		}
		item = { source: held.source, index, fingerprint: held.fingerprint };
	}
	return {
		frame: body.frame,
		act: "delete" as const,
		sources: stamps,
		fingerprint: body.fingerprint,
		...(item === undefined ? {} : { item }),
	};
});

/**
 * A reorder (#340): one element held, the sibling it lands beside and which
 * side, or a row of a list and the row it lands beside. The call one owner
 * up rides along for each, because only the frame knows it, and the lane
 * moves the call when the element is the whole of what a component returns.
 */
const moveOf = (body: Record<string, unknown>, stamps: string[]): string | Omit<MoveAsk, "fingerprint"> => {
	const says = 'a move is { "sources": [ one ], "place": "before" | "after", "target" | "item" }';
	const place = body.place;
	if (stamps.length !== 1 || (place !== "before" && place !== "after")) return says;
	const record = (value: unknown) =>
		typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
	const stamped = (value: unknown): value is string => typeof value === "string" && parseStamps([value]) !== undefined;
	const index = (value: unknown): value is number =>
		typeof value === "number" && Number.isInteger(value) && value >= 0;
	const owner = record(body.owner);
	if (body.owner !== undefined && (!stamped(owner?.source) || typeof owner?.fingerprint !== "string")) {
		return 'a move\'s call is { "owner": { "source", "fingerprint" } }';
	}
	const item = record(body.item);
	if (item !== undefined) {
		if (
			!stamped(item.source) ||
			!index(item.index) ||
			!index(item.target) ||
			typeof item.fingerprint !== "string" ||
			item.fingerprint === ""
		) {
			return 'a move of one row is { "item": { "source", "index", "target", "fingerprint" } }';
		}
		return {
			act: "move",
			sources: stamps,
			place,
			item: { source: item.source, index: item.index, target: item.target, fingerprint: item.fingerprint },
		};
	}
	const target = record(body.target);
	if (!stamped(target?.source) || (target.owner !== undefined && !stamped(target.owner))) {
		return 'a move names its sibling: { "target": { "source", "owner"? } }';
	}
	return {
		act: "move",
		sources: stamps,
		place,
		target: { source: target.source, ...(typeof target.owner === "string" ? { owner: target.owner } : {}) },
		...(owner !== undefined && stamped(owner.source) && typeof owner.fingerprint === "string"
			? { owner: { source: owner.source, fingerprint: owner.fingerprint } }
			: {}),
	};
};

/**
 * The patch that puts a hand edit back (#314): the run, and the file it
 * was taken of.
 */
const revertBody = validator("json", (value, c) => {
	const body = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
	const { path, start, end, text, fingerprint } = body;
	const spans = typeof start === "number" && typeof end === "number" && Number.isInteger(start);
	if (typeof path !== "string" || !spans || typeof text !== "string" || typeof fingerprint !== "string") {
		return c.text('a revert is { "path", "start", "end", "text", "fingerprint" }', 400);
	}
	if (!Number.isInteger(end) || start < 0 || end < start) return c.text("not a span", 400);
	return { path, start, end, text, fingerprint };
});

/**
 * The hand's write lane over HTTP (#256, #314, #317): the selection's read,
 * the text and structural writes, and the patch that puts one back. Each
 * plans in `hand-lane.ts`; a refusal is the lane's own no and comes back as
 * one.
 */
export function handRoutes(deps: {
	resolve: ResolveProject;
	/** The frames reading a shared file, as the graph last said: every click reads (DEV-299). */
	lastReaders: (root: string) => LaneDeps;
}) {
	return (
		new Hono()
			/*
			 * The read half (#256). The properties rail draws an element before
			 * anybody touches it, so it asks the same file the write lane parses:
			 * the name the author wrote, where it is written, and the fingerprint a
			 * write is measured against. Nothing here writes, and a stamp that hits
			 * nothing is part of the answer rather than an error.
			 */
			.post("/:project/rungs", rungsBody, async (c) =>
				withProject(c, deps.resolve, async (root) => {
					const { frame, sources } = c.req.valid("json");
					const read = await readRungs(root, frame, sources, deps.lastReaders(root));
					if (read.kind === "error") return c.text(read.message, read.status);
					return c.json({ rungs: read.rungs });
				}),
			)
			/*
			 * The write half of a text edit (#314). The frame already shows the
			 * words; this puts them in the file, once, and answers with the patch
			 * that takes them out again and how the stamps on that line moved.
			 */
			.post("/:project/text", textBody, async (c) =>
				withProject(c, deps.resolve, (root) => {
					const { frame, ...ask } = c.req.valid("json");
					const site = textSite(root, frame, ask);
					if (site.kind === "error") return c.text(site.message, site.status);
					if (site.kind === "refusal") return c.json({ ok: false, refusal: site.refusal }, 409);
					return c.json(written(root, site));
				}),
			)
			/*
			 * The structural write (#317, #340): a delete or a move.
			 * The frame already shows what happened; this puts it in the file, once,
			 * and answers with the patch that takes it back.
			 */
			.post("/:project/element", elementBody, async (c) =>
				withProject(c, deps.resolve, (root) => {
					const { frame, ...ask } = c.req.valid("json");
					const site = elementSite(root, frame, ask);
					if (site.kind === "error") return c.text(site.message, site.status);
					if (site.kind === "refusal") return c.json({ ok: false, refusal: site.refusal }, 409);
					return c.json(written(root, site));
				}),
			)
			// undo and redo (#314), planned and landed in `revertSpan`
			.post("/:project/revert", revertBody, async (c) =>
				withProject(c, deps.resolve, (root) => {
					const reverted = revertSpan(root, c.req.valid("json"));
					if (reverted.kind === "error") return c.text(reverted.message, reverted.status);
					if (reverted.kind === "refusal") return c.json({ ok: false, refusal: reverted.refusal }, 409);
					const { kind: _, ...answer } = reverted;
					return c.json({ ok: true, ...answer });
				}),
			)
	);
}
