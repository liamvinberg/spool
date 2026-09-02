import type { CSSProperties, ReactNode } from "react";

/**
 * The spool.page section shell, lifted verbatim out of site-states — the one
 * section whose composition works — so every other section is the same shell
 * rather than six re-typings of it. What drifted before: site-disk grew a
 * masthead and put its heading beside the demo, site-frames dropped the stage
 * card and the foot lines and used a 96px gutter instead of 56. Nothing here is
 * new; it is site-states' chrome with the parts that change passed in.
 *
 * The composition, fixed: back chip top-left, a big heading and one muted lead
 * under it, one bordered stage on the dot grid holding the demo, two quiet mono
 * lines at the foot. Geometry is fixed px inside the 1440x900 board and never
 * measured, so nothing strands when the canvas or the player scales the
 * document.
 *
 * `morph` is the section's viewTransitionName and it rides the stage — exactly
 * one per document, which is what lets a hub tile morph into the whole stage
 * without the page's transition aborting. Children are positioned absolutely in
 * the stage's own STAGE_W x STAGE_H space.
 */

export const STAGE_W = 1328;
export const STAGE_H = 620;

/** The canvas grain under every stage. */
export const dotGrid: CSSProperties = {
	backgroundImage:
		"radial-gradient(circle, color-mix(in srgb, var(--color-text) 8%, transparent) 1px, transparent 1px)",
	backgroundSize: "30px 30px",
	backgroundPosition: "-1px -1px",
};

/** The house two-shade code stance: strings and numbers in ink, syntax in muted. */
export function colorJson(line: string): ReactNode[] {
	const parts = line.split(/("[^"]*"|\b\d+\b)/g).filter((part) => part !== "");
	return parts.map((part, i) => (
		<span key={i} className={/^["\d]/.test(part) ? "text-text" : "text-muted/70"}>
			{part}
		</span>
	));
}

/**
 * The back chip's dress, exported rather than rendered.
 *
 * spool derives an arrow from every literal data-go target *in a frame's own
 * folder*, so a data-go living here in shared/ is invisible to the parser and
 * every section wearing this shell goes orphaned on the canvas map. The literal
 * has to stay in the frame. So the shell owns how the chip looks and the frame
 * owns where it walks, which is the half that was ever worth reading anyway:
 *
 *   <button type="button" data-go="site-hub" aria-label="Back to canvas" className={backChipClass}>
 *     <span className={backArrowClass}>←</span>
 *     Canvas
 *   </button>
 */
export const backChipClass =
	"group absolute top-11 left-14 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-surface/40 px-2.5 py-1.5 font-mono text-[11px] leading-none text-muted transition-colors hover:border-thread/40 hover:text-text";

export const backArrowClass = "text-muted transition-colors group-hover:text-thread";

interface SiteSectionProps {
	/** the section name, set big */
	title: string;
	/** the one muted line under it */
	lead: string;
	/** the two quiet mono lines at the foot, left and right */
	foot: readonly [string, string];
	/** this document's single viewTransitionName, worn by the stage */
	morph: string;
	/** the back chip, built in the frame so its data-go literal derives an arrow */
	back: ReactNode;
	/** the demo, positioned absolutely inside STAGE_W x STAGE_H */
	children: ReactNode;
}

export function SiteSection({ title, lead, foot, morph, back, children }: SiteSectionProps) {
	return (
		<div className="relative h-full w-full overflow-hidden bg-bg font-sans text-text antialiased [font-synthesis:none]">
			{back}

			<div className="absolute top-[92px] left-14">
				<h1 className="text-[68px] leading-[0.95] font-semibold tracking-[-0.02em]">{title}</h1>
				<p className="mt-3 text-[16px] leading-[24px] text-muted">{lead}</p>
			</div>

			{/* the body is the demo */}
			<div
				className="absolute overflow-hidden rounded-2xl border border-border bg-canvas"
				style={{
					left: 56,
					top: 216,
					width: STAGE_W,
					height: STAGE_H,
					viewTransitionName: morph,
					...dotGrid,
				}}
			>
				{/* the stage vignette: lifts the middle, settles the corners */}
				<div
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(94% 84% at 50% 44%, rgba(255,255,255,0.02) 0%, transparent 42%, rgba(0,0,0,0.46) 100%)",
					}}
				/>
				{children}
			</div>

			<div className="absolute right-14 bottom-9 left-14 flex items-center justify-between font-mono text-[11px] leading-none text-muted">
				<span>{foot[0]}</span>
				<span>{foot[1]}</span>
			</div>
		</div>
	);
}
