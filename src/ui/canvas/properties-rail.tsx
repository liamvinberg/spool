import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { pageName } from "../../page-path";
import type { Geometry, RungRead } from "../api";
import { readRungs } from "../api";
import { cn } from "../cn";
import { MenuItem } from "./context-menu";
import type { PickedHit } from "./protocol";
import { FAINT, NumField, popoverAt, Row, Section, useCloseOnPressAway, VALUE } from "./rail-fields";
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
 * `frame.json` and never source. What it says about an element is where it
 * sits: the crumbs, read off the file rather than off the document, so a
 * crumb says the name the author wrote.
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
	| { kind: "element"; frame: string; chain: readonly PickedHit[]; selector: string }
	/**
	 * Several elements held at once (#323).
	 *
	 * Their stamps are read together, which is where a delete of all of them
	 * finds the file it is measured against — and it is one frame's, because a
	 * selection spread over two is two writes. `picks` is empty where they are
	 * spread, which is the count and nothing else.
	 */
	| { kind: "elements"; count: number; frame: string | null; picks: readonly PickedHit[] };

export interface PropertiesActs {
	onAsk?: () => void;
	/** a crumb press: one rung of the ancestry, or the frame at the root of it */
	onRung: (frame: string, hit: PickedHit | null) => void;
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
	rungs,
	acts,
	width,
	onCollapse,
}: {
	recovery?: ReactNode;
	held: Held | null;
	/** the selection's one read (#256), indexed by rung; the canvas owns it */
	rungs: (RungRead | undefined)[] | null;
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
			<Head held={held} rungs={rungs} acts={acts} onCollapse={onCollapse} />
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
 * The one read behind everything a selection draws (#256, #259).
 *
 * The whole ancestry in one ask, answered once per selection and shared by
 * every reader of it: the rail's crumbs, and the fingerprint every hand write
 * on the held element is measured against. Two reads of the same rungs was two
 * round trips saying the same thing.
 *
 * What comes back is scattered back onto the chain, so a caller indexes it by
 * rung and gets nothing where a rung had no stamp to ask about. A read in
 * flight is nothing rather than the last rung's answer: crumbs fall back to
 * the live tags for a beat, and a write measured against the previous
 * element's file would land somewhere wrong.
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
	// coming back, and the crumbs go on saying what they said until it lands
	// (#321): blanking there would flash them for a round trip after each save.
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
	if (held.kind === "frame")
		return <FrameGeometry key={held.name} name={held.name} geometry={held.geometry} acts={acts} />;
	return null;
}

function Empty({ says }: { says: string }) {
	return (
		<div className="flex h-9 items-center px-2.5">
			<span className={cn("text-muted", VALUE)}>{says}</span>
		</div>
	);
}

/* ---------- the crumbs ---------- */

/**
 * `cart / main / CartRow`, and a press on any of them climbs.
 *
 * The frame is the root of the chain, which is what tells it apart from its
 * root element: the two are the same rectangle on screen and different things
 * to adjust, so the crumbs are the only place that says which one is held
 * (#254). A name is the one the author wrote where the file could be read, and
 * the live tag until it can be.
 */
function Head({
	held,
	rungs,
	acts,
	onCollapse,
}: {
	held: Held | null;
	rungs: (RungRead | undefined)[] | null;
	acts: PropertiesActs;
	onCollapse: () => void;
}) {
	const element = held?.kind === "element" ? held : null;
	const rung = rungOf(held);
	const walked = element === null || rung < 0 ? [] : element.chain.slice(0, rung + 1);
	const frame = element?.frame ?? (held?.kind === "frame" ? held.name : null);
	const steps: Step[] =
		frame === null
			? []
			: [
					// the frame by its own name: the canvas around the rail is already on its page
					{ key: `frame:${frame}`, name: pageName(frame), onPress: () => acts.onRung(frame, null) },
					...(element === null
						? []
						: walked.map((hit, index) => ({
								key: hit.selector,
								name: rungs?.[index]?.name ?? hit.tag,
								onPress: () => acts.onRung(element.frame, hit),
							}))),
				];
	return (
		<div className="shrink-0 border-border border-b">
			{/* the ruler under the trail is placed against this row, not against the page */}
			<div className="relative flex h-9 items-center gap-2 px-2.5">
				{steps.length === 0 ? (
					<span data-properties-crumbs="" className={cn("flex min-w-0 flex-1 items-center gap-1", VALUE)}>
						<span className={cn("text-muted", VALUE)}>properties</span>
					</span>
				) : (
					<Trail steps={steps} />
				)}
				{element === null ? null : <span className={cn("shrink-0", FAINT)}>{element.chain[rung]?.tag ?? ""}</span>}
				{acts.onAsk && held ? <Actions onAsk={acts.onAsk} /> : null}
				<CollapseCaret onCollapse={onCollapse} />
			</div>
		</div>
	);
}

/**
 * The `⋯` beside the crumbs: what can be done about the thing held, which is
 * to hand it to the agent. It opens the canvas's own menu (`context-menu.tsx`)
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

/** one crumb's worth of the trail: a name, and the rung a press on it climbs to */
interface Step {
	key: string;
	name: string;
	onPress: () => void;
}

/** the canvas menu's box, which the `…` opens a short one of */
const MENU_WIDTH = 200;
const MENU_ROW = 30;
const MENU_PAD = 8;

/**
 * The trail, showing the rungs nearest the one held and eliding the rest.
 *
 * A chain eight deep does not fit a 300px column, and the rule that let every
 * ancestor squeeze spent the width on `spoo… / d. / m… / d.` — a row that
 * names nothing and that nobody can press on purpose. So the frame at the root
 * and as many of the nearest rungs as fit read whole, and what is left over
 * collapses into a `…` that opens on the rungs it stands for. A trail should
 * always say something true about where you are, even when it cannot say all
 * of it.
 *
 * How many fit is measured rather than counted out, because the rail's width
 * is the reader's to drag (`rail-width.ts`). The ruler is the whole trail drawn
 * where nothing can see it: measuring the crumbs on screen would only ever say
 * how much of what is already shown fits, never whether one more would.
 */
function Trail({ steps }: { steps: readonly Step[] }) {
	const row = useRef<HTMLSpanElement | null>(null);
	const ruler = useRef<HTMLSpanElement | null>(null);
	const opener = useRef<HTMLButtonElement | null>(null);
	const list = useRef<HTMLDivElement | null>(null);
	const [near, setNear] = useState(steps.length - 1);
	const [menu, setMenu] = useState<{ chain: string; left: number; top: number } | null>(null);
	const shut = useCallback(() => setMenu(null), []);

	useLayoutEffect(() => {
		const box = row.current;
		const rule = ruler.current;
		if (box !== null && rule !== null) setNear(fitting(box.getBoundingClientRect().width, rule));
	});

	// the menu carries the trail it was opened on: a climb from anywhere else
	// would otherwise leave it standing, listing rungs nobody is under any more
	const chain = steps.map((step) => step.key).join(">");
	const at = menu?.chain === chain ? menu : null;
	useCloseOnPressAway(at !== null, shut, list, opener);

	const kept = Math.max(0, Math.min(near, steps.length - 1));
	const root = steps[0];
	const skipped = steps.slice(1, steps.length - kept);
	const nearest = steps.slice(steps.length - kept);

	const show = () => {
		const rect = opener.current?.getBoundingClientRect();
		if (rect === undefined) return;
		setMenu({ chain, ...popoverAt(rect, MENU_WIDTH, skipped.length * MENU_ROW + MENU_PAD) });
	};

	return (
		<>
			<span
				ref={row}
				data-properties-crumbs=""
				className={cn("flex min-w-0 flex-1 items-center gap-1 overflow-hidden", VALUE)}
			>
				{root === undefined ? null : (
					<Crumb name={root.name} last={steps.length === 1} squeezes={steps.length > 1} onPress={root.onPress} />
				)}
				{skipped.length === 0 ? null : (
					<Elision ref={opener} open={at !== null} onToggle={() => (at === null ? show() : shut())} />
				)}
				{nearest.map((step, index) => (
					<Crumb
						key={step.key}
						name={step.name}
						last={index === nearest.length - 1}
						squeezes={false}
						onPress={step.onPress}
					/>
				))}
			</span>
			{/* clipped to nothing rather than merely faded, so a long trail cannot
			    push the tag and the caret off the row while it is being measured */}
			<span aria-hidden="true" inert className="absolute top-0 left-0 h-0 w-0 overflow-hidden">
				<span ref={ruler} data-crumb-ruler="" className={cn("flex w-max items-center gap-1", VALUE)}>
					{root === undefined ? null : <Crumb name={root.name} last={false} squeezes={false} onPress={() => {}} />}
					<Elision open={false} onToggle={() => {}} />
					{steps.slice(1).map((step, index) => (
						<Crumb
							key={step.key}
							name={step.name}
							last={index === steps.length - 2}
							squeezes={false}
							onPress={() => {}}
						/>
					))}
				</span>
			</span>
			{at === null ? null : (
				<div
					ref={list}
					role="menu"
					aria-label="Skipped rungs"
					style={{ left: at.left, top: at.top }}
					className="fixed z-50 flex w-[200px] animate-menu-in flex-col rounded-md border border-border-raised bg-raised p-unit"
					onPointerDown={(event) => event.stopPropagation()}
				>
					{skipped.map((step) => (
						<MenuItem
							key={step.key}
							label={step.name}
							onClick={() => {
								shut();
								step.onPress();
							}}
						/>
					))}
				</div>
			)}
		</>
	);
}

/**
 * How many of the nearest rungs the row has room to draw whole.
 *
 * Read off the ruler, whose children are the whole trail with the `…` second,
 * so the gap the row sets between crumbs is measured here too rather than
 * restated as a number. The held rung is drawn whatever the answer: a trail
 * that names nothing is worse than one that runs past its edge.
 */
function fitting(available: number, ruler: HTMLElement): number {
	const boxes = [...ruler.children].map((child) => child.getBoundingClientRect());
	const root = boxes[0];
	const elision = boxes[1];
	if (root === undefined || elision === undefined) return 0;
	const gap = elision.left - root.right;
	const rungs = boxes.slice(2);
	const whole = rungs.reduce((width, box) => width + gap + box.width, root.width);
	if (whole <= available) return rungs.length;
	let width = root.width + gap + elision.width;
	for (let kept = 1; kept <= rungs.length; kept++) {
		width += gap + (rungs[rungs.length - kept]?.width ?? 0);
		if (width > available) return Math.max(1, kept - 1);
	}
	return rungs.length;
}

/** the face a crumb wears, worn by the `…` too so the ruler measures what will draw */
const FACE = "cursor-pointer truncate rounded-xs px-0.5 focus:outline-none focus-visible:bg-surface";

function Crumb({
	name,
	last,
	squeezes,
	onPress,
}: {
	name: string;
	last: boolean;
	/**
	 * The frame gives its width up first, and only once the elided trail has
	 * itself run out of room: everything the trail still draws reads whole.
	 */
	squeezes: boolean;
	onPress: () => void;
}) {
	return (
		<span className={cn("flex items-center gap-1", squeezes ? "min-w-0" : "shrink-0")}>
			<button
				type="button"
				onClick={onPress}
				className={cn(FACE, last ? "text-thread-strong" : "text-muted hover:text-text")}
			>
				{name}
			</button>
			{last ? null : <span className="shrink-0 text-muted">/</span>}
		</span>
	);
}

/**
 * The `…` the middle of the trail collapses into.
 *
 * It is a crumb like the others, so a press on it is the affordance the row
 * already teaches; what it opens is the canvas's own menu (`context-menu.tsx`)
 * rather than a list this surface invented, one item per rung it stands for,
 * outermost first.
 */
function Elision({ ref, open, onToggle }: { ref?: React.Ref<HTMLButtonElement>; open: boolean; onToggle: () => void }) {
	return (
		<span className="flex shrink-0 items-center gap-1">
			<button
				ref={ref}
				type="button"
				aria-label="Skipped rungs"
				aria-expanded={open}
				onClick={onToggle}
				className={cn(FACE, "text-muted hover:text-text", open && "bg-surface text-text")}
			>
				…
			</button>
			<span className="shrink-0 text-muted">/</span>
		</span>
	);
}

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
