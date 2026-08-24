import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { FIELD, INK, MUTED, QrBlock, SEA, actionOf } from "../../../shared/ui/tvarso-checkout";
import { cn } from "../../../shared/lib/utils";

/**
 * The payment block of the Tvärsö card, rebuilt as geometry so it can move.
 *
 * This is the frame's own copy of a block that already exists in
 * `shared/ui/tvarso-checkout.tsx`, and the copy is the point: the shipped
 * outlet is a flex column, and a flex column can only appear and disappear.
 * Here every part of the block is placed at a written coordinate inside the
 * 312×192 hole, so `card` becoming `swish` is a set of numbers changing rather
 * than a subtree unmounting — the CVC field grows into the QR square, the
 * card-number field narrows to make room, and the two rows that have no
 * counterpart fade where they stand.
 *
 * Nothing here uses layout animation. The card is drawn at 360×620 and scaled
 * to the canvas, and measuring a layout through a scale transform is exactly
 * where projection gets unreliable, so the geometry is declared instead.
 */

export type Payment = "card" | "swish" | "invoice";

interface Spec {
	readonly title: string;
	readonly a: { label: string; value: string };
	readonly b: { label: string; value: string } | null;
	readonly c: { label: string; value: string } | null;
	readonly note: string | null;
	readonly tick: { label: string; on: boolean } | null;
}

const SPECS: Record<Payment, Spec> = {
	card: {
		title: "Card",
		a: { label: "Card number", value: "4242 4242 4242 4242" },
		b: { label: "Expires", value: "04 / 28" },
		c: { label: "CVC", value: "•••" },
		note: null,
		tick: { label: "Remember this card", on: true },
	},
	swish: {
		title: "Swish",
		a: { label: "Mobile number", value: "070 123 45 67" },
		b: null,
		c: null,
		note: "Open Swish on that phone and confirm within three minutes.",
		tick: null,
	},
	invoice: {
		title: "Invoice",
		a: { label: "Company", value: "Ramsö Segelsällskap" },
		b: { label: "Organisation number", value: "556677-8899" },
		c: { label: "Reference", value: "IL" },
		note: null,
		tick: { label: "30 day terms accepted", on: false },
	},
};

/** slow enough to be read, quick enough that four of them cost four seconds */
const MORPH = { type: "spring" as const, stiffness: 430, damping: 39, mass: 0.85 };
const FADE_IN = { duration: 0.14, ease: [0.22, 1, 0.36, 1] as [number, number, number, number], delay: 0.06 };
const FADE_OUT = { duration: 0.1, ease: "linear" as const };
const TEXT = { duration: 0.12, ease: "linear" as const };

/** one line of the card's own type, cross-dissolved: two words share no pixels */
function Line({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
	return (
		<span className={cn("relative block", className)} style={style}>
			<span className="whitespace-nowrap opacity-0">{text}</span>
			<AnimatePresence initial={false}>
				<motion.span
					key={text}
					className="absolute top-0 left-0 whitespace-nowrap"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={TEXT}
				>
					{text}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}

function Appears({ children, x, y, w }: { children: ReactNode; x: number; y: number; w: number }) {
	return (
		<motion.div
			className="absolute"
			style={{ left: x, top: y, width: w }}
			initial={{ opacity: 0 }}
			animate={{ opacity: 1, transition: FADE_IN }}
			exit={{ opacity: 0, transition: FADE_OUT }}
		>
			{children}
		</motion.div>
	);
}

export function MorphPayment({ payment }: { payment: Payment }) {
	const spec = SPECS[payment];
	const swish = payment === "swish";
	const aWidth = swish ? 208 : 312;

	return (
		<div className="relative" style={{ width: 312, height: 192, color: INK }}>
			<Line className="text-[13px] font-medium leading-none" style={{ color: MUTED }} text={spec.title} />

			{/* the field that never leaves: it only narrows to let the code in */}
			<motion.div
				className="absolute"
				style={{ left: 0, top: 0 }}
				initial={false}
				animate={{ x: 0, y: 25, width: aWidth }}
				transition={MORPH}
			>
				<Line className="text-[12px] leading-none" style={{ color: MUTED }} text={spec.a.label} />
			</motion.div>
			<motion.div
				className="absolute flex items-center rounded-[8px] px-3"
				style={{ background: FIELD, left: 0, top: 0 }}
				initial={false}
				animate={{ x: 0, y: 43, width: aWidth, height: 36 }}
				transition={MORPH}
			>
				<Line className="text-[14px] leading-none" text={spec.a.value} />
			</motion.div>

			{/* the right-hand box: a small field in two of them, the code in the third */}
			<motion.div
				className="absolute overflow-hidden rounded-[8px]"
				style={{ background: FIELD, left: 0, top: 0 }}
				initial={false}
				animate={swish ? { x: 220, y: 25, width: 92, height: 92 } : { x: 220, y: 109, width: 92, height: 36 }}
				transition={MORPH}
			>
				<AnimatePresence initial={false}>
					{swish ? (
						<motion.span
							key="qr"
							className="absolute inset-0 flex items-center justify-center"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, transition: FADE_IN }}
							exit={{ opacity: 0, transition: FADE_OUT }}
						>
							<QrBlock />
						</motion.span>
					) : (
						<motion.span
							key="value"
							className="absolute inset-0 flex items-center px-3 text-[14px] leading-none"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1, transition: FADE_IN }}
							exit={{ opacity: 0, transition: FADE_OUT }}
						>
							{spec.c?.value ?? ""}
						</motion.span>
					)}
				</AnimatePresence>
			</motion.div>

			<AnimatePresence initial={false}>
				{spec.c === null ? null : (
					<Appears key="c-label" x={220} y={91} w={92}>
						<Line className="text-[12px] leading-none" style={{ color: MUTED }} text={spec.c.label} />
					</Appears>
				)}
				{spec.b === null ? null : (
					<Appears key="b-label" x={0} y={91} w={208}>
						<Line className="text-[12px] leading-none" style={{ color: MUTED }} text={spec.b.label} />
					</Appears>
				)}
				{spec.b === null ? null : (
					<Appears key="b-box" x={0} y={109} w={208}>
						<div
							className="flex h-9 items-center rounded-[8px] px-3 text-[14px] leading-none"
							style={{ background: FIELD }}
						>
							<Line text={spec.b.value} />
						</div>
					</Appears>
				)}
				{spec.note === null ? null : (
					<Appears key="note" x={0} y={95} w={208}>
						<p className="text-[12px] leading-4" style={{ color: MUTED }}>
							{spec.note}
						</p>
					</Appears>
				)}
				{spec.tick === null ? null : (
					<Appears key="tick" x={0} y={157} w={312}>
						<div className="flex items-center gap-2 text-[13px] leading-none">
							<span
								className="flex h-4 w-4 items-center justify-center rounded-[5px] border"
								style={{
									borderColor: spec.tick.on ? SEA : "#E6E7E3",
									background: spec.tick.on ? SEA : "transparent",
								}}
							>
								{spec.tick.on ? (
									<svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" aria-hidden="true">
										<path
											d="m2.5 6.2 2.3 2.3L9.5 3.6"
											stroke="#FFFFFF"
											strokeWidth="1.7"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								) : null}
							</span>
							<Line className="text-[13px] leading-none" style={{ color: MUTED }} text={spec.tick.label} />
						</div>
					</Appears>
				)}
			</AnimatePresence>
		</div>
	);
}

export interface Box {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/**
 * The button's label, laid over the shell's own empty button so it dissolves
 * with the rest. The box is measured from the shell rather than written down:
 * the caption under the button is two lines today and could be one tomorrow.
 */
export function MorphAction({ payment, box }: { payment: Payment; box: Box | null }) {
	if (box === null) return null;
	return (
		<div className="pointer-events-none absolute flex items-center justify-center" style={box}>
			<Line
				className="text-center text-[15px] font-medium leading-none"
				style={{ color: "#FFFFFF" }}
				text={actionOf(payment)}
			/>
		</div>
	);
}
