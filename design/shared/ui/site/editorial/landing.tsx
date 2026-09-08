import { useEffect, useRef, useState } from "react";
import { EditorialContent } from "./content";
import { createBloomRenderer } from "shared/ui/site/current/ui/site/bloom/renderer";
import "shared/ui/site/current/ui/site/bloom/page.css";
import "shared/ui/site/current/landing.css";
import "./editorial.css";

/** Ported from site-bloom-returns-end. The browser owns document scrolling. */
export function EditorialLanding({ direction }: { direction: "folio" | "margin" }) {
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
			<EditorialContent
                direction={direction}
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
