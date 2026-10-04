import { useLayoutEffect, useState } from "react";
import { CoffeeScreen, type CoffeeScreenName } from "shared/ui/demo/coffee-screens";
import { TidemarkLanding } from "shared/ui/demo/tidemark-landing";

/**
 * The project every take on the read-only canvas draws (DEV-114): tidemark app,
 * three pages, frames at their authored size. World units are CSS pixels of the
 * frame itself, so a frame on the canvas and the same frame played are one
 * element at two scales, and growing one into the other is a pure transform.
 *
 * Prototype only.
 */

/** `thumb`: a real project's frame as its cover (DEV-161), `play` the full-size one, `live` its export when it has one */
export type Content = { coffee: CoffeeScreenName; action?: string } | { site: number } | { thumb: string; play: string; live?: string };

export interface Spec {
	name: string;
	x: number;
	y: number;
	w: number;
	h: number;
	content: Content;
	/** where its primary action walks */
	next?: string;
}

export interface Page {
	name: string;
	frames: Spec[];
	threads: { from: string; to: string; might?: boolean }[];
}

export const DEVICE = { w: 390, h: 844 };
const SITE = { w: 1440, h: 900 };

export const PAGES: Page[] = [
	{
		name: "app",
		frames: [
			{ name: "menu", x: 0, y: 70, ...DEVICE, content: { coffee: "menu" }, next: "cart" },
			{ name: "cart", x: 560, y: 0, ...DEVICE, content: { coffee: "cart" }, next: "receipt" },
			{ name: "receipt", x: 1120, y: 100, ...DEVICE, content: { coffee: "receipt" } },
		],
		threads: [
			{ from: "menu", to: "cart" },
			{ from: "cart", to: "receipt", might: true },
		],
	},
	{
		name: "site",
		frames: [
			{ name: "landing", x: 0, y: 0, ...SITE, content: { site: 0 }, next: "pricing" },
			{ name: "pricing", x: 1640, y: 0, ...SITE, content: { site: 1500 } },
		],
		threads: [{ from: "landing", to: "pricing" }],
	},
	{
		name: "drafts",
		frames: [
			{ name: "checkout-v2", x: 0, y: 0, ...DEVICE, content: { coffee: "cart", action: "Pay with Apple Pay" } },
			{ name: "loyalty", x: 560, y: 60, ...DEVICE, content: { coffee: "menu", action: "Join rewards" } },
		],
		threads: [],
	},
];

/** who is in the canvas right now, and on which frame */
export const HERE = [
	{ id: "jonas", frame: "cart" },
	{ id: "mira", frame: "menu" },
];

export const OUTSIDER = { email: "erik@kaffebar.se", by: "jonas" };

/** The live part. Rendered at its authored size; whoever holds it scales it. */
export function FrameBody({ spec, changed = false, fill = false }: { spec: Spec; changed?: boolean; fill?: boolean }) {
	const content = spec.content;
	if ("thumb" in content) {
		return (
			<img
				src={content.thumb}
				alt=""
				draggable={false}
				decoding="async"
				className="block bg-surface object-cover object-top"
				style={{ width: spec.w, height: fill ? "100%" : spec.h, borderRadius: spec.w > 500 ? 6 : 22 }}
			/>
		);
	}
	if ("site" in content) {
		return (
			<div className="overflow-hidden rounded-[10px] bg-[#0A0A0B]" style={{ width: spec.w, height: fill ? "100%" : spec.h }}>
				<div style={{ height: 3200, transform: `translateY(-${content.site}px)` }}>
					<TidemarkLanding />
				</div>
			</div>
		);
	}
	const action = spec.name === "cart" && changed ? "Pay $9.00 with Apple Pay" : content.action;
	return (
		<div style={{ width: spec.w, height: fill ? "100%" : spec.h }}>
			<CoffeeScreen screen={content.coffee} scale="full" actionLabel={action} className={fill ? "rounded-none border-0" : "rounded-[22px]"} />
		</div>
	);
}

/** Clicking a frame's primary action walks; the rest of the frame is the frame's own. */
export function walkOn(event: React.MouseEvent, spec: Spec, go: (name: string) => void) {
	if (spec.next === undefined) return;
	let el = event.target as HTMLElement | null;
	for (let i = 0; i < 4 && el !== null; i += 1) {
		const text = el.textContent?.trim() ?? "";
		if (text.length < 40 && /checkout|pay|order|join|get started|start/i.test(text)) {
			go(spec.next);
			return;
		}
		el = el.parentElement;
	}
}

/* ---------- camera maths ---------- */

export interface Cam {
	x: number;
	y: number;
	z: number;
}

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function bounds(frames: Spec[]): Rect {
	const x = Math.min(...frames.map((f) => f.x));
	const y = Math.min(...frames.map((f) => f.y));
	const r = Math.max(...frames.map((f) => f.x + f.w));
	const b = Math.max(...frames.map((f) => f.y + f.h));
	return { x, y, w: r - x, h: b - y };
}

export function fit(rect: Rect, vw: number, vh: number, pad: { x: number; top: number; bottom: number }, max: number): Cam {
	const z = Math.min((vw - pad.x * 2) / rect.w, (vh - pad.top - pad.bottom) / rect.h, max);
	return {
		z,
		x: vw / 2 - (rect.x + rect.w / 2) * z,
		y: pad.top + (vh - pad.top - pad.bottom) / 2 - (rect.y + rect.h / 2) * z,
	};
}

export function useSize(ref: React.RefObject<HTMLElement | null>) {
	const [size, setSize] = useState({ w: 0, h: 0 });
	useLayoutEffect(() => {
		const el = ref.current;
		if (el === null) return;
		const read = () => setSize({ w: el.clientWidth, h: el.clientHeight });
		read();
		const observer = new ResizeObserver(read);
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);
	return size;
}

export const url = (page: string, frame?: string) => `spool.page/tidemark/tidemark-app/${page}${frame === undefined ? "" : `/${frame}`}`;

/**
 * spool's own numbers, not new ones: the canvas camera flies 220ms on a cubic
 * ease-out (`FLIGHT_MS` in camera-store.ts), and everything else rides the house
 * curve between 120 and 300ms (system/motion).
 */
const HOUSE_CURVE = [0.23, 1, 0.32, 1] as const;
export const CAMERA = { duration: 0.22, ease: [0.33, 1, 0.68, 1] } as const;
/** a surface moving: the player growing out of a frame, a column folding */
export const GLIDE = { duration: 0.24, ease: HOUSE_CURVE } as const;
/** a small thing arriving: a toast, a menu, a row lighting */
export const SPRING = { duration: 0.18, ease: HOUSE_CURVE } as const;
/** surfaces crossing */
export const CROSS = { duration: 0.12, ease: "easeOut" } as const;
