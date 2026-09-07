import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "shared/lib/utils";
import { CoffeeScreen } from "shared/ui/demo/coffee-screens";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import { arranged, bounds, clamp, fit, fixture, INITIAL, type Box, type Camera, type Layout, type Settings, type Tile } from "./layout";
import "./prototype.css";

// Three separate frames ask whether arranging belongs to a toolbar, a gesture,
// or the selection's edge. All state stays in this playground.
export type ArrangeTake = "toolbar" | "pull" | "wrap";
interface Snapshot { tiles: Tile[]; settings: Settings; camera: Camera }
interface Preview extends Snapshot { label: string }
type Gesture = {
	kind: "pull" | "wrap" | "gap" | "marquee" | "move" | "pan";
	x: number; y: number; start: Snapshot; selected: string[];
	axis: "x" | "y"; previousColumns: number; previousLayout: Layout;
};

const TITLE: Record<ArrangeTake, string> = { toolbar: "Arrange from the selection", pull: "Pull a layout into place", wrap: "Shape the space it takes" };
const HINT: Record<ArrangeTake, string> = {
	toolbar: "Hover to preview. Click to place. Drag a gap to adjust the spacing.",
	pull: "Pull the handle right for a row, down for a column, or diagonally for a grid.",
	wrap: "Drag the right edge to wrap the frames. Drag a gap to spread them out.",
};

export function ArrangePrototype({ take }: { take: ArrangeTake }) {
	const initialTiles = fixture(false);
	const initialSettings = take === "wrap" ? { ...INITIAL, layout: "grid" as const } : INITIAL;
	const [tiles, setTiles] = useState(() => arranged(initialTiles, initialTiles.map((tile) => tile.id), initialSettings));
	const [settings, setSettings] = useState<Settings>(initialSettings);
	const [selected, setSelected] = useState(initialTiles.map((tile) => tile.id));
	const [camera, setCamera] = useState<Camera>({ x: 100, y: 230, zoom: 0.45 });
	const [preview, setPreview] = useState<Preview | null>(null);
	const [history, setHistory] = useState<Snapshot[]>([]);
	const [mixed, setMixed] = useState(false);
	const [dragging, setDragging] = useState<Gesture["kind"] | null>(null);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const [menu, setMenu] = useState(false);
	const [notice, setNotice] = useState("");
	const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
	const stage = useRef<HTMLDivElement>(null);
	const gesture = useRef<Gesture | null>(null);
	const previewRef = useRef<Preview | null>(null);
	const space = useRef(false);
	const size = useRef({ width: 1308, height: 956 });
	const snapshot = (): Snapshot => ({ tiles, settings, camera });
	const fitted = (next: Tile[]) => fit(next, size.current.width, size.current.height);
	const show = (next: Preview | null) => { previewRef.current = next; setPreview(next); };
	const commit = (next: Snapshot) => {
		setHistory((items) => [...items, snapshot()]);
		setTiles(next.tiles); setSettings(next.settings); setCamera(next.camera); show(null);
	};
	const undo = () => {
		if (gesture.current || previewRef.current) { cancel(); return; }
		const previous = history.at(-1);
		if (!previous) return;
		setTiles(previous.tiles); setSettings(previous.settings); setCamera(previous.camera);
		setHistory(history.slice(0, -1)); setNotice("Undone.");
	};
	const cancel = () => {
		if (gesture.current?.kind === "marquee") setSelected(gesture.current.selected);
		gesture.current = null; show(null); setDragging(null); setMarquee(null); setMenu(false); setPointer(null);
	};
	const reset = (nextMixed = mixed) => {
		const next = fixture(nextMixed);
		const nextSettings: Settings = take === "wrap" ? { ...INITIAL, layout: "grid" } : INITIAL;
		const laid = arranged(next, next.map((tile) => tile.id), nextSettings);
		cancel(); setTiles(laid); setSettings(nextSettings); setSelected(next.map((tile) => tile.id));
		setCamera(fitted(laid)); setHistory([]); setNotice("");
	};
	useEffect(() => {
		const element = stage.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => {
			if (!entry) return;
			size.current = { width: entry.contentRect.width, height: entry.contentRect.height };
			setCamera(fit(tiles, entry.contentRect.width, entry.contentRect.height));
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	useEffect(() => {
		const down = (event: KeyboardEvent) => {
			if (event.target instanceof HTMLInputElement) return;
			if (event.code === "Space") { event.preventDefault(); space.current = true; }
			if (event.key === "Escape") { event.preventDefault(); cancel(); }
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); undo(); }
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") { event.preventDefault(); setSelected(tiles.map((tile) => tile.id)); show(null); }
		};
		const up = (event: KeyboardEvent) => { if (event.code === "Space") space.current = false; };
		const blur = () => { space.current = false; cancel(); };
		window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
		return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
	});

	const display = preview ?? snapshot();
	const held = display.tiles.filter((tile) => selected.includes(tile.id));
	const selection = bounds(held);
	const screenBox = (box: Box, view = display.camera): Box => ({ x: box.x * view.zoom + view.x, y: box.y * view.zoom + view.y, w: box.w * view.zoom, h: box.h * view.zoom });
	const box = screenBox(selection);
	const many = selected.length > 1;
	const columns = display.settings.layout === "row" ? selected.length : display.settings.layout === "column" ? 1 : Math.min(display.settings.columns, selected.length);
	const rows = Math.ceil(selected.length / Math.max(1, columns));
	const layoutLabel = display.settings.layout === "free" ? "free" : display.settings.layout === "grid" ? `${columns} × ${rows}` : display.settings.layout;
	const canHandle = many && settings.layout !== "free";
	const point = (event: ReactPointerEvent) => {
		const rect = stage.current?.getBoundingClientRect();
		return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
	};
	const begin = (event: ReactPointerEvent<HTMLElement>, kind: Gesture["kind"], axis: "x" | "y" = "x", ids = selected) => {
		if (gesture.current || (event.button !== 0 && event.button !== 1)) return;
		event.preventDefault(); event.stopPropagation();
		const p = point(event);
		setPointer(p);
		gesture.current = { kind, ...p, start: snapshot(), selected: ids, axis, previousColumns: settings.columns, previousLayout: "free" };
		stage.current?.setPointerCapture(event.pointerId); setDragging(kind); show(null); setNotice("");
	};
	const propose = (next: Settings, label: string, place = false) => {
		if (!many || gesture.current) return;
		const nextTiles = arranged(tiles, selected, next);
		const result = { tiles: nextTiles, settings: next, camera: fitted(nextTiles), label };
		if (place) { commit(result); setNotice("Placed. Drag a gap to adjust."); }
		else show(result);
	};
	const move = (event: ReactPointerEvent<HTMLDivElement>) => {
		const active = gesture.current;
		if (!active) return;
		const p = point(event); const dx = p.x - active.x; const dy = p.y - active.y;
		setPointer(p);
		const start = active.start;
		if (active.kind === "marquee") {
			setMarquee({ x: Math.min(active.x, p.x), y: Math.min(active.y, p.y), w: Math.abs(dx), h: Math.abs(dy) });
			const world = { x: (Math.min(active.x, p.x) - camera.x) / camera.zoom, y: (Math.min(active.y, p.y) - camera.y) / camera.zoom, w: Math.abs(dx) / camera.zoom, h: Math.abs(dy) / camera.zoom };
			setSelected(tiles.filter((tile) => tile.x < world.x + world.w && tile.x + tile.w > world.x && tile.y < world.y + world.h && tile.y + tile.h > world.y).map((tile) => tile.id));
			return;
		}
		if (active.kind === "pan") {
			show({ ...start, camera: { ...start.camera, x: start.camera.x + dx, y: start.camera.y + dy }, label: "pan" }); return;
		}
		if (active.kind === "move") {
			const moved = start.tiles.map((tile) => active.selected.includes(tile.id) ? { ...tile, x: tile.x + dx / start.camera.zoom, y: tile.y + dy / start.camera.zoom } : tile);
			show({ ...start, tiles: moved, label: "move" }); return;
		}
		let next = { ...start.settings };
		if (active.kind === "pull") {
			if (Math.hypot(dx, dy) < 14) { show(null); return; }
			const angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;
			const layout = angle < 24 ? "row" : angle > 66 ? "column" : "grid";
			// A small dead band prevents a diagonal gesture flickering between layouts.
			if (!(active.previousLayout === "row" && angle < 29) && !(active.previousLayout === "column" && angle > 61)) active.previousLayout = layout;
			next = { ...next, layout: active.previousLayout, columns: clamp(Math.round(6 - (angle - 25) / 11), 2, 5), gap: clamp(Math.round(40 + Math.hypot(dx, dy) / 2), 40, 240) };
		} else if (active.kind === "gap") {
			next.gap = clamp(Math.round((start.settings.gap + (active.axis === "x" ? dx : dy) / start.camera.zoom) / 4) * 4, 24, 320);
		} else {
			const selectedTiles = start.tiles.filter((tile) => active.selected.includes(tile.id));
			const maxWidth = Math.max(...selectedTiles.map((tile) => tile.w));
			const startWidth = start.settings.columns * (maxWidth + start.settings.gap) - start.settings.gap;
			const raw = (startWidth + dx / start.camera.zoom + start.settings.gap) / (maxWidth + start.settings.gap);
			if (Math.abs(raw - active.previousColumns) > 0.65) active.previousColumns = clamp(Math.round(raw), 1, active.selected.length);
			next = { ...next, layout: "grid", columns: active.previousColumns };
		}
		const nextTiles = arranged(start.tiles, active.selected, next);
		show({ tiles: nextTiles, settings: next, camera: active.kind === "pull" || active.kind === "wrap" ? fitted(nextTiles) : start.camera, label: active.kind });
	};
	const end = (event: ReactPointerEvent<HTMLDivElement>) => {
		const active = gesture.current;
		if (!active) return;
		const next = previewRef.current;
		if (next && active.kind === "pan") { setCamera(next.camera); show(null); }
		else if (next) { commit(active.kind === "wrap" ? { ...next, camera: fitted(next.tiles) } : next); setNotice("Placed. ⌘Z to undo."); }
		gesture.current = null; setDragging(null); setMarquee(null); setPointer(null);
		if (stage.current?.hasPointerCapture(event.pointerId)) stage.current.releasePointerCapture(event.pointerId);
	};
	const selectTile = (event: ReactPointerEvent<HTMLButtonElement>, tile: Tile) => {
		if (space.current || event.button === 1) { begin(event, "pan"); return; }
		const ids = event.shiftKey ? selected.includes(tile.id) ? selected.filter((id) => id !== tile.id) : [...selected, tile.id] : selected.includes(tile.id) ? selected : [tile.id];
		setSelected(ids); setMenu(false); show(null);
		if (!event.shiftKey) begin(event, "move", "x", ids);
		else event.stopPropagation();
	};
	const changeGap = (value: number) => propose({ ...settings, gap: clamp(value, 24, 320) }, "gap", true);
	const zoomBy = (factor: number) => {
		const zoom = clamp(camera.zoom * factor, 0.08, 1.2);
		const center = { x: size.current.width / 2, y: size.current.height / 2 };
		setCamera({ x: center.x - (center.x - camera.x) * zoom / camera.zoom, y: center.y - (center.y - camera.y) * zoom / camera.zoom, zoom });
	};

	return (
		<SpoolShell activeTab="spool" tabs={["spool"]} zoom={`${Math.round(display.camera.zoom * 100)}%`} arrowsOn={false}>
			<CanvasChrome pages={[{ name: "app", frames: tiles.map((tile) => tile.id), active: true, open: true }, { name: "site", frames: [] }, { name: "library", frames: [] }]} rail={null} tool="select">
				<div ref={stage} className="arrange-stage" data-take={take} data-layout={display.settings.layout} data-gap={display.settings.gap} data-columns={columns} data-selected={selected.length} data-preview={Boolean(preview)} data-dragging={dragging ?? "none"}
					onPointerMove={move} onPointerUp={end} onPointerCancel={cancel}
					onPointerDown={(event) => { setMenu(false); if (event.target === event.currentTarget) { if (space.current || event.button === 1) begin(event, "pan"); else { setSelected([]); begin(event, "marquee"); } } }}>
					<div className="arrange-intro">
						<h1>{TITLE[take]}</h1>
						<p>{HINT[take]}</p>
					</div>
					<div className="arrange-fixture">
						<button type="button" aria-pressed={mixed} onClick={() => { setMixed(!mixed); reset(!mixed); }}>Mixed sizes</button>
						<button type="button" onClick={undo} disabled={!history.length && !preview}>Undo</button>
						<button type="button" onClick={() => reset()}>Reset</button>
					</div>
					{preview && dragging !== "pan" && dragging !== "move" ? tiles.filter((tile) => selected.includes(tile.id)).map((tile) => {
						const ghost = screenBox(tile);
						return <div key={tile.id} className="arrange-ghost" style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)`, width: ghost.w, height: ghost.h }} />;
					}) : null}
					{display.tiles.map((tile) => {
						const rect = screenBox(tile); const isSelected = selected.includes(tile.id);
						return <div key={tile.id} className={cn("arrange-tile", isSelected && "is-selected", (dragging === "gap" || dragging === "move" || dragging === "pan") && "is-direct")}
							data-tile={tile.id} data-x={tile.x} data-y={tile.y} data-width={tile.w} data-height={tile.h}
							style={{ transform: `translate(${rect.x}px, ${rect.y}px)`, width: rect.w, height: rect.h }}>
							<span className="arrange-tile-label">{tile.id}</span>
							<div className="arrange-document" style={{ width: tile.w, height: tile.h, transform: `scale(${display.camera.zoom})` }}><CoffeeScreen screen={tile.screen} scale="full" /></div>
							<button type="button" className="arrange-tile-hit" aria-label={`Select ${tile.id}`} aria-pressed={isSelected} onPointerDown={(event) => selectTile(event, tile)} onClick={(event) => { if (event.detail === 0) setSelected(event.shiftKey ? [...new Set([...selected, tile.id])] : [tile.id]); }} />
						</div>;
					})}
					{many ? <>
						<div className="arrange-bounds" style={{ transform: `translate(${box.x - 12}px, ${box.y - 30}px)`, width: box.w + 24, height: box.h + 42 }} />
						{take === "toolbar" ? <div className="arrange-toolbar-position" style={{ top: 122 }}>
							<div className="arrange-toolbar" role="toolbar" aria-label="Arrange selection" onPointerLeave={() => { if (!gesture.current) show(null); }}>
								<span className="arrange-count">{selected.length} frames</span><Divider />
								{(["row", "column", "grid"] as const).map((layout) => <Tool key={layout} label={layout === "row" ? "Row" : layout === "column" ? "Column" : "Grid"} active={display.settings.layout === layout}
									onPreview={() => propose({ ...settings, layout }, layout)} onEndPreview={() => { if (!gesture.current) show(null); }} onClick={() => propose({ ...settings, layout }, layout, true)}><LayoutIcon layout={layout} /></Tool>)}
								<Divider />
								{settings.layout === "grid" ? <Stepper label="Columns" value={settings.columns} min={1} max={selected.length} onChange={(value) => propose({ ...settings, columns: value }, "columns", true)} /> : null}
								<label className="arrange-gap-input">Gap<input aria-label="Gap" type="number" min="24" max="320" step="4" value={settings.gap} onChange={(event) => changeGap(Number(event.target.value))} /></label>
								<Divider /><Tool label="Alignment" active={menu} onClick={() => setMenu(!menu)}><AlignIcon /></Tool>
								{menu ? <div className="arrange-align-menu">{(["start", "center", "end"] as const).map((align) => <button key={align} type="button" aria-pressed={settings.align === align} onClick={() => { propose({ ...settings, align }, "alignment", true); setMenu(false); }}>{align === "start" ? "Align to start" : align === "center" ? "Align to center" : "Align to end"}<span>{settings.align === align ? "✓" : ""}</span></button>)}</div> : null}
							</div>
						</div> : <div className="arrange-small-label" style={{ left: box.x - 12, top: box.y - 55 }}><span>{selected.length} frames</span><span>{layoutLabel}</span></div>}
						{take === "pull" ? <>
							<button type="button" className="arrange-pull" aria-label="Pull to arrange" style={{ left: dragging === "pull" && pointer ? pointer.x - 14 : clamp(box.x + box.w / 2 - 43, 42, size.current.width - 110), top: dragging === "pull" && pointer ? pointer.y - 14 : Math.min(box.y + box.h + 22, size.current.height - 140) }} onPointerDown={(event) => begin(event, "pull")} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); propose({ ...settings, layout: event.key === "ArrowRight" ? "row" : "column" }, "pull", true); } }}><GripIcon /><span>arrange</span></button>
							{dragging === "pull" ? <div className="arrange-pull-readout"><LayoutIcon layout={display.settings.layout === "free" ? "grid" : display.settings.layout} /><span>{layoutLabel}</span><span>{display.settings.gap} gap</span><kbd>esc</kbd></div> : null}
						</> : null}
						{take === "wrap" ? <button type="button" className="arrange-wrap" aria-label="Drag to change columns" style={{ left: dragging === "wrap" && pointer ? pointer.x - 13 : box.x + box.w + 3, top: box.y - 12, height: box.h + 24 }} onPointerDown={(event) => begin(event, "wrap")} onKeyDown={(event) => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); propose({ ...settings, layout: "grid", columns: clamp(settings.columns + (event.key === "ArrowRight" ? 1 : -1), 1, selected.length) }, "columns", true); } }}><span className="arrange-wrap-grip" /><span className="arrange-wrap-tag">{columns} columns</span></button> : null}
						{canHandle && !preview || canHandle && dragging === "gap" || canHandle && dragging === "wrap" ? <GapHandles tiles={held} settings={display.settings} camera={display.camera} onBegin={begin} onChange={changeGap} /> : null}
					</> : null}
					{marquee ? <div className="arrange-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} /> : null}
					<div className="arrange-bottom-copy" aria-live="polite">{dragging && dragging !== "marquee" ? "release to place · esc cancels" : preview ? `preview · ${layoutLabel} · click to place` : notice || (selected.length ? `${selected.length} selected · shift-click to change selection` : "Drag across frames to select them.")}</div>
					<div className="arrange-zoom"><button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.8)}>−</button><button type="button" onClick={() => setCamera(fitted(tiles))}>Fit</button><button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)}>+</button></div>
					<div className="arrange-pan-hint">space + drag to pan</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

function GapHandles({ tiles, settings, camera, onBegin, onChange }: { tiles: Tile[]; settings: Settings; camera: Camera; onBegin: (event: ReactPointerEvent<HTMLElement>, kind: Gesture["kind"], axis?: "x" | "y") => void; onChange: (value: number) => void }) {
	const box = bounds(tiles);
	const columns = settings.layout === "row" ? tiles.length : settings.layout === "column" ? 1 : Math.min(settings.columns, tiles.length);
	const width = Math.max(...tiles.filter((_, i) => i % columns === 0).map((tile) => tile.w));
	const height = Math.max(...tiles.slice(0, columns).map((tile) => tile.h));
	const handle = (axis: "x" | "y", x: number, y: number) => <button key={axis} type="button" className={cn("arrange-gap-handle", axis === "y" && "is-vertical")} aria-label={axis === "x" ? "Drag horizontal gap" : "Drag vertical gap"}
		style={{ left: x * camera.zoom + camera.x, top: y * camera.zoom + camera.y }} onPointerDown={(event) => onBegin(event, "gap", axis)}
		onKeyDown={(event) => { if (["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"].includes(event.key)) { event.preventDefault(); onChange(settings.gap + (["ArrowRight", "ArrowUp"].includes(event.key) ? 4 : -4)); } }}><span /><b>{settings.gap}</b></button>;
	return <>{columns > 1 ? handle("x", box.x + width + settings.gap / 2, box.y + height / 2) : null}{tiles.length > columns ? handle("y", box.x + width / 2, box.y + height + (settings.gap + 36) / 2) : null}</>;
}

function Tool({ label, active = false, onClick, onPreview, onEndPreview, children }: { label: string; active?: boolean; onClick: () => void; onPreview?: () => void; onEndPreview?: () => void; children: ReactNode }) {
	return <button type="button" className="arrange-tool" aria-label={label} aria-pressed={active} onClick={onClick} onPointerEnter={onPreview} onFocus={onPreview} onPointerLeave={onEndPreview} onBlur={onEndPreview}>{children}<span className="arrange-tooltip">{label}</span></button>;
}
function Divider() { return <span className="arrange-divider" />; }
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
	return <div className="arrange-stepper"><button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button><span aria-label={label}>{value} col</span><button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button></div>;
}
function LayoutIcon({ layout }: { layout: Exclude<Layout, "free"> }) {
	return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">{layout === "row" ? <><rect x="2" y="5" width="4" height="10" rx="1" /><rect x="8" y="5" width="4" height="10" rx="1" /><rect x="14" y="5" width="4" height="10" rx="1" /></> : layout === "column" ? <><rect x="5" y="2" width="10" height="4" rx="1" /><rect x="5" y="8" width="10" height="4" rx="1" /><rect x="5" y="14" width="10" height="4" rx="1" /></> : <><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></>}</svg>;
}
function AlignIcon() { return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><path d="M2 3h16" /><rect x="4" y="6" width="4" height="11" rx="1" /><rect x="12" y="6" width="4" height="7" rx="1" /></svg>; }
function GripIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">{[4, 8, 12].flatMap((x) => [4, 8, 12].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1" />))}</svg>; }
