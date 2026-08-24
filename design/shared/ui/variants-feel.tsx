import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/utils";
import { EASE, MARK, SWAP_IN } from "../lib/variants-feel";
import { CARD_H, CARD_W, TvarsoCheckout, type VariationId } from "./tvarso-checkout";

/**
 * The two pieces of feel every take on the third wave shares.
 *
 * **The crossfade only fades one way.** Fading the old card out while the new
 * one fades in drops the identical pixels to 75% at the halfway point, so the
 * masthead and the trip and the total all flash toward the canvas while the
 * payment block changes. Here the outgoing render sits underneath at full
 * strength and the incoming one comes up over it, which is the only way the
 * parts that did not change look like they were never touched.
 *
 * **The ring says what state your hands are in.** Resting is the shipped
 * selection ring with its handles; looking is the same ring at half strength
 * with the handles gone, so a peek is visibly borrowed rather than a selection
 * you have to undo. Pinning fires one ring outward and that is the whole
 * confirmation.
 */

/**
 * Two renders of the same thing, dissolved into each other in place.
 *
 * The token is whatever identifies the render — a variation id, a region, a
 * candidate plus a mode. `render` is called for the token underneath and the
 * token on top, so the caller never has to hold the old one.
 */
export function Crossfade({
	token,
	render,
	className,
	style,
	duration = SWAP_IN.duration,
}: {
	token: string;
	render: (token: string) => ReactNode;
	/** the root has to carry the size: both layers are absolute so neither can shift the other */
	className?: string | undefined;
	style?: React.CSSProperties | undefined;
	duration?: number | undefined;
}) {
	const [under, setUnder] = useState(token);
	const fading = under !== token;

	return (
		<div className={cn("relative", className)} style={style}>
			{fading ? <div className="absolute inset-0">{render(under)}</div> : null}
			<motion.div
				key={token}
				className="absolute inset-0"
				initial={{ opacity: fading ? 0 : 1 }}
				animate={{ opacity: 1 }}
				transition={{ duration, ease: "linear" }}
				onAnimationComplete={() => setUnder(token)}
			>
				{render(token)}
			</motion.div>
		</div>
	);
}

/** the card, swapped by dissolve, in a box that never changes size */
export function SwapCard({
	variation,
	scale,
	className,
	duration,
}: {
	variation: VariationId;
	scale: number;
	className?: string | undefined;
	duration?: number | undefined;
}) {
	return (
		<Crossfade
			token={variation}
			duration={duration}
			className={cn("overflow-hidden rounded-[8px]", className)}
			style={{ width: CARD_W * scale, height: CARD_H * scale }}
			render={(token) => (
				<div style={{ width: CARD_W * scale, height: CARD_H * scale, overflow: "hidden" }}>
					<div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
						<TvarsoCheckout variation={token as VariationId} />
					</div>
				</div>
			)}
		/>
	);
}

/** the same card as a still, for a layer a crossfade is not driving */
export function StillCard({ variation, scale }: { variation: VariationId; scale: number }) {
	return (
		<div style={{ width: CARD_W * scale, height: CARD_H * scale, overflow: "hidden" }}>
			<div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
				<TvarsoCheckout variation={variation} />
			</div>
		</div>
	);
}

const HANDLES = [
	"-left-[7px] -top-[7px]",
	"-right-[7px] -top-[7px]",
	"-bottom-[7px] -left-[7px]",
	"-bottom-[7px] -right-[7px]",
];

/**
 * The selection ring, dimmed while you are only looking, with one ring fired
 * outward every time the decision moves.
 */
export function PeekRing({
	peeking,
	size,
	pulse = 0,
}: {
	peeking: boolean;
	size?: string | undefined;
	/** bump it to fire the pin ring; 0 never fires */
	pulse?: number | undefined;
}) {
	return (
		<>
			<motion.span
				className="pointer-events-none absolute -inset-[3px] rounded-[11px] border-[1.5px] border-thread"
				initial={false}
				animate={{ opacity: peeking ? 0.4 : 1 }}
				transition={MARK}
			/>
			{HANDLES.map((position) => (
				<motion.span
					key={position}
					className={cn("absolute h-2 w-2 rounded-[1.5px] border-[1.5px] border-thread bg-on-thread", position)}
					initial={false}
					animate={{ opacity: peeking ? 0 : 1, scale: peeking ? 0.6 : 1 }}
					transition={MARK}
				/>
			))}
			<AnimatePresence>
				{pulse > 0 ? (
					<motion.span
						key={pulse}
						className="pointer-events-none absolute rounded-[11px] border-[1.5px] border-thread"
						initial={{ inset: -3, opacity: 0.85 }}
						animate={{ inset: -13, opacity: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.34, ease: EASE }}
					/>
				) : null}
			</AnimatePresence>
			{size === undefined ? null : (
				<motion.div
					className="-translate-x-1/2 absolute top-[calc(100%+8px)] left-1/2 rounded-xs bg-thread px-2 py-[3px] font-mono text-2xs text-on-thread leading-3"
					initial={false}
					animate={{ opacity: peeking ? 0 : 1 }}
					transition={MARK}
				>
					{size}
				</motion.div>
			)}
		</>
	);
}
