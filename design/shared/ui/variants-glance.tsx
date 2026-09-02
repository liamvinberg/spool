import { motion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { CARD_H, CARD_W, TvarsoCheckout, actionOf, type Variation, type VariationId } from "shared/ui/tvarso-checkout";
import { cn } from "shared/lib/utils";

/**
 * The glance kit: what the second wave of this page is all about.
 *
 * Round one asked where a variation set lives. This asks the smaller and harder
 * question under it — how do you look at four candidates quickly, and how do
 * you compare two of them — so everything here serves looking rather than
 * switching.
 *
 * Two things are shared because every take needs them and neither should be
 * re-argued per frame:
 *
 * **The swap is instant.** A peek that fades is a peek you have to wait for,
 * and 160ms of crossfade is long enough that four looks cost a second of
 * nothing happening. So the card is swapped by rendering the other one. The
 * only motion in a glance is the mark that says which one you are on.
 *
 * **A difference is a region, not a feeling.** Two candidates of this document
 * differ in the payment block and in the button under it, and `empty` differs
 * in all of it. That is knowable, so a peek can outline it, and a compare can
 * point at it rather than leaving two cards side by side for the eye to diff.
 */

export type Region = "card" | "payment" | "action";

/** what actually differs between two candidates of the Tvärsö card */
export function regionsBetween(a: VariationId, b: VariationId): readonly Region[] {
	if (a === b) return [];
	if (a === "empty" || b === "empty") return ["card"];
	return actionOf(a) === actionOf(b) ? ["payment"] : ["payment", "action"];
}

export function saysRegions(regions: readonly Region[]): string {
	if (regions.length === 0) return "identical";
	if (regions.includes("card")) return "the whole card";
	return regions.join(" · ");
}

interface Box {
	readonly top: number;
	readonly height: number;
}

/**
 * One candidate, at whatever size the take draws its field, with the regions
 * that differ from another candidate outlined over it.
 *
 * The outlines are measured from the card itself rather than written down, so
 * they stay right when the document changes underneath this page.
 */
export function GlanceCard({
	variation,
	scale,
	against,
	dimUnchanged = false,
	className,
	children,
}: {
	variation: VariationId;
	scale: number;
	/** draw what is different from this one; undefined draws nothing */
	against?: VariationId | undefined;
	/** everything that did not change steps back, so the change is the only lit thing */
	dimUnchanged?: boolean;
	className?: string | undefined;
	children?: ReactNode;
}) {
	const wrap = useRef<HTMLDivElement | null>(null);
	const outlet = useRef<HTMLDivElement | null>(null);
	const action = useRef<HTMLButtonElement | null>(null);
	const [boxes, setBoxes] = useState<{ payment: Box | null; action: Box | null }>({ payment: null, action: null });

	useLayoutEffect(() => {
		const outer = wrap.current;
		if (outer === null) return;
		const origin = outer.getBoundingClientRect();
		const read = (node: Element | null): Box | null => {
			if (node === null) return null;
			const rect = node.getBoundingClientRect();
			return { top: rect.top - origin.top, height: rect.height };
		};
		setBoxes({ payment: read(outlet.current), action: read(action.current) });
	}, [variation]);

	const regions = against === undefined ? [] : regionsBetween(variation, against);
	const lit = (region: Region) => regions.includes(region) || regions.includes("card");

	return (
		<div
			ref={wrap}
			className={cn("relative overflow-hidden rounded-[8px]", className)}
			style={{ width: CARD_W * scale, height: CARD_H * scale }}
		>
			<div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
				<TvarsoCheckout variation={variation} outletRef={outlet} actionRef={action} />
			</div>

			{/* what did not change steps back, so what did is the only lit thing */}
			{dimUnchanged && regions.length > 0 && !regions.includes("card") ? (
				<>
					<Veil top={0} height={(boxes.payment?.top ?? 0)} />
					<Veil
						top={(boxes.payment?.top ?? 0) + (boxes.payment?.height ?? 0)}
						height={Math.max(
							0,
							(boxes.action?.top ?? CARD_H * scale) - (boxes.payment?.top ?? 0) - (boxes.payment?.height ?? 0),
						)}
					/>
					<Veil
						top={(boxes.action?.top ?? 0) + (boxes.action?.height ?? 0)}
						height={Math.max(0, CARD_H * scale - (boxes.action?.top ?? 0) - (boxes.action?.height ?? 0))}
					/>
				</>
			) : null}

			{regions.includes("card") ? <Outline top={0} height={CARD_H * scale} /> : null}
			{!regions.includes("card") && lit("payment") && boxes.payment !== null ? (
				<Outline top={boxes.payment.top} height={boxes.payment.height} />
			) : null}
			{!regions.includes("card") && lit("action") && boxes.action !== null ? (
				<Outline top={boxes.action.top - 3} height={boxes.action.height + 6} />
			) : null}
			{children}
		</div>
	);
}

function Outline({ top, height }: { top: number; height: number }) {
	return (
		<motion.span
			className="pointer-events-none absolute inset-x-[2px] rounded-[5px] border border-thread"
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.09, ease: "linear" }}
			style={{ top, height }}
		/>
	);
}

function Veil({ top, height }: { top: number; height: number }) {
	if (height <= 0) return null;
	return (
		<motion.span
			className="pointer-events-none absolute inset-x-0 bg-bg"
			initial={{ opacity: 0 }}
			animate={{ opacity: 0.45 }}
			transition={{ duration: 0.09, ease: "linear" }}
			style={{ top, height }}
		/>
	);
}

/* ── the notches, which are the whole argument of the peek family ──────── */

export type NotchState = "resting" | "peeking" | "idle";

/** a name: the cheapest notch, and the only one that says what it is without hovering */
export function NotchName({
	label,
	state,
	onPeek,
	onLeave,
	onPin,
}: {
	label: string;
	state: NotchState;
	onPeek: () => void;
	onLeave: () => void;
	onPin: () => void;
}) {
	return (
		<button
			type="button"
			onPointerEnter={onPeek}
			onPointerLeave={onLeave}
			onFocus={onPeek}
			onBlur={onLeave}
			onClick={onPin}
			className={cn(
				"h-5 rounded-xs px-1.5 font-mono text-2xs leading-3 transition-colors duration-100",
				state === "peeking"
					? "bg-raised text-text"
					: state === "resting"
						? "text-thread"
						: "text-muted/60 hover:text-text",
			)}
		>
			{label}
		</button>
	);
}

/** a cover: a real render of the candidate, small enough to be a notch */
export function NotchCover({
	variation,
	state,
	scale = 0.055,
	onPeek,
	onLeave,
	onPin,
}: {
	variation: Variation;
	state: NotchState;
	scale?: number;
	onPeek: () => void;
	onLeave: () => void;
	onPin: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={variation.label}
			onPointerEnter={onPeek}
			onPointerLeave={onLeave}
			onFocus={onPeek}
			onBlur={onLeave}
			onClick={onPin}
			className={cn(
				"relative flex shrink-0 overflow-hidden rounded-[3px] border transition-colors duration-100",
				state === "resting" ? "border-thread" : state === "peeking" ? "border-text" : "border-border-raised",
			)}
		>
			<div
				style={{
					width: CARD_W * scale,
					height: CARD_H * scale,
					overflow: "hidden",
				}}
			>
				<div style={{ width: CARD_W, height: CARD_H, transform: `scale(${scale})`, transformOrigin: "top left" }}>
					<TvarsoCheckout variation={variation.id} />
				</div>
			</div>
			{state === "idle" ? <span className="absolute inset-0 bg-bg/35" /> : null}
		</button>
	);
}

/** the readout a peek needs: which one you are on, and whether it is the resting one */
export function PeekReadout({
	peeking,
	label,
	says,
}: {
	peeking: boolean;
	label: string;
	says?: string | undefined;
}) {
	return (
		<span className="flex items-center gap-2 font-mono text-2xs leading-3">
			<span className={peeking ? "text-text" : "text-thread"}>{label}</span>
			{says === undefined ? null : <span className="text-muted/50">{says}</span>}
		</span>
	);
}
