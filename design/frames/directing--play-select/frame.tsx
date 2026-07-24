import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";
import { CursorIcon, HandIcon, SelectIcon } from "../../shared/ui/spool-icons";
import { SpoolShell } from "../../shared/ui/spool-shell";

/**
 * directing — B-shape, live. A working playground: annotate is a verb on select,
 * no fourth tool. Click an element to pick it, shift-click to gather more, then C
 * attaches one order to the whole selection. A shared order over several elements
 * reads as a dashed enclosure with a single numbered pin. Clicking a frame's label
 * picks the whole frame; clicking inside picks the element. There is no empty-canvas
 * order here, because there is nothing to select. Try it: click a row, shift-click a
 * second, press C.
 */

type Tool = "interact" | "select" | "hand";
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
interface Pin {
	n: number;
	order: string;
	targets: Sel[];
}

function union(rects: Rect[]): Rect {
	const x = Math.min(...rects.map((r) => r.x));
	const y = Math.min(...rects.map((r) => r.y));
	const r = Math.max(...rects.map((a) => a.x + a.w));
	const b = Math.max(...rects.map((a) => a.y + a.h));
	return { x, y, w: r - x, h: b - y };
}

export default function DirectingPlaySelect() {
	const canvasRef = useRef<HTMLDivElement>(null);
	const [tool, setTool] = useState<Tool>("select");
	const [sel, setSel] = useState<Sel[]>([]);
	const [draft, setDraft] = useState(false);
	const [text, setText] = useState("");
	const [pins, setPins] = useState<Pin[]>([]);

	const select = tool === "select";

	const measure = (name: string): Rect | null => {
		const c = canvasRef.current;
		if (!c) return null;
		const el = c.querySelector(`[data-name="${CSS.escape(name)}"]`) as HTMLElement | null;
		if (!el) return null;
		const cr = c.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return { x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height };
	};

	// seed a committed shared order over two cart rows so the reading is on screen
	useLayoutEffect(() => {
		const a = measure("BryggkaffeRow");
		const b = measure("HavremjolkRow");
		if (a && b) {
			setPins([
				{ n: 1, order: "make these denser", targets: [
					{ name: "BryggkaffeRow", frame: false, rect: a },
					{ name: "HavremjolkRow", frame: false, rect: b },
				] },
			]);
		}
	}, []);

	const rel = (el: HTMLElement): Rect => {
		const cr = canvasRef.current?.getBoundingClientRect();
		const r = el.getBoundingClientRect();
		return { x: r.left - (cr?.left ?? 0), y: r.top - (cr?.top ?? 0), w: r.width, h: r.height };
	};

	const pick = (name: string, frame: boolean) => (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!select) return;
		setDraft(false);
		const target = (frame ? (e.currentTarget as HTMLElement).closest("[data-frame]") : e.currentTarget) as HTMLElement | null;
		if (!target) return;
		const next: Sel = { name, frame, rect: rel(target) };
		setSel((cur) => {
			if (!e.shiftKey) return [next];
			const has = cur.some((s) => s.name === next.name);
			return has ? cur.filter((s) => s.name !== next.name) : [...cur, next];
		});
	};

	const commit = () => {
		if (!text.trim() || sel.length === 0) {
			setDraft(false);
			return;
		}
		setPins((ps) => [...ps, { n: ps.length + 1, order: text.trim(), targets: sel }]);
		setSel([]);
		setDraft(false);
		setText("");
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (draft) return;
			if (e.metaKey || e.ctrlKey) return;
			const k = e.key.toLowerCase();
			if (k === "c" && sel.length > 0) {
				e.preventDefault();
				setDraft(true);
			} else if (k === "v") setTool("select");
			else if (k === "h") setTool("hand");
			else if (k === "i") setTool("interact");
			else if (e.key === "Escape") {
				setSel([]);
				setDraft(false);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [draft, sel.length]);

	const api: PickApi = { select, pick };

	return (
		<SpoolShell activeTab="kaffe" tabs={["kaffe", "opencode"]} zoom="100%" showCanvasControls={false}>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: the mock canvas is the interactive surface */}
			<div
				ref={canvasRef}
				onClick={() => {
					if (draft) {
						setDraft(false);
						return;
					}
					setSel([]);
				}}
				className={cn("relative h-full w-full select-none overflow-hidden bg-canvas", select ? "cursor-crosshair" : "cursor-default")}
			>
				<DotGrid />

				<CartFrame api={api} frozen={sel.length > 0} />
				<SettingsFrame api={api} frozen={sel.length > 0} />

				{/* committed shared / single orders */}
				{pins.map((p) => (
					<PinMark key={p.n} pin={p} />
				))}

				{/* the live selection and its note affordance */}
				{sel.length > 0 && !draft ? <Selection sel={sel} onNote={() => setDraft(true)} /> : null}
				{draft ? (
					<DraftInput sel={sel} next={pins.length + 1} text={text} setText={setText} commit={commit} cancel={() => setDraft(false)} />
				) : null}

				{sel.length === 0 && pins.length <= 1 ? <Hint /> : null}
			</div>

			<Toolbar tool={tool} setTool={setTool} armed={sel.length > 0} />
		</SpoolShell>
	);
}

interface PickApi {
	select: boolean;
	pick: (name: string, frame: boolean) => (e: React.MouseEvent) => void;
}

/* ---------- selection overlay + shared note ---------- */

function Selection({ sel, onNote }: { sel: Sel[]; onNote: () => void }) {
	const multi = sel.length > 1;
	const box = union(sel.map((s) => s.rect));
	return (
		<>
			{/* each picked element gets an outline; a frame pick reads dashed */}
			{sel.map((s) => (
				<span
					key={s.name}
					className={cn(
						"pointer-events-none absolute rounded-[4px] border",
						s.frame ? "border-thread/70 border-dashed" : "border-thread",
					)}
					style={{ left: s.rect.x - 2, top: s.rect.y - 2, width: s.rect.w + 4, height: s.rect.h + 4 }}
				/>
			))}
			{/* the shared enclosure gathers a multi-pick into one thing */}
			{multi ? (
				<span
					className="pointer-events-none absolute rounded-md border border-thread/50 border-dashed bg-thread/[0.04]"
					style={{ left: box.x - 8, top: box.y - 8, width: box.w + 16, height: box.h + 16 }}
				/>
			) : null}
			{/* label */}
			<span
				className="-translate-y-full pointer-events-none absolute flex items-center gap-1 pb-1"
				style={{ left: box.x - (multi ? 8 : 2), top: box.y - (multi ? 8 : 2) }}
			>
				<span className="rounded-[3px] bg-thread px-1 py-px font-mono text-[9px] text-on-thread leading-none">
					{multi ? `${sel.length} elements` : sel[0].frame ? `${sel[0].name} · frame` : sel[0].name}
				</span>
			</span>
			{/* the note affordance rides the selection's right edge, clear of other rows */}
			<div
				className="-translate-y-1/2 absolute"
				style={{ left: box.x + box.w + (multi ? 14 : 8), top: box.y + box.h / 2 }}
			>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onNote();
					}}
					className="flex items-center gap-1.5 rounded-full border border-thread/60 bg-bg/95 py-1 pr-2.5 pl-2 backdrop-blur transition-colors hover:border-thread"
				>
					<Kbd>C</Kbd>
					<span className="font-sans text-sm text-thread leading-none">add note</span>
				</button>
			</div>
		</>
	);
}

function DraftInput({
	sel,
	next,
	text,
	setText,
	commit,
	cancel,
}: {
	sel: Sel[];
	next: number;
	text: string;
	setText: (v: string) => void;
	commit: () => void;
	cancel: () => void;
}) {
	const multi = sel.length > 1;
	const box = union(sel.map((s) => s.rect));
	const label = multi ? `${sel.length} elements` : sel[0].frame ? `${sel[0].name} · frame` : sel[0].name;
	const placeholder = multi ? "make these denser" : sel[0].frame ? "rework this" : "delete this";
	// focus on a later tick so the triggering "C" keystroke never lands in the field
	const inputRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const id = window.setTimeout(() => inputRef.current?.focus(), 0);
		return () => window.clearTimeout(id);
	}, []);
	return (
		<>
			{sel.map((s) => (
				<span
					key={s.name}
					className={cn(
						"pointer-events-none absolute rounded-[4px] border",
						s.frame ? "border-thread/60 border-dashed" : "border-thread/70",
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
			<div
				className="absolute z-20"
				style={{ left: box.x - (multi ? 8 : 2), top: box.y + box.h + (multi ? 12 : 8) }}
				onClick={(e) => e.stopPropagation()}
			>
				<div className="flex items-center gap-2 rounded-md border border-thread/70 bg-bg/95 py-1.5 pr-2 pl-1.5 backdrop-blur">
					<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
						{next}
					</span>
					<input
						ref={inputRef}
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
				<span className="mt-1 ml-1 block font-mono text-2xs text-muted/60 leading-3">
					one order · {label}
				</span>
			</div>
		</>
	);
}

function PinMark({ pin }: { pin: Pin }) {
	const multi = pin.targets.length > 1;
	const box = union(pin.targets.map((t) => t.rect));
	const anchor = multi ? { x: box.x - 8, y: box.y - 8 } : { x: box.x + box.w, y: box.y };
	return (
		<div className="group">
			{multi ? (
				<span
					className="pointer-events-none absolute rounded-md border border-thread/40 border-dashed bg-thread/[0.03]"
					style={{ left: box.x - 8, top: box.y - 8, width: box.w + 16, height: box.h + 16 }}
				/>
			) : null}
			<div
				className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
				style={{ left: anchor.x, top: anchor.y }}
			>
				<span className="flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg bg-thread px-1 font-mono text-[10px] text-on-thread leading-none">
					{pin.n}
				</span>
				<div className="-translate-x-1/2 pointer-events-none absolute bottom-full left-1/2 mb-1.5 hidden w-max max-w-[220px] group-hover:block">
					<div className="rounded-md border border-border-raised bg-bg/95 px-2.5 py-1.5 backdrop-blur">
						<p className="font-sans text-sm text-text leading-sm">{pin.order}</p>
						<p className="mt-0.5 font-mono text-2xs text-muted leading-3">
							{multi ? `${pin.targets.length} elements` : pin.targets[0].name} <span className="text-muted/40">·</span>{" "}
							<span className="text-muted/70">queued</span>
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}

/* ---------- fake app frames ---------- */

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
					<El name="ExtraShotRow" api={api}>
						<span className="font-sans text-base text-text leading-none">Extra shot</span>
						<span className="font-mono text-sm text-muted leading-none tabular-nums">10 kr</span>
					</El>
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
		// biome-ignore lint/a11y/noStaticElementInteractions: fake canvas element, selection target
		<div
			data-name={name}
			onClick={api.pick(name, false)}
			className={cn("relative flex h-9 items-center justify-between", api.select && "cursor-crosshair")}
		>
			{children}
		</div>
	);
}

function FrameLabel({ name, api }: { name: string; api: PickApi }) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the label is the whole-frame target
		<div
			onClick={api.pick(name, true)}
			className={cn("mb-1.5 inline-flex h-4 items-center gap-1.5 font-mono text-sm leading-xs", api.select && "cursor-crosshair")}
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
					<span key={h} className={cn("w-[3px] rounded-full", frozen ? "bg-muted/35" : "bg-thread/70")} style={{ height: h }} />
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

function Hint() {
	return (
		<div className="pointer-events-none absolute right-8 bottom-24 flex max-w-[280px] flex-col items-end gap-1 text-right">
			<p className="font-sans text-base text-muted leading-base">
				Click a row to pick it, shift-click to gather more, then C to leave one shared order.
			</p>
			<p className="font-mono text-2xs text-muted/60 leading-3">a frame label picks the whole frame</p>
		</div>
	);
}

/* ---------- toolbar: three tools, no annotate tool ---------- */

const TOOLS = [
	{ id: "interact" as const, label: "interact", key: null, Icon: CursorIcon },
	{ id: "select" as const, label: "select", key: "V", Icon: SelectIcon },
	{ id: "hand" as const, label: "hand", key: "H", Icon: HandIcon },
];

function Toolbar({ tool, setTool, armed }: { tool: Tool; setTool: (t: Tool) => void; armed: boolean }) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2.5">
			<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs leading-3 backdrop-blur">
				<span className="text-thread">select</span>
				{armed ? (
					<>
						<span className="text-muted/60">selection ready</span>
						<Kbd>C</Kbd>
						<span className="text-muted/60">to note it</span>
					</>
				) : (
					<span className="text-muted/60">click to pick, shift-click to add</span>
				)}
			</div>
			<div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
				{TOOLS.map((meta) => (
					<ToolButton key={meta.id} label={meta.label} kbd={meta.key} active={tool === meta.id} Icon={meta.Icon} onClick={() => setTool(meta.id)} />
				))}
			</div>
		</div>
	);
}

function ToolButton({
	label,
	kbd,
	active,
	Icon,
	onClick,
}: {
	label: string;
	kbd: string | null;
	active: boolean;
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
				active ? "bg-raised text-text" : "text-muted hover:bg-surface hover:text-text",
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
