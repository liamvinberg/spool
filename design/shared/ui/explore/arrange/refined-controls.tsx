import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from "react";
import { cn } from "shared/lib/utils";
import { clamp, type Settings } from "./layout";
import "./refined-controls.css";

export type RefinementTake = "press" | "rail" | "pad";
type Kind = "spacing" | "columns" | "track" | "pad";
interface Drag {
	kind: Kind;
	x: number;
	y: number;
	start: Settings;
	latest: Settings;
	rect: DOMRect;
	column: number;
}
interface Props {
	take: RefinementTake;
	count: number;
	value: Settings;
	startOpen: boolean;
	onPreview: (next: Settings, direct: boolean) => void;
	onPlace: (next: Settings) => void;
	onCancel: () => void;
}

const MIN_GAP = 24;
const MAX_GAP = 240;

function columnCount(value: Settings, count: number): number {
	return value.layout === "column" ? 1 : value.layout === "row" ? count : Math.min(value.columns, count);
}
function withColumns(value: Settings, columns: number, count: number): Settings {
	return { ...value, columns, layout: columns === 1 ? "column" : columns === count ? "row" : "grid" };
}

// These controls deliberately expose the variables the first pull hid in its angle.
// The captured pointer belongs to the control. The moving frames never take it away.
export function RefinedControls({ take, count, value, startOpen, onPreview, onPlace, onCancel }: Props) {
	const [active, setActive] = useState<Kind | null>(null);
	const [open, setOpen] = useState(startOpen);
	const [showAlign, setShowAlign] = useState(false);
	const drag = useRef<Drag | null>(null);
	const root = useRef<HTMLDivElement>(null);
	const columns = columnCount(value, count);
	const rows = Math.ceil(count / columns);
	const abort = () => { drag.current = null; setActive(null); onCancel(); };
	useEffect(() => {
		const key = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Escape") { abort(); setShowAlign(false); }
		};
		const outside = (event: globalThis.PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target)) { setOpen(false); setShowAlign(false); }
		};
		window.addEventListener("keydown", key);
		window.addEventListener("blur", abort);
		window.addEventListener("pointerdown", outside);
		return () => {
			window.removeEventListener("keydown", key);
			window.removeEventListener("blur", abort);
			window.removeEventListener("pointerdown", outside);
		};
	});

	const update = (event: PointerEvent<HTMLElement>) => {
		const held = drag.current;
		if (!held) return;
		event.stopPropagation();
		let next = held.start;
		if (held.kind === "spacing") {
			const delta = event.clientX - held.x;
			next = { ...next, gap: clamp(Math.round((held.start.gap + delta * 2) / 4) * 4, MIN_GAP, MAX_GAP) };
		} else if (held.kind === "columns") {
			const col = clamp(held.column + Math.round((event.clientX - held.x) / 24), 1, count);
			next = withColumns(next, col, count);
		} else {
			const fraction = clamp((event.clientX - held.rect.left - 16) / (held.rect.width - 32), 0, 1);
			const raw = 1 + fraction * (count - 1);
			// Leave a small margin around each stop before it can switch again.
			const previous = columnCount(held.latest, count);
			const col = Math.abs(raw - previous) > 0.56 ? clamp(Math.round(raw), 1, count) : previous;
			next = withColumns(next, col, count);
			if (held.kind === "pad") {
				const spread = clamp(1 - (event.clientY - held.rect.top - 16) / (held.rect.height - 32), 0, 1);
				next = { ...next, gap: Math.round((MIN_GAP + spread * (MAX_GAP - MIN_GAP)) / 4) * 4 };
			}
		}
		held.latest = next;
		onPreview(next, held.kind === "spacing" || (held.kind === "pad" && columns === columnCount(next, count)));
	};
	const begin = (event: PointerEvent<HTMLElement>, kind: Kind, next = value) => {
		if (event.button !== 0 || drag.current) return;
		event.preventDefault(); event.stopPropagation();
		const ready = next.layout === "free" ? { ...next, layout: "grid" as const } : next;
		drag.current = { kind, x: event.clientX, y: event.clientY, start: ready, latest: ready, rect: event.currentTarget.getBoundingClientRect(), column: columnCount(ready, count) };
		event.currentTarget.setPointerCapture(event.pointerId);
		setActive(kind); setShowAlign(false);
		onPreview(ready, false);
		if (kind === "track" || kind === "pad") update(event);
	};
	const finish = (event: PointerEvent<HTMLDivElement>) => {
		const held = drag.current;
		if (!held) return;
		event.stopPropagation(); drag.current = null; setActive(null);
		onPlace(held.latest);
	};
	const placeColumns = (next: number) => onPlace(withColumns(value, clamp(next, 1, count), count));
	const keyColumns = (event: KeyboardEvent<HTMLElement>) => {
		if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
		event.preventDefault();
		placeColumns(event.key === "Home" ? 1 : event.key === "End" ? count : columns + (event.key === "ArrowRight" ? 1 : -1));
	};
	const gapField = <label className="refine-number"><span>Gap</span><input aria-label="Gap" type="number" min={MIN_GAP} max={MAX_GAP} step="4" value={value.gap}
		onChange={(event) => onPlace({ ...value, layout: value.layout === "free" ? "grid" : value.layout, gap: clamp(Number(event.target.value), MIN_GAP, MAX_GAP) })} /></label>;
	const align = <div className="refine-align"><button type="button" className="refine-align-trigger" aria-label="Alignment" aria-expanded={showAlign} onClick={() => setShowAlign(!showAlign)}><AlignIcon /></button>
		{showAlign ? <div className="arrange-align-menu">{(["start", "center", "end"] as const).map((position) => <button type="button" key={position} aria-pressed={value.align === position} onClick={() => { onPlace({ ...value, layout: value.layout === "free" ? "grid" : value.layout, align: position }); setShowAlign(false); }}>Align {position}<span>{value.align === position ? "✓" : ""}</span></button>)}</div> : null}</div>;

	return <div ref={root} className={cn("refine-controls", active && "is-held")} data-refinement={take} data-control-active={active ?? "none"}
		onPointerMove={update} onPointerUp={finish} onPointerCancel={abort} onPointerDown={(event) => event.stopPropagation()}>
		{take === "press" ? <>
			<div className="refine-bar" role="toolbar" aria-label="Arrange selection">
				<span className="refine-count">{count} frames</span><Divider />
				{(["row", "column", "grid"] as const).map((layout) => <button key={layout} type="button" className="refine-layout-button" aria-label={layout === "row" ? "Row" : layout === "column" ? "Column" : "Grid"} aria-pressed={value.layout === layout}
					onPointerDown={(event) => begin(event, "spacing", { ...value, layout })}
					onClick={(event) => { if (event.detail === 0) onPlace({ ...value, layout }); }}><ShapeIcon columns={layout === "row" ? 3 : layout === "column" ? 1 : 2} count={layout === "grid" ? 4 : 3} /><span>{layout === "row" ? "Row" : layout === "column" ? "Column" : "Grid"}</span></button>)}
				<Divider />
				<button type="button" className="refine-scrub" aria-label="Drag columns" onPointerDown={(event) => begin(event, "columns")} onKeyDown={keyColumns}><span>{columns}</span> columns<SmallArrows /></button>
				<Divider />{gapField}<Divider />{align}
			</div>
			{active === "spacing" ? <div className="refine-ruler"><span>closer</span><div className="refine-ruler-line">{Array.from({ length: 19 }, (_, i) => <i key={i} />)}<b style={{ left: `${(value.gap - MIN_GAP) / (MAX_GAP - MIN_GAP) * 100}%` }} /></div><span>further</span><strong>{value.gap}</strong></div> : <p className="refine-hint">Click a layout, or pull its button sideways to set the gap.</p>}
		</> : take === "rail" ? <div className="refine-rail-surface">
			<div className="refine-rail-heading"><span className="refine-count">{count} frames</span><span className="refine-dimensions"><ShapeIcon columns={columns} count={count} />{columns} × {rows}</span>{gapField}{align}</div>
			<div className="refine-track" role="slider" tabIndex={0} aria-label="Layout columns" aria-valuemin={1} aria-valuemax={count} aria-valuenow={columns} aria-valuetext={`${columns} columns, ${rows} rows`}
				onPointerDown={(event) => begin(event, "track")} onKeyDown={keyColumns}>
				<div className="refine-track-rule" /><div className="refine-track-stops">{Array.from({ length: count }, (_, index) => <span key={index} data-active={columns === index + 1}><i />{index + 1}</span>)}</div>
				<div className="refine-track-thumb" style={{ left: `calc(16px + (100% - 32px) * ${(columns - 1) / (count - 1)})` }} />
			</div>
			<div className="refine-track-captions"><span>column</span><span>drag to change columns</span><span>row</span></div>
		</div> : <>
			<div className="refine-bar" role="toolbar" aria-label="Arrange selection"><span className="refine-count">{count} frames</span><Divider /><button type="button" className="refine-pad-trigger" aria-label="Arrange pad" aria-expanded={open} onClick={() => setOpen(!open)}><ShapeIcon columns={columns} count={count} />Arrange<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" aria-hidden="true"><path d="m2 4 3 3 3-3" /></svg></button><Divider />{gapField}{align}</div>
			{open ? <div className="refine-pad-surface"><div className="refine-pad-heading"><span>{columns} columns · {rows} rows</span><span>{value.gap} gap</span></div>
				<div className="refine-pad" role="slider" tabIndex={0} aria-label="Layout pad" aria-valuemin={1} aria-valuemax={count} aria-valuenow={columns} aria-valuetext={`${columns} columns, ${rows} rows, ${value.gap} gap`}
					onPointerDown={(event) => begin(event, "pad")} onKeyDown={(event) => { keyColumns(event); if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); onPlace({ ...value, layout: value.layout === "free" ? "grid" : value.layout, gap: clamp(value.gap + (event.key === "ArrowUp" ? 4 : -4), MIN_GAP, MAX_GAP) }); } }}>
					<div className="refine-pad-grid">{Array.from({ length: count }, (_, i) => <i key={i} />)}</div>
					<div className="refine-pad-cross-x" style={{ left: `calc(16px + (100% - 32px) * ${(columns - 1) / (count - 1)})` }} />
					<div className="refine-pad-cross-y" style={{ top: `calc(16px + (100% - 32px) * ${1 - (value.gap - MIN_GAP) / (MAX_GAP - MIN_GAP)})` }} />
					<div className="refine-pad-thumb" style={{ left: `calc(16px + (100% - 32px) * ${(columns - 1) / (count - 1)})`, top: `calc(16px + (100% - 32px) * ${1 - (value.gap - MIN_GAP) / (MAX_GAP - MIN_GAP)})` }} />
					<span className="refine-pad-loose">looser ↑</span><span className="refine-pad-tight">tighter ↓</span>
				</div><div className="refine-track-captions"><span>1 column</span><span>drag the dot</span><span>{count} columns</span></div>
			</div> : <p className="refine-hint">Open Arrange to shape the layout with one handle.</p>}
		</>}
		{active ? <p className="refine-release">{active === "spacing" ? "layout held · " : ""}release to place · esc cancels</p> : null}
	</div>;
}

function Divider() { return <span className="arrange-divider" />; }
function ShapeIcon({ columns, count }: { columns: number; count: number }) {
	const rows = Math.ceil(count / columns);
	const cell = Math.min(4, 18 / columns, 18 / rows);
	const width = columns * cell;
	const height = rows * cell;
	return <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">{Array.from({ length: count }, (_, index) => <rect key={index} x={(20 - width) / 2 + index % columns * cell} y={(20 - height) / 2 + Math.floor(index / columns) * cell} width={Math.max(.8, cell - 1.2)} height={Math.max(.8, cell - 1.2)} rx=".4" />)}</svg>;
}
function SmallArrows() { return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 3-3 3 3 3m4-6 3 3-3 3M1 6h10" /></svg>; }
function AlignIcon() { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2 3h16" /><rect x="4" y="6" width="4" height="11" rx="1" /><rect x="12" y="6" width="4" height="7" rx="1" /></svg>; }
