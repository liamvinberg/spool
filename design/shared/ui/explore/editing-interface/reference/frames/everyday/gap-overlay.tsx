import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type GapBand, type GapProperty, gapBands, gapBinding, rounded, spacingChoices } from "../editing/gap";
import { gapValue } from "./spacing";

export type GapAnchor = { element: HTMLElement; rect: DOMRect; node: HTMLElement };
export function GapOverlay({
	node,
	property,
	value,
	stage,
	zoom,
	revision,
	disabled,
	cancelled,
	onOpen,
	onBegin,
	onChange,
	onFinish,
	onCancel,
	onHint,
}: {
	node: HTMLElement;
	property: GapProperty;
	value: number;
	stage: RefObject<HTMLDivElement | null>;
	zoom: number;
	revision: number;
	disabled: boolean;
	cancelled: RefObject<boolean>;
	onOpen: (anchor: GapAnchor) => void;
	onBegin: () => void;
	onChange: (value: string) => void;
	onFinish: () => void;
	onCancel: () => void;
	onHint: (hint: string) => void;
}) {
	const [bands, setBands] = useState<GapBand[]>([]);
	const [active, setActive] = useState<number | null>(null);
	const [dragging, setDragging] = useState(false);
	const read = useRef<() => void>(() => {});
	const cleanup = useRef<() => void>(() => {});
	const grabbed = useRef<{ index: number; box: GapBand; count: number } | null>(null);
	const live = useRef({ onBegin, onChange, onFinish, onCancel, zoom, disabled });
	live.current = { onBegin, onChange, onFinish, onCancel, zoom, disabled };
	useLayoutEffect(() => {
		const viewport = stage.current;
		if (!viewport) return;
		let frame = 0;
		const update = () => {
			const next = gapBands(node, viewport, live.current.zoom);
			const held = grabbed.current;
			// Keep the captured target mounted even when its gap reaches zero.
			setBands(
				held
					? Array.from({ length: held.count }, (_, i) =>
							i === held.index ? held.box : (next[i] ?? { left: 0, top: 0, width: 0, height: 0 }),
						)
					: next,
			);
		};
		const schedule = () => {
			if (!frame)
				frame = requestAnimationFrame(() => {
					frame = 0;
					update();
				});
		};
		read.current = update;
		update();
		const observer = new ResizeObserver(schedule);
		observer.observe(node);
		observer.observe(viewport);
		for (const child of node.children) observer.observe(child);
		viewport.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("resize", schedule);
		return () => {
			cleanup.current();
			observer.disconnect();
			cancelAnimationFrame(frame);
			viewport.removeEventListener("scroll", schedule);
			window.removeEventListener("resize", schedule);
		};
	}, [node, stage]);
	useLayoutEffect(() => {
		void revision;
		void zoom;
		read.current();
	}, [revision, zoom, dragging]);
	useEffect(() => {
		if (cancelled.current || disabled) cleanup.current();
	}, [revision, disabled, cancelled]);
	return (
		<div
			className="ep-overlays ep-gaps"
			data-active={active !== null || undefined}
			style={{ visibility: disabled ? "hidden" : undefined }}
		>
			{bands.map((box, i) => (
				<button
					// The index identifies an adjacent pair throughout one drag.
					key={`${i}`}
					type="button"
					className="ep-gap-band"
					data-axis={property === "column-gap" ? "x" : "y"}
					data-active={active === i || undefined}
					data-compact={
						(property === "column-gap"
							? box.width < String(rounded(value)).length * 6 + (gapBinding(node, property) ? 22 : 10)
							: box.height < 22) || undefined
					}
					style={box}
					aria-label={`Edit ${property === "column-gap" ? "horizontal" : "vertical"} gap, ${rounded(value)} pixels`}
					onPointerEnter={() => {
						setActive(i);
						onHint("Gap · drag to adjust · click for a value or spacing token · Escape cancels");
					}}
					onPointerLeave={() => {
						if (!dragging) setActive(null);
					}}
					onFocus={() => setActive(i)}
					onBlur={() => {
						if (!dragging) setActive(null);
					}}
					onClick={(event) => {
						// Pointer gestures open on release; native keyboard activation opens here.
						if (event.detail === 0)
							onOpen({ element: event.currentTarget, rect: event.currentTarget.getBoundingClientRect(), node });
					}}
					onPointerDown={(event) => {
						if (event.button !== 0 || event.altKey || disabled || grabbed.current) return;
						event.preventDefault();
						event.stopPropagation();
						const element = event.currentTarget;
						const anchor = { element, rect: element.getBoundingClientRect(), node };
						const x = event.clientX,
							y = event.clientY;
						const binding = gapBinding(node, property);
						const choices = binding ? spacingChoices(node) : [];
						const pointerId = event.pointerId;
						grabbed.current = { index: i, box, count: bands.length };
						let started = false,
							ended = false;
						element.setPointerCapture(pointerId);
						const end = (cancel: boolean) => {
							if (ended) return;
							ended = true;
							grabbed.current = null;
							element.removeEventListener("pointermove", move);
							element.removeEventListener("pointerup", up);
							element.removeEventListener("pointercancel", abort);
							element.removeEventListener("lostpointercapture", abort);
							window.removeEventListener("blur", abort);
							window.removeEventListener("keydown", key);
							window.removeEventListener("resize", abort);
							stage.current?.removeEventListener("scroll", abort);
							stage.current?.parentElement?.removeEventListener("wheel", wheel, true);
							if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
							setDragging(false);
							setActive(null);
							if (started) {
								if (cancel || cancelled.current) live.current.onCancel();
								else live.current.onFinish();
								stage.current?.focus({ preventScroll: true });
							} else if (!cancel) onOpen(anchor);
						};
						const move = (e: PointerEvent) => {
							if (e.pointerId !== pointerId) return;
							if (live.current.zoom !== zoom || live.current.disabled) {
								end(true);
								return;
							}
							const delta = property === "column-gap" ? e.clientX - x : e.clientY - y;
							if (!started && Math.abs(delta) < 3) return;
							if (!started) {
								live.current.onBegin();
								started = true;
								setDragging(true);
							}
							const step = e.shiftKey ? 10 : 1;
							live.current.onChange(gapValue(value + Math.round(delta / zoom / step) * step, binding, choices));
						};
						const up = (e: PointerEvent) => {
							if (e.pointerId === pointerId) end(false);
						};
						const abort = () => end(true);
						const key = (e: KeyboardEvent) => {
							if (e.key === "Escape") {
								e.preventDefault();
								end(true);
							}
						};
						const wheel = (e: WheelEvent) => {
							if (e.ctrlKey || e.metaKey) end(true);
						};
						cleanup.current = abort;
						element.addEventListener("pointermove", move);
						element.addEventListener("pointerup", up);
						element.addEventListener("pointercancel", abort);
						element.addEventListener("lostpointercapture", abort);
						window.addEventListener("blur", abort);
						window.addEventListener("keydown", key);
						window.addEventListener("resize", abort);
						stage.current?.addEventListener("scroll", abort, { passive: true });
						stage.current?.parentElement?.addEventListener("wheel", wheel, true);
					}}
				>
					<span className="ep-gap-mark" />
					<span className="ep-gap-value">
						{rounded(value)}
						{gapBinding(node, property) ? " ↗" : ""}
					</span>
				</button>
			))}
		</div>
	);
}
