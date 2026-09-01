import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { stylesheetFor } from "../lib/properties-families";
import { ELEMENTS, elementOf } from "../lib/properties-model";
import { cn } from "../lib/utils";
import { type AgentContext, type AgentEvent, AgentRail, StateMark } from "./spool-agent-rail";
import { type PageRow } from "./spool-canvas-chrome";
import { AgentIcon, ChevronIcon, FolderIcon, HandIcon, PanelCaret, PropertiesIcon, SelectIcon } from "./spool-icons";
import { PropertiesCart } from "./spool-properties-cart";
import { type Acts, type Geometry, type Pick, Rail, type Reading, type Rect } from "./spool-properties-rail";
import { SpoolShell } from "./spool-shell";

/**
 * The right column with two surfaces in it.
 *
 * Today the column holds one thing. `properties-rail.tsx` took it back for
 * direct manipulation (#256) and the agent rail, which is gated behind the
 * `agent-panel` experiment (#238), stands beside it as a 44px strip you press:
 * pressing one shuts the other, because 300 and 420 side by side leave 472px of
 * field at 1440. That is `--beside`, and it is the shipped shape drawn here as
 * the baseline every other take is a diff against.
 *
 * The question the other four ask is what the column looks like once the agent
 * is a surface the product ships rather than a flag one machine switched on.
 * The whole vocabulary is here rather than in each take: the strip is 44, the
 * properties panel is 300, the agent panel is 420, and a shut surface still has
 * to be able to say that something happened in it.
 *
 * `--stack` won, so the motion is drawn where the winner is: `DockMotion` is
 * the second flag, and what moves is the column's edge and the opacity of what
 * stands in it. Nothing inside either rail ever re-lays.
 *
 * The field is the properties surface's own document — kaffe's cart, live, with
 * the rail from `spool-properties-rail.tsx` reading and writing it — so
 * selecting an element fills the properties side for real. The agent side is a
 * settled transcript in `spool-agent-rail.tsx`'s cells with its tab row taken
 * away, which is the rail as #144 left it. Press ⏎ anywhere to run a turn: the
 * agent goes to work on the frame, which is the moment every take has to answer
 * for, since it is when the surface you are not looking at has something to say.
 */

export type DockTake = "beside" | "stack" | "split" | "over" | "swap";

/**
 * How the `stack` column moves, which is the second question the take asks
 * (#267 is where the agent is switched on; this is what happens when it is).
 *
 *   eased  the house curve: the column's edge travels 300ms, the surfaces cross
 *          at 120ms, and neither rail re-lays while it happens
 *   fixed  both surfaces are laid out at 420, so pressing a glyph never moves
 *          the edge and the only motion is the cross
 *   cut    nothing transitions, which is where the other two are read from
 */
export type DockMotion = "eased" | "fixed" | "cut";

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"], active: true, open: true },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
];

const FRAME = "cart";
const STRIP_W = 44;
const PROPERTIES_W = 300;
const AGENT_W = 420;

/* ---------- the conversation ----------
 * One turn already settled on the same document the field is holding, and one
 * the human starts. The chip is the selection, which is the whole reason these
 * two surfaces want the same column: they are both about the thing you picked. */

const PROMO: AgentContext = { frame: "cart", element: "promo", lines: "20" };
const PAY: AgentContext = { frame: "cart", element: "pay", lines: "44" };

const SETTLED: readonly AgentEvent[] = [
	{ kind: "user", text: "make the promo strip one line on a narrow screen", context: PROMO },
	{ kind: "tool", tool: "read", label: "frames/app/cart/frame.tsx", state: "completed", detail: "214 lines", meta: "214" },
	{
		kind: "tool",
		tool: "edit",
		label: "frames/app/cart/frame.tsx",
		state: "completed",
		diff: { added: 3, removed: 1 },
		detail: "1 hunk at line 20",
		repainted: "cart",
	},
	{ kind: "assistant", text: "The strip holds one line under 380px. The label stays, the second row goes." },
];

const ASKED: AgentEvent = { kind: "user", text: "give pay a taller tap target", context: PAY };
const WORKING_ROWS: readonly AgentEvent[] = [
	{ kind: "thinking", text: "reading the footer" },
	{ kind: "tool", tool: "read", label: "frames/app/cart/frame.tsx", state: "running", meta: "44" },
];
const LANDED: readonly AgentEvent[] = [
	{
		kind: "tool",
		tool: "edit",
		label: "frames/app/cart/frame.tsx",
		state: "completed",
		diff: { added: 2, removed: 2 },
		detail: "1 hunk at line 44",
		repainted: "cart",
	},
	{ kind: "assistant", text: "Pay is 48px tall now, with the label centred on the new height." },
];

/** how long the scripted turn runs before it lands, in ms */
const TURN_MS = 4200;

type Surface = "properties" | "agent";

/* ---------- the document ---------- */

type Snapshot = { classes: Record<string, string>; texts: Record<string, string>; frame: Geometry };

const INITIAL: Snapshot = {
	classes: Object.fromEntries(ELEMENTS.map((element) => [element.id, element.className ?? ""])),
	texts: {},
	frame: { x: 1740, y: 96, w: 300, h: 640 },
};

const ORIGINAL = new Map(
	ELEMENTS.map((element) => [element.id, new Set((element.className ?? "").split(/\s+/).filter(Boolean))]),
);

/** where the cart stands in the field, which is a coordinate rather than a camera */
const STAGE = { left: 340, top: 84 } as const;

export function DockScreen({
	take,
	argues,
	motion: character = "eased",
}: {
	take: DockTake;
	argues?: string | undefined;
	motion?: DockMotion | undefined;
}) {
	const [state, setState] = useState<Snapshot>(INITIAL);
	const [history, setHistory] = useState<readonly Snapshot[]>([]);
	const [selection, setSelection] = useState<Pick | null>({ id: "pay", key: "pay" });
	const [hover, setHover] = useState<Pick | null>(null);
	const [boxes, setBoxes] = useState<ReadonlyMap<string, Rect>>(new Map());
	const fieldRef = useRef<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement | null>(null);

	/* ---------- the turn ---------- */

	const [events, setEvents] = useState<readonly AgentEvent[]>(SETTLED);
	const [working, setWorking] = useState(false);
	/** the turn landed while this surface was shut: the strip carries the dot */
	const [unread, setUnread] = useState(false);

	const send = useCallback(() => {
		setEvents([...SETTLED, ASKED, ...WORKING_ROWS]);
		setWorking(true);
	}, []);

	useEffect(() => {
		if (!working) return;
		const timer = setTimeout(() => {
			setEvents([...SETTLED, ASKED, ...LANDED]);
			setWorking(false);
			setUnread(true);
		}, TURN_MS);
		return () => clearTimeout(timer);
	}, [working]);

	/* ---------- the mock's stylesheet ---------- */

	const stylesheet = useMemo(
		() =>
			stylesheetFor(
				Object.entries(state.classes).map(([id, className]) => ({ hook: `[data-node="${id}"]`, className })),
			),
		[state.classes],
	);

	/* ---------- measuring ---------- */

	const measure = useCallback(() => {
		const field = fieldRef.current;
		const stage = stageRef.current;
		if (field === null || stage === null) return;
		const origin = field.getBoundingClientRect();
		const next = new Map<string, Rect>();
		for (const node of stage.querySelectorAll<HTMLElement>("[data-node]")) {
			const id = node.dataset.node ?? "";
			const key = node.dataset.key ?? id;
			const rect = node.getBoundingClientRect();
			next.set(`${id}:${key}`, {
				x: rect.left - origin.left,
				y: rect.top - origin.top,
				w: rect.width,
				h: rect.height,
			});
		}
		setBoxes(next);
	}, []);

	useLayoutEffect(measure, [measure, state]);
	useEffect(() => {
		addEventListener("resize", measure);
		let live = true;
		void document.fonts.ready.then(() => {
			if (live) measure();
		});
		return () => {
			live = false;
			removeEventListener("resize", measure);
		};
	}, [measure]);

	/* ---------- writing ---------- */

	const commit = useCallback((change: (snapshot: Snapshot) => Snapshot) => {
		setState((current) => {
			const next = change(current);
			if (next === current) return current;
			setHistory((stack) => [...stack, current]);
			return next;
		});
	}, []);

	const undo = useCallback(() => {
		setHistory((stack) => {
			const last = stack[stack.length - 1];
			if (last === undefined) return stack;
			setState(last);
			return stack.slice(0, -1);
		});
	}, []);

	const ascend = useCallback(() => {
		setSelection((held) => {
			if (held === null) return null;
			const element = elementOf(held.id);
			if (element?.parent === undefined || element.parent === null) return null;
			const parent = elementOf(element.parent);
			return parent === undefined ? null : { id: parent.id, key: parent.mapped === undefined ? parent.id : held.key };
		});
	}, []);

	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLTextAreaElement ||
				event.target instanceof HTMLSelectElement
			)
				return;
			if (event.key === "Escape") ascend();
			if (event.key === "Enter" && !working) {
				event.preventDefault();
				send();
			}
			if ((event.metaKey || event.ctrlKey) && event.key === "z") {
				event.preventDefault();
				undo();
			}
		};
		addEventListener("keydown", down);
		return () => removeEventListener("keydown", down);
	}, [ascend, send, undo, working]);

	/* ---------- pointing ---------- */

	const pickFrom = (target: EventTarget | null): Pick | null => {
		let node = target instanceof Element ? target : null;
		while (node !== null && stageRef.current?.contains(node)) {
			const id = node.getAttribute("data-node");
			if (id !== null) return { id, key: node.getAttribute("data-key") ?? id };
			node = node.parentElement;
		}
		return null;
	};

	/* ---------- what the rail reads ---------- */

	const element = selection === null ? null : (elementOf(selection.id) ?? null);
	const box = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
	const root = boxes.get("screen:screen") ?? { x: STAGE.left, y: STAGE.top, w: state.frame.w, h: state.frame.h };
	const reading: Reading | null =
		element === null || selection === null
			? null
			: {
					element,
					pick: selection,
					className: state.classes[element.id] ?? "",
					text:
						state.texts[element.id] ??
						(element.text !== undefined && "literal" in element.text ? element.text.literal : null),
					box: box ?? { x: 0, y: 0, w: 0, h: 0 },
					inFrame: box === undefined ? { x: 0, y: 0 } : { x: box.x - root.x, y: box.y - root.y },
					frame: state.frame,
					original: ORIGINAL.get(element.id) ?? new Set(),
				};

	const acts: Acts = {
		setClass: (id, next) =>
			commit((snapshot) => ({ ...snapshot, classes: { ...snapshot.classes, [id]: next(snapshot.classes[id] ?? null) } })),
		setText: (id, text) => commit((snapshot) => ({ ...snapshot, texts: { ...snapshot.texts, [id]: text } })),
		setFrame: (patch) => commit((snapshot) => ({ ...snapshot, frame: { ...snapshot.frame, ...patch } })),
		select: (pick) => setSelection(pick),
		undo,
		canUndo: history.length > 0,
	};

	const properties = <Rail reading={reading} acts={acts} />;
	const agent = (
		<AgentRail
			head={null}
			density="wide"
			events={events}
			context={selection === null ? undefined : chipFor(selection)}
			usage={working ? "26.8k in context" : "24.1k in context"}
			working={working}
		/>
	);
	const agentLife = { working, unread };
	const onRead = () => setUnread(false);

	const dock =
		take === "over" ? null : (
			<Dock
				take={take}
				motion={character}
				properties={properties}
				agent={agent}
				life={agentLife}
				onRead={onRead}
				attention={selection}
				working={working}
			/>
		);

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "spool"]} zoom="100%">
			<style>{stylesheet}</style>
			<div className="flex h-full w-full overflow-hidden bg-bg">
				<PagesRail />
				<div className="relative min-w-0 flex-1 overflow-hidden bg-canvas">
					<div ref={fieldRef} className="absolute inset-0">
						<Still left={84} top={190} name="menu" />
						<div className="absolute flex flex-col gap-1.5" style={{ left: STAGE.left, top: STAGE.top - 22 }}>
							<button
								type="button"
								onClick={() => setSelection({ id: "screen", key: "screen" })}
								className="flex h-4 items-center gap-1.5 font-mono text-sm leading-4"
								style={{ width: state.frame.w }}
							>
								<span className={cn(selection?.id === "screen" ? "text-thread" : "text-muted")}>{FRAME}</span>
								<span className="ml-auto font-mono text-2xs text-muted/55 leading-3">
									{state.frame.w} × {state.frame.h}
								</span>
							</button>
							<div
								ref={stageRef}
								onPointerMove={(event) => setHover(pickFrom(event.target))}
								onPointerLeave={() => setHover(null)}
								onClick={(event) => {
									const pick = pickFrom(event.target);
									if (pick !== null) setSelection(pick);
								}}
								className="relative overflow-hidden rounded-[10px] border border-border bg-bg"
								style={{ width: state.frame.w, height: state.frame.h }}
							>
								<PropertiesCart classes={state.classes} texts={state.texts} elements={ELEMENTS} />
							</div>
						</div>
						<Still left={700} top={150} name="receipt" />
						<Rings boxes={boxes} hover={hover} selection={selection} />
					</div>
					{take === "over" ? (
						<Floating agent={agent} life={agentLife} onRead={onRead} />
					) : null}
					{argues === undefined ? null : (
						<p className="pointer-events-none absolute right-6 bottom-6 max-w-[42ch] text-right text-base text-muted leading-base">
							{argues}
						</p>
					)}
					<CanvasTools />
				</div>
				{take === "over" ? (
					<aside
						aria-label="properties"
						className="flex shrink-0 flex-col border-border border-l bg-bg"
						style={{ width: PROPERTIES_W }}
					>
						{properties}
					</aside>
				) : (
					dock
				)}
			</div>
		</SpoolShell>
	);
}

/** the composer's chip names what the canvas is holding, in the rail's own words */
function chipFor(pick: Pick): AgentContext {
	const element = elementOf(pick.id);
	return {
		frame: FRAME,
		element: element?.name ?? pick.id,
		lines: element?.line === undefined ? "1-214" : `${element.line}`,
	};
}

/* ---------- the docks ---------- */

interface Life {
	working: boolean;
	unread: boolean;
}

function Dock({
	take,
	motion: character,
	properties,
	agent,
	life,
	onRead,
	attention,
	working,
}: {
	take: Exclude<DockTake, "over">;
	motion: DockMotion;
	properties: ReactNode;
	agent: ReactNode;
	life: Life;
	onRead: () => void;
	attention: Pick | null;
	working: boolean;
}) {
	if (take === "beside") return <Beside properties={properties} agent={agent} life={life} onRead={onRead} />;
	if (take === "stack")
		return <Stack properties={properties} agent={agent} life={life} onRead={onRead} motion={character} />;
	if (take === "split") return <Split properties={properties} agent={agent} life={life} />;
	return <Swap properties={properties} agent={agent} attention={attention} working={working} />;
}

/**
 * beside — what ships today, with the experiment on.
 *
 * Two rails in the column, one open and one shut, and the shut one is a 44px
 * strip with its glyph in it. Pressing a strip opens that rail and collapses
 * the other, so the column is 344 or 464 and never 764.
 */
function Beside({
	properties,
	agent,
	life,
	onRead,
}: {
	properties: ReactNode;
	agent: ReactNode;
	life: Life;
	onRead: () => void;
}) {
	const [open, setOpen] = useState<Surface>("properties");
	return (
		<div className="flex h-full shrink-0">
			{open === "agent" ? (
				<Strip>
					<StripButton label="properties" lit={false} onPress={() => setOpen("properties")}>
						<PropertiesIcon className="h-4 w-4" />
					</StripButton>
				</Strip>
			) : (
				<Panel width={PROPERTIES_W} label="properties">
					{properties}
				</Panel>
			)}
			{open === "agent" ? (
				<Panel width={AGENT_W} label="agent">
					{agent}
				</Panel>
			) : (
				<Strip>
					<StripButton
						label="agent"
						lit={false}
						life={life}
						onPress={() => {
							setOpen("agent");
							onRead();
						}}
					>
						<AgentIcon className="h-4 w-4" />
					</StripButton>
				</Strip>
			)}
		</div>
	);
}

/**
 * stack — one strip on the edge, the surfaces listed down it.
 *
 * The strip stops being a rail's own shut state and becomes the column's index:
 * it is always 44px and always in the same place, the lit glyph says what the
 * panel is, and pressing the lit one shuts the column to the strip alone. What
 * it buys is that both surfaces are named in one place, and adding a third is a
 * glyph rather than another rail.
 */
function Stack({
	properties,
	agent,
	life,
	onRead,
	motion: character,
}: {
	properties: ReactNode;
	agent: ReactNode;
	life: Life;
	onRead: () => void;
	motion: DockMotion;
}) {
	const [open, setOpen] = useState<Surface | null>("properties");
	const eased = character !== "cut";
	/**
	 * How wide each surface is laid out.
	 *
	 * `fixed` gives both of them the agent's 420 so the edge never moves, which
	 * is the whole of that take. Everywhere else a surface keeps its own width
	 * and the column's edge travels the 120 between them.
	 */
	const width = (surface: Surface) =>
		character === "fixed" ? AGENT_W : surface === "agent" ? AGENT_W : PROPERTIES_W;
	const panel = open === null ? 0 : width(open);

	return (
		<div className="flex h-full shrink-0">
			{/*
			 * One panel, and both surfaces standing in it at their own width.
			 *
			 * The naive swap re-lays the arriving rail while the column is still
			 * moving: the properties rows squash through 120px of width on their way
			 * in, which is a whole surface reflowing to say "you pressed a button".
			 * So each surface is absolutely placed against the strip at the width it
			 * will settle at, the column clips them, and what actually animates is
			 * the edge and the opacity. Nothing inside either rail moves at all.
			 */}
			<div
				className={cn(
					"relative h-full shrink-0 overflow-hidden",
					eased && "transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
				)}
				style={{ width: panel }}
			>
				{(["properties", "agent"] as const).map((surface) => {
					const up = open === surface;
					return (
						<aside
							key={surface}
							aria-label={surface}
							aria-hidden={!up}
							className={cn(
								"absolute inset-y-0 right-0 flex flex-col border-border border-l bg-bg",
								eased && "transition-opacity duration-[120ms] ease-out motion-reduce:transition-none",
								up ? "opacity-100" : "pointer-events-none opacity-0",
							)}
							style={{ width: width(surface) }}
						>
							{surface === "agent" ? agent : properties}
						</aside>
					);
				})}
			</div>
			<Strip>
				<StripButton
					label="properties"
					lit={open === "properties"}
					eased={eased}
					onPress={() => setOpen((held) => (held === "properties" ? null : "properties"))}
				>
					<PropertiesIcon className="h-4 w-4" />
				</StripButton>
				<StripButton
					label="agent"
					lit={open === "agent"}
					eased={eased}
					life={life}
					onPress={() => {
						setOpen((held) => (held === "agent" ? null : "agent"));
						onRead();
					}}
				>
					<AgentIcon className="h-4 w-4" />
				</StripButton>
			</Strip>
		</div>
	);
}

/**
 * split — one column, both surfaces, a grip between them.
 *
 * Nothing is ever shut, so nothing has to announce itself: the turn arriving is
 * just the lower half moving. The column is 420 because the agent needs 420,
 * which is 120 more field spent all day for a surface that is idle most of it,
 * and the properties rows are the ones that pay for the height.
 */
function Split({ properties, agent, life }: { properties: ReactNode; agent: ReactNode; life: Life }) {
	const [share, setShare] = useState(0.46);
	const holder = useRef<HTMLDivElement | null>(null);
	const [dragging, setDragging] = useState(false);

	const onMove = (event: React.PointerEvent) => {
		if (!dragging) return;
		const box = holder.current?.getBoundingClientRect();
		if (box === undefined) return;
		const next = (event.clientY - box.top) / box.height;
		setShare(Math.min(0.74, Math.max(0.22, next)));
	};

	return (
		<div
			ref={holder}
			className="flex h-full shrink-0 flex-col border-border border-l bg-bg"
			style={{ width: AGENT_W }}
		>
			<div className="flex min-h-0 flex-col" style={{ height: `${share * 100}%` }}>
				<SectionHead icon={<PropertiesIcon className="h-3.5 w-3.5" />} name="properties" />
				<div className="min-h-0 flex-1 overflow-hidden">{properties}</div>
			</div>
			<button
				type="button"
				aria-label="resize"
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					setDragging(true);
				}}
				onPointerMove={onMove}
				onPointerUp={() => setDragging(false)}
				onPointerCancel={() => setDragging(false)}
				className="group relative h-3 shrink-0 cursor-row-resize touch-none outline-none"
			>
				<span className="absolute inset-x-0 top-[5px] h-px bg-border group-hover:bg-thread group-focus-visible:bg-thread" />
			</button>
			<div className="flex min-h-0 flex-1 flex-col">
				<SectionHead
					icon={<AgentIcon className="h-3.5 w-3.5" />}
					name="agent"
					mark={life.working ? <StateMark state="running" /> : null}
				/>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">{agent}</div>
			</div>
		</div>
	);
}

/**
 * swap — the column shows whatever you last acted on.
 *
 * No strip, no glyphs, nothing to press: picking an element brings the
 * properties up, running a turn brings the agent up, and the footer says which
 * of the two you are looking at and why. The pin is the escape hatch, and it is
 * the whole risk of the take — a surface that moves on its own is a surface you
 * cannot point at over someone's shoulder.
 */
function Swap({
	properties,
	agent,
	attention,
	working,
}: {
	properties: ReactNode;
	agent: ReactNode;
	attention: Pick | null;
	working: boolean;
}) {
	const [pinned, setPinned] = useState<Surface | null>(null);
	const [shown, setShown] = useState<Surface>("properties");
	const first = useRef(true);

	useEffect(() => {
		if (first.current) {
			first.current = false;
			return;
		}
		if (pinned === null) setShown("properties");
	}, [attention, pinned]);

	useEffect(() => {
		if (working && pinned === null) setShown("agent");
	}, [working, pinned]);

	const surface = pinned ?? shown;
	const element = attention === null ? null : elementOf(attention.id);

	return (
		<aside
			aria-label={surface}
			className="flex shrink-0 flex-col border-border border-l bg-bg"
			style={{ width: AGENT_W }}
		>
			<div className="min-h-0 flex-1 overflow-hidden">
				<div className="flex h-full flex-col">{surface === "agent" ? agent : properties}</div>
			</div>
			<div className="flex h-8 shrink-0 items-center gap-2 border-border border-t px-3">
				<span className="shrink-0 text-muted/70">
					{surface === "agent" ? <AgentIcon className="h-3.5 w-3.5" /> : <PropertiesIcon className="h-3.5 w-3.5" />}
				</span>
				<span className="min-w-0 truncate font-mono text-2xs text-muted/70 leading-3">
					{surface === "agent"
						? working
							? "agent · working on cart"
							: "agent · last turn"
						: `properties · ${element?.name ?? "nothing"}`}
				</span>
				<button
					type="button"
					onClick={() => setPinned((held) => (held === null ? surface : null))}
					className={cn(
						"ml-auto shrink-0 rounded-xs px-1.5 py-0.5 font-mono text-2xs leading-3",
						pinned === null ? "text-muted/50 hover:text-muted" : "bg-surface text-text",
					)}
				>
					{pinned === null ? "pin" : "pinned"}
				</button>
			</div>
		</aside>
	);
}

/**
 * over — the agent leaves the column and stands on the field.
 *
 * Properties keeps the rail it was given, so the column never moves and the
 * field only ever loses 300. The agent is a window: it opens where the pill is,
 * it drags by its head, and it goes away. What it costs is the one thing a rail
 * never does, which is cover the work.
 */
function Floating({ agent, life, onRead }: { agent: ReactNode; life: Life; onRead: () => void }) {
	const [open, setOpen] = useState(true);
	const [at, setAt] = useState({ x: 24, y: 88 });
	const held = useRef<{ x: number; y: number } | null>(null);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => {
					setOpen(true);
					onRead();
				}}
				className="absolute top-5 right-5 z-20 flex h-9 items-center gap-2 rounded-lg border border-border-raised bg-bg/90 pr-3 pl-2.5 backdrop-blur"
			>
				<AgentIcon className="h-4 w-4 text-muted" />
				<span className="font-mono text-muted text-xs leading-3">agent</span>
				{life.working ? <StateMark state="running" /> : life.unread ? <Dot /> : null}
			</button>
		);
	}

	return (
		<div
			className="absolute z-20 flex flex-col overflow-hidden rounded-lg border border-border-raised bg-bg"
			style={{ right: at.x, bottom: at.y, width: AGENT_W, height: 560 }}
		>
			<div
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					held.current = { x: event.clientX, y: event.clientY };
				}}
				onPointerMove={(event) => {
					const start = held.current;
					if (start === null) return;
					setAt((spot) => ({
						x: Math.max(12, spot.x - (event.clientX - start.x)),
						y: Math.max(12, spot.y - (event.clientY - start.y)),
					}));
					held.current = { x: event.clientX, y: event.clientY };
				}}
				onPointerUp={() => {
					held.current = null;
				}}
				className="flex h-9 shrink-0 cursor-grab touch-none items-center gap-2 border-border border-b px-3"
			>
				<AgentIcon className="h-3.5 w-3.5 text-muted" />
				<span className="font-mono text-muted text-xs leading-3">agent</span>
				{life.working ? <StateMark state="running" className="ml-1" /> : null}
				<button
					type="button"
					onClick={() => setOpen(false)}
					className="ml-auto font-mono text-2xs text-muted/50 leading-3 hover:text-muted"
				>
					close
				</button>
			</div>
			<div className="flex min-h-0 flex-1 flex-col">{agent}</div>
		</div>
	);
}

/* ---------- the column's parts ---------- */

function Panel({ width, label, children }: { width: number; label: string; children: ReactNode }) {
	return (
		<aside
			aria-label={label}
			className="flex h-full shrink-0 flex-col border-border border-l bg-bg"
			style={{ width }}
		>
			{children}
		</aside>
	);
}

/** the 44px edge: whatever is shut, drawn as the one control that opens it */
function Strip({ children }: { children: ReactNode }) {
	return (
		<div
			className="flex h-full shrink-0 flex-col items-center gap-1 border-border border-l bg-bg pt-2"
			style={{ width: STRIP_W }}
		>
			{children}
		</div>
	);
}

function StripButton({
	label,
	lit,
	life,
	eased = true,
	onPress,
	children,
}: {
	label: string;
	lit: boolean;
	life?: Life | undefined;
	eased?: boolean | undefined;
	onPress: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onPress}
			className={cn(
				"relative flex h-8 w-8 items-center justify-center rounded-sm",
				// the shipped rails' own press feel: colour in 140ms on the house
				// curve, and the glyph gives under the finger
				eased &&
					"transition-[background-color,color,transform] duration-[140ms] ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-90 motion-reduce:transition-none",
				lit ? "bg-surface text-text" : "text-muted/70 hover:text-text",
			)}
		>
			{children}
			{life === undefined || lit ? null : life.working ? (
				<StateMark state="running" className="-right-0.5 absolute top-0.5" />
			) : life.unread ? (
				<Dot className="-right-0.5 absolute top-1" eased={eased} />
			) : null}
		</button>
	);
}

/**
 * A turn that landed in a surface nobody was looking at.
 *
 * It arrives the way the canvas's own unseen mark does (`--animate-unseen-in`,
 * 200ms from 0.4): the point of the dot is that you notice it on the next
 * glance rather than at the instant it appears, so it grows into place and does
 * nothing after that. Nothing pulses. A mark that keeps moving is asking to be
 * dealt with now, and a finished turn is not an alarm.
 */
function Dot({ className, eased = true }: { className?: string | undefined; eased?: boolean | undefined }) {
	const still = useReducedMotion() === true;
	return (
		<motion.span
			className={cn("h-1.5 w-1.5 rounded-full bg-thread", className)}
			initial={eased && !still ? { opacity: 0, scale: 0.4 } : false}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.2, ease: [0.22, 0.61, 0.36, 1] }}
		/>
	);
}

function SectionHead({ icon, name, mark }: { icon: ReactNode; name: string; mark?: ReactNode }) {
	return (
		<div className="flex h-7 shrink-0 items-center gap-2 border-border border-b px-3">
			<span className="text-muted/70">{icon}</span>
			<span className="font-mono text-2xs text-muted leading-3">{name}</span>
			{mark === undefined ? null : <span className="ml-auto">{mark}</span>}
		</div>
	);
}

/* ---------- the field's furniture ---------- */

function PagesRail() {
	return (
		<aside className="flex w-[248px] shrink-0 flex-col border-border border-r bg-bg">
			<div className="flex h-11 shrink-0 items-center justify-between border-border border-b pr-2 pl-3.5">
				<div className="flex items-baseline gap-2">
					<h1 className="font-semibold text-base leading-base">Pages</h1>
					<span className="font-mono text-muted text-xs leading-xs">{PAGES.length}</span>
				</div>
				<span className="flex h-7 w-7 items-center justify-center rounded-sm text-muted/60">
					<PanelCaret dir="left" className="h-3.5 w-2.5" />
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden py-2">
				{PAGES.map((page) => (
					<div key={page.name}>
						<div className={cn("relative flex h-8 items-center pr-1.5", page.active === true && "bg-surface")}>
							{page.active === true ? (
								<span className="absolute top-1.5 bottom-1.5 left-0 w-[2px] rounded-full bg-thread" />
							) : null}
							<span className="flex h-8 w-6 shrink-0 items-center justify-center text-muted">
								<ChevronIcon open={page.open === true} className="h-2.5 w-2.5" />
							</span>
							<FolderIcon
								className={cn("h-3.5 w-3.5 shrink-0", page.active === true ? "text-thread" : "text-muted")}
							/>
							<span
								className={cn(
									"ml-2 min-w-0 flex-1 truncate font-mono text-sm leading-sm",
									page.active === true ? "text-text" : "text-muted",
								)}
							>
								{page.name}
							</span>
							<span className="font-mono text-2xs text-muted/60 leading-3">{page.frames.length}</span>
						</div>
						{page.open === true ? (
							<div className="relative pb-0.5">
								<span className="absolute top-0 bottom-1 left-[18px] w-px bg-border-raised" />
								{page.frames.map((frame) => (
									<div key={frame} className={cn("relative flex h-7 items-center", frame === FRAME && "bg-surface")}>
										<span className="absolute top-1/2 left-[18px] h-px w-2.5 bg-border-raised" />
										<span
											className={cn(
												"min-w-0 truncate pl-[34px] font-mono text-sm leading-sm",
												frame === FRAME ? "text-text" : "text-muted",
											)}
										>
											{frame}
										</span>
									</div>
								))}
							</div>
						) : null}
					</div>
				))}
			</div>
		</aside>
	);
}

function CanvasTools() {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center">
			<div className="flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
				<span className="flex h-9 w-9 items-center justify-center rounded-md bg-raised text-text">
					<SelectIcon className="h-[18px] w-[18px]" />
				</span>
				<span className="flex h-9 w-9 items-center justify-center rounded-md text-muted">
					<HandIcon className="h-[18px] w-[18px]" />
				</span>
			</div>
		</div>
	);
}

/** the hover ring and the selection ring, with no handles: the drag is #259's, not this page's */
function Rings({
	boxes,
	hover,
	selection,
}: {
	boxes: ReadonlyMap<string, Rect>;
	hover: Pick | null;
	selection: Pick | null;
}) {
	const selected = selection === null ? undefined : boxes.get(`${selection.id}:${selection.key}`);
	const hovered =
		hover === null || (selection !== null && hover.id === selection.id && hover.key === selection.key)
			? undefined
			: boxes.get(`${hover.id}:${hover.key}`);
	const isFrame = selection?.id === "screen";
	return (
		<div className="pointer-events-none absolute inset-0">
			{hovered === undefined ? null : (
				<span
					className="absolute rounded-[3px] border border-thread/55"
					style={{ left: hovered.x - 2, top: hovered.y - 2, width: hovered.w + 4, height: hovered.h + 4 }}
				/>
			)}
			{selected === undefined ? null : (
				<span
					className={cn("absolute border-[1.5px] border-thread", isFrame ? "rounded-[12px]" : "rounded-[3px]")}
					style={{
						left: selected.x - (isFrame ? 3 : 2),
						top: selected.y - (isFrame ? 3 : 2),
						width: selected.w + (isFrame ? 6 : 4),
						height: selected.h + (isFrame ? 6 : 4),
					}}
				/>
			)}
		</div>
	);
}

/** a neighbour on the field, so the frame under the pointer is a choice */
function Still({ left, top, name }: { left: number; top: number; name: string }) {
	return (
		<div className="absolute flex flex-col gap-1.5" style={{ left, top }}>
			<span className="font-mono text-muted text-sm leading-4">{name}</span>
			<div className="h-[430px] w-[200px] overflow-hidden rounded-[8px] border border-border bg-bg">
				<div className="flex h-full flex-col gap-2 p-3">
					<span className="h-3 w-14 rounded-full bg-surface" />
					<span className="h-20 w-full rounded-[4px] bg-surface" />
					<span className="h-1.5 w-[88%] rounded-full bg-raised" />
					<span className="h-1.5 w-[72%] rounded-full bg-raised" />
					<span className="h-1.5 w-[80%] rounded-full bg-raised" />
					<span className="mt-auto h-7 w-full rounded-[4px] bg-raised" />
				</div>
			</div>
		</div>
	);
}
