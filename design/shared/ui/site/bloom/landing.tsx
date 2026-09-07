import { useEffect, useRef, useState } from "react";
import { OffprintLanding } from "shared/ui/site/demo-apps/landing";
import { BloomField, type BloomTake } from "./field";
import "./page.css";

export type BloomPosition = "top" | "middle" | "closing";

export function BloomLanding({ take, position = "top" }: { take: BloomTake; position?: BloomPosition }) {
	const root = useRef<HTMLDivElement>(null);
	const [paused, setPaused] = useState(false);
	useEffect(() => {
		const host = root.current;
		const page = host?.querySelector<HTMLElement>(".sg-page");
		if (!host || !page) return;
		let disposed = false;
		void document.fonts.ready.then(() => {
			if (disposed) return;
			const section = position === "top" ? null : page.querySelector(position === "middle" ? "#compare" : "#start");
			if (section) {
				page.scrollTo({
					top: page.scrollTop + section.getBoundingClientRect().top - page.getBoundingClientRect().top - 110,
					behavior: "instant",
				});
			}
			host.dataset.position = position;
		});
		return () => { disposed = true; };
	}, [position]);

	return (
		<div className="bl-page" data-bloom={take} ref={root}>
			<div className="bl-field" aria-hidden="true">
				<BloomField take={take} paused={paused} />
			</div>
			<OffprintLanding
				take="play"
				footerExtra={
					<button
						type="button"
						className="bl-motion"
						aria-label={paused ? "Play background motion" : "Pause background motion"}
						aria-pressed={paused}
						onClick={() => setPaused(!paused)}
					>
						<span aria-hidden="true" />
						{paused ? "motion off" : "motion on"}
					</button>
				}
			/>
		</div>
	);
}
