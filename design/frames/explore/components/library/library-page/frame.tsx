import { useEffect, useState } from "react";
import { TOKEN_COUNT, TVARSO_PARTS } from "shared/ui/demo/tvarso-library";
import { FrameBody, layout, PAGES, Rail, Tint } from "shared/ui/explore/components/library-frames";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The same projection as `library-frames` with the camera taken off it
 * ([spool-cloud#31](https://github.com/liamvinberg/spool-cloud/issues/31)).
 *
 * Every component is still a frame in file order, still held with a click and
 * read in the same rail. What changes is that the page is fixed: everything is
 * drawn at 100%, the flow wraps at the column's width, and the only movement is
 * the scroll. There is no zoom readout because there is no zoom, and no tool bar
 * because there is nothing on this surface to point at except what a click
 * already holds.
 *
 * The case for it is that a library is read, not arranged, and a page you scroll
 * is the cheapest thing to read. The case against is the one the screenshot
 * makes: at 100% a project of twenty three components is already a long way down.
 */

const LAID = layout(760);
const TALL = Math.max(...LAID.frames.map((frame) => frame.y + frame.h)) + 96;

export default function LibraryPageFrame() {
	const [held, setHeld] = useState<string | null>("Button");
	const [over, setOver] = useState<string | null>(null);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setHeld(null);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const heldFrame = LAID.frames.find((frame) => frame.id === held) ?? null;

	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom="">
			<CanvasChrome pages={PAGES} selected={held ?? undefined} tool="none" rail={<Rail frame={heldFrame} />}>
				<div
					className="relative h-full w-full overflow-y-auto overflow-x-clip"
					onPointerDown={() => setHeld(null)}
					style={{ "--ik": 1 } as React.CSSProperties}
				>
					<div className="relative w-full" style={{ height: TALL }}>
						<span className="pointer-events-none absolute top-6 left-8 flex items-baseline gap-2 font-mono text-base text-text/70 leading-base">
							src/ui
							<span className="text-2xs text-muted/40 leading-3">
								{TVARSO_PARTS} components · {TOKEN_COUNT} tokens
							</span>
						</span>
						{LAID.families.map((family) => (
							<Tint key={family.file} family={family} />
						))}
						{LAID.frames.map((frame) => (
							<FrameBody
								key={frame.id}
								frame={frame}
								k={1}
								held={held === frame.id}
								over={over === frame.id}
								onDown={(event) => {
									event.stopPropagation();
									setHeld(frame.id);
								}}
								onOver={() => setOver(frame.id)}
								onOut={() => setOver((current) => (current === frame.id ? null : current))}
							/>
						))}
					</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}
