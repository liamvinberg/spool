import type { ReactNode } from "react";

/**
 * The spool.page link card, 1200x630: what X, Slack, Discord and iMessage draw
 * when the domain is pasted.
 *
 * The chrome is the constant. Every `site-card--*` frame is the same claim, the
 * same ground and the same two slots, so the only variable between them is the
 * app being shown — which is the thing actually being chosen. Anything a variant
 * wants to move belongs in the variant, not in a prop here.
 *
 * The slots are true phone proportions. The first card shipped 245x430 screens,
 * a 0.57 ratio against a phone's 0.46, and squat screens are most of why it read
 * as a wireframe rather than an app. A screen is authored at a real 390x844 and
 * scaled into the slot, so it is designed at the size it would really be built
 * at and nothing is drawn to fit a card.
 */

export const CARD_W = 1200;
export const CARD_H = 630;

/** A phone, authored at 390x844. */
export const PHONE_W = 390;
export const PHONE_H = 844;

const SLOT_W = 208;
const SCALE = SLOT_W / PHONE_W;

const dotGrid = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 7%, transparent) 1px, transparent 1px)",
	backgroundSize: "34px 34px",
	backgroundPosition: "-1px -1px",
} as const;

/**
 * One frame on the canvas. `live` wears the thread ring, which is what spool
 * draws around the frame it is currently running, so the pair reads as a canvas
 * with a walk on it rather than as two screenshots side by side.
 */
function Slot({ x, y, live, children }: { x: number; y: number; live?: boolean; children: ReactNode }) {
	return (
		<div
			className="absolute overflow-hidden rounded-[18px]"
			style={{
				left: x,
				top: y,
				width: SLOT_W,
				height: Math.round(PHONE_H * SCALE),
				outline: live ? "2px solid var(--color-thread)" : "1px solid var(--color-border-raised)",
				outlineOffset: live ? 3 : 0,
			}}
		>
			<div style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${SCALE})`, transformOrigin: "top left" }}>
				{children}
			</div>
		</div>
	);
}

/** The walk between the two frames: one arrow, the thread's own red. */
function Walk({ x, y }: { x: number; y: number }) {
	return (
		<svg
			className="absolute"
			style={{ left: x, top: y, width: 64, height: 24 }}
			viewBox="0 0 64 24"
			fill="none"
			aria-hidden="true"
		>
			<path d="M1 12 H50" stroke="var(--color-thread)" strokeWidth="2.5" />
			<path
				d="M44 4 L56 12 L44 20"
				stroke="var(--color-thread)"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

export function SiteCardShell({ from, to, mark }: { from: ReactNode; to: ReactNode; mark: ReactNode }) {
	return (
		<div
			className="relative overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]"
			style={{ width: CARD_W, height: CARD_H, ...dotGrid }}
		>
			<div className="absolute flex items-center gap-3" style={{ left: 88, top: 62 }}>
				{mark}
				<span className="font-semibold text-[30px] tracking-tight">spool</span>
			</div>

			<h1
				className="absolute font-semibold"
				style={{ left: 88, top: 232, width: 470, fontSize: 60, lineHeight: 1, letterSpacing: "-0.025em" }}
			>
				Feel an app before it exists
			</h1>

			<p className="absolute text-muted" style={{ left: 88, top: 420, width: 440, fontSize: 22, lineHeight: "31px" }}>
				Your agent authors real TSX frames. You arrange them and walk the flows.
			</p>

			<div
				className="absolute font-mono text-muted"
				style={{ left: 88, bottom: 56, fontSize: 21, letterSpacing: "-0.01em" }}
			>
				spool.page
			</div>

			<Slot x={648} y={90} live>
				{from}
			</Slot>
			<Walk x={876} y={303} />
			<Slot x={952} y={140}>
				{to}
			</Slot>
		</div>
	);
}
