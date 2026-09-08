import { useEffect, useRef, useState } from "react";
import { OffprintLanding } from "../demo-apps/landing";
import { createBloomRenderer } from "./renderer";
import "./page.css";
import "../../../landing.css";

/** Ported from site-bloom-returns-end. The browser owns document scrolling. */
export function BloomLanding() {
	const canvas = useRef<HTMLCanvasElement>(null);
	const renderer = useRef<ReturnType<typeof createBloomRenderer>>(null);
	const [paused, setPaused] = useState(false);
	useEffect(() => {
		const node = canvas.current;
		if (!node) return;
		const bloom = createBloomRenderer(node);
		renderer.current = bloom;
		return () => {
			bloom?.dispose();
			renderer.current = null;
		};
	}, []);
	useEffect(() => renderer.current?.setPaused(paused), [paused]);

	return (
		<div className="bl-page" data-bloom="returns-end">
			<div className="bl-field" aria-hidden="true" data-backend="fallback">
				<canvas ref={canvas} className="bl-canvas" />
			</div>
			<OffprintLanding
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
