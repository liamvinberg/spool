import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Offprint } from "./offprint";

export type DemoTake = "workshops" | "booking" | "ticket";
export const DEMO_TAKES: readonly DemoTake[] = ["workshops", "booking", "ticket"];
export const DEMO_NAMES: Record<DemoTake, string> = {
	workshops: "The workshop",
	booking: "A seat at the table",
	ticket: "Your Saturday plan",
};

// The website carries the same prototype in memory. Each embedded player owns its session.
export function DemoProduct({ take }: { take: DemoTake }) {
	const [screen, setScreen] = useState(take);
	const [time, setTime] = useState("10:00");
	const [seats, setSeats] = useState(1);
	const host = useRef<HTMLDivElement>(null);
	const pointer = useRef(false);
	const transition = useRef<ViewTransition | null>(null);
	useEffect(() => () => transition.current?.skipTransition(), []);
	const go = (next: DemoTake, nextTime = time, nextSeats = seats) => {
		const update = () => {
			setScreen(next);
			setTime(nextTime);
			setSeats(nextSeats);
		};
		const node = host.current;
		transition.current?.skipTransition();
		if (
			!node ||
			!pointer.current ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
			!document.startViewTransition
		) {
			update();
			return;
		}
		node.dataset.offprintTransition = "true";
		const active = document.startViewTransition(() => flushSync(update));
		active.types?.add("offprint-demo");
		transition.current = active;
		const settle = () => {
			if (transition.current !== active) return;
			delete node.dataset.offprintTransition;
			transition.current = null;
		};
		void active.finished.then(settle, settle);
	};
	return (
		<div
			ref={host}
			className="dl-product-session"
			onPointerDownCapture={() => {
				pointer.current = true;
			}}
			onKeyDownCapture={() => {
				pointer.current = false;
			}}
		>
			<Offprint
				screen={screen}
				time={time}
				seats={seats}
				onOpen={() => go("booking")}
				onBook={(time, seats) => go("ticket", time, seats)}
				onBack={() => go("workshops")}
			/>
		</div>
	);
}
