import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

type Box = { left: number; top: number; width: number; height: number };
type Line = { x1: number; y1: number; x2: number; y2: number };
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
	onFinish,
	onCancel,
	cancelled,
	onHint,
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
	onFinish: () => void;
	onCancel: () => void;
	cancelled: RefObject<boolean>;
	onHint: (s: string) => void;
}) {
	const [boxes, setBoxes] = useState({ selected: ZERO, hover: ZERO });
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
		update.current();
	}, [revision]);
	if (!selected) return null;
	const lines = measuring && hover && hover !== selected && !editing ? distances(boxes.selected, boxes.hover) : [];
	const style = padding ? getComputedStyle(selected) : null;
	const inset = style && padding ? Number.parseFloat(style.getPropertyValue(padding)) || 0 : 0;
	const paddingStyle =
		padding === "padding-top"
			? { top: 0, left: 0, right: 0, height: inset }
			: padding === "padding-bottom"
				? { bottom: 0, left: 0, right: 0, height: inset }
				: padding === "padding-left"
					? { top: 0, bottom: 0, left: 0, width: inset }
					: { top: 0, bottom: 0, right: 0, width: inset };
	return (
		<div className="ep-overlays" data-measuring={measuring || undefined}>
			{hover && hover !== selected && !editing && <div className="ep-hover" style={boxes.hover} />}
			<div className="ep-outline" data-editing={editing || undefined} style={boxes.selected}>
				{padding && inset > 0 && <div className="ep-padding-preview" style={paddingStyle} />}
				{!editing &&
					!measuring &&
					!["inline", "none", "contents"].includes(getComputedStyle(selected).display) &&
					["width", "height", "size"].map((axis) => (
						<ResizeHandle
							key={axis}
							axis={axis}
							selected={selected}
							onBegin={onBegin}
							onChange={onChange}
							onFinish={onFinish}
							onCancel={onCancel}
							cancelled={cancelled}
							onHint={onHint}
						/>
					))}
			</div>
			{lines.length > 0 && (
				<svg className="ep-measurements" role="img" aria-label="Distances between element boxes">
					{lines.map((line, i) => {
						const horizontal = line.y1 === line.y2;
						const value = Number(Math.hypot(line.x2 - line.x1, line.y2 - line.y1).toFixed(1));
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
	axis,
	selected,
	onBegin,
	onChange,
	onFinish,
	onCancel,
	cancelled,
	onHint,
}: {
	axis: string;
	selected: HTMLElement;
	onBegin: () => void;
	onChange: (p: string, v: string) => void;
	onFinish: () => void;
	onCancel: () => void;
	cancelled: RefObject<boolean>;
	onHint: (s: string) => void;
}) {
	const held = useRef<{ x: number; y: number; width: number; height: number; moved: boolean } | null>(null);
	const [dragging, setDragging] = useState(false);
	const cancel = useRef(onCancel);
	cancel.current = onCancel;
	useEffect(() => {
		const blur = () => {
			if (!held.current) return;
			held.current = null;
			setDragging(false);
			cancel.current();
		};
		window.addEventListener("blur", blur);
		return () => window.removeEventListener("blur", blur);
	}, []);
	const read = () => {
		const style = getComputedStyle(selected);
		return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
	};
	return (
		<button
			type="button"
			className="ep-resize"
			data-axis={axis}
			data-dragging={dragging || undefined}
			aria-label={`Resize ${axis}`}
			title={axis === "size" ? "Resize width and height" : `Resize ${axis}`}
			onPointerEnter={() =>
				onHint(
					`${axis === "size" ? "Width and height" : axis} · drag to resize in page flow · Shift snaps to 10px · Escape cancels`,
				)
			}
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				e.stopPropagation();
				if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
				onBegin();
				held.current = { x: e.clientX, y: e.clientY, ...read(), moved: false };
				e.currentTarget.setPointerCapture(e.pointerId);
			}}
			onPointerMove={(e) => {
				const h = held.current;
				if (!h || cancelled.current) return;
				const dx = e.clientX - h.x;
				const dy = e.clientY - h.y;
				if (!h.moved && Math.hypot(dx, dy) < 3) return;
				h.moved = true;
				setDragging(true);
				const snap = (v: number) => Math.max(1, e.shiftKey ? Math.round(v / 10) * 10 : Math.round(v * 10) / 10);
				if (axis !== "height") onChange("width", `${snap(h.width + dx)}px`);
				if (axis !== "width") onChange("height", `${snap(h.height + dy)}px`);
			}}
			onPointerUp={(e) => {
				const h = held.current;
				held.current = null;
				setDragging(false);
				if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
				onFinish();
				if (h && !h.moved && !cancelled.current)
					document
						.querySelector<HTMLInputElement>(`input[aria-label="${axis === "size" ? "width" : axis}"]`)
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
				const property =
					axis === "size" ? (e.key === "ArrowUp" || e.key === "ArrowDown" ? "height" : "width") : axis;
				const size = read();
				onBegin();
				onChange(
					property,
					`${Math.max(1, (property === "width" ? size.width : size.height) + (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1))}px`,
				);
				onFinish();
			}}
		/>
	);
}
