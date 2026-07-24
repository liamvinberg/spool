import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { CursorIcon, HandIcon, SelectIcon } from "../../shared/ui/spool-icons";
import { SpoolShell } from "../../shared/ui/spool-shell";

/**
 * directing — A-shape, live. A working playground: annotate is a fourth tool (C).
 * Point at anything and it previews what you would hit — an element by name, a whole
 * frame by its label, or a bare spot on the canvas. Click, an input opens in place,
 * type an order, Enter drops a numbered pin. Canvas pins are the move only this shape
 * can make. Motion pauses the moment you pick up the tool, so nothing shifts under
 * your order. Try it: press C, then click a row, a label, or empty canvas.
 */

type Tool = "interact" | "select" | "hand" | "annotate";
type Kind = "element" | "frame" | "canvas";
interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface Target {
	kind: Kind;
	name: string;
	rect: Rect;
}
interface Pin {
	n: number;
	kind: Kind;
	name: string;
	x: number;
	y: number;
	order: string;
}

const SEED: Pin[] = [
	{ n: 1, kind: "element", name: "BryggkaffeRow", x: 300, y: 174, order: "make this row denser" },
];

export default function DirectingPlayTool() {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [tool, setTool] = useState<Tool>("annotate");
	const [hover, setHover] = useState<Target | null>(null);
	const [draft, setDraft] = useState<{ target: Target; x: number; y: number } | null>(null);
	const [text, setText] = useState("");
	const [pins, setPins] = useState<Pin[]>(SEED);

	const annotate = tool === "annotate";

	const rel = (el: HTMLElement): Rect => {
		const c = canvasRef.current?.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return { x: r.left - (c?.left ?? 0), y: r.top - (c?.top ?? 0), w: r.width, h: r.height };
	};
	const point = (e: React.MouseEvent): { x: number; y: number } => {
		const c = canvasRef.current?.getBoundingClientRect();
		return { x: e.clientX - (c?.left ?? 0), y: e.clientY - (c?.top ?? 0) };
	};

	const openDraft = (target: Target, at: { x: number; y: number }) => {
		setText("");
		setDraft({ target, x: at.x, y: at.y });
		setHover(null);
	};
	const commit = () => {
		if (!draft || !text.trim()) {
			setDraft(null);
			return;
		}
		setPins((ps) => [...ps, { n: ps.length + 1, kind: draft.target.kind, name: draft.target.name, x: draft.x, y: draft.y, order: text.trim() }]);
		setDraft(null);
		setText("");
	};
	const cancel = () => {
		setDraft(null);
		setText("");
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (draft) return;
			if (e.metaKey || e.ctrlKey) return;
			const k = e.key.toLowerCase();
			if (k === "c") setTool("annotate");
			else if (k === "v") setTool("select");
			else if (k === "h") setTool("hand");
			else if (k === "i" || e.key === "Escape") setTool("interact");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [draft]);

	const api: PickApi = {
		annotate,
		leave: () => setHover(null),
		hoverEl: (name) => (e) => {
			if (!annotate || draft) return;
			setHover({ kind: "element", name, rect: rel(e.currentTarget as HTMLElement) });
		},
		pickEl: (name) => (e) => {
			e.stopPropagation();
			if (!annotate) return;
			openDraft({ kind: "element", name, rect: rel(e.currentTarget as HTMLElement) }, point(e));
		},
		hoverFrame: (name) => (e) => {
			if (!annotate || draft) return;
			const frameEl = (e.currentTarget as HTMLElement).closest("[data-frame]") as HTMLElement | null;
			if (frameEl) setHover({ kind: "frame", name, rect: rel(frameEl) });
		},
		pickFrame: (name) => (e) => {
			e.stopPropagation();
			if (!annotate) return;
			const frameEl = (e.currentTarget as HTMLElement).closest("[data-frame]") as HTMLElement | null;
			if (frameEl) openDraft({ kind: "frame", name, rect: rel(frameEl) }, point(e));
		},
	};

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} zoom="100%" showCanvasControls={false}>
			{/** biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the interactive surface */}
			<div
				ref={canvasRef}
				onClick={(e) => {
					if (draft) {
						cancel();
						return;
					}
					if (!annotate) return;
					const p = point(e);
					openDraft({ kind: "canvas", name: "canvas", rect: { x: p.x, y: p.y, w: 0, h: 0 } }, p);
				}}
				onMouseLeave={() => setHover(null)}
				className={cn("relative h-full w-full select-none overflow-hidden bg-canvas", annotate ? "cursor-crosshair" : "cursor-default")}
			>
				<DotGrid />

				<CartFrame api={api} frozen={annotate} />
				<SettingsFrame api={api} frozen={annotate} />

				{hover && annotate && !draft ? <HoverPreview target={hover} /> : null}

				{pins.map((p) => (
					<PinMark key={p.n} pin={p} />
				))}

				{draft ? <DraftInput draft={draft} next={pins.length + 1} text={text} setText={setText} commit={commit} cancel={cancel} /> : null}

				{pins.length <= 1 && !draft ? <Hint /> : null}
			</div>

			<Toolbar tool={tool} setTool={setTool} />
		</SpoolShell>
	);
}

interface PickApi {
	annotate: boolean;
	leave: () => void;
	hoverEl: (name: string) => (e: React.MouseEvent) => void;
	pickEl: (name: string) => (e: React.MouseEvent) => void;
	hoverFrame: (name: string) => (e: React.MouseEvent) => void;
	pickFrame: (name: string) => (e: React.MouseEvent) => void;
}

/* ---------- the fake app frames ---------- */

function CartFrame({ api, frozen }: { api: PickApi; frozen: boolean }) {
	return (
		<div data-frame className="absolute" style={{ left: 150, top: 96, width: 258 }}>
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
					<div className="mt-1.5 border-border-raised/60 border-t pt-1.5">
						<El name="TotalRow" api={api}>
							<span className="font-sans text-sm text-muted leading-none">Summa</span>
							<span className="font-mono text-base text-text leading-none tabular-nums">35 kr</span>
						</El>
					</div>
					<button
						type="button"
						data-name="CheckoutButton"
						onMouseEnter={api.hoverEl("CheckoutButton")}
						onMouseLeave={api.leave}
						onClick={api.pickEl("CheckoutButton")}
						className={cn(
							"mt-2 flex h-8 w-full items-center justify-center rounded-sm bg-thread font-sans font-medium text-on-thread text-sm leading-none",
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
		<div data-frame className="absolute" style={{ left: 470, top: 150, width: 236 }}>
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
			onClick={api.pickEl(name)}
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
			onClick={api.pickFrame(name)}
			className={cn("mb-1.5 inline-flex h-4 items-center gap-1.5 font-mono text-sm leading-xs", api.annotate && "cursor-crosshair")}
		>
			<span className="text-2xs text-muted/70">▸</span>
			<span className="text-muted">{name}</span>
		</div>
	);
}

function FrameHeader({ frozen }: { frozen: boolean }) {
	return (
		<div className="flex items-center justify-between border-border-raised/60 border-b px-3 py-2">
			<div className="flex items-center gap-1.5">
				<span className={cn("h-1.5 w-1.5 rounded-full", frozen ? "bg-muted/50" : "bg-thread")} />
				<span className="font-mono text-2xs text-muted leading-3">{frozen ? "paused" : "live"}</span>
			</div>
			<div className="flex items-end gap-[3px]" aria-hidden="true">
				{[9, 14, 7].map((h) => (
					<span
						key={h}
						className={cn("w-[3px] rounded-full", frozen ? "bg-muted/35" : "bg-thread/70")}
						style={{ height: h }}
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

/* ---------- overlays: preview, pins, draft ---------- */

function HoverPreview({ target }: { target: Target }) {
	const { rect, name, kind } = target;
	const frame = kind === "frame";
	return (
		<div className="pointer-events-none absolute z-10" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}>
			<span
				className={cn("absolute inset-0 rounded-[4px] border", frame ? "border-thread/70 border-dashed" : "border-thread")}
			/>
			<span className="-top-[18px] absolute left-0 flex items-center gap-1 whitespace-nowrap rounded-[3px] bg-thread px-1 py-px font-mono text-[9px] text-on-thread leading-none">
				{name}
				{frame ? <span className="opacity-70">frame</span> : null}
			</span>
		</div>
	);
}

function PinMark({ pin }: { pin: Pin }) {
	return (
		<div className="group absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: pin.x, top: pin.y }}>
			<span className="flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
				{pin.n}
			</span>
			<div className="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden w-max max-w-[220px] group-hover:block">
				<div className="rounded-md border border-border-raised bg-bg/95 px-2.5 py-1.5 backdrop-blur">
					<p className="font-sans text-sm text-text leading-sm">{pin.order}</p>
					<p className="mt-0.5 font-mono text-2xs text-muted leading-3">
						{pin.name}
						{pin.kind === "frame" ? " · frame" : pin.kind === "canvas" ? " · here" : ""} <span className="text-muted/40">·</span>{" "}
						<span className="text-muted/70">queued</span>
					</p>
				</div>
			</div>
		</div>
	);
}

function DraftInput({
	draft,
	next,
	text,
	setText,
	commit,
	cancel,
}: {
	draft: { target: Target; x: number; y: number };
	next: number;
	text: string;
	setText: (v: string) => void;
	commit: () => void;
	cancel: () => void;
}) {
	const { target } = draft;
	const placeholder =
		target.kind === "canvas" ? "put a settings frame here" : target.kind === "frame" ? "rework this" : "make this row denser";
	const label = target.kind === "canvas" ? "canvas · here" : target.kind === "frame" ? `${target.name} · frame` : target.name;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: input shell, clicks kept off the canvas
		<div className="absolute z-20 -translate-y-1/2" style={{ left: draft.x + 10, top: draft.y }} onClick={(e) => e.stopPropagation()}>
			<div className="flex items-center gap-2 rounded-md border border-thread/70 bg-bg/95 py-1.5 pr-2 pl-1.5 backdrop-blur">
				<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
					{next}
				</span>
				{/* biome-ignore lint/a11y/noAutofocus: the draft opens to be typed into immediately */}
				<input
					autoFocus
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							commit();
						} else if (e.key === "Escape") {
							e.preventDefault();
							cancel();
						}
					}}
					placeholder={placeholder}
					className="w-[196px] select-text bg-transparent font-sans text-base text-text leading-none outline-none placeholder:text-muted/40"
				/>
				<span className="flex items-center gap-1">
					<Kbd>esc</Kbd>
					<Kbd>⏎</Kbd>
				</span>
			</div>
			<span className="mt-1 ml-1 block font-mono text-2xs text-muted/60 leading-3">{label}</span>
		</div>
	);
}

function Hint() {
	return (
		<div className="pointer-events-none absolute right-8 bottom-24 flex max-w-[260px] flex-col items-end gap-1 text-right">
			<p className="font-sans text-base text-muted leading-base">
				Point at a row, a label, or empty canvas. Click to leave an order.
			</p>
			<p className="flex items-center gap-1.5 font-mono text-2xs text-muted/60 leading-3">
				hover any pin to read it
			</p>
		</div>
	);
}

/* ---------- toolbar ---------- */

const TOOLS = [
	{ id: "interact" as const, label: "interact", key: null, Icon: CursorIcon },
	{ id: "select" as const, label: "select", key: "V", Icon: SelectIcon },
	{ id: "hand" as const, label: "hand", key: "H", Icon: HandIcon },
];

function Toolbar({ tool, setTool }: { tool: Tool; setTool: (t: Tool) => void }) {
	const caption =
		tool === "annotate"
			? "click an element, a frame, or a spot"
			: tool === "select"
				? "pick an element"
				: tool === "hand"
					? "pan the canvas"
					: "clicks reach the app";
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2.5">
			<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs leading-3 backdrop-blur">
				<span className="text-thread">{tool}</span>
				<span className="text-muted/60">{caption}</span>
			</div>
			<div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
				{TOOLS.map((meta) => (
					<ToolButton key={meta.id} label={meta.label} kbd={meta.key} active={tool === meta.id} Icon={meta.Icon} onClick={() => setTool(meta.id)} />
				))}
				<span className="mx-1 h-5 w-px bg-border-raised" />
				<ToolButton label="annotate" kbd="C" active={tool === "annotate"} accent Icon={AnnotateIcon} onClick={() => setTool("annotate")} />
			</div>
		</div>
	);
}

function ToolButton({
	label,
	kbd,
	active,
	accent,
	Icon,
	onClick,
}: {
	label: string;
	kbd: string | null;
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
				"group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
				active ? (accent ? "bg-raised text-thread" : "bg-raised text-text") : "text-muted hover:bg-surface hover:text-text",
			)}
		>
			<Icon className="h-[18px] w-[18px]" />
			<span className="-top-8 pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
				{label}
				{kbd ? <Kbd>{kbd}</Kbd> : null}
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

/* ---------- shared ---------- */

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
