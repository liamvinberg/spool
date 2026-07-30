import { cn } from "../lib/utils";

/**
 * The strip under an `agent-many--*` frame: which population is on screen, and what the
 * frame measured of itself while drawing it.
 *
 * It borrows `agent-chat`'s picker whole, for the reason that frame gave: this is not
 * chrome spool has or will have, so it does not wear spool's chrome. Mono, below the app,
 * in the register the canvas uses for things the machine would print.
 *
 * The second line is the addition, and it is the point. Every number on it is read out of
 * the document that is drawing it — never computed in a comment — so a take that claims a
 * name fits says how wide the name was and how wide the room was, at both rail widths.
 */

export interface ReadoutCase {
	readonly id: string;
	readonly says: string;
}

export function ManyReadout({
	cases,
	picked,
	onPick,
	says,
	measured,
}: {
	cases: readonly ReadoutCase[];
	picked: string;
	onPick: (id: string) => void;
	says: string;
	/** what the frame measured, already phrased; joined with the separator the rail uses */
	measured: readonly string[];
}) {
	return (
		<div className="flex shrink-0 flex-col justify-center gap-1.5 border-border border-t bg-surface/40 px-5 py-2.5">
			<div className="flex items-center gap-3">
				<span className="shrink-0 font-mono text-2xs text-muted/45 leading-3">case</span>
				<div className="flex items-center gap-0.5">
					{cases.map((entry) => (
						<button
							key={entry.id}
							type="button"
							onClick={() => onPick(entry.id)}
							className={cn(
								"rounded px-1.5 py-0.5 font-mono text-2xs leading-3 transition-colors",
								entry.id === picked ? "bg-raised text-text" : "text-muted/70 hover:text-text",
							)}
						>
							{entry.id}
						</button>
					))}
				</div>
				<span className="min-w-0 flex-1 truncate text-right font-mono text-2xs text-muted/45 leading-3">{says}</span>
			</div>
			<div className="flex items-start gap-3">
				<span className="shrink-0 pt-px font-mono text-2xs text-muted/45 leading-4">read</span>
				{/* it wraps rather than truncates, because a measurement that is cut off is the
				    thing this whole page keeps getting wrong */}
				<div className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-0.5">
					{measured.map((line) => (
						<span key={line} className="whitespace-nowrap font-mono text-2xs text-muted/70 leading-4">
							{line}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}
