import { describe as describeLength, parseTyped, stepLength } from "../../properties/families";
import { cn } from "../cn";
import { type GapAxis, gapSteppable, steppedGap } from "./hand-gap";
import { FAINT, LABEL, NumField, VALUE } from "./properties-fields";

/**
 * The gap's own exact value, opened from the band (#306).
 *
 * The same treatment the rail's spacing fields wear, over the band a person
 * just clicked rather than a row twenty rows down: the value as the file
 * spells it, one step per arrow and ten with ⇧, the project's own scale to
 * pick from, and one deliberate way off the scale into a pixel count. Nothing
 * here renames a value — a percentage or an expression is shown for what it
 * is, and the scale offers itself without claiming the current value is on it.
 */

/** The steps of the project's own scale a gap is usually written on. */
const SCALE = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];

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
	/** what the class cell spells on this axis, or nothing where it sets none */
	authored: string | null;
	/** what the gap measures in the running layout, which an unset one steps from */
	measured: number;
	step: number;
	at: { left: number; top: number };
	onWrite: (value: string) => void;
	onClose: () => void;
}) {
	const value = authored ?? "";
	const readout = describeLength("spacing", value === "" ? null : value, false, step);
	const scale = /^\d+(?:\.\d+)?$/.test(value);
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
				value={value}
				readout={readout}
				ok
				placeholder="0"
				onCommit={(typed) => {
					const next = parseTyped("spacing", typed);
					if (next !== null && !next.negative) onWrite(next.value);
					onClose();
				}}
				stepDraft={(from, units) => {
					if (!gapSteppable(from === "" ? null : from)) return undefined;
					return steppedGap(from === "" ? null : from, measured, units);
				}}
			/>
			<div className="mt-1 max-h-40 overflow-y-auto">
				{SCALE.map((unit) => (
					<button
						key={unit}
						type="button"
						data-gap-step={unit}
						aria-pressed={scale && Number(value) === unit}
						className={cn(
							"flex w-full items-center gap-2 rounded-xs px-1 py-[3px] text-left hover:bg-surface",
							VALUE,
							scale && Number(value) === unit ? "text-thread-strong" : "text-text",
						)}
						onClick={() => {
							onWrite(String(unit));
							onClose();
						}}
					>
						<span className="flex-1">{unit}</span>
						<span className={FAINT}>{`${unit * step}px`}</span>
					</button>
				))}
			</div>
			{scale ? (
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
