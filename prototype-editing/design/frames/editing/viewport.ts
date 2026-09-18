import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";

type Anchor = { x: number; y: number; screenX: number; screenY: number };
type Pan = { id: number; x: number; y: number; left: number; top: number };
const clamp = (zoom: number) => Math.max(0.05, Math.min(8, zoom));
const editing = (target: EventTarget | null) =>
	target instanceof Element &&
	(Boolean(target.closest("input,textarea,select")) || (target instanceof HTMLElement && target.isContentEditable));

export function useViewport(stage: RefObject<HTMLDivElement | null>, document: RefObject<HTMLDivElement | null>) {
	const [zoom, setZoom] = useState(1);
	const [width, setWidth] = useState(0);
	const [panning, setPanning] = useState(false);
	const requested = useRef(1);
	const applied = useRef(1);
	const anchor = useRef<Anchor | null>(null);
	const space = useRef(false);
	const pan = useRef<Pan | null>(null);
	const suppressClick = useRef(false);

	const position = useCallback(
		(point: Anchor, scale: number) => {
			const viewport = stage.current;
			const page = document.current;
			if (!viewport || !page) return;
			const bounds = viewport.getBoundingClientRect();
			const content = page.getBoundingClientRect();
			viewport.scrollLeft += content.left + point.x * scale - bounds.left - point.screenX;
			viewport.scrollTop += content.top + point.y * scale - bounds.top - point.screenY;
		},
		[stage, document],
	);
	const scaleTo = useCallback(
		(next: number, point: Anchor) => {
			if (!Number.isFinite(next)) return;
			const scale = clamp(next);
			requested.current = scale;
			anchor.current = point;
			setZoom(scale);
			if (scale === applied.current) {
				position(point, scale);
				anchor.current = null;
			}
		},
		[position],
	);
	const zoomAt = useCallback(
		(next: number, clientX?: number, clientY?: number) => {
			const viewport = stage.current;
			const page = document.current;
			if (!viewport || !page) return;
			const bounds = viewport.getBoundingClientRect();
			const content = page.getBoundingClientRect();
			const x = clientX ?? bounds.left + viewport.clientWidth / 2;
			const y = clientY ?? bounds.top + viewport.clientHeight / 2;
			scaleTo(next, {
				x: (x - content.left) / applied.current,
				y: (y - content.top) / applied.current,
				screenX: x - bounds.left,
				screenY: y - bounds.top,
			});
		},
		[stage, document, scaleTo],
	);
	const zoomBy = useCallback((factor: number) => zoomAt(requested.current * factor), [zoomAt]);
	const actualSize = useCallback(() => zoomAt(1), [zoomAt]);
	const fit = useCallback(
		(node: HTMLElement | null) => {
			const viewport = stage.current;
			const page = document.current;
			if (!viewport || !page) return;
			const selected = node && page.contains(node) ? node : page;
			const content = page.getBoundingClientRect();
			const bounds = selected.getBoundingClientRect();
			const w = bounds.width / applied.current;
			const h =
				selected === page
					? Math.max(page.scrollHeight, bounds.height / applied.current)
					: bounds.height / applied.current;
			if (w <= 0 || h <= 0) return;
			const next = clamp(
				Math.min(Math.max(1, viewport.clientWidth - 32) / w, Math.max(1, viewport.clientHeight - 32) / h),
			);
			const top = selected === page && h * next > viewport.clientHeight;
			scaleTo(next, {
				x: (bounds.left - content.left) / applied.current + w / 2,
				y: top ? 0 : (bounds.top - content.top) / applied.current + h / 2,
				screenX: viewport.clientWidth / 2,
				screenY: top ? 0 : viewport.clientHeight / 2,
			});
		},
		[stage, document, scaleTo],
	);
	const fitPage = useCallback(() => fit(null), [fit]);
	const stopPan = useCallback(
		(resetSpace = false) => {
			const held = pan.current;
			pan.current = null;
			if (resetSpace) space.current = false;
			if (held && stage.current?.hasPointerCapture(held.id)) stage.current.releasePointerCapture(held.id);
			setPanning(space.current);
		},
		[stage],
	);
	const keyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.isComposing || editing(event.target)) return false;
			if (event.key === "Escape" && (space.current || pan.current)) stopPan(true);
			else if (event.code === "Space" && !event.metaKey && !event.ctrlKey && !event.altKey) {
				space.current = true;
				setPanning(true);
			} else if (!event.altKey && ["+", "=", "-"].includes(event.key)) zoomBy(event.key === "-" ? 1 / 1.2 : 1.2);
			else if (event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && event.code === "Digit0")
				actualSize();
			else if (event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && event.code === "Digit1")
				fitPage();
			else return false;
			event.preventDefault();
			event.stopImmediatePropagation();
			return true;
		},
		[actualSize, fitPage, stopPan, zoomBy],
	);
	const keyUp = useCallback(
		(event: KeyboardEvent) => {
			if (event.code === "Space" || event.key === " ") stopPan(true);
		},
		[stopPan],
	);

	useLayoutEffect(() => {
		applied.current = zoom;
		if (anchor.current) {
			position(anchor.current, zoom);
			anchor.current = null;
		}
	}, [zoom, position]);

	useLayoutEffect(() => {
		const viewport = stage.current;
		if (!viewport) return;
		let outerWidth = -1;
		const resize = () => {
			const next = viewport.getBoundingClientRect().width;
			// Zoom can add scrollbars. Only a real viewport resize changes page layout.
			if (next === outerWidth) return;
			outerWidth = next;
			setWidth(viewport.clientWidth);
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(viewport, { box: "border-box" });
		const owner = viewport.ownerDocument;
		const wrap = viewport.parentElement ?? viewport;
		const inside = (target: EventTarget | null) => target instanceof Node && wrap.contains(target);
		const consume = (event: Event) => {
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		const down = (event: PointerEvent) => {
			if (!inside(event.target)) return;
			suppressClick.current = false;
			if (
				!space.current ||
				event.button !== 0 ||
				editing(event.target) ||
				(event.target instanceof Element && event.target.closest(".ep-resize"))
			)
				return;
			consume(event);
			suppressClick.current = true;
			pan.current = {
				id: event.pointerId,
				x: event.clientX,
				y: event.clientY,
				left: viewport.scrollLeft,
				top: viewport.scrollTop,
			};
			viewport.setPointerCapture(event.pointerId);
		};
		const move = (event: PointerEvent) => {
			const held = pan.current;
			if (!held || held.id !== event.pointerId) return;
			consume(event);
			viewport.scrollLeft = held.left - (event.clientX - held.x);
			viewport.scrollTop = held.top - (event.clientY - held.y);
		};
		const up = (event: PointerEvent) => {
			if (pan.current?.id !== event.pointerId) return;
			consume(event);
			stopPan(event.type === "pointercancel");
		};
		const lost = () => {
			if (pan.current) stopPan(true);
		};
		const click = (event: MouseEvent) => {
			if (inside(event.target) && (space.current || suppressClick.current) && !editing(event.target)) consume(event);
		};
		const wheel = (event: WheelEvent) => {
			if ((!event.ctrlKey && !event.metaKey) || editing(event.target)) return;
			consume(event);
			const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
			zoomAt(requested.current * Math.exp(-event.deltaY * unit * 0.002), event.clientX, event.clientY);
		};
		const blur = () => stopPan(true);
		// Capture ahead of React's delegated handlers, but own only this stage and its overlay.
		owner.addEventListener("pointerdown", down, true);
		owner.addEventListener("pointermove", move, true);
		owner.addEventListener("pointerup", up, true);
		owner.addEventListener("pointercancel", up, true);
		owner.addEventListener("click", click, true);
		owner.addEventListener("dblclick", click, true);
		viewport.addEventListener("lostpointercapture", lost);
		wrap.addEventListener("wheel", wheel, { passive: false });
		owner.defaultView?.addEventListener("blur", blur);
		return () => {
			observer.disconnect();
			owner.removeEventListener("pointerdown", down, true);
			owner.removeEventListener("pointermove", move, true);
			owner.removeEventListener("pointerup", up, true);
			owner.removeEventListener("pointercancel", up, true);
			owner.removeEventListener("click", click, true);
			owner.removeEventListener("dblclick", click, true);
			viewport.removeEventListener("lostpointercapture", lost);
			wrap.removeEventListener("wheel", wheel);
			owner.defaultView?.removeEventListener("blur", blur);
			const held = pan.current;
			pan.current = null;
			space.current = false;
			if (held && viewport.hasPointerCapture(held.id)) viewport.releasePointerCapture(held.id);
		};
	}, [stage, stopPan, zoomAt]);

	return { zoom, width, zoomBy, actualSize, fitPage, fitSelection: fit, keyDown, keyUp, panning };
}
