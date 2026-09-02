import { motion, useAnimationControls } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Scaled, TvarsoTicket, TvarsoTimetable } from "shared/ui/demo/tvarso-checkout";
import { PeekRing, SwapCard } from "shared/ui/explore/variants/variants-feel";
import {
	FIELD_SCALE,
	FrameLabel,
	KeepVerb,
	Neighbour,
	Placed,
	PlayVerb,
	VariantsScreen,
} from "shared/ui/explore/variants/variants-shell";
import { useDecision } from "shared/lib/explore/variants/variants-decision";
import { EASE } from "shared/lib/explore/variants/variants-feel";
import { cn } from "shared/lib/utils";

/**
 * The wheel is the strip.
 *
 * Nothing is drawn under this frame and nothing is drawn on it. Put the pointer
 * over the card and roll: each detent is one candidate, the card dissolves into
 * the next one in 90ms and gives a 1.3 pixel press so the step is felt as well
 * as seen. Take the pointer off and it is an ordinary frame again — there was
 * never a control to close.
 *
 * The detent is the whole engineering. A trackpad delivers a flick as forty
 * events, so the accumulator needs a real threshold (88px of travel) and a
 * 110ms lock after each step, which is roughly the speed a person can read a
 * card at. Without the lock one flick spends the whole set; with it, a fast
 * flick steps three times and you see all three.
 *
 * What it costs: the gesture is invisible. Nobody discovers this without being
 * told, and it collides with a canvas whose wheel is zoom — which is exactly
 * the argument to have, because the frame's own hover already means something
 * on a canvas and this is asking for the wheel too.
 */

const NOTCH = 88;
const LOCK = 110;

export default function ThrowScrollFrame() {
	const decision = useDecision();
	const [over, setOver] = useState(false);
	const box = useRef<HTMLDivElement | null>(null);
	const kick = useAnimationControls();
	const held = useRef({ delta: 0, at: 0 });
	const open = decision.standing === "open";

	useEffect(() => {
		const node = box.current;
		if (node === null || !open) return;
		const roll = (event: WheelEvent) => {
			event.preventDefault();
			const now = performance.now();
			if (now - held.current.at < LOCK) return;
			held.current.delta += event.deltaY;
			if (Math.abs(held.current.delta) < NOTCH) return;
			const forward = held.current.delta > 0;
			held.current = { delta: 0, at: now };
			if (forward) decision.next();
			else decision.prev();
			void kick.start({ scale: [0.994, 1] }, { duration: 0.19, ease: EASE });
		};
		node.addEventListener("wheel", roll, { passive: false });
		return () => node.removeEventListener("wheel", roll);
	}, [decision, kick, open]);

	return (
		<VariantsScreen
			name="throw--scroll"
			argues="No strip, no covers, no chrome. Hover the frame and the wheel steps through the candidates."
			hint={open ? "hover the card · roll to step · nothing is drawn until you do" : "decided"}
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
					right={
						open ? (
							<>
								<span className={cn("font-mono text-2xs leading-3", over ? "text-text" : "text-muted/60")}>
									{decision.showing.label}
								</span>
								<KeepVerb onKeep={() => decision.keep(decision.showing.id)} />
							</>
						) : (
							<PlayVerb />
						)
					}
				/>
				<div
					ref={box}
					className="relative"
					onPointerEnter={() => setOver(true)}
					onPointerLeave={() => {
						setOver(false);
						held.current.delta = 0;
					}}
				>
					<motion.div animate={kick} style={{ transformOrigin: "50% 50%" }}>
						<SwapCard variation={decision.showing.id} scale={FIELD_SCALE} duration={0.09} />
					</motion.div>
					<PeekRing peeking={false} size="360 × 620" pulse={0} />
				</div>
			</Placed>
		</VariantsScreen>
	);
}
