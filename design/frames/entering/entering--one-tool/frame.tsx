import { useEffect, useRef, useState } from "react";
import { HandIcon, SelectIcon } from "../../../shared/ui/spool-icons";
import {
	AnnotateIcon,
	DotGrid,
	FrameBox,
	Kbd,
	Law,
	MiniCart,
	MiniSettings,
	type Ring,
	Toolbar,
	type ToolSpec,
} from "../../../shared/ui/entering-stage";
import { SpoolShell } from "../../../shared/ui/spool-shell";

/**
 * entering — the ladder. One pointer tool, four gestures, no interact. Click
 * takes the frame (move, resize). Double-click enters it. ⌘ takes the element
 * under the cursor. Escape climbs back down one rung at a time. Annotate points
 * at exactly the same things; it only opens an input instead of a selection.
 * Try it: click the cart, drag it, double-click in, escape, then ⌘-click a row.
 */

type Mode = "select" | "hand" | "annotate";

const TOOLS: readonly ToolSpec[] = [
	{ id: "select", label: "select", kbd: "V", Icon: SelectIcon },
	{ id: "hand", label: "hand", kbd: "H", Icon: HandIcon },
	{ id: "annotate", label: "annotate", kbd: "C", Icon: AnnotateIcon, accent: true },
];

const FRAMES = ["cart", "settings"] as const;
type FrameName = (typeof FRAMES)[number];

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface Rung {
	name: string;
	rect: Rect;
}
/** An element pick is the whole ancestry plus where you stand on it. */
interface Pick {
	frame: FrameName;
	chain: Rung[];
	depth: number;
}
interface Pin {
	n: number;
	label: string;
	x: number;
	y: number;
	order: string;
}

export default function EnteringOneTool() {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [mode, setMode] = useState<Mode>("select");
	const [at, setAt] = useState<Record<FrameName, { x: number; y: number }>>({
		cart: { x: 500, y: 232 },
		settings: { x: 872, y: 300 },
	});
	const [selected, setSelected] = useState<FrameName | null>(null);
	const [entered, setEntered] = useState<FrameName | null>(null);
	const [pick, setPick] = useState<Pick | null>(null);
	const [meta, setMeta] = useState(false);
	const [hint, setHint] = useState<Rung | null>(null);
	const [pins, setPins] = useState<Pin[]>([]);
	const [draft, setDraft] = useState<{ label: string; x: number; y: number } | null>(null);
	const [text, setText] = useState("");
	const drag = useRef<{ name: FrameName; dx: number; dy: number; moved: boolean } | null>(null);

	const state = useRef({ entered, pick, selected, draft });
	state.current = { entered, pick, selected, draft };

	const rel = (el: HTMLElement): Rect => {
		const c = canvasRef.current?.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return { x: r.left - (c?.left ?? 0), y: r.top - (c?.top ?? 0), w: r.width, h: r.height };
	};
	const point = (e: { clientX: number; clientY: number }) => {
		const c = canvasRef.current?.getBoundingClientRect();
		return { x: e.clientX - (c?.left ?? 0), y: e.clientY - (c?.top ?? 0) };
	};

	/** Walk from the hit element up to the frame, collecting every named rung. */
	const chainAt = (target: EventTarget | null): Rung[] => {
		const chain: Rung[] = [];
		let cur = (target as HTMLElement | null)?.closest("[data-el]") ?? null;
		while (cur !== null && !cur.hasAttribute("data-frame")) {
			const name = cur.getAttribute("data-el");
			if (name !== null) chain.unshift({ name, rect: rel(cur) });
			cur = cur.parentElement;
		}
		return chain;
	};

	// the escape ladder: element rung → frame rung → frame → bare canvas
	const escape = () => {
		const s = state.current;
		if (s.draft !== null) {
			setDraft(null);
			setText("");
			return;
		}
		if (s.entered !== null) {
			setSelected(s.entered);
			setEntered(null);
			return;
		}
		if (s.pick !== null) {
			if (s.pick.depth > 0) setPick({ ...s.pick, depth: s.pick.depth - 1 });
			else {
				setSelected(s.pick.frame);
				setPick(null);
			}
			return;
		}
		setSelected(null);
	};

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "Meta" || e.key === "Control") setMeta(true);
			if (e.key === "Escape") {
				escape();
				return;
			}
			if (state.current.draft !== null || state.current.entered !== null) return;
			if (e.metaKey || e.ctrlKey) return;
			const k = e.key.toLowerCase();
			if (k === "v") setMode("select");
			else if (k === "h") setMode("hand");
			else if (k === "c") setMode("annotate");
			else if (e.key === "Enter" && state.current.selected !== null) setEntered(state.current.selected);
		};
		const up = (e: KeyboardEvent) => {
			if (e.key === "Meta" || e.key === "Control") {
				setMeta(false);
				setHint(null);
			}
		};
		const clear = () => {
			setMeta(false);
			setHint(null);
		};
		window.addEventListener("keydown", down);
		window.addEventListener("keyup", up);
		window.addEventListener("blur", clear);
		return () => {
			window.removeEventListener("keydown", down);
			window.removeEventListener("keyup", up);
			window.removeEventListener("blur", clear);
		};
		// biome-ignore lint/correctness/useExhaustiveDependencies: escape reads through a ref
	}, []);

	const annotating = mode === "annotate";
	const current = pick === null ? null : pick.chain[pick.depth];

	const ringOf = (name: FrameName): Ring =>
		entered === name ? "entered" : selected === name || pick?.frame === name ? "selected" : "none";

	const frameProps = (name: FrameName) => ({
		ring: ringOf(name),
		live: entered === name,
		hitTest: true,
		dim: entered !== null && entered !== name,

		// an inert frame never fires its own handlers: the canvas reads the DOM
		// under the cursor, it does not let the app act on the click
		onClickCapture: (e: React.MouseEvent) => {
			if (entered !== name) e.stopPropagation();
		},

		onPointerMove: (e: React.PointerEvent) => {
			if (entered !== null || drag.current !== null) return;
			if (!meta && !annotating) {
				if (hint !== null) setHint(null);
				return;
			}
			const chain = chainAt(e.target);
			setHint(chain[chain.length - 1] ?? null);
		},
		onPointerLeave: () => setHint(null),

		onPointerDown: (e: React.PointerEvent) => {
			// the pointer is the frame's now: the canvas must not see this press
			// at all, or it reads as a click on bare canvas and drops you out
			e.stopPropagation();
			if (entered === name) return;
			if (entered !== null) setEntered(null);

			if (annotating) {
				const chain = chainAt(e.target);
				const deepest = chain[chain.length - 1];
				openDraft(deepest === undefined ? name : `${name} · ${deepest.name}`, point(e));
				return;
			}

			// ⌘ takes the element under the cursor. Bare click takes the frame,
			// and takes only the frame: no silent descent into its DOM.
			if (e.metaKey || e.ctrlKey) {
				const chain = chainAt(e.target);
				if (chain.length > 0) {
					setPick({ frame: name, chain, depth: chain.length - 1 });
					setSelected(null);
					setHint(null);
				}
				return;
			}

			setPick(null);
			setSelected(name);
			const p = at[name];
			drag.current = { name, dx: e.clientX - p.x, dy: e.clientY - p.y, moved: false };
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		},

		onDoubleClick: (e: React.MouseEvent) => {
			if (annotating) return;
			e.stopPropagation();
			setPick(null);
			setSelected(null);
			setHint(null);
			setEntered(name);
		},

		labelSlot:
			entered === name ? (
				<span className="flex items-center gap-1.5 rounded-full border border-thread/40 bg-thread/10 px-1.5 py-px font-mono text-[9px] text-thread leading-none">
					live<span className="text-thread/60">esc</span>
				</span>
			) : null,
	});

	const openDraft = (label: string, p: { x: number; y: number }) => {
		setText("");
		setDraft({ label, x: p.x, y: p.y });
		setHint(null);
	};
	const commitDraft = () => {
		if (draft === null || text.trim() === "") {
			setDraft(null);
			setText("");
			return;
		}
		setPins((ps) => [...ps, { n: ps.length + 1, label: draft.label, x: draft.x, y: draft.y, order: text.trim() }]);
		setDraft(null);
		setText("");
	};

	const outline = current ?? (hint !== null && pick === null ? hint : null);
	const outlineIsPick = current !== null;

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} showCanvasControls={false}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the surface under test */}
			<div
				ref={canvasRef}
				onPointerDown={(e) => {
					if (draft !== null) {
						setDraft(null);
						setText("");
						return;
					}
					if (annotating) {
						openDraft("canvas · here", point(e));
						return;
					}
					setEntered(null);
					setSelected(null);
					setPick(null);
				}}
				onPointerMove={(e) => {
					const d = drag.current;
					if (d === null) return;
					d.moved = true;
					setAt((cur) => ({ ...cur, [d.name]: { x: e.clientX - d.dx, y: e.clientY - d.dy } }));
				}}
				onPointerUp={() => {
					drag.current = null;
				}}
				className={cnCanvas(annotating)}
			>
				<DotGrid />

				<Law
					title="the ladder"
					law="One pointer tool. Click takes the frame, double-click goes inside it, ⌘ takes the element under the cursor. Escape climbs back down."
					rows={[
						{ keys: ["click"], does: "the frame: move, resize" },
						{ keys: ["dbl"], does: "enter it, live" },
						{ keys: ["⌘"], does: "the element under it" },
						{ keys: ["esc"], does: "down one rung" },
					]}
				/>

				<div className="absolute inset-0">
					<FrameBox name="cart" x={at.cart.x} y={at.cart.y} w={258} {...frameProps("cart")}>
						<MiniCart />
					</FrameBox>
					<FrameBox name="settings" x={at.settings.x} y={at.settings.y} w={236} {...frameProps("settings")}>
						<MiniSettings />
					</FrameBox>
				</div>

				{outline !== null && entered === null ? (
					<div
						className="pointer-events-none absolute z-10"
						style={{ left: outline.rect.x, top: outline.rect.y, width: outline.rect.w, height: outline.rect.h }}
					>
						<span
							className={`absolute inset-0 rounded-[3px] border ${outlineIsPick ? "border-thread" : "border-thread/50 border-dashed"}`}
						/>
						<span className="-top-[17px] absolute left-0 whitespace-nowrap rounded-[3px] bg-thread px-1 py-px font-mono text-[9px] text-on-thread leading-none">
							{outline.name}
						</span>
					</div>
				) : null}

				{pins.map((p) => (
					<PinMark key={p.n} pin={p} />
				))}

				{draft !== null ? (
					<DraftInput
						draft={draft}
						n={pins.length + 1}
						text={text}
						setText={setText}
						commit={commitDraft}
						cancel={() => {
							setDraft(null);
							setText("");
						}}
					/>
				) : null}

				<Breadcrumb entered={entered} selected={selected} pick={pick} />

				<p className="pointer-events-none absolute right-8 bottom-28 max-w-[268px] text-right font-sans text-base text-muted leading-base">
					{entered !== null
						? "Inside. The frame owns the pointer and the keyboard until you escape."
						: annotating
							? "Annotate points at the same things ⌘ does. It just opens an input instead of a selection."
							: pick !== null
								? "Pointing at an element. This is what the agent reads, and what the inspector shows."
								: "Click a frame to take it. Drag it. Double-click to go inside. Hold ⌘ to reach an element."}
				</p>
			</div>

			<Toolbar
				tools={TOOLS}
				tool={entered !== null ? "inside" : mode}
				onTool={(id) => {
					setEntered(null);
					setMode(id as Mode);
				}}
				caption={
					entered !== null
						? `${entered} · esc to leave`
						: annotating
							? "click an element, a frame, or a spot"
							: mode === "hand"
								? "pan the canvas"
								: meta
									? "release to take frames again"
									: "click takes the frame · ⌘ takes the element"
				}
			/>
		</SpoolShell>
	);
}

function cnCanvas(annotating: boolean) {
	return `relative h-full w-full select-none overflow-hidden bg-canvas ${annotating ? "cursor-crosshair" : "cursor-default"}`;
}

/** Where you stand, spelled out: the rung the next escape drops you from. */
function Breadcrumb({
	entered,
	selected,
	pick,
}: {
	entered: string | null;
	selected: string | null;
	pick: Pick | null;
}) {
	const rungs: string[] =
		entered !== null
			? ["canvas", entered, "inside"]
			: pick !== null
				? ["canvas", pick.frame, ...pick.chain.slice(0, pick.depth + 1).map((r) => r.name)]
				: selected !== null
					? ["canvas", selected]
					: ["canvas"];
	return (
		<div className="pointer-events-none absolute bottom-8 left-6 flex items-center gap-1.5 font-mono text-2xs leading-3">
			{rungs.map((r, i) => (
				<span key={r} className="flex items-center gap-1.5">
					{i > 0 ? <span className="text-muted/30">/</span> : null}
					<span className={i === rungs.length - 1 ? "text-text" : "text-muted/50"}>{r}</span>
				</span>
			))}
			{rungs.length > 1 ? (
				<span className="ml-1.5 flex items-center gap-1 text-muted/40">
					<Kbd>esc</Kbd>
				</span>
			) : null}
		</div>
	);
}

function PinMark({ pin }: { pin: Pin }) {
	return (
		<div className="group -translate-x-1/2 -translate-y-1/2 absolute z-20" style={{ left: pin.x, top: pin.y }}>
			<span className="flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
				{pin.n}
			</span>
			<div className="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden w-max max-w-[220px] group-hover:block">
				<div className="rounded-md border border-border-raised bg-bg/95 px-2.5 py-1.5 backdrop-blur">
					<p className="font-sans text-sm text-text leading-sm">{pin.order}</p>
					<p className="mt-0.5 font-mono text-2xs text-muted leading-3">{pin.label}</p>
				</div>
			</div>
		</div>
	);
}

function DraftInput({
	draft,
	n,
	text,
	setText,
	commit,
	cancel,
}: {
	draft: { label: string; x: number; y: number };
	n: number;
	text: string;
	setText: (v: string) => void;
	commit: () => void;
	cancel: () => void;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: input shell, clicks kept off the canvas
		<div
			className="-translate-y-1/2 absolute z-30"
			style={{ left: draft.x + 10, top: draft.y }}
			onPointerDown={(e) => e.stopPropagation()}
		>
			<div className="flex items-center gap-2 rounded-md border border-thread/70 bg-bg/95 py-1.5 pr-2 pl-1.5 backdrop-blur">
				<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
					{n}
				</span>
				{/* biome-ignore lint/a11y/noAutofocus: the draft opens to be typed into immediately */}
				<input
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") commit();
						else if (e.key === "Escape") cancel();
					}}
					placeholder="make this row denser"
					className="w-[196px] select-text bg-transparent font-sans text-base text-text leading-none outline-none placeholder:text-muted/40"
				/>
				<span className="flex items-center gap-1">
					<Kbd>esc</Kbd>
					<Kbd>⏎</Kbd>
				</span>
			</div>
			<span className="mt-1 ml-1 block font-mono text-2xs text-muted/60 leading-3">{draft.label}</span>
		</div>
	);
}
