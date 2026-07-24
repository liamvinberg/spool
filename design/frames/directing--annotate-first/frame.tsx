import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { CursorIcon, HandIcon, SelectIcon } from "../../shared/ui/spool-icons";
import { SpoolShell } from "../../shared/ui/spool-shell";

/**
 * directing — the annotate tool, canonical. This is the visual source of truth for
 * issue #56: annotate is a fourth canvas tool (key C) beside interact / select /
 * hand. Point at anything and it previews what you would hit — an element by name or
 * a whole frame by its label. Click, an order opens in place, type it in the human's
 * voice, Enter drops a numbered pin. Shift-click gathers several elements into one
 * dashed enclosure and C attaches a single shared order. Motion pauses the moment the
 * tool is up, so nothing shifts under your order. Pins live three moments — writing,
 * just written, waiting — collapse to numbered chips when they crowd, and a quiet
 * count in the chrome gathers what is still pending. Valid targets are elements and
 * frames; bare canvas takes no order.
 * Try it: click a row or a label; shift-click two rows, then press C.
 */

/* motion vocabulary — one strong ease-out for every enter/exit (the same curve the
 * house AnimatePresence uses), a soft settle spring for a pin taking hold, and timings
 * chosen deliberately: sub-200ms where the system answers, a held 2.6s beat only where
 * a fresh order asks to be read. Nothing here is a library default. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_CSS = "cubic-bezier(0.23,1,0.32,1)";
const SETTLE = { type: "spring", duration: 0.44, bounce: 0.24 } as const;
const FRESH_HOLD_MS = 2600;

type Tool = "interact" | "select" | "hand" | "annotate";

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface Sel {
	name: string;
	frame: boolean;
	rect: Rect;
}
interface Draft {
	targets: Sel[];
}
interface Pin {
	n: number;
	order: string;
	targets: Sel[];
	collapsed?: boolean;
}

/* the still life: one order in each state, over two live frames — elements and frames only */
const SEED_SPEC: { n: number; names: string[]; frame: boolean; order: string; collapsed?: boolean }[] = [
	{ n: 1, names: ["BryggkaffeRow", "HavremjolkRow"], frame: false, order: "make these denser" },
	{ n: 2, names: ["NotifyRow"], frame: false, order: "delete this" },
	{ n: 3, names: ["settings"], frame: true, order: "rework this" },
	{ n: 4, names: ["KanelbulleRow"], frame: false, order: "make the price bold", collapsed: true },
	{ n: 5, names: ["PromoField"], frame: false, order: "swap this for the terminal variant", collapsed: true },
];
const SEED_MAX_N = SEED_SPEC.reduce((m, s) => Math.max(m, s.n), 0);

function union(rects: Rect[]): Rect {
	const x = Math.min(...rects.map((r) => r.x));
	const y = Math.min(...rects.map((r) => r.y));
	const right = Math.max(...rects.map((r) => r.x + r.w));
	const bottom = Math.max(...rects.map((r) => r.y + r.h));
	return { x, y, w: right - x, h: bottom - y };
}
const NUB = 12; // how far a single-element pin hangs past the row's right edge, onto the frame border

function anchorOf(pin: { targets: Sel[] }): { x: number; y: number } {
	const box = union(pin.targets.map((t) => t.rect));
	if (pin.targets.length > 1) return { x: box.x - 8, y: box.y - 8 }; // shared: top-left of the enclosure
	if (pin.targets[0].frame) return { x: box.x - 4, y: box.y + 8 }; // frame: in the margin beside the label
	return { x: box.x + box.w + NUB, y: box.y + box.h / 2 }; // element: hanging off its right edge
}
function targetLabel(pin: { targets: Sel[] }): string {
	if (pin.targets.length > 1) return `${pin.targets.length} elements`;
	const t = pin.targets[0];
	return t.frame ? `${t.name} · frame` : t.name;
}

export default function DirectingAnnotate() {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [tool, setTool] = useState<Tool>("annotate");
	const [hover, setHover] = useState<Sel | null>(null);
	const [gather, setGather] = useState<Sel[]>([]);
	const [draft, setDraft] = useState<Draft | null>(null);
	const [text, setText] = useState("");
	const [pins, setPins] = useState<Pin[]>([]);
	const [freshN, setFreshN] = useState<number | null>(2);

	const annotate = tool === "annotate";

	const measure = (name: string): Rect | null => {
		const c = canvasRef.current;
		if (!c) return null;
		const el = c.querySelector(`[data-name="${CSS.escape(name)}"]`) as HTMLElement | null;
		if (!el) return null;
		const cr = c.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
	};
	const rel = (el: HTMLElement): Rect => {
		const cr = canvasRef.current?.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return { x: r.left - (cr?.left ?? 0), y: r.top - (cr?.top ?? 0), w: r.width, h: r.height };
	};

	// seed the still life once the real frames have laid out, so pins ride live geometry
	useLayoutEffect(() => {
		const built: Pin[] = [];
		for (const s of SEED_SPEC) {
			const rects = s.names.map(measure);
			if (rects.some((r) => r === null)) continue;
			built.push({
				n: s.n,
				order: s.order,
				collapsed: s.collapsed,
				targets: s.names.map((name, i) => ({ name, frame: s.frame, rect: rects[i] as Rect })),
			});
		}
		setPins(built);
	}, []);

	const openDraft = (d: Draft) => {
		setText("");
		setHover(null);
		setDraft(d);
	};
	const cancel = () => {
		setDraft(null);
		setText("");
		setGather([]);
	};
	const commit = () => {
		if (!draft || !text.trim()) {
			setDraft(null);
			setText("");
			return;
		}
		const nextN = pins.reduce((m, p) => Math.max(m, p.n), 0) + 1;
		const at = anchorOf({ targets: draft.targets });
		const collapsed =
			draft.targets.length === 1 &&
			pins.some((p) => {
				const a = anchorOf(p);
				return Math.hypot(a.x - at.x, a.y - at.y) < 46;
			});
		setPins((ps) => [...ps, { n: nextN, order: text.trim(), targets: draft.targets, collapsed }]);
		setFreshN(nextN);
		window.setTimeout(() => setFreshN((cur) => (cur === nextN ? null : cur)), FRESH_HOLD_MS);
		setDraft(null);
		setText("");
		setGather([]);
	};

	const openGather = () => {
		if (gather.length === 0) return;
		openDraft({ targets: gather });
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (draft) return;
			if (e.metaKey || e.ctrlKey) return;
			const k = e.key.toLowerCase();
			if (k === "c") {
				if (gather.length > 0) {
					e.preventDefault();
					openGather();
				} else setTool("annotate");
			} else if (k === "v") {
				setTool("select");
				setGather([]);
			} else if (k === "h") {
				setTool("hand");
				setGather([]);
			} else if (k === "i") {
				setTool("interact");
				setGather([]);
			} else if (e.key === "Escape") {
				setGather([]);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [draft, gather]);

	const api: PickApi = {
		annotate,
		leave: () => setHover(null),
		hoverEl: (name) => (e) => {
			if (!annotate || draft) return;
			setHover({ name, frame: false, rect: rel(e.currentTarget as HTMLElement) });
		},
		hoverFrame: (name) => (e) => {
			if (!annotate || draft) return;
			const frameEl = (e.currentTarget as HTMLElement).closest("[data-frame]") as HTMLElement | null;
			if (frameEl) setHover({ name, frame: true, rect: rel(frameEl) });
		},
		clickEl: (name) => (e) => {
			if (!annotate) return;
			e.stopPropagation();
			const r = rel(e.currentTarget as HTMLElement);
			const sel: Sel = { name, frame: false, rect: r };
			if (e.shiftKey) {
				setDraft(null);
				setHover(null);
				setGather((cur) => (cur.some((s) => s.name === name) ? cur.filter((s) => s.name !== name) : [...cur, sel]));
				return;
			}
			setGather([]);
			openDraft({ targets: [sel] });
		},
		clickFrame: (name) => (e) => {
			if (!annotate) return;
			e.stopPropagation();
			const frameEl = (e.currentTarget as HTMLElement).closest("[data-frame]") as HTMLElement | null;
			if (!frameEl) return;
			const r = rel(frameEl);
			setGather([]);
			openDraft({ targets: [{ name, frame: true, rect: r }] });
		},
	};

	return (
		<SpoolShell
			activeTab="kaffe"
			tabs={["kaffe", "opencode"]}
			showCanvasControls={false}
			headerAccessory={<PendingCount n={pins.length} />}
		>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the interactive surface */}
			<div
				ref={canvasRef}
				onClick={() => {
					// bare canvas is not a target: a click only clears whatever is open
					if (draft) {
						cancel();
						return;
					}
					if (gather.length > 0) setGather([]);
				}}
				onMouseLeave={() => setHover(null)}
				className="relative h-full w-full cursor-default select-none overflow-hidden bg-canvas"
			>
				<DotGrid />

				<CartFrame api={api} frozen={annotate} />
				<SettingsFrame api={api} frozen={annotate} />

				<AnimatePresence>{hover && annotate && !draft ? <HoverPreview key={hover.name} target={hover} /> : null}</AnimatePresence>

				{pins.map((p) => (
					<PinMark key={p.n} pin={p} fresh={p.n === freshN} born={p.n > SEED_MAX_N} />
				))}

				{gather.length > 0 && !draft ? <GatherOverlay gather={gather} /> : null}

				<AnimatePresence>{draft ? <DraftInput key="draft" draft={draft} next={pins.reduce((m, p) => Math.max(m, p.n), 0) + 1} text={text} setText={setText} commit={commit} cancel={cancel} /> : null}</AnimatePresence>

				<AnimatePresence>{annotate ? <PausedHint key="paused" /> : null}</AnimatePresence>
				<AnimatePresence>{!draft && gather.length === 0 ? <Hint key="hint" /> : null}</AnimatePresence>
			</div>

			<Toolbar tool={tool} setTool={setTool} gathered={gather.length} />
		</SpoolShell>
	);
}

interface PickApi {
	annotate: boolean;
	leave: () => void;
	hoverEl: (name: string) => (e: React.MouseEvent) => void;
	hoverFrame: (name: string) => (e: React.MouseEvent) => void;
	clickEl: (name: string) => (e: React.MouseEvent) => void;
	clickFrame: (name: string) => (e: React.MouseEvent) => void;
}

/* ---------- the fake app frames: the thing you point at ---------- */

function CartFrame({ api, frozen }: { api: PickApi; frozen: boolean }) {
	return (
		<div data-frame className="absolute" style={{ left: 196, top: 156, width: 272 }}>
			<FrameLabel name="cart" api={api} />
			<div className="overflow-hidden rounded-md border border-border bg-surface">
				<FrameHeader frozen={frozen} />
				<div className="flex flex-col px-3 py-2">
					<El name="BryggkaffeRow" api={api}>
						<span className="font-sans text-base text-text leading-none">Bryggkaffe</span>
						<span className="font-mono text-sm text-muted leading-none tabular-nums">30 kr</span>
					</El>
					<El name="HavremjolkRow" api={api}>
						<span className="font-sans text-base text-text leading-none">Havremjölk</span>
						<span className="font-mono text-sm text-muted leading-none tabular-nums">5 kr</span>
					</El>
					<El name="KanelbulleRow" api={api}>
						<span className="font-sans text-base text-text leading-none">Kanelbulle</span>
						<span className="font-mono text-sm text-muted leading-none tabular-nums">35 kr</span>
					</El>
					<El name="PromoField" api={api}>
						<span className="font-sans text-base text-text leading-none">Rabattkod</span>
						<span className="rounded-[3px] border border-border-raised px-2 py-1 font-sans text-muted text-sm leading-none">Lös in</span>
					</El>
					<div className="mt-1.5 flex items-center justify-between border-border-raised/60 border-t pt-2.5">
						<span className="font-sans text-sm text-muted leading-none">Summa</span>
						<span className="font-mono text-base text-text leading-none tabular-nums">70 kr</span>
					</div>
					<button
						type="button"
						data-name="CheckoutButton"
						onMouseEnter={api.hoverEl("CheckoutButton")}
						onMouseLeave={api.leave}
						onClick={api.clickEl("CheckoutButton")}
						className={cn(
							"mt-2.5 flex h-8 w-full items-center justify-center rounded-sm bg-thread font-sans font-medium text-on-thread text-sm leading-none",
							api.annotate && "cursor-crosshair",
						)}
					>
						Till kassan
					</button>
				</div>
			</div>
		</div>
	);
}

function SettingsFrame({ api, frozen }: { api: PickApi; frozen: boolean }) {
	return (
		<div data-frame data-name="settings" className="absolute" style={{ left: 612, top: 186, width: 232 }}>
			<FrameLabel name="settings" api={api} />
			<div className="overflow-hidden rounded-md border border-border bg-surface">
				<FrameHeader frozen={frozen} />
				<div className="flex flex-col px-3 py-2">
					<El name="NotifyRow" api={api}>
						<span className="font-sans text-base text-text leading-none">Notifications</span>
						<Toggle on />
					</El>
					<El name="ThemeRow" api={api}>
						<span className="font-sans text-base text-text leading-none">Appearance</span>
						<span className="font-mono text-sm text-muted leading-none">Dark</span>
					</El>
				</div>
			</div>
		</div>
	);
}

function El({ name, api, children }: { name: string; api: PickApi; children: React.ReactNode }) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: fake canvas element, annotation target
		<div
			data-name={name}
			onMouseEnter={api.hoverEl(name)}
			onMouseLeave={api.leave}
			onClick={api.clickEl(name)}
			className={cn("relative flex h-9 items-center justify-between", api.annotate && "cursor-crosshair")}
		>
			{children}
		</div>
	);
}

function FrameLabel({ name, api }: { name: string; api: PickApi }) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the label is the whole-frame target
		<div
			onMouseEnter={api.hoverFrame(name)}
			onMouseLeave={api.leave}
			onClick={api.clickFrame(name)}
			className={cn("mb-1.5 inline-flex h-4 items-center gap-1.5 font-mono text-sm leading-xs", api.annotate && "cursor-crosshair")}
		>
			<span className="text-2xs text-muted/70">▸</span>
			<span className="text-muted">{name}</span>
		</div>
	);
}

function FrameHeader({ frozen }: { frozen: boolean }) {
	const reduce = useReducedMotion();
	return (
		<div className="flex items-center justify-between border-border-raised/60 border-b px-3 py-2">
			<div className="flex items-center gap-1.5">
				<span className={cn("h-1.5 w-1.5 rounded-full transition-colors duration-300", frozen ? "bg-muted/50" : "bg-thread")} />
				<span className="relative inline-flex font-mono text-2xs text-muted leading-3">
					<AnimatePresence initial={false} mode="wait">
						<motion.span
							key={frozen ? "paused" : "live"}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.12, ease: EASE_OUT }}
						>
							{frozen ? "paused" : "live"}
						</motion.span>
					</AnimatePresence>
				</span>
			</div>
			<div className="flex items-end gap-[3px]" aria-hidden="true">
				{[9, 14, 7].map((h, i) => (
					// each bar settles to rest when the tool arms, resumes its pulse when the app is live again
					<motion.span
						key={h}
						className={cn("w-[3px] origin-bottom rounded-full transition-colors duration-300", frozen ? "bg-muted/35" : "bg-thread/70")}
						style={{ height: h }}
						animate={frozen || reduce ? { scaleY: 1 } : { scaleY: [1, 0.5, 1] }}
						transition={
							frozen || reduce
								? { duration: 0.32, ease: EASE_OUT }
								: { duration: 1.1, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut", delay: i * 0.16 }
						}
					/>
				))}
			</div>
		</div>
	);
}

function Toggle({ on }: { on: boolean }) {
	return (
		<span className={cn("flex h-4 w-7 items-center rounded-full px-[2px]", on ? "bg-thread/70" : "bg-raised")}>
			<span className={cn("h-3 w-3 rounded-full bg-text", on && "translate-x-3")} />
		</span>
	);
}

/* ---------- hover preview: what you would hit ---------- */

function HoverPreview({ target }: { target: Sel }) {
	const reduce = useReducedMotion();
	const { rect, name, frame } = target;
	return (
		<motion.div
			className="pointer-events-none absolute z-10 origin-top-left"
			style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
			initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
			animate={{ opacity: 1, scale: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.13, ease: EASE_OUT }}
		>
			<span className={cn("absolute inset-0 rounded-[4px] border", frame ? "border-thread/70 border-dashed" : "border-thread")} />
			<span className="-top-[18px] absolute left-0 flex items-center gap-1 whitespace-nowrap rounded-[3px] bg-thread px-1 py-px font-mono text-[9px] text-on-thread leading-none">
				{name}
				{frame ? <span className="opacity-70">frame</span> : null}
			</span>
		</motion.div>
	);
}

/* ---------- the gathered, pre-order selection (shift-click) ---------- */

function GatherOverlay({ gather }: { gather: Sel[] }) {
	const reduce = useReducedMotion();
	const multi = gather.length > 1;
	const box = union(gather.map((s) => s.rect));
	return (
		<>
			<AnimatePresence initial={false}>
				{gather.map((s) => (
					<motion.span
						key={s.name}
						className="pointer-events-none absolute rounded-[4px] border border-thread"
						style={{ left: s.rect.x - 2, top: s.rect.y - 2, width: s.rect.w + 4, height: s.rect.h + 4 }}
						initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
						transition={{ duration: 0.16, ease: EASE_OUT }}
					/>
				))}
			</AnimatePresence>
			{multi ? (
				<motion.span
					className="pointer-events-none absolute origin-top-left rounded-md border border-thread/50 border-dashed bg-thread/[0.04]"
					style={{ left: box.x - 8, top: box.y - 8, width: box.w + 16, height: box.h + 16 }}
					initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.24, ease: EASE_OUT }}
				/>
			) : null}
			{/* count + commit hint ride the top-left corner, out in the margin, clear of the frame */}
			<div className="pointer-events-none absolute" style={{ left: box.x - (multi ? 8 : 2), top: box.y - (multi ? 8 : 2) }}>
				<motion.span
					className="-translate-y-1/2 absolute top-0 right-full mr-2 flex items-center gap-2 whitespace-nowrap rounded-full border border-thread/50 bg-bg/90 py-1 pr-2.5 pl-2.5 backdrop-blur"
					initial={reduce ? { opacity: 0 } : { opacity: 0, x: 4 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.18, ease: EASE_OUT }}
				>
					<span className="font-mono text-[9px] text-thread leading-none">{multi ? `${gather.length} elements` : gather[0].name}</span>
					<span className="flex items-center gap-1 font-mono text-[9px] text-muted leading-none">
						<Kbd>C</Kbd>
						order
					</span>
				</motion.span>
			</div>
		</>
	);
}

/* ---------- pins: writing lives in the draft; these are just written and waiting ---------- */

function PinMark({ pin, fresh, born }: { pin: Pin; fresh: boolean; born: boolean }) {
	const reduce = useReducedMotion();
	if (pin.targets.length > 1) return <SharedPin pin={pin} fresh={fresh} born={born} />;

	const at = anchorOf(pin);
	const collapsed = !!pin.collapsed && !fresh;
	// a frame or crowded pin reads above its anchor; a lone element reads to the side
	const above = pin.targets[0].frame || collapsed;

	return (
		<div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: at.x, top: at.y }}>
			<motion.div
				className="group relative"
				style={{ transformOrigin: above ? "center bottom" : "center" }}
				initial={born ? (reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }) : false}
				animate={{ opacity: 1, scale: 1 }}
				transition={born ? (reduce ? { duration: 0.16, ease: EASE_OUT } : SETTLE) : undefined}
			>
				{/* dot and chip share the same 20px seat and crossfade when a pin relaxes into a crowd */}
				<span className="relative flex h-5 min-w-5 items-center justify-center">
					<span className={cn("transition-opacity duration-150 motion-reduce:transition-none", collapsed ? "opacity-0" : "opacity-100")}>
						<PinDot n={pin.n} fresh={fresh} />
					</span>
					<span
						className={cn(
							"absolute transition-opacity duration-150 motion-reduce:transition-none",
							collapsed ? "opacity-100" : "opacity-0",
						)}
					>
						<PinChip n={pin.n} ring />
					</span>
				</span>
				<div className={cn("pointer-events-none absolute w-max", above ? "-translate-x-1/2 bottom-full left-1/2 mb-2" : "-translate-y-1/2 top-1/2 left-full ml-3")}>
					<div
						className={cn(
							"transition-[opacity,transform] duration-150 motion-reduce:transition-none",
							above ? "origin-bottom" : "origin-left",
							fresh ? "opacity-100" : "opacity-0 group-hover:opacity-100",
							fresh ? "scale-100" : "scale-[0.96] group-hover:scale-100",
						)}
						style={{ transitionTimingFunction: EASE_CSS }}
					>
						<OrderBubble n={pin.n} order={pin.order} target={targetLabel(pin)} emphasis={fresh} />
					</div>
				</div>
			</motion.div>
		</div>
	);
}

/** a shared order: one dashed enclosure, one numbered pin labeled with the element count */
function SharedPin({ pin, fresh, born }: { pin: Pin; fresh: boolean; born: boolean }) {
	const reduce = useReducedMotion();
	const box = union(pin.targets.map((t) => t.rect));
	return (
		<div className="group">
			<motion.span
				className={cn(
					"pointer-events-none absolute origin-top-left rounded-md border border-dashed",
					fresh ? "border-thread/60 bg-thread/[0.07]" : "border-thread/40 bg-thread/[0.04]",
				)}
				style={{ left: box.x - 8, top: box.y - 8, width: box.w + 16, height: box.h + 16 }}
				initial={born ? (reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }) : false}
				animate={{ opacity: 1, scale: 1 }}
				transition={born ? { duration: 0.3, ease: EASE_OUT } : undefined}
			/>
			<div className="absolute z-10" style={{ left: box.x - 8, top: box.y - 8 }}>
				{/* the anchor on the enclosure corner, and its numbered count pill out in the margin */}
				<motion.span
					className="-translate-x-1/2 -translate-y-1/2 absolute top-0 left-0 h-2 w-2 rounded-full bg-thread"
					initial={born ? { opacity: 0 } : false}
					animate={{ opacity: 1 }}
					transition={born ? { duration: 0.2, ease: EASE_OUT, delay: 0.06 } : undefined}
				/>
				<span className="-translate-y-1/2 absolute top-0 right-full mr-2 flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border-raised bg-bg/90 py-1 pr-2.5 pl-1 backdrop-blur">
					<PinChip n={pin.n} />
					<span className="font-mono text-[9px] text-muted leading-none">{pin.targets.length} elements</span>
				</span>
				{/* the read floats clear above the frame, tied by a hairline */}
				<div className="-translate-x-1/2 pointer-events-none absolute bottom-full left-0 flex flex-col items-center">
					<div
						className={cn(
							"flex flex-col items-center origin-bottom transition-[opacity,transform] duration-150 motion-reduce:transition-none",
							fresh ? "opacity-100 scale-100" : "opacity-0 scale-[0.96] group-hover:opacity-100 group-hover:scale-100",
						)}
						style={{ transitionTimingFunction: EASE_CSS }}
					>
						<OrderBubble n={pin.n} order={pin.order} target={`${pin.targets.length} elements`} emphasis={fresh} />
						<span className="h-16 w-px bg-thread/40" />
					</div>
				</div>
			</div>
		</div>
	);
}

function OrderBubble({ n, order, target, emphasis }: { n: number; order: string; target: string; emphasis: boolean }) {
	return (
		<div
			className={cn(
				"flex w-max max-w-[236px] items-start gap-2 rounded-md border bg-bg/95 px-2.5 py-2 backdrop-blur",
				emphasis ? "border-thread/40" : "border-border-raised",
			)}
		>
			<PinChip n={n} />
			<div className="min-w-0 flex-1">
				<p className="font-sans text-base text-text leading-base">{order}</p>
				<p className="mt-1 font-mono text-2xs text-muted leading-3">
					{target} <span className="text-muted/40">·</span>{" "}
					<span className={emphasis ? "text-thread/80" : "text-muted/70"}>{emphasis ? "unread" : "queued"}</span>
				</p>
			</div>
		</div>
	);
}

function PinDot({ n, fresh }: { n: number; fresh: boolean }) {
	const reduce = useReducedMotion();
	return (
		<span className="relative flex h-5 min-w-5 items-center justify-center">
			{/* the unread heartbeat: the one signal that keeps pulsing while the app itself is paused */}
			{fresh && !reduce ? (
				<motion.span
					aria-hidden="true"
					className="absolute inset-0 rounded-full border border-thread/60"
					animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
					transition={{ duration: 1.4, repeat: Number.POSITIVE_INFINITY, ease: "easeOut" }}
				/>
			) : null}
			<span className="flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
				{n}
			</span>
		</span>
	);
}

function PinChip({ n, ring }: { n: number; ring?: boolean }) {
	return (
		<span
			className={cn(
				"flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-thread px-1 font-mono text-[10px] text-on-thread leading-none",
				ring && "mt-0 border-2 border-bg",
			)}
		>
			{n}
		</span>
	);
}

/* ---------- the draft: an order mid-typing, in place ---------- */

function DraftInput({
	draft,
	next,
	text,
	setText,
	commit,
	cancel,
}: {
	draft: Draft;
	next: number;
	text: string;
	setText: (v: string) => void;
	commit: () => void;
	cancel: () => void;
}) {
	const reduce = useReducedMotion();
	const inputRef = useRef<HTMLInputElement>(null);
	// focus on a later tick so the triggering "C" keystroke never lands in the field
	useEffect(() => {
		const id = window.setTimeout(() => inputRef.current?.focus(), 0);
		return () => window.clearTimeout(id);
	}, []);

	const multi = draft.targets.length > 1;
	const isFrame = draft.targets.length === 1 && draft.targets[0].frame;
	const box = union(draft.targets.map((t) => t.rect));
	const label = targetLabel(draft);
	const placeholder = multi ? "make these denser" : isFrame ? "rework this" : "delete this";
	const left = box.x - (multi ? 8 : 2);
	const top = box.y + box.h + (multi ? 12 : 10);

	return (
		// the whole draft layer fades as a unit; the card scales up from the subject it belongs to
		<motion.div
			className="pointer-events-none absolute inset-0 z-30"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.12, ease: EASE_OUT }}
		>
			{/* keep the subject lit while it is being ordered */}
			{draft.targets.map((s) => (
				<span
					key={s.name}
					className={cn(
						"pointer-events-none absolute rounded-[4px] border",
						s.frame ? "border-thread/60 border-dashed" : "border-thread/80",
					)}
					style={{ left: s.rect.x - 2, top: s.rect.y - 2, width: s.rect.w + 4, height: s.rect.h + 4 }}
				/>
			))}
			{multi ? (
				<span
					className="pointer-events-none absolute rounded-md border border-thread/50 border-dashed bg-thread/[0.04]"
					style={{ left: box.x - 8, top: box.y - 8, width: box.w + 16, height: box.h + 16 }}
				/>
			) : null}

			{/* biome-ignore lint/a11y/noStaticElementInteractions: input shell keeps clicks off the canvas */}
			<motion.div
				className="pointer-events-auto absolute origin-top-left"
				style={{ left, top }}
				initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.18, ease: EASE_OUT }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="w-[268px] overflow-hidden rounded-md border border-thread/70 bg-bg/95 backdrop-blur">
					<div className="flex items-center gap-2 border-thread/25 border-b bg-thread/[0.06] px-2.5 py-2">
						<PinChip n={next} />
						<input
							ref={inputRef}
							value={text}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === "Enter") {
									e.preventDefault();
									commit();
								} else if (e.key === "Escape") {
									e.preventDefault();
									cancel();
								}
							}}
							placeholder={placeholder}
							className="min-w-0 flex-1 select-text bg-transparent font-sans text-base text-text leading-none caret-thread outline-none placeholder:text-muted/40"
						/>
					</div>
					<div className="flex items-center justify-between px-2.5 py-1.5 font-mono text-2xs text-muted leading-3">
						<span>{label}</span>
						<span className="flex items-center gap-1.5">
							<Kbd>esc</Kbd>
							<span className="text-muted/50">discard</span>
							<Kbd>⏎</Kbd>
							<span className="text-muted/50">order</span>
						</span>
					</div>
				</div>
			</motion.div>
		</motion.div>
	);
}

/* ---------- quiet chrome: pending count, paused hint, guidance ---------- */

function PendingCount({ n }: { n: number }) {
	const reduce = useReducedMotion();
	return (
		<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-surface/60 py-1 pr-2.5 pl-2 font-mono text-2xs text-muted leading-3">
			<span className="h-1.5 w-1.5 rounded-full bg-thread" />
			<span className="relative inline-flex h-3 min-w-[0.6em] justify-center overflow-hidden tabular-nums text-text">
				<AnimatePresence initial={false} mode="popLayout">
					<motion.span
						key={n}
						initial={reduce ? { opacity: 0 } : { opacity: 0, y: 7 }}
						animate={{ opacity: 1, y: 0 }}
						exit={reduce ? { opacity: 0 } : { opacity: 0, y: -7 }}
						transition={{ duration: 0.2, ease: EASE_OUT }}
					>
						{n}
					</motion.span>
				</AnimatePresence>
			</span>
			pending
		</div>
	);
}

function PausedHint() {
	const reduce = useReducedMotion();
	return (
		<motion.div
			className="pointer-events-none absolute bottom-7 left-7 flex items-center gap-2 font-mono text-2xs text-muted/50 leading-3"
			initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
			transition={{ duration: 0.2, ease: EASE_OUT }}
		>
			<span className="flex items-center gap-[2px]">
				<span className="h-2.5 w-[2px] rounded-full bg-muted/40" />
				<span className="h-2.5 w-[2px] rounded-full bg-muted/40" />
			</span>
			motion paused while you direct
		</motion.div>
	);
}

function Hint() {
	return (
		<motion.div
			className="pointer-events-none absolute right-8 bottom-28 flex max-w-[268px] flex-col items-end gap-1 text-right"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.18, ease: EASE_OUT }}
		>
			<p className="font-sans text-base text-muted leading-base">Point at a row or a label, then click to leave an order.</p>
			<p className="font-mono text-2xs text-muted/60 leading-3">shift-click to gather, then C to order them together</p>
		</motion.div>
	);
}

/* ---------- toolbar: interact / select / hand / annotate, C ---------- */

const NAV_TOOLS = [
	{ id: "interact" as const, label: "interact", key: null, hold: null, Icon: CursorIcon },
	{ id: "select" as const, label: "select", key: "V", hold: "hold ⌘", Icon: SelectIcon },
	{ id: "hand" as const, label: "hand", key: "H", hold: "hold space", Icon: HandIcon },
];

function Toolbar({ tool, setTool, gathered }: { tool: Tool; setTool: (t: Tool) => void; gathered: number }) {
	const caption =
		tool === "annotate"
			? gathered > 0
				? `gathered ${gathered}, press C to order together`
				: "click an element or a frame"
			: tool === "select"
				? "pick an element"
				: tool === "hand"
					? "pan the canvas"
					: "clicks reach the app";
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-40 flex flex-col items-center gap-2.5">
			<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs leading-3 backdrop-blur">
				<span className="text-thread">{tool}</span>
				<span className="relative inline-flex text-muted/60">
					<AnimatePresence initial={false} mode="wait">
						<motion.span
							key={caption}
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.12, ease: EASE_OUT }}
						>
							{caption}
						</motion.span>
					</AnimatePresence>
				</span>
			</div>
			<div
				role="toolbar"
				aria-label="canvas tools"
				className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur"
			>
				{NAV_TOOLS.map((meta) => (
					<ToolButton
						key={meta.id}
						label={meta.label}
						kbd={meta.key}
						hold={meta.hold}
						active={tool === meta.id}
						Icon={meta.Icon}
						onClick={() => setTool(meta.id)}
					/>
				))}
				<span className="mx-1 h-5 w-px bg-border-raised" />
				<ToolButton
					label="annotate"
					kbd="C"
					hold={null}
					active={tool === "annotate"}
					accent
					Icon={AnnotateIcon}
					onClick={() => setTool("annotate")}
				/>
			</div>
		</div>
	);
}

function ToolButton({
	label,
	kbd,
	hold,
	active,
	accent,
	Icon,
	onClick,
}: {
	label: string;
	kbd: string | null;
	hold: string | null;
	active: boolean;
	accent?: boolean;
	Icon: (p: { className?: string }) => React.ReactNode;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			onClick={onClick}
			className={cn(
				"group relative flex h-9 w-9 items-center justify-center rounded-md transition-[background-color,color,transform] duration-150 active:scale-[0.96]",
				active ? (accent ? "bg-raised text-thread" : "bg-raised text-text") : "text-muted hover:bg-surface hover:text-text",
			)}
			style={{ transitionTimingFunction: EASE_CSS }}
		>
			<Icon className="h-[18px] w-[18px]" />
			<span className="-top-8 pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
				{label}
				{kbd ? <Kbd>{kbd}</Kbd> : null}
				{hold ? <span className="text-muted/50">· {hold}</span> : null}
			</span>
		</button>
	);
}

function AnnotateIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
			<path
				d="M12 21c4-3.6 6.5-6.9 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 14.1 8 17.4 12 21Z"
				stroke="currentColor"
				strokeWidth="1.7"
				strokeLinejoin="round"
			/>
			<circle cx="12" cy="10.4" r="2.5" fill="currentColor" />
		</svg>
	);
}

/* ---------- shared bits ---------- */

function DotGrid() {
	return (
		<div
			className="pointer-events-none absolute inset-0 opacity-40"
			style={{
				backgroundImage: "radial-gradient(circle, var(--color-border-raised) 0.75px, transparent 0.75px)",
				backgroundSize: "22px 22px",
			}}
		/>
	);
}

function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="flex h-4 min-w-4 items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 font-mono text-[9px] text-muted leading-none">
			{children}
		</span>
	);
}
