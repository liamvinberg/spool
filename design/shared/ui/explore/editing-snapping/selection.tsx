import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type ResizeEdge, resizeBox } from "../editing-interface/reference/frames/editing/resize";

import { scales, step } from "./browser";
import type { Correction } from "./geometry";

type Box = { left: number; top: number; width: number; height: number };
type Line = { x1: number; y1: number; x2: number; y2: number };
const HANDLES: { edge: ResizeEdge; name: string }[] = [
	{ edge: "nw", name: "top left" },
	{ edge: "n", name: "top" },
	{ edge: "ne", name: "top right" },
	{ edge: "e", name: "right" },
	{ edge: "se", name: "bottom right" },
	{ edge: "s", name: "bottom" },
	{ edge: "sw", name: "bottom left" },
	{ edge: "w", name: "left" },
];
const ZERO: Box = { left: 0, top: 0, width: 0, height: 0 };
const right = (b: Box) => b.left + b.width;
const bottom = (b: Box) => b.top + b.height;

// Measurements describe border boxes. They do not infer margin, gap or padding.
function distances(a: Box, b: Box): Line[] {
	const overlapLeft = Math.max(a.left, b.left);
	const overlapRight = Math.min(right(a), right(b));
	const overlapTop = Math.max(a.top, b.top);
	const overlapBottom = Math.min(bottom(a), bottom(b));
	const x = overlapRight >= overlapLeft ? (overlapLeft + overlapRight) / 2 : a.left + a.width / 2;
	const y = overlapBottom >= overlapTop ? (overlapTop + overlapBottom) / 2 : a.top + a.height / 2;
	const horizontal = right(a) <= b.left || right(b) <= a.left;
	const vertical = bottom(a) <= b.top || bottom(b) <= a.top;
	const lines: Line[] = [];
	if (horizontal) {
		lines.push({
			x1: right(a) <= b.left ? right(a) : right(b),
			x2: right(a) <= b.left ? b.left : a.left,
			y1: y,
			y2: y,
		});
	}
	if (vertical) {
		lines.push({
			x1: x,
			x2: x,
			y1: bottom(a) <= b.top ? bottom(a) : bottom(b),
			y2: bottom(a) <= b.top ? b.top : a.top,
		});
	}
	if (!horizontal && !vertical) {
		lines.push(
			{ x1: a.left, x2: b.left, y1: y, y2: y },
			{ x1: right(a), x2: right(b), y1: y, y2: y },
			{ x1: x, x2: x, y1: a.top, y2: b.top },
			{ x1: x, x2: x, y1: bottom(a), y2: bottom(b) },
		);
	}
	return horizontal || vertical ? lines : lines.filter((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > 0.5);
}

function extensions(line: Line, a: Box, b: Box): Line[] {
	const horizontal = line.y1 === line.y2;
	if (horizontal && !(right(a) <= b.left || right(b) <= a.left)) return [];
	if (!horizontal && !(bottom(a) <= b.top || bottom(b) <= a.top)) return [];
	const first = horizontal ? (right(a) <= b.left ? a : b) : bottom(a) <= b.top ? a : b;
	const second = first === a ? b : a;
	return [first, second]
		.map((box, i) => {
			const x = i === 0 ? line.x1 : line.x2;
			const y = i === 0 ? line.y1 : line.y2;
			return {
				x1: x,
				y1: y,
				x2: Math.max(box.left, Math.min(right(box), x)),
				y2: Math.max(box.top, Math.min(bottom(box), y)),
			};
		})
		.filter((l) => l.x1 !== l.x2 || l.y1 !== l.y2);
}

export function Selection({
	selected,
	hovered,
	measuring,
	editing,
	stage,
	revision,
	padding,
	onBegin,
	onChange,
	onPosition,
	onRestore,
	zoom,
	onFinish,
	onCancel,
	cancelled,
	onHint,
	snapThreshold,
}: {
	selected: HTMLElement | null;
	hovered: HTMLElement | null;
	measuring: boolean;
	editing: boolean;
	stage: RefObject<HTMLDivElement | null>;
	revision: number;
	padding: string | null;
	onBegin: () => void;
	onChange: (property: string, value: string) => void;
	onPosition: (property: string, value: string) => void;
	onRestore: (property: string) => void;
	zoom: number;
	onFinish: () => void;
	onCancel: () => void;
	cancelled: RefObject<boolean>;
	onHint: (s: string) => void;
	snapThreshold: number;
}) {
	const [boxes, setBoxes] = useState({ selected: ZERO, hover: ZERO });
	const [guides, setGuides] = useState<Correction | null>(null);
	const [activeEdge, setActiveEdge] = useState<ResizeEdge | null>(null);
	const update = useRef<() => void>(() => {});
	const hover = hovered === selected && measuring ? (selected?.parentElement ?? null) : hovered;
	useLayoutEffect(() => {
		const viewport = stage.current;
		if (!viewport || !selected) return;
		let frame: number | null = null;
		const read = () => {
			const origin = viewport.getBoundingClientRect();
			const box = (node: HTMLElement | null) => {
				if (!node) return ZERO;
				const b = node.getBoundingClientRect();
				return { left: b.left - origin.left, top: b.top - origin.top, width: b.width, height: b.height };
			};
			setBoxes({ selected: box(selected), hover: box(hover) });
		};
		const schedule = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				read();
			});
		};
		update.current = read;
		read();
		const observer = new ResizeObserver(schedule);
		observer.observe(selected);
		observer.observe(viewport);
		if (hover) observer.observe(hover);
		viewport.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			observer.disconnect();
			viewport.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [selected, hover, stage]);
	useLayoutEffect(() => {
		void revision;
		void zoom;
		update.current();
	}, [revision, zoom]);
	if (!selected) return null;
	const lines =
		measuring && !activeEdge && hover && hover !== selected && !editing ? distances(boxes.selected, boxes.hover) : [];
	const style = padding ? getComputedStyle(selected) : null;
	const inset = style && padding ? (Number.parseFloat(style.getPropertyValue(padding)) || 0) * zoom : 0;
	const paddingStyle =
		padding === "padding-top"
			? { top: 0, left: 0, right: 0, height: inset }
			: padding === "padding-bottom"
				? { bottom: 0, left: 0, right: 0, height: inset }
				: padding === "padding-left"
					? { top: 0, bottom: 0, left: 0, width: inset }
					: { top: 0, bottom: 0, right: 0, width: inset };
	return (
		<div className="ep-overlays" data-measuring={(measuring && !activeEdge) || undefined}>
			{hover && hover !== selected && !editing && !activeEdge && <div className="ep-hover" style={boxes.hover} />}
			<div className="ep-outline" data-editing={editing || undefined} style={boxes.selected}>
				{padding && inset > 0 && <div className="ep-padding-preview" style={paddingStyle} />}
				{!editing &&
					!["inline", "none", "contents"].includes(getComputedStyle(selected).display) &&
					HANDLES.filter(({ edge }) => {
						if (activeEdge === edge) return true;
						if (Math.min(boxes.selected.width, boxes.selected.height) < 24) return false;
						return (
							edge.length === 2 ||
							(edge === "n" || edge === "s" ? boxes.selected.width : boxes.selected.height) >= 72
						);
					}).map(({ edge, name }) => (
						<ResizeHandle
							key={edge}
							edge={edge}
							name={name}
							selected={selected}
							zoom={zoom}
							onBegin={() => {
								setActiveEdge(edge);
								onBegin();
								stage.current?.focus({ preventScroll: true });
							}}
							onChange={onChange}
							onPosition={onPosition}
							onRestore={onRestore}
							onFinish={(pointer) => {
								setActiveEdge(null);
								setGuides(null);
								onFinish();
								if (pointer) stage.current?.focus({ preventScroll: true });
							}}
							onCancel={() => {
								setActiveEdge(null);
								setGuides(null);
								onCancel();
								stage.current?.focus({ preventScroll: true });
							}}
							cancelled={cancelled}
							onHint={onHint}
							snapThreshold={snapThreshold}
							onGuides={setGuides}
						/>
					))}
			</div>
			{activeEdge && !cancelled.current && guides && stage.current && (
				<svg className="es-guides" role="img" aria-label="Resize alignment guides">
					{guides.v.map((x) => (
						<line
							key={`v:${x}`}
							x1={x - stage.current!.getBoundingClientRect().left}
							x2={x - stage.current!.getBoundingClientRect().left}
							y1={0}
							y2="100%"
						/>
					))}
					{guides.h.map((y) => (
						<line
							key={`h:${y}`}
							y1={y - stage.current!.getBoundingClientRect().top}
							y2={y - stage.current!.getBoundingClientRect().top}
							x1={0}
							x2="100%"
						/>
					))}
				</svg>
			)}
			{lines.length > 0 && (
				<svg className="ep-measurements" role="img" aria-label="Distances between element boxes">
					{lines.map((line, i) => {
						const horizontal = line.y1 === line.y2;
						const value = Number((Math.hypot(line.x2 - line.x1, line.y2 - line.y1) / zoom).toFixed(1));
						const x = (line.x1 + line.x2) / 2;
						const y = (line.y1 + line.y2) / 2;
						const label = `${value}`;
						return (
							<g key={`${i}:${horizontal}`}>
								<line {...line} />
								{extensions(line, boxes.selected, boxes.hover).map((l) => (
									<line key={`${l.x1}:${l.y1}`} {...l} strokeDasharray="3 3" opacity={0.6} />
								))}
								{[0, 1].map((end) => {
									const px = end ? line.x2 : line.x1;
									const py = end ? line.y2 : line.y1;
									return (
										<line
											key={end}
											x1={px - (horizontal ? 0 : 3)}
											x2={px + (horizontal ? 0 : 3)}
											y1={py - (horizontal ? 3 : 0)}
											y2={py + (horizontal ? 3 : 0)}
										/>
									);
								})}
								<rect
									x={x - label.length * 3.5 - 5}
									y={y - 8}
									width={label.length * 7 + 10}
									height={16}
									rx={2}
								/>
								<text x={x} y={y} dominantBaseline="central" textAnchor="middle">
									{label}
								</text>
							</g>
						);
					})}
				</svg>
			)}
		</div>
	);
}

function ResizeHandle({
	edge,
	name,
	selected,
	zoom,
	onBegin,
	onChange,
	onPosition,
	onRestore,
	onFinish,
	onCancel,
	cancelled,
	onHint,
	snapThreshold,
	onGuides,
}: {
	edge: ResizeEdge;
	name: string;
	selected: HTMLElement;
	zoom: number;
	onBegin: () => void;
	onChange: (p: string, v: string) => void;
	onPosition: (p: string, v: string) => void;
	onRestore: (p: string) => void;
	onFinish: (pointer: boolean) => void;
	onCancel: () => void;
	cancelled: RefObject<boolean>;
	onHint: (s: string) => void;
	snapThreshold: number;
	onGuides: (guides: Correction | null) => void;
}) {
	const read = () => {
		const style = getComputedStyle(selected);
		const scale = scales(selected);
		const px = (p: string) => Number.parseFloat(style.getPropertyValue(p)) || 0;
		const inset = (p: string, fallback: number) => {
			const value = Number.parseFloat(style.getPropertyValue(p));
			return Number.isFinite(value) ? value : fallback;
		};
		const limit = (p: string, extra: number, fallback: number) => {
			const value = style.getPropertyValue(p);
			return value.endsWith("px") ? Number.parseFloat(value) + extra : fallback;
		};
		const box = selected.getBoundingClientRect();
		const extraWidth =
			style.boxSizing === "border-box"
				? 0
				: px("padding-left") + px("padding-right") + px("border-left-width") + px("border-right-width");
		const extraHeight =
			style.boxSizing === "border-box"
				? 0
				: px("padding-top") + px("padding-bottom") + px("border-top-width") + px("border-bottom-width");
		return {
			width: box.width / scale.w,
			height: box.height / scale.h,
			scale,
			extraWidth,
			extraHeight,
			free: style.position === "absolute" || style.position === "fixed",
			left: inset("left", selected.offsetLeft),
			top: inset("top", selected.offsetTop),
			limits: {
				minWidth: limit("min-width", extraWidth, extraWidth),
				minHeight: limit("min-height", extraHeight, extraHeight),
				maxWidth: limit("max-width", extraWidth, Infinity),
				maxHeight: limit("max-height", extraHeight, Infinity),
			},
		};
	};
	type Held = ReturnType<typeof read> & {
		x: number;
		y: number;
		lastX: number;
		lastY: number;
		moved: boolean;
		proportional: boolean;
	};
	const held = useRef<Held | null>(null);
	const [dragging, setDragging] = useState(false);
	const apply = (h: Held, dx: number, dy: number, alt: boolean, shift: boolean, bypass = false) => {
		if (cancelled.current) return;
		const box = resizeBox(h, edge, (dx * zoom) / h.scale.w, (dy * zoom) / h.scale.h, alt && h.free, shift, h.limits);
		if (h.proportional && !shift && edge.length === 1) onRestore(edge === "n" || edge === "s" ? "width" : "height");
		h.proportional = shift;
		const applySize = (size: { w: number; h: number }) => {
			if (cancelled.current) return;
			if (edge.includes("w") || edge.includes("e") || shift) onChange("width", `${size.w}px`);
			if (edge.includes("n") || edge.includes("s") || shift) onChange("height", `${size.h}px`);
			if (h.free) {
				const width = size.w + h.extraWidth;
				const height = size.h + h.extraHeight;
				const shiftX =
					alt || (shift && !/[we]/.test(edge)) ? (h.width - width) / 2 : edge.includes("w") ? h.width - width : 0;
				const shiftY =
					alt || (shift && !/[ns]/.test(edge))
						? (h.height - height) / 2
						: edge.includes("n")
							? h.height - height
							: 0;
				onPosition("left", `${h.left + shiftX}px`);
				onPosition("right", "auto");
				onPosition("top", `${h.top + shiftY}px`);
				onPosition("bottom", "auto");
			}
		};
		let rendered = { width: box.width, height: box.height };
		let snapped = false;
		try {
			const result = step(
				selected,
				{
					w: Math.max(8, Math.round(box.width - h.extraWidth)),
					h: Math.max(8, Math.round(box.height - h.extraHeight)),
				},
				{
					sx: edge.includes("w") ? -1 : edge.includes("e") ? 1 : 0,
					sy: edge.includes("n") ? -1 : edge.includes("s") ? 1 : 0,
					zoom: 1,
					threshold: snapThreshold,
					bypass,
					...(shift ? { ratio: (h.width * h.scale.w) / (h.height * h.scale.h) } : {}),
				},
				{ apply: applySize },
			);
			onGuides(result);
			rendered = { width: result.actual.w / zoom, height: result.actual.h / zoom };
			snapped = result.v.length > 0 || result.h.length > 0;
		} catch {
			onGuides(null);
			onHint("This transform cannot support resize alignment. Use exact values in Properties.");
			return;
		}
		onHint(
			bypass
				? "Snapping bypassed · Release Cmd/Ctrl to align again"
				: h.free
					? `${Math.round(rendered.width)} × ${Math.round(rendered.height)} · ${alt ? "from center" : "opposite edge held"}${shift ? " · proportions locked" : ""}${snapped ? " · aligned" : ""}`
					: `${Math.round(rendered.width)} × ${Math.round(rendered.height)} · parent layout positions this element${shift ? " · proportions locked" : ""}${snapped ? " · aligned" : ""}`,
		);
	};
	const latest = useRef({ onCancel, apply });
	latest.current = { onCancel, apply };
	useEffect(() => {
		const blur = () => {
			if (held.current) {
				held.current = null;
				setDragging(false);
				latest.current.onCancel();
			}
		};
		const modifier = (event: KeyboardEvent) => {
			const h = held.current;
			if (!h?.moved || !["Alt", "Shift", "Meta", "Control"].includes(event.key)) return;
			latest.current.apply(
				h,
				(h.lastX - h.x) / zoom,
				(h.lastY - h.y) / zoom,
				event.altKey,
				event.shiftKey,
				event.metaKey || event.ctrlKey,
			);
		};
		const camera = (event: Event) => {
			if (held.current && event.target instanceof Element && event.target.matches(".ep-stage")) blur();
		};
		window.addEventListener("scroll", camera, true);
		window.addEventListener("wheel", blur, { passive: true });
		window.addEventListener("blur", blur);
		window.addEventListener("keydown", modifier);
		window.addEventListener("keyup", modifier);
		return () => {
			window.removeEventListener("scroll", camera, true);
			window.removeEventListener("wheel", blur);
			window.removeEventListener("blur", blur);
			if (held.current) blur();
			window.removeEventListener("keydown", modifier);
			window.removeEventListener("keyup", modifier);
		};
	}, [zoom]);
	const start = (x: number, y: number): Held => ({
		x,
		y,
		lastX: x,
		lastY: y,
		...read(),
		moved: false,
		proportional: false,
	});
	return (
		<button
			type="button"
			className="ep-resize"
			data-edge={edge}
			data-dragging={dragging || undefined}
			aria-label={`Resize ${name}`}
			title={`Resize ${name}`}
			onPointerEnter={() =>
				onHint(
					"Resize · Shift keeps proportions · Option centers free elements · Cmd/Ctrl bypasses snapping · Escape cancels",
				)
			}
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				e.stopPropagation();
				if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
				onBegin();
				try {
					held.current = start(e.clientX, e.clientY);
				} catch {
					onCancel();
					onHint("This transform cannot support resize alignment. Use exact values in Properties.");
					return;
				}
				e.currentTarget.setPointerCapture(e.pointerId);
			}}
			onPointerMove={(e) => {
				const h = held.current;
				if (!h || cancelled.current) return;
				h.lastX = e.clientX;
				h.lastY = e.clientY;
				const dx = e.clientX - h.x;
				const dy = e.clientY - h.y;
				if (!h.moved && Math.hypot(dx, dy) < 3) return;
				h.moved = true;
				setDragging(true);
				apply(h, dx / zoom, dy / zoom, e.altKey, e.shiftKey, e.metaKey || e.ctrlKey);
			}}
			onPointerUp={(e) => {
				const h = held.current;
				held.current = null;
				setDragging(false);
				if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
				if (h) {
					if (cancelled.current) onCancel();
					else onFinish(true);
				}
				if (h && !h.moved && !cancelled.current)
					document
						.querySelector<HTMLInputElement>(
							`input[aria-label="${edge === "n" || edge === "s" ? "height" : "width"}"]`,
						)
						?.focus();
			}}
			onLostPointerCapture={() => {
				if (held.current) {
					held.current = null;
					setDragging(false);
					onCancel();
				}
			}}
			onPointerCancel={() => {
				held.current = null;
				setDragging(false);
				onCancel();
			}}
			onKeyDown={(e) => {
				if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
				e.preventDefault();
				e.stopPropagation();
				onBegin();
				const step = e.shiftKey ? 10 : 1;
				let original: Held;
				try {
					original = start(0, 0);
				} catch {
					onCancel();
					onHint("This transform cannot support resize alignment. Use exact values in Properties.");
					return;
				}
				apply(
					original,
					e.key === "ArrowRight" ? step : e.key === "ArrowLeft" ? -step : 0,
					e.key === "ArrowDown" ? step : e.key === "ArrowUp" ? -step : 0,
					e.altKey,
					false,
					true,
				);
				onFinish(false);
			}}
		/>
	);
}
