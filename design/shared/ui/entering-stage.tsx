import { useState } from "react";
import { cn } from "../lib/utils";

/**
 * The shared stage for the entering explorations: a small fake canvas holding
 * two genuinely interactive frames. Each exploration supplies its own law for
 * how a frame becomes live; everything below is the constant they vary against.
 */

export type Ring = "none" | "hover" | "selected" | "entered";

export function DotGrid() {
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

export function Kbd({ children }: { children: React.ReactNode }) {
	return (
		<span className="inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-[3px] border border-border-raised bg-surface px-1 align-middle font-mono text-2xs text-muted leading-none">
			{children}
		</span>
	);
}

/** The law card: what this exploration claims, and the gestures that carry it. */
export function Law({
	title,
	law,
	rows,
}: {
	title: string;
	law: string;
	rows: readonly { keys: readonly string[]; does: string }[];
}) {
	return (
		<div className="pointer-events-none absolute top-6 left-6 z-30 w-[268px]">
			<p className="font-mono text-2xs text-thread leading-3">{title}</p>
			<p className="mt-2 font-sans text-base text-text leading-base">{law}</p>
			<div className="mt-3 flex flex-col gap-1.5 border-border-raised/70 border-t pt-3">
				{rows.map((row) => (
					<div key={row.does} className="flex items-center gap-2">
						<span className="flex w-[74px] shrink-0 items-center gap-1">
							{row.keys.map((k) => (
								<Kbd key={k}>{k}</Kbd>
							))}
						</span>
						<span className="font-mono text-2xs text-muted leading-3">{row.does}</span>
					</div>
				))}
			</div>
		</div>
	);
}

/** One frame on the fake canvas: chrome, label, and the pointer gate. */
export function FrameBox({
	name,
	x,
	y,
	w,
	ring,
	live,
	hitTest = false,
	dim = false,
	labelSlot,
	children,
	...handlers
}: {
	name: string;
	x: number;
	y: number;
	w: number;
	ring: Ring;
	/** Whether the body currently owns pointer input, exactly as the real shell gates it. */
	live: boolean;
	/**
	 * Keep the frozen body hit-testable so the canvas can still find the element
	 * under the cursor. The caller must then swallow app clicks itself, the way
	 * the real canvas asks the frame's shim for a pick without firing anything.
	 */
	hitTest?: boolean;
	/** Pushed back while another frame holds the canvas. */
	dim?: boolean;
	/** Sits at the right of the label row: an enter affordance, a live pill. */
	labelSlot?: React.ReactNode;
	children: React.ReactNode;
	onPointerDown?: React.PointerEventHandler;
	onDoubleClick?: React.MouseEventHandler;
	onPointerEnter?: React.PointerEventHandler;
	onPointerLeave?: React.PointerEventHandler;
	onPointerMove?: React.PointerEventHandler;
	onClickCapture?: React.MouseEventHandler;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: the fake canvas frame is the surface under test
		<div
			data-frame={name}
			className="absolute transition-opacity duration-200"
			style={{ left: x, top: y, width: w, opacity: dim ? 0.45 : 1 }}
			{...handlers}
		>
			<div className="mb-1.5 flex h-4 items-center justify-between gap-2">
				<span
					className={cn(
						"font-mono text-sm leading-xs transition-colors",
						ring === "entered" ? "text-thread" : ring === "none" ? "text-muted" : "text-text",
					)}
				>
					{name}
				</span>
				{labelSlot}
			</div>
			<div className="relative">
				<div
					className={cn(
						"overflow-hidden rounded-md border bg-surface transition-colors",
						ring === "entered" ? "border-thread" : ring === "selected" ? "border-text/60" : "border-border",
					)}
				>
					<FrameHeader live={live} />
					<div style={{ pointerEvents: live || hitTest ? "auto" : "none" }}>{children}</div>
				</div>
				{ring === "hover" && (
					<span className="pointer-events-none absolute inset-0 rounded-md border border-thread/60" />
				)}
				{ring === "selected" && (
					<>
						{CORNERS.map((c) => (
							<span
								key={c.k}
								className="pointer-events-none absolute h-1.5 w-1.5 rounded-[1px] border border-text bg-bg"
								style={c.style}
							/>
						))}
					</>
				)}
				{ring === "entered" && (
					<span className="pointer-events-none absolute -inset-[3px] rounded-[10px] border border-thread/35" />
				)}
			</div>
		</div>
	);
}

const CORNERS = [
	{ k: "nw", style: { left: -3, top: -3 } },
	{ k: "ne", style: { right: -3, top: -3 } },
	{ k: "sw", style: { left: -3, bottom: -3 } },
	{ k: "se", style: { right: -3, bottom: -3 } },
] as const;

/** live vs frozen, read at a glance: the bars only move when the frame is running. */
function FrameHeader({ live }: { live: boolean }) {
	return (
		<div className="flex items-center justify-between border-border-raised/60 border-b px-3 py-2">
			<div className="flex items-center gap-1.5">
				<span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-thread" : "bg-muted/50")} />
				<span className="font-mono text-2xs text-muted leading-3">{live ? "live" : "frozen"}</span>
			</div>
			<div className="flex items-end gap-[3px]" aria-hidden="true">
				{[0, 1, 2].map((i) => (
					<span
						key={i}
						className={cn("w-[3px] rounded-full", live ? "bg-thread/70" : "bg-muted/35")}
						style={{
							height: live ? undefined : [9, 14, 7][i],
							animation: live ? `entering-eq 900ms ${i * 140}ms ease-in-out infinite alternate` : undefined,
						}}
					/>
				))}
			</div>
			<style>{"@keyframes entering-eq{from{height:5px}to{height:15px}}"}</style>
		</div>
	);
}

/* ---------- the two little apps, really running ---------- */

export function MiniCart() {
	const [qty, setQty] = useState(1);
	const [paid, setPaid] = useState(false);
	const total = qty * 30 + 5;
	return (
		<div data-el="Cart" className="flex flex-col px-3 py-2.5">
			<div data-el="Lines" className="flex flex-col">
				<div data-el="BryggkaffeRow" className="flex h-9 items-center justify-between">
					<span className="font-sans text-base text-text leading-none">Bryggkaffe</span>
					<div data-el="Stepper" className="flex items-center gap-1.5">
						<Step label="−" onClick={() => setQty((q) => Math.max(1, q - 1))} />
						<span className="w-3 text-center font-mono text-sm text-text leading-none tabular-nums">{qty}</span>
						<Step label="+" onClick={() => setQty((q) => Math.min(9, q + 1))} />
					</div>
				</div>
				<div data-el="HavremjolkRow" className="flex h-9 items-center justify-between">
					<span className="font-sans text-base text-text leading-none">Havremjölk</span>
					<span className="font-mono text-sm text-muted leading-none tabular-nums">5 kr</span>
				</div>
			</div>
			<div
				data-el="TotalRow"
				className="mt-1.5 flex h-9 items-center justify-between border-border-raised/60 border-t pt-1.5"
			>
				<span className="font-sans text-sm text-muted leading-none">Summa</span>
				<span className="font-mono text-base text-text leading-none tabular-nums">{total} kr</span>
			</div>
			<button
				type="button"
				data-el="CheckoutButton"
				onClick={() => {
					setPaid(true);
					setTimeout(() => setPaid(false), 1400);
				}}
				className={cn(
					"mt-2 flex h-8 w-full items-center justify-center rounded-sm font-sans font-medium text-sm leading-none transition-colors",
					paid ? "bg-raised text-muted" : "bg-thread text-on-thread hover:bg-thread/90",
				)}
			>
				{paid ? "Betald ✓" : "Till kassan"}
			</button>
		</div>
	);
}

export function MiniSettings() {
	const [notify, setNotify] = useState(true);
	const [theme, setTheme] = useState<"dark" | "light">("dark");
	return (
		<div data-el="Settings" className="flex flex-col px-3 py-2.5">
			<div data-el="NotifyRow" className="flex h-9 items-center justify-between">
				<span className="font-sans text-base text-text leading-none">Notifications</span>
				<button
					type="button"
					data-el="NotifyToggle"
					onClick={() => setNotify((n) => !n)}
					aria-pressed={notify}
					className={cn(
						"flex h-4 w-7 items-center rounded-full px-[2px] transition-colors",
						notify ? "bg-thread/70" : "bg-raised",
					)}
				>
					<span className={cn("h-3 w-3 rounded-full bg-text transition-transform", notify && "translate-x-3")} />
				</button>
			</div>
			<div data-el="ThemeRow" className="flex h-9 items-center justify-between">
				<span className="font-sans text-base text-text leading-none">Appearance</span>
				<div data-el="ThemeSwitch" className="flex items-center gap-0.5 rounded-sm bg-raised p-0.5">
					{(["dark", "light"] as const).map((t) => (
						<button
							key={t}
							type="button"
							onClick={() => setTheme(t)}
							className={cn(
								"flex h-5 items-center rounded-[3px] px-2 font-mono text-2xs leading-none transition-colors",
								theme === t ? "bg-surface text-text" : "text-muted",
							)}
						>
							{t}
						</button>
					))}
				</div>
			</div>
			<div
				data-el="PreviewRow"
				className="mt-1.5 flex h-9 items-center justify-between border-border-raised/60 border-t pt-1.5"
			>
				<span className="font-sans text-sm text-muted leading-none">Preview</span>
				<span
					className={cn(
						"h-5 w-12 rounded-[3px] border transition-colors",
						theme === "dark" ? "border-border-raised bg-bg" : "border-border-raised bg-text",
					)}
				/>
			</div>
		</div>
	);
}

function Step({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex h-5 w-5 items-center justify-center rounded-[3px] bg-raised font-mono text-sm text-muted leading-none transition-colors hover:text-text"
		>
			{label}
		</button>
	);
}

/* ---------- the toolbar, varied per exploration ---------- */

export interface ToolSpec {
	id: string;
	label: string;
	kbd: string | null;
	Icon: (p: { className?: string }) => React.ReactNode;
	accent?: boolean;
}

export function Toolbar({
	tools,
	tool,
	onTool,
	caption,
	trailing,
}: {
	tools: readonly ToolSpec[];
	tool: string;
	onTool: (id: string) => void;
	caption: string;
	/** A verb rather than a mode: sits past a divider and fires on the selection. */
	trailing?: React.ReactNode;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex flex-col items-center gap-2.5">
			<div className="flex items-center gap-1.5 rounded-full border border-border-raised bg-bg/90 px-2.5 py-1 font-mono text-2xs leading-3 backdrop-blur">
				<span className="text-thread">{tool}</span>
				<span className="text-muted/60">{caption}</span>
			</div>
			<div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border-raised bg-bg/90 p-1 backdrop-blur">
				{tools.map((meta) => (
					<button
						key={meta.id}
						type="button"
						aria-label={meta.label}
						aria-pressed={tool === meta.id}
						onClick={() => onTool(meta.id)}
						className={cn(
							"group relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
							tool === meta.id
								? meta.accent
									? "bg-raised text-thread"
									: "bg-raised text-text"
								: "text-muted hover:bg-surface hover:text-text",
						)}
					>
						<meta.Icon className="h-[18px] w-[18px]" />
						<span className="-top-8 pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border-raised bg-bg px-2 py-1 font-mono text-2xs text-muted leading-3 opacity-0 transition-opacity group-hover:opacity-100">
							{meta.label}
							{meta.kbd ? <Kbd>{meta.kbd}</Kbd> : null}
						</span>
					</button>
				))}
				{trailing ? (
					<>
						<span className="mx-1 h-5 w-px bg-border-raised" />
						{trailing}
					</>
				) : null}
			</div>
		</div>
	);
}

export function AnnotateIcon({ className }: { className?: string }) {
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
