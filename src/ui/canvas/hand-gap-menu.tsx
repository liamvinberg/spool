import { describe as describeLength, parseTyped, stepLength } from "../../properties/families";
import { cn } from "../cn";
import { type GapAxis, gapOnScale, steppedGap } from "./hand-gap";
import { FAINT, LABEL, NumField } from "./properties-fields";

/**
 * The gap's own exact value, opened from the band (#306).
 *
 * The treatment the rail's spacing fields wear, over the band a person just
 * clicked rather than a row twenty rows down: the value as the file spells it,
 * the pixels it comes to, one step per arrow and ten with shift, and one
 * deliberate way off the scale into a pixel count.
 *
 * It offers no list of its own, because the rail's spacing rows offer none.
 * This project's scale is a step and a number, not a set of names, so a menu
 * of guessed steps would be a second spacing model beside the one the rail
 * already uses. Nothing here renames a value either: a percentage or an
 * expression is shown for what it is, and only a value that can move without
 * changing what it is has arrows at all.
 */
export function GapMenu({
	axis,
	authored,
	measured,
	step,
	at,
	onWrite,
	onClose,
}: {
	axis: GapAxis;
	/** what the class cell authors on this axis, which is the declaration in use */
	authored: string;
	/** what the gap measures in the running layout */
	measured: number;
	step: number;
	at: { left: number; top: number };
	onWrite: (value: string) => void;
	onClose: () => void;
}) {
	const readout = describeLength("spacing", authored === "" ? null : authored, false, step);
	return (
		<div
			data-gap-popover=""
			role="dialog"
			aria-label="Gap options"
			className="fixed z-50 w-52 rounded-sm border border-border-raised bg-raised p-1 outline-none"
			style={{ left: at.left, top: at.top }}
			onPointerDown={(event) => event.stopPropagation()}
			onKeyDown={(event) => {
				event.stopPropagation();
				if (event.key === "Escape") onClose();
			}}
		>
			<div className="flex items-center gap-1 px-1 pb-1">
				<span className={cn("flex-1", LABEL)}>{axis === "column-gap" ? "horizontal gap" : "vertical gap"}</span>
				<span className={FAINT}>{`${Number(measured.toFixed(2))}px`}</span>
			</div>
			<NumField
				label="Gap"
				value={authored}
				readout={readout}
				ok
				placeholder="0"
				onCommit={(typed) => {
					const next = parseTyped("spacing", typed);
					if (next !== null && !next.negative) onWrite(next.value);
					onClose();
				}}
				stepDraft={(from, units) => steppedGap(from, measured, units)}
			/>
			{gapOnScale(authored) ? (
				<button
					type="button"
					data-gap-custom=""
					className={cn("mt-1 w-full rounded-xs px-1 py-[3px] text-left hover:bg-surface", LABEL)}
					onClick={() => {
						// deliberately off the scale: the pixels it measures now, written
						// as a value of its own rather than a reference that moves with it
						const next = stepLength("spacing", null, measured, 0);
						onWrite(next === null ? `[${Number(measured.toFixed(2))}px]` : next.value);
						onClose();
					}}
				>
					Use custom value
				</button>
			) : null}
		</div>
	);
}
