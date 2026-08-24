import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import {
	CARD_H,
	CARD_W,
	Scaled,
	TvarsoCheckout,
	TvarsoShell,
	TvarsoTicket,
	TvarsoTimetable,
	type VariationId,
} from "../../../shared/ui/tvarso-checkout";
import { PeekRing } from "../../../shared/ui/variants-feel";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	VariantsScreen,
} from "../../../shared/ui/variants-shell";
import { useDecision } from "../../../shared/lib/variants-decision";
import { EASE } from "../../../shared/lib/variants-feel";
import { cn } from "../../../shared/lib/utils";
import { type Box, MorphAction, MorphPayment, type Payment } from "./morph";

/**
 * The change tells you what it changed.
 *
 * Every other take swaps one card for another and leaves you to spot the
 * difference after the fact. This one refuses to cut: the masthead, the trip,
 * the lines and the total never move a pixel, and the payment block travels
 * from one candidate to the next in front of you. Going from `card` to `swish`,
 * the CVC box grows into the QR square, the card-number field narrows to make
 * room for it, and the two rows with nowhere to go fade where they stand. You
 * do not have to find the difference; you watched it happen.
 *
 * It answers a pointer instantly and takes about 300ms to finish, which is the
 * trade this frame is asking about — a swap is faster, a morph is clearer, and
 * the reason to hold this one longer is that its whole value is being read.
 *
 * `empty` has no shared elements with anything, so it dissolves over the top
 * rather than pretending. A morph is only honest when the two things are the
 * same thing twice.
 */
export default function ThrowMorphFrame() {
	const decision = useDecision();
	const [peek, setPeek] = useState<VariationId | null>(null);
	const [pulse, setPulse] = useState(0);
	const open = decision.standing === "open";
	const resting = decision.showing;
	const showing = decision.candidates.find((one) => one.id === peek) ?? resting;
	const peeking = showing.id !== resting.id;

	const wrap = useRef<HTMLDivElement | null>(null);
	const button = useRef<HTMLButtonElement | null>(null);
	const [box, setBox] = useState<Box | null>(null);

	/* the caption under the button is two lines once the card's font lands, which
	   moves the button, so the box is measured again whenever the card resettles */
	useLayoutEffect(() => {
		const outer = wrap.current;
		const node = button.current;
		if (outer === null || node === null) return;
		const measure = () => {
			const origin = outer.getBoundingClientRect();
			const rect = node.getBoundingClientRect();
			setBox({
				left: (rect.left - origin.left) / FIELD_SCALE,
				top: (rect.top - origin.top) / FIELD_SCALE,
				width: rect.width / FIELD_SCALE,
				height: rect.height / FIELD_SCALE,
			});
		};
		measure();
		void document.fonts.ready.then(measure);
		const watch = new ResizeObserver(measure);
		watch.observe(node);
		return () => watch.disconnect();
	}, []);

	const last = useRef<Payment>("card");
	if (showing.id !== "empty") last.current = showing.id as Payment;
	const empty = showing.id === "empty";

	return (
		<VariantsScreen
			name="throw--morph"
			argues="The card never cuts. The payment block travels from one candidate to the next while you watch."
			hint={open ? "hover a name and watch it move · click to rest on it" : "decided"}
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
				<div className="relative">
					<div
						className="overflow-hidden rounded-[8px]"
						style={{ width: CARD_W * FIELD_SCALE, height: CARD_H * FIELD_SCALE }}
					>
						<div
							ref={wrap}
							className="relative"
							style={{
								width: CARD_W,
								height: CARD_H,
								transform: `scale(${FIELD_SCALE})`,
								transformOrigin: "top left",
							}}
						>
							<TvarsoShell action="" actionRef={button}>
								<MorphPayment payment={last.current} />
							</TvarsoShell>
							<MorphAction payment={last.current} box={box} />
							<motion.div
								className="absolute inset-0"
								initial={false}
								animate={{ opacity: empty ? 1 : 0 }}
								transition={{ duration: empty ? 0.16 : 0.12, ease: EASE }}
								style={{ pointerEvents: "none" }}
							>
								<TvarsoCheckout variation="empty" />
							</motion.div>
						</div>
					</div>
					<PeekRing peeking={peeking} size="360 × 620" pulse={pulse} />
				</div>

				{open ? (
					<div className="mt-7 flex flex-col gap-2.5" onPointerLeave={() => setPeek(null)}>
						<div className="-ml-1 flex items-center">
							{decision.candidates.map((variation) => {
								const on = variation.id === showing.id;
								return (
									<button
										key={variation.id}
										type="button"
										onPointerEnter={() => setPeek(variation.id)}
										onFocus={() => setPeek(variation.id)}
										onClick={() => {
											decision.look(variation.id);
											setPeek(null);
											setPulse((count) => count + 1);
										}}
										className={cn(
											"flex h-6 items-center rounded-xs px-2 font-mono text-2xs leading-3 transition-colors duration-100",
											variation.id === resting.id
												? "text-thread"
												: on
													? "bg-raised text-text"
													: "text-muted/60 hover:text-text",
										)}
									>
										{variation.label}
									</button>
								);
							})}
						</div>
						<span className="ml-1 flex items-center gap-2 font-mono text-2xs leading-3">
							<span className={peeking ? "text-text" : "text-thread"}>{showing.label}</span>
							<span className="text-muted/50">
								{empty ? "no shared elements · this one dissolves" : peeking ? "moving" : "resting here"}
							</span>
						</span>
					</div>
				) : null}
			</Placed>
		</VariantsScreen>
	);
}
