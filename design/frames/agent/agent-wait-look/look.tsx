import { useEffect, useState } from "react";
import { cn } from "../../../shared/lib/utils";
import { ShimmerWord } from "../../../shared/ui/spool-wait-rail";

/**
 * The sheet's own parts. Nothing here knows about spool's rail: it is a reading of
 * other people's surfaces, drawn so the four answers line up in one place.
 */

/** an answer that is read off source, and one that is inferred from it */
export type Firmness = "read" | "inferred" | "unverified";

export interface Surface {
	readonly name: string;
	/** where the evidence is, verbatim enough to go and look */
	readonly source: string;
	readonly where: string;
	readonly whereHow: Firmness;
	/** does it stay put and change, or does it come and go */
	readonly always: "yes" | "no, it is made and unmade" | "not on disk";
	readonly alwaysNote: string;
	readonly alwaysHow: Firmness;
	readonly moves: string;
	readonly movesHow: Firmness;
	readonly says: string;
	/** the real frames, off the real source, so the sheet shows rather than describes */
	readonly glyphs: readonly string[] | null;
	/** ms for one full cycle of those frames */
	readonly cycle: number;
	/** the animation is an opacity pulse rather than a glyph cycle */
	readonly pulse?: boolean;
	/** it is a word with light moving across it rather than a glyph at all */
	readonly sweep?: boolean;
}

/** a cell whose confidence is part of what it says */
export function Cell({ text, how, className }: { text: string; how: Firmness; className?: string | undefined }) {
	return (
		<span
			className={cn(
				"font-mono text-2xs leading-4",
				how === "read" ? "text-text/85" : how === "inferred" ? "text-muted/70 italic" : "text-muted/35",
				className,
			)}
		>
			{text}
		</span>
	);
}

/**
 * The indicator itself, running.
 *
 * Every frame list here is copied out of the source it is cited against, so this column
 * is evidence rather than illustration. A pulse is drawn as a pulse for the same reason:
 * assistant-ui's is Tailwind's own `animate-pulse`, opacity 1 to .5 and back over two
 * seconds, and describing that in words would be the one place this sheet stopped
 * showing its work.
 */
export function Glyph({
	frames,
	cycle,
	pulse = false,
	sweep = false,
}: {
	frames: readonly string[];
	cycle: number;
	pulse?: boolean;
	sweep?: boolean;
}) {
	const [at, setAt] = useState(0);
	useEffect(() => {
		if (pulse || sweep || frames.length < 2) return;
		const timer = window.setInterval(() => setAt((n) => (n + 1) % frames.length), Math.round(cycle / frames.length));
		return () => window.clearInterval(timer);
	}, [frames, cycle, pulse, sweep]);
	if (sweep)
		return <ShimmerWord text={frames[0] ?? ""} live cycle={cycle} className="font-mono text-2xs leading-4" />;
	return (
		<span
			className={cn("font-mono text-base text-text/80 leading-4 tabular-nums", pulse && "animate-pulse")}
			style={pulse ? { animationDuration: `${cycle}ms` } : undefined}
		>
			{pulse ? frames[0] : frames[at]}
		</span>
	);
}

/** one of the sheet's conclusions, with the thing that forces it under it */
export function Finding({ title, body }: { title: string; body: string }) {
	return (
		<div className="flex min-w-0 flex-col gap-2 border-border border-t pt-3">
			<span className="font-mono text-sm text-text leading-4">{title}</span>
			<p className="max-w-[560px] font-mono text-2xs text-muted/70 leading-5">{body}</p>
		</div>
	);
}
