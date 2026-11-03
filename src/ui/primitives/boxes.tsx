// Box primitives, the knob editors for a box's spacing, corners and shadow
// (#220), and the previews their rows show at rest. Controlled through
// `TuneProps` as the pickers are: a drag is live as it moves, one commit on
// release, the value from before on Escape.
//
// Spacing and corners are diagrams at real size, a pixel dragged a pixel
// written, with Figma's habits: Shift lands on fours, Alt takes the opposite
// side or corner with it. A value keeps the shape it was written in.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../cn";
import { NumberField, type TuneProps } from "./inputs";
import { ColourText, clamp, parseColour, splitOutside, tuneDrag, Unreadable } from "./pickers";
import { PropertyValue } from "./structure";

/* ------------------------------------------------------- the rules -- */

/** px: all sides, [vertical, horizontal], or [top, right, bottom, left] */
export type Sides = number | [number, number] | [number, number, number, number];

/** px: all corners, or [top-left, top-right, bottom-right, bottom-left] */
export type Corners = number | [number, number, number, number];

type Four = [number, number, number, number];

/** every side, top first and clockwise, as CSS reads the shorthand */
export function sidesOf(value: Sides): Four {
	if (typeof value === "number") return [value, value, value, value];
	if (value.length === 2) return [value[0], value[1], value[0], value[1]];
	return value;
}

/** a dragged length: Shift lands on fours */
export function snapBox(n: number, shift: boolean): number {
	return shift ? Math.round(n / 4) * 4 : Math.round(n);
}

/**
 * One side or corner (top or top-left first, clockwise) set to `n`, in the
 * value's own shape: one value moves every part, a pair moves a side with its
 * opposite, four move one alone, or with its opposite under Alt.
 */
export function movePart<V extends Sides>(value: V, part: number, n: number, alt: boolean): V {
	if (typeof value === "number") return n as V;
	if (value.length === 2) return (part % 2 === 0 ? [n, value[1]] : [value[0], n]) as V;
	return value.map((m, i) => (i === part || (alt && i === (part + 2) % 4) ? n : m)) as V;
}

interface BoxLimits {
	min?: number | undefined;
	max?: number | undefined;
}

/** the number fields under a diagram: one per part the value's shape holds */
function PartFields<V extends Sides>({
	value,
	onTune,
	names,
	min = 0,
	max = Number.POSITIVE_INFINITY,
}: TuneProps<V> & BoxLimits & { names: string[] }) {
	const parts: readonly number[] = typeof value === "number" ? [value] : value;
	const shown = typeof value === "number" ? ["all"] : value.length === 2 ? ["v", "h"] : names;
	return (
		<div className="flex h-control-xs items-center gap-1">
			{parts.map((n, i) => (
				<NumberField
					key={shown[i]}
					label={shown[i]}
					prefix={shown[i]}
					value={n}
					onValueChange={(typed) =>
						onTune(movePart(value, i, clamp(Math.round(typed), min, max), false), "commit")
					}
					className="min-w-0 flex-1"
				/>
			))}
		</div>
	);
}

/** what a diagram draws as far as it reaches; the number says the rest */
const REACH = 48;

/** the length a drag from a part makes: the press's value plus the inward pull, snapped and kept in bounds */
const pulled = (from: number, inward: number, shift: boolean, { min = 0, max = Number.POSITIVE_INFINITY }: BoxLimits) =>
	clamp(snapBox(from + inward, shift), min, max);

/* --------------------------------------------------------- spacing -- */

const SIDES = ["top", "right", "bottom", "left"] as const;

/**
 * Spacing open in place: the box's edge, its content, and the bands between
 * them at real size, each with its number on it. Drag a band toward the
 * middle for more. The fields under it type the parts the value holds.
 */
export function SpacingEditor({ value, onTune, disabled = false, min, max }: TuneProps<Sides> & BoxLimits) {
	const [t, r, b, l] = sidesOf(value).map((n) => Math.min(Math.max(n, 0), REACH));
	const shown = sidesOf(value);
	const band: CSSProperties[] = [
		{ top: 0, left: 0, right: 0, height: Math.max(t!, 10), cursor: "ns-resize" },
		{ top: t, bottom: b, right: 0, width: Math.max(r!, 10), cursor: "ew-resize" },
		{ bottom: 0, left: 0, right: 0, height: Math.max(b!, 10), cursor: "ns-resize" },
		{ top: t, bottom: b, left: 0, width: Math.max(l!, 10), cursor: "ew-resize" },
	];
	const press = (side: number) => (event: ReactPointerEvent<HTMLElement>) =>
		tuneDrag(event, { value, onTune }, ({ dx, dy, shift, alt }) => {
			const inward = [dy, -dx, -dy, dx][side]!;
			return movePart(value, side, pulled(shown[side]!, inward, shift, { min, max }), alt);
		});
	return (
		<div className={cn("flex flex-col gap-2", disabled && "pointer-events-none opacity-40")}>
			<div className="relative h-32 rounded-sm border border-line-default bg-surface-window p-2">
				<div className="relative size-full rounded-xs border border-line-strong bg-surface-panel">
					<div
						className="absolute rounded-xs border border-line-strong bg-surface-raised"
						style={{ top: t, right: r, bottom: b, left: l }}
					/>
					{SIDES.map((name, side) => (
						<div
							key={name}
							aria-hidden="true"
							onPointerDown={press(side)}
							className={cn(
								"absolute flex touch-none select-none items-center justify-center",
								"bg-accent-subtle transition-colors duration-fast ease-out hover:bg-state-selected-strong",
							)}
							style={band[side]}
						>
							<span className="text-primary tabular-nums type-value">{shown[side]}</span>
						</div>
					))}
				</div>
			</div>
			<PartFields value={value} onTune={onTune} names={["t", "r", "b", "l"]} min={min} max={max} />
		</div>
	);
}

/* --------------------------------------------------------- corners -- */

/** which way is inward from each corner */
const INWARD = [
	[1, 1],
	[-1, 1],
	[-1, -1],
	[1, -1],
] as const;

const CORNER_PLACE = ["top-1 left-2", "top-1 right-2", "right-2 bottom-1", "bottom-1 left-2"];

/**
 * Corners open in place: a box at real size drawn with its own radii, a grip
 * in each corner to pull toward the middle and the corner's number outside
 * it. The fields under it type the parts the value holds.
 */
export function CornersEditor({ value, onTune, disabled = false, min, max }: TuneProps<Corners> & BoxLimits) {
	const radii = sidesOf(value);
	const press = (corner: number) => (event: ReactPointerEvent<HTMLElement>) =>
		tuneDrag(event, { value, onTune }, ({ dx, dy, shift, alt }) => {
			const [sx, sy] = INWARD[corner]!;
			// the grip rides in at half the radius, so pulling it both ways at once follows the hand
			return movePart(value, corner, pulled(radii[corner]!, dx * sx + dy * sy, shift, { min, max }), alt);
		});
	return (
		<div className={cn("flex flex-col gap-2", disabled && "pointer-events-none opacity-40")}>
			<div className="relative flex h-32 items-center justify-center rounded-sm border border-line-default bg-surface-window">
				{radii.map((n, corner) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: a corner is its place
						key={corner}
						className={cn(
							"pointer-events-none absolute text-secondary tabular-nums type-value",
							CORNER_PLACE[corner],
						)}
					>
						{n}
					</span>
				))}
				<div
					className="relative h-24 w-52 border border-secondary bg-surface-raised"
					style={{ borderRadius: radii.map((n) => `${n}px`).join(" ") }}
				>
					{INWARD.map(([sx, sy], corner) => {
						const inset = 4 + Math.min(radii[corner]!, REACH) / 2;
						return (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: a corner is its place
								key={corner}
								aria-hidden="true"
								onPointerDown={press(corner)}
								className={cn(
									"group/grip absolute flex size-5 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center",
									sx === sy ? "cursor-nwse-resize" : "cursor-nesw-resize",
								)}
								style={{
									left: sx === 1 ? inset : `calc(100% - ${inset}px)`,
									top: sy === 1 ? inset : `calc(100% - ${inset}px)`,
								}}
							>
								<span className="size-2 rounded-full border border-primary bg-surface-window transition-[scale,border-color] duration-fast ease-out group-hover/grip:scale-125 group-hover/grip:border-accent" />
							</span>
						);
					})}
				</div>
			</div>
			<PartFields value={value} onTune={onTune} names={["tl", "tr", "br", "bl"]} min={min} max={max} />
		</div>
	);
}

/* ----------------------------------------------------------- shadow -- */

/** One CSS box-shadow, px. */
export interface Shadow {
	inset: boolean;
	x: number;
	y: number;
	blur: number;
	spread: number;
	colour: string;
}

const LENGTH = /^(-?\d*\.?\d+)(px)?$/;

/** A single CSS box-shadow; several, or one it cannot read, read as nothing. */
export function parseShadow(text: string): Shadow | undefined {
	if (splitOutside(text, (char) => char === ",").length !== 1) return undefined;
	const words = splitOutside(text, (char) => /\s/.test(char));
	const lengths: number[] = [];
	const colours: string[] = [];
	let inset = false;
	for (const word of words) {
		const length = LENGTH.exec(word);
		if (word.toLowerCase() === "inset") inset = true;
		else if (length !== null && (length[2] !== undefined || Number(length[1]) === 0)) lengths.push(Number(length[1]));
		else if (parseColour(word) !== undefined || /^[a-z]+$/i.test(word)) colours.push(word);
		else return undefined;
	}
	if (lengths.length < 2 || lengths.length > 4 || colours.length > 1) return undefined;
	const [x = 0, y = 0, blur = 0, spread = 0] = lengths;
	return { inset, x, y, blur, spread, colour: colours[0] ?? "currentcolor" };
}

export function formatShadow({ inset, x, y, blur, spread, colour }: Shadow): string {
	const px = (n: number) => (n === 0 ? "0" : `${Math.round(n * 10) / 10}px`);
	return `${inset ? "inset " : ""}${[x, y, blur, spread].map(px).join(" ")} ${colour}`;
}

/** The shadow raised `rise` px from `from`: the offset and the blur grow together, as a thing lifted off a table. */
export function lift(from: Shadow, rise: number): Shadow {
	const y = Math.max(0, Math.round(from.y + rise));
	const ratio = from.y > 0 ? from.blur / from.y : 2;
	return { ...from, y, blur: Math.max(0, Math.round(y * ratio)) };
}

const PARTS = ["x", "y", "blur", "spread"] as const;

/** a shadow shows on a light surface and is lost on a dark one, so its card and table are light in either theme */
const LIT = "bg-[light-dark(var(--color-surface-window),var(--color-surface-inverse))]";

/**
 * A shadow open in place: a card casting it. Drag the card up to lift it, the
 * offset and the blur growing together; sideways moves it. Under it the four
 * lengths and the colour to type.
 */
export function ShadowEditor({ value, onTune, disabled = false }: TuneProps<string>) {
	const shadow = parseShadow(value);
	if (shadow === undefined) return <Unreadable value={value} />;
	const put = (next: Partial<Shadow>) => onTune(formatShadow({ ...shadow, ...next }), "commit");
	return (
		<div className={cn("flex flex-col gap-2", disabled && "pointer-events-none opacity-40")}>
			<div
				className={cn("relative flex h-28 items-center justify-center rounded-sm border border-line-default", LIT)}
			>
				<div
					aria-hidden="true"
					title="Drag up to lift"
					onPointerDown={(event) =>
						tuneDrag(event, { value, onTune }, ({ dx, dy }) =>
							formatShadow({ ...lift(shadow, -dy / 2), x: Math.round(shadow.x + dx / 2) }),
						)
					}
					className={cn("h-14 w-28 cursor-grab touch-none rounded-md active:cursor-grabbing", LIT)}
					style={{ boxShadow: value }}
				/>
			</div>
			<div className="flex h-control-xs items-center gap-1">
				{PARTS.map((part) => (
					<NumberField
						key={part}
						label={part}
						prefix={part === "blur" ? "b" : part === "spread" ? "s" : part}
						value={shadow[part]}
						onValueChange={(typed) => put({ [part]: part === "blur" ? Math.max(0, typed) : typed })}
						className="min-w-0 flex-1"
					/>
				))}
			</div>
			<div className="flex h-control-xs items-center gap-1.5">
				<span
					aria-hidden="true"
					className="ml-1 size-3.5 shrink-0 rounded-xs border border-line-strong"
					style={{ background: shadow.colour }}
				/>
				<ColourText
					label="shadow colour"
					value={shadow.colour}
					onCommit={(colour) => put({ colour })}
					className="flex-1"
				/>
			</div>
		</div>
	);
}

/* ---------------------------------------------------------- previews -- */

/** the four sides, the parts the value holds drawn solid */
function SidesGlyph({ corners }: { corners: boolean }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" aria-hidden="true" className="size-3 shrink-0 text-secondary">
			{corners ? (
				<path d="M1.5 7V4.5a3 3 0 0 1 3-3H7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
			) : (
				<>
					<rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1" />
					<rect x="4" y="4" width="4" height="4" rx="0.5" fill="currentColor" />
				</>
			)}
		</svg>
	);
}

/** Spacing or corners at rest: a glyph and the numbers as written. */
export function BoxPreview({ value, corners = false }: { value: Sides; corners?: boolean | undefined }) {
	return (
		<span className="flex min-w-0 flex-1 items-center gap-1.5">
			<SidesGlyph corners={corners} />
			<PropertyValue value={typeof value === "number" ? value : value.join(" ")} unit="px" className="px-0" />
		</span>
	);
}

/** A shadow at rest: a chip casting it small, and its lift and blur. */
export function ShadowPreview({ value }: { value: string }) {
	const shadow = parseShadow(value);
	const small =
		shadow &&
		formatShadow({ ...shadow, x: shadow.x / 4, y: shadow.y / 4, blur: shadow.blur / 4, spread: shadow.spread / 4 });
	return (
		<span className="flex min-w-0 flex-1 items-center gap-1.5">
			<span aria-hidden="true" className={cn("size-3.5 shrink-0 rounded-xs", LIT)} style={{ boxShadow: small }} />
			<PropertyValue value={shadow === undefined ? value : `${shadow.y} ${shadow.blur}`} className="px-0" />
		</span>
	);
}
