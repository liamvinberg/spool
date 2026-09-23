import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { pageName } from "../../page-path";
import type { Geometry, RungRead } from "../api";
import { readRungs } from "../api";
import { cn } from "../cn";
import { MenuItem } from "./context-menu";
import type { PickedHit } from "./protocol";
import { NumField, popoverAt, Row, Section, useCloseOnPressAway, VALUE } from "./rail-fields";
import { PanelCaret } from "./sidebar";

/**
 * The properties rail (#256): the right column, holding one thing.
 *
 * Properties are what the column shows by default. Never a tab row: the agent
 * rail killed its own on purpose, and two rails side by side do not fit.
 * Where this surface stands, how wide it is and how it is reached are all
 * `dock.tsx`'s; what arrives here is a width and one act, which is that the
 * head's caret shuts the column.
 *
 * What it says about a frame is the frame's own geometry, which is
 * `frame.json` and never source. An element says the same about the frame it
 * is in, and nothing about itself (#339): its name is the label on the canvas,
 * its words are typed where they are drawn, and the rest is the agent's.
 */

/** the smallest a frame may be dragged or typed to, which is the canvas's own floor */
const FRAME_FLOOR = 80;

/**
 * What the canvas is holding, as the rail reads it.
 *
 * One rung at a time is what a properties surface means, so a selection of
 * several says how many and nothing else: there is no honest single value to
 * put in a field that stands for three elements.
 */
export type Held =
	| { kind: "frame"; name: string; geometry: Geometry }
	| { kind: "frames"; count: number }
	// a page standing on the field (#265). It has nothing editable: a page's name
	// is its folder, its place is the drag, and its size is derived from what is
	// inside it — so what the rail can say is what it is and how much is in it
	| { kind: "page"; page: string; name: string; count: number }
	| {
			kind: "element";
			frame: string;
			/** the frame the element is in, whose own fields the rail shows */
			geometry: Geometry;
			chain: readonly PickedHit[];
			selector: string;
	  }
	/**
	 * Several elements held at once (#323).
	 *
	 * Their stamps are read together, which is where a delete of all of them
	 * finds the file it is measured against — and it is one frame's, because a
	 * selection spread over two is two writes. `picks` is empty where they are
	 * spread, which is the count and nothing else; where they are one frame's,
	 * the rail shows that frame's own fields.
	 */
	| {
			kind: "elements";
			count: number;
			frame: string | null;
			geometry: Geometry | null;
			picks: readonly PickedHit[];
	  };

export interface PropertiesActs {
	onAsk?: () => void;
	/** the frame's own geometry, which is `frame.json` and never source */
	onGeometry: (name: string, patch: Partial<Geometry>) => void;
	/** a scrub tick: the screen follows, the file waits for the pointer to lift */
	onGeometryPreview: (name: string, patch: Partial<Geometry>) => void;
	/** the scrub let go: one write and one undo slot for the whole gesture */
	onGeometryCommit: (name: string, before: Geometry) => void;
}

export function PropertiesRail({
	recovery,
	held,
	acts,
	width,
	onCollapse,
}: {
	recovery?: ReactNode;
	held: Held | null;
	acts: PropertiesActs;
	/** what the dock has given this surface, which is its own remembered width */
	width: number;
	/** the caret in the head: it shuts the column rather than this rail (`dock.tsx`) */
	onCollapse: () => void;
}) {
	return (
		<section
			aria-label="Properties"
			data-properties-rail=""
			style={{ width }}
			className="flex h-full min-w-[200px] flex-col overflow-hidden border-border border-l bg-bg"
		>
			<Head held={held} acts={acts} onCollapse={onCollapse} />
			<div className="min-h-0 flex-1 overflow-y-auto [&>div:first-child]:border-t-0">
				<Body held={held} acts={acts} />
			</div>
			{recovery}
		</section>
	);
}

/* ---------- what the file says about the ancestry ---------- */

/** Which rung of the ancestry is held, or -1 when the chain no longer carries it. */
export function rungOf(held: Held | null): number {
	return held?.kind === "element" ? held.chain.findIndex((hit) => hit.selector === held.selector) : -1;
}

/**
 * The rungs' stamps, in rung order, down to and including the one held, and
 * which rung of the chain each one belongs to.
 *
 * A rung the file has no stamp for — DOM some code drew — is left out of the
 * ask rather than blanking the whole read, so the rungs above and below it
 * still say what the file calls them.
 */
export function stampsOf(held: Held | null): { frame: string; sources: string[]; rungs: number[] } | null {
	if (held?.kind === "elements") {
		if (held.frame === null) return null;
		const sources: string[] = [];
		const rungs: number[] = [];
		for (const [index, hit] of held.picks.entries()) {
			if (hit.source === null || hit.source === "") continue;
			sources.push(hit.source);
			rungs.push(index);
		}
		return sources.length === 0 ? null : { frame: held.frame, sources, rungs };
	}
	if (held?.kind !== "element") return null;
	const rung = rungOf(held);
	if (rung < 0) return null;
	const sources: string[] = [];
	const rungs: number[] = [];
	for (const [index, hit] of held.chain.slice(0, rung + 1).entries()) {
		const source = hit.source ?? "";
		if (source === "") continue;
		sources.push(source);
		rungs.push(index);
	}
	return sources.length === 0 ? null : { frame: held.frame, sources, rungs };
}

/**
 * The one read behind every hand write on a selection (#256, #259).
 *
 * The whole ancestry in one ask, answered once per selection: the fingerprint
 * every write on the held element is measured against, the fingerprints of
 * the files its ancestors are written in (where a call site one owner up
 * lives), and whether its words can be typed into (#339).
 *
 * What comes back is scattered back onto the chain, so a caller indexes it by
 * rung and gets nothing where a rung had no stamp to ask about. A read in
 * flight is nothing rather than the last rung's answer: a write measured
 * against the previous element's file would land somewhere wrong.
 */
export function useRungs(project: string, held: Held | null, revision: number): (RungRead | undefined)[] | null {
	const [answered, setAnswered] = useState<{ asked: string; on: string; rungs: RungRead[] } | null>(null);
	const ask = stampsOf(held);
	/**
	 * The whole ask on one line: the revision of the file, the frame, the stamps.
	 *
	 * A string, because what has to change for a re-read is the ask itself — and
	 * an object rebuilt on every render is not that, so the rail would ask the
	 * daemon again every time the pointer moved.
	 */
	const asked = ask === null ? "" : [String(revision), ask.frame, ...ask.sources].join("\n");
	/** which element the answer is about, which a re-read of it does not change */
	const on =
		held?.kind === "element"
			? `${held.frame}\n${held.selector}`
			: held?.kind === "elements"
				? `${held.frame}\n${held.picks.map((hit) => hit.selector).join(" ")}`
				: "";
	useEffect(() => {
		const [, frame, ...sources] = asked.split("\n");
		if (frame === undefined || sources.length === 0) return;
		let live = true;
		void readRungs(project, frame, sources).then((read) => {
			if (live && read !== undefined) setAnswered({ asked, on, rungs: read });
		});
		return () => {
			live = false;
		};
	}, [project, asked, on]);
	if (ask === null || answered === null) return null;
	// A re-read of the element already answered for is the hand's own write
	// coming back, and the last answer stands until it lands (#321): blanking
	// there would leave nothing to measure a write against for a round trip.
	if (answered.asked !== asked && (on === "" || answered.on !== on)) return null;
	const byRung: (RungRead | undefined)[] = [];
	for (const [index, rung] of ask.rungs.entries()) byRung[rung] = answered.rungs[index];
	return byRung;
}

/* ---------- the rail itself ---------- */

function Body({ held, acts }: { held: Held | null; acts: PropertiesActs }) {
	if (held === null) return <Empty says="select an element" />;
	if (held.kind === "frames") return <Empty says={`${held.count} frames`} />;
	if (held.kind === "page") return <PageFacts held={held} />;
	// an element, or several in one frame, shows the frame it is in (#338):
	// that frame's own geometry is all the rail sets
	const name = held.kind === "frame" ? held.name : held.frame;
	const geometry = held.geometry;
	if (name === null || geometry === null)
		return <Empty says={`${held.kind === "elements" ? held.count : 1} elements`} />;
	return <FrameGeometry key={name} name={name} geometry={geometry} acts={acts} />;
}

function Empty({ says }: { says: string }) {
	return (
		<div className="flex h-9 items-center px-2.5">
			<span className={cn("text-muted", VALUE)}>{says}</span>
		</div>
	);
}

/* ---------- the head ---------- */

/**
 * What the rail is about, by name: the frame held, or the frame the held
 * elements are in. The frame is the rail's subject either way, so it is the
 * frame's name that heads it; where in the frame an element sits is the
 * canvas's to show, on the element itself.
 */
function Head({ held, acts, onCollapse }: { held: Held | null; acts: PropertiesActs; onCollapse: () => void }) {
	const frame =
		held?.kind === "frame" ? held.name : held?.kind === "element" || held?.kind === "elements" ? held.frame : null;
	return (
		<div className="shrink-0 border-border border-b">
			<div className="flex h-9 items-center gap-2 px-2.5">
				<span data-properties-head="" className={cn("min-w-0 flex-1 truncate", VALUE)}>
					{frame === null ? <span className="text-muted">properties</span> : pageName(frame)}
				</span>
				{acts.onAsk && held ? <Actions onAsk={acts.onAsk} /> : null}
				<CollapseCaret onCollapse={onCollapse} />
			</div>
		</div>
	);
}

/**
 * The `⋯` in the head: what can be done about the thing held, which is to
 * hand it to the agent. It opens the canvas's own menu (`context-menu.tsx`)
 * rather than a list this surface invented.
 */
function Actions({ onAsk }: { onAsk: () => void }) {
	const opener = useRef<HTMLButtonElement | null>(null);
	const list = useRef<HTMLDivElement | null>(null);
	const [at, setAt] = useState<{ left: number; top: number } | null>(null);
	const shut = useCallback(() => setAt(null), []);
	useCloseOnPressAway(at !== null, shut, list, opener);
	const show = () => {
		const rect = opener.current?.getBoundingClientRect();
		if (rect !== undefined) setAt(popoverAt(rect, MENU_WIDTH, MENU_ROW + MENU_PAD));
	};
	return (
		<>
			<button
				ref={opener}
				type="button"
				aria-label="Element actions"
				aria-expanded={at !== null}
				onClick={() => (at === null ? show() : shut())}
				className={cn(
					"flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-xs text-text hover:bg-surface focus:outline-none",
					VALUE,
					at !== null && "bg-surface",
				)}
			>
				⋯
			</button>
			{at === null ? null : (
				<div
					ref={list}
					role="menu"
					aria-label="Element actions"
					style={{ left: at.left, top: at.top }}
					className="fixed z-50 flex w-[200px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
					onPointerDown={(event) => event.stopPropagation()}
				>
					<MenuItem
						label="Ask agent"
						onClick={() => {
							shut();
							onAsk();
						}}
					/>
				</div>
			)}
		</>
	);
}

/** the canvas menu's box, which the `⋯` opens a short one of */
const MENU_WIDTH = 200;
const MENU_ROW = 30;
const MENU_PAD = 8;

function CollapseCaret({ onCollapse }: { onCollapse: () => void }) {
	return (
		<button
			type="button"
			aria-label="Collapse properties"
			onClick={onCollapse}
			className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-muted/50 transition-colors hover:text-text"
		>
			<PanelCaret dir="right" className="h-3.5 w-2.5" />
		</button>
	);
}

/* ---------- the frame: frame.json, in raw pixels ---------- */

const AXES = [
	{ key: "x", of: "position" },
	{ key: "y", of: "position" },
	{ key: "w", of: "size" },
	{ key: "h", of: "size" },
] as const;

function FrameGeometry({ name, geometry, acts }: { name: string; geometry: Geometry; acts: PropertiesActs }) {
	// what the scrub started from: a whole drag is one write and one undo slot,
	// exactly as a corner drag is, so the file waits for the pointer to lift
	const scrubbed = useRef<Geometry | null>(null);
	const floor = (key: "x" | "y" | "w" | "h", value: number) =>
		key === "w" || key === "h" ? Math.max(FRAME_FLOOR, value) : value;
	const write = (key: "x" | "y" | "w" | "h", value: number) => {
		const floored = floor(key, value);
		if (floored === geometry[key]) return;
		acts.onGeometry(name, { [key]: floored });
	};
	const scrub = (key: "x" | "y" | "w" | "h", value: number) => {
		scrubbed.current ??= { ...geometry };
		const floored = floor(key, value);
		if (floored === geometry[key]) return;
		acts.onGeometryPreview(name, { [key]: floored });
	};
	const settle = () => {
		const before = scrubbed.current;
		scrubbed.current = null;
		if (before !== null) acts.onGeometryCommit(name, before);
	};
	const cancel = (key: "x" | "y" | "w" | "h") => {
		const before = scrubbed.current;
		scrubbed.current = null;
		if (before !== null) acts.onGeometryPreview(name, { [key]: before[key] });
	};
	return (
		<>
			{(["position", "size"] as const).map((section) => (
				<Section key={section} name={section} reason="frame.json">
					{AXES.filter((axis) => axis.of === section).map((axis) => (
						<Row
							key={axis.key}
							name={axis.key}
							onScrub={(units) => scrub(axis.key, geometry[axis.key] + units * 4)}
							onScrubEnd={settle}
							onScrubCancel={() => cancel(axis.key)}
						>
							<NumField
								value={String(Math.round(geometry[axis.key]))}
								readout="px"
								onCommit={(typed) => {
									const next = Number.parseInt(typed, 10);
									if (!Number.isNaN(next)) write(axis.key, next);
								}}
								onStep={(units) => write(axis.key, geometry[axis.key] + units * 4)}
							/>
						</Row>
					))}
				</Section>
			))}
		</>
	);
}

/**
 * What the rail can say about a page (#265): what it is called, where it lives,
 * and how much is under it.
 *
 * Nothing is editable, and that is the point rather than an omission. A page's
 * name is its folder and the rail renames it; its place is the drag itself; its
 * size is derived from the frames inside it, so a field for it would be a scale
 * control on a picture and would mean nothing about the project.
 */
function PageFacts({ held }: { held: Extract<Held, { kind: "page" }> }) {
	const rows: readonly [string, string][] = [
		["name", held.name],
		["path", `frames/${held.page}`],
		["frames", String(held.count)],
	];
	return (
		<Section name="page" reason="design/frames">
			{rows.map(([name, value]) => (
				<Row key={name} name={name}>
					<span className={cn("min-w-0 truncate", VALUE)}>{value}</span>
				</Row>
			))}
		</Section>
	);
}
