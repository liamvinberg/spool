import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import {
	CARD_H,
	CARD_W,
	Scaled,
	TvarsoCheckout,
	TvarsoTicket,
	TvarsoTimetable,
	type VariationId,
} from "shared/ui/tvarso-checkout";
import { Crossfade, PeekRing } from "shared/ui/variants-feel";
import { regionsBetween } from "shared/ui/variants-glance";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	VariantsScreen,
} from "shared/ui/variants-shell";
import { useKey } from "shared/lib/variants-cycle";
import { useDecision } from "shared/lib/variants-decision";
import { MARK } from "shared/lib/variants-feel";

/**
 * Touch the difference itself.
 *
 * Three of these four candidates differ in exactly one block of the card, and
 * that block is on screen, so there is nothing to put under the frame: point at
 * the payment block and it says how many ways it goes, click it and it is the
 * next one. The card dissolves rather than cuts, and since every other pixel is
 * identical between the three, the only thing that appears to move is the block
 * you had your finger on. Direct manipulation of the decision, with the
 * decision's own vocabulary left in the label row.
 *
 * The honest hole is `empty`, which is not a region — it throws the card away —
 * so it is reachable from the arrow keys and the label count and never from the
 * block. A model that only understands regions cannot see that candidate at
 * all, which is the argument this frame is making against itself.
 */

const HOT = "payment";

export default function ThrowRegionFrame() {
	const decision = useDecision();
	const [hot, setHot] = useState(false);
	const [pulse, setPulse] = useState(0);
	const wrap = useRef<HTMLDivElement | null>(null);
	const outlet = useRef<HTMLDivElement | null>(null);
	const action = useRef<HTMLButtonElement | null>(null);
	const [boxes, setBoxes] = useState<{ payment: DOMRect | null; action: DOMRect | null }>({
		payment: null,
		action: null,
	});

	const open = decision.standing === "open";
	const showing = decision.showing;
	const inRegion = decision.candidates.filter((one) => one.fills === "outlet");
	const at = Math.max(0, inRegion.findIndex((one) => one.id === showing.id));
	const nextInRegion = inRegion[(at + 1) % Math.max(1, inRegion.length)];
	const differs = nextInRegion === undefined ? [] : regionsBetween(showing.id, nextInRegion.id);

	useLayoutEffect(() => {
		const outer = wrap.current;
		if (outer === null) return;
		const origin = outer.getBoundingClientRect();
		const read = (node: Element | null): DOMRect | null => {
			if (node === null) return null;
			const rect = node.getBoundingClientRect();
			return new DOMRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
		};
		setBoxes({ payment: read(outlet.current), action: read(action.current) });
	}, []);

	useKey("ArrowRight", decision.next);
	useKey("ArrowLeft", decision.prev);

	const cycle = () => {
		if (nextInRegion === undefined) return;
		decision.look(nextInRegion.id);
		setPulse((count) => count + 1);
	};

	return (
		<VariantsScreen
			name="throw--region"
			argues="The candidates differ in one block, so click the block. The rest of the card never flinches."
			hint={open ? "hover the payment block · click to take the next one · ← → reach empty too" : "decided"}
		>
			<Neighbour x={48} y={170} name="timetable">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTimetable />
				</Scaled>
			</Neighbour>
			<Neighbour x={624} y={170} name="ticket">
				<Scaled scale={FIELD_SCALE}>
					<TvarsoTicket />
				</Scaled>
			</Neighbour>

			<Placed x={336} y={170} z={2}>
				<FrameLabel
					name="checkout"
					selected
					stacked={open}
					count={open ? decision.candidates.length : undefined}
					right={open ? <KeepVerb onKeep={() => decision.keep(showing.id)} /> : <PlayVerb />}
				/>
				<div ref={wrap} className="relative" style={{ width: CARD_W * FIELD_SCALE, height: CARD_H * FIELD_SCALE }}>
					<Crossfade
						token={showing.id}
						className="overflow-hidden rounded-[8px]"
						style={{ width: CARD_W * FIELD_SCALE, height: CARD_H * FIELD_SCALE }}
						render={(token) => (
							<div style={{ width: CARD_W * FIELD_SCALE, height: CARD_H * FIELD_SCALE, overflow: "hidden" }}>
								<div
									style={{
										width: CARD_W,
										height: CARD_H,
										transform: `scale(${FIELD_SCALE})`,
										transformOrigin: "top left",
									}}
								>
									<TvarsoCheckout
										variation={token as VariationId}
										outletRef={token === showing.id ? outlet : undefined}
										actionRef={token === showing.id ? action : undefined}
									/>
								</div>
							</div>
						)}
					/>

					{open && boxes.payment !== null && showing.fills === "outlet" ? (
						<button
							type="button"
							aria-label="Cycle the payment block"
							onPointerEnter={() => setHot(true)}
							onPointerLeave={() => setHot(false)}
							onClick={cycle}
							className="absolute inset-x-[2px] cursor-pointer"
							style={{ top: boxes.payment.y, height: boxes.payment.height }}
						/>
					) : null}

					{boxes.payment === null ? null : (
						<motion.span
							className="pointer-events-none absolute inset-x-[2px] rounded-[5px] border border-thread"
							initial={false}
							animate={{ opacity: hot ? 1 : 0 }}
							transition={MARK}
							style={{ top: boxes.payment.y, height: boxes.payment.height }}
						/>
					)}
					{boxes.action === null || !differs.includes("action") ? null : (
						<motion.span
							className="pointer-events-none absolute inset-x-[2px] rounded-[5px] border border-thread/45"
							initial={false}
							animate={{ opacity: hot ? 1 : 0 }}
							transition={MARK}
							style={{ top: boxes.action.y - 3, height: boxes.action.height + 6 }}
						/>
					)}

					<PeekRing peeking={hot} size="360 × 620" pulse={pulse} />
				</div>

				{open ? (
					<div className="mt-7 flex flex-col gap-1.5 font-mono text-2xs leading-3">
						<span className="flex items-center gap-2">
							<span className="text-thread">{showing.label}</span>
							<span className="text-muted/50">
								{hot
									? `${HOT} · next is ${nextInRegion?.label ?? showing.label}`
									: `${HOT} · ${inRegion.length} of ${decision.candidates.length} candidates live here`}
							</span>
						</span>
						<span className="text-muted/40">empty replaces the card, so it is not a region</span>
					</div>
				) : null}
			</Placed>
		</VariantsScreen>
	);
}
