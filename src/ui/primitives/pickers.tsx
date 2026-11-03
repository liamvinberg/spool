// Picker primitives, the knob editors for colour and choices (#220):
// ColourPicker, GradientEditor, FontList, WeightPicker, PictureGrid, IconGrid,
// OptionList, and the previews their rows show at rest.
//
// Every editor is controlled through `TuneProps`: the caller passes the live
// value back as `value` while a gesture runs. A drag is live as it moves, one
// commit on release and the value from before on Escape. A choice is tried on
// by hover, put back on leaving and committed by a press. Placing a popover
// list is the caller's, as for every float.

import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import type { KnobChoice, KnobOption } from "../../runtime/knob-protocol";
import { cn } from "../cn";
import { CheckIcon } from "../icons";
import { Thumbnail } from "./display";
import { NumberField, SearchField, TextField, type TuneProps } from "./inputs";
import { Menu, MenuItem, Popover } from "./overlays";
import { Segment, SegmentedControl } from "./selection";
import { ScrollArea } from "./structure";

/* ----------------------------------------------------------- the drag -- */

export interface DragPoint {
	/** from the pressed element's box */
	x: number;
	y: number;
	/** from where the press began */
	dx: number;
	dy: number;
	rect: DOMRect;
	shift: boolean;
	alt: boolean;
}

/**
 * A press held and moved as one tune: `next` reads the value each point makes,
 * live as it changes, one commit on release when it changed anything, and the
 * value from before the press on Escape, which ends it there.
 */
export function tuneDrag<T>(
	event: ReactPointerEvent<HTMLElement>,
	{ value, onTune }: TuneProps<T>,
	next: (point: DragPoint) => T,
): void {
	if (event.button !== 0) return;
	event.preventDefault();
	const view = event.currentTarget.ownerDocument.defaultView ?? window;
	const rect = event.currentTarget.getBoundingClientRect();
	const start = { x: event.clientX, y: event.clientY };
	let last = value;
	const move = (at: { clientX: number; clientY: number; shiftKey: boolean; altKey: boolean }) => {
		const made = next({
			x: at.clientX - rect.left,
			y: at.clientY - rect.top,
			dx: at.clientX - start.x,
			dy: at.clientY - start.y,
			rect,
			shift: at.shiftKey,
			alt: at.altKey,
		});
		if (same(made, last)) return;
		last = made;
		onTune(made, "live");
	};
	const stop = () => {
		view.removeEventListener("pointermove", move);
		view.removeEventListener("pointerup", up);
		view.removeEventListener("pointercancel", up);
		view.removeEventListener("keydown", key, true);
	};
	const up = () => {
		stop();
		if (!same(last, value)) onTune(last, "commit");
	};
	const key = (pressed: KeyboardEvent) => {
		if (pressed.key !== "Escape") return;
		pressed.preventDefault();
		pressed.stopPropagation();
		stop();
		if (!same(last, value)) onTune(value, "cancel");
	};
	view.addEventListener("pointermove", move);
	view.addEventListener("pointerup", up);
	view.addEventListener("pointercancel", up);
	view.addEventListener("keydown", key, true);
	move(event);
}

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** a number as a literal, to `digits` places and no trailing zeros */
const trim = (n: number, digits: number) => String(Number(n.toFixed(digits)));

/** `text` cut at every separator outside parentheses, the pieces trimmed and none empty */
export function splitOutside(text: string, separator: (char: string) => boolean): string[] {
	const pieces: string[] = [];
	let depth = 0;
	let piece = "";
	for (const char of text) {
		if (char === "(") depth++;
		if (char === ")") depth--;
		if (depth === 0 && separator(char)) {
			pieces.push(piece);
			piece = "";
		} else piece += char;
	}
	pieces.push(piece);
	return pieces.map((one) => one.trim()).filter((one) => one !== "");
}

/* ------------------------------------------------------------ try on -- */

/**
 * Choices under the pointer: the first tried keeps the value from before,
 * leaving puts it back, a press commits. Pressing the value already held
 * commits nothing.
 */
function useTryOn<T>({ value, onTune }: TuneProps<T>) {
	const before = useRef<{ value: T } | null>(null);
	const put = () => {
		const held = before.current;
		before.current = null;
		return held;
	};
	return {
		try: (next: T) => {
			before.current ??= { value };
			onTune(next, "live");
		},
		leave: () => {
			const held = put();
			if (held !== null) onTune(held.value, "cancel");
		},
		pick: (next: T) => {
			const held = put();
			if (next !== (held ?? { value }).value) onTune(next, "commit");
			else if (held !== null) onTune(held.value, "cancel");
		},
	};
}

const optionOf = (choice: KnobChoice): KnobOption => (typeof choice === "string" ? { value: choice } : choice);

/* ------------------------------------------------------------ colour -- */

export type ColourFormat = "hex" | "rgb" | "hsl" | "oklch";

/** sRGB channels 0…255 and alpha 0…1, unrounded, so a drag never steps */
export interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

type Triple = [number, number, number];
type Channelled = Exclude<ColourFormat, "hex">;

/** how each format writes its three channels: names, places, units, the arrows' step */
const CHANNELS: Record<Channelled, { names: string[]; digits: Triple; units: string[]; step: Triple }> = {
	rgb: { names: ["R", "G", "B"], digits: [0, 0, 0], units: ["", "", ""], step: [1, 1, 1] },
	hsl: { names: ["H", "S", "L"], digits: [1, 1, 1], units: ["", "%", "%"], step: [1, 1, 1] },
	oklch: { names: ["L", "C", "H"], digits: [2, 4, 2], units: ["%", "", ""], step: [1, 0.01, 1] },
};

const HEX = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CALL = /^(rgba?|hsla?|oklch)\(([^()]*)\)$/i;

/** A CSS colour in one of the four formats, and which it was written in. */
export function parseColour(text: string): { colour: Rgba; format: ColourFormat } | undefined {
	const typed = text.trim();
	const hex = HEX.exec(typed)?.[1];
	if (hex !== undefined) {
		const pairs = hex.length <= 4 ? [...hex].map((digit) => digit + digit) : (hex.match(/../g) ?? []);
		const [r = 0, g = 0, b = 0, a = 255] = pairs.map((pair) => Number.parseInt(pair, 16));
		return { colour: { r, g, b, a: a / 255 }, format: "hex" };
	}
	const call = CALL.exec(typed);
	if (call === null) return undefined;
	const format = call[1]!.toLowerCase().replace(/a$/, "") as Channelled;
	const parts = call[2]!.split(/[\s,/]+/).filter((part) => part !== "");
	if (parts.length !== 3 && parts.length !== 4) return undefined;
	const read = (part: string, percent: number) => {
		const n = Number.parseFloat(part);
		return part.endsWith("%") ? n * percent : n;
	};
	const [p = "", q = "", s = "", alpha = "1"] = parts;
	const triple: Triple =
		format === "rgb"
			? [read(p, 2.55), read(q, 2.55), read(s, 2.55)]
			: format === "hsl"
				? [read(p, 1), read(q, 1), read(s, 1)]
				: [p.endsWith("%") ? read(p, 1) : read(p, 1) * 100, read(q, 0.004), read(s, 1)];
	const a = read(alpha, 0.01);
	if (![...triple, a].every(Number.isFinite)) return undefined;
	return { colour: fromChannels(format, triple, clamp(a, 0, 1)), format };
}

/** The colour written in `format`; alpha only when it is not whole. */
export function formatColour(colour: Rgba, format: ColourFormat): string {
	const alpha = Math.round(colour.a * 1000) / 1000;
	if (format === "hex") {
		const pair = (n: number) =>
			Math.round(clamp(n, 0, 255))
				.toString(16)
				.padStart(2, "0");
		return `#${pair(colour.r)}${pair(colour.g)}${pair(colour.b)}${alpha < 1 ? pair(alpha * 255) : ""}`;
	}
	const { digits, units } = CHANNELS[format];
	const words = channelsOf(colour, format).map((n, i) => `${trim(n, digits[i]!)}${units[i]}`);
	return `${format}(${words.join(" ")}${alpha < 1 ? ` / ${trim(alpha, 3)}` : ""})`;
}

/** the three numbers a format writes: rgb 0…255, hsl degrees and percents, oklch percent, chroma, degrees */
function channelsOf({ r, g, b }: Rgba, format: Channelled): Triple {
	if (format === "rgb") return [r, g, b];
	if (format === "hsl") {
		const [h, s, l] = rgbToHsl(r, g, b);
		return [h, s * 100, l * 100];
	}
	const [L, a, bb] = rgbToOklab(r, g, b);
	const C = Math.hypot(a, bb);
	return [L * 100, C, C < 1e-4 ? 0 : (Math.atan2(bb, a) * (180 / Math.PI) + 360) % 360];
}

function fromChannels(format: Channelled, [p, q, s]: Triple, a: number): Rgba {
	if (format === "rgb") return { r: clamp(p, 0, 255), g: clamp(q, 0, 255), b: clamp(s, 0, 255), a };
	if (format === "hsl") return { ...hslToRgb(p, clamp(q, 0, 100) / 100, clamp(s, 0, 100) / 100), a };
	const h = (s * Math.PI) / 180;
	return { ...oklabToRgb(clamp(p, 0, 100) / 100, q * Math.cos(h), q * Math.sin(h)), a };
}

function rgbToHsl(r: number, g: number, b: number): Triple {
	const [h, , v] = rgbToHsv(r, g, b);
	const max = v;
	const min = Math.min(r, g, b) / 255;
	const l = (max + min) / 2;
	const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
	return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Omit<Rgba, "a"> {
	const v = l + s * Math.min(l, 1 - l);
	return hsvToRgb(h, v === 0 ? 0 : 2 * (1 - l / v), v);
}

function rgbToHsv(r: number, g: number, b: number): Triple {
	const [R, G, B] = [r / 255, g / 255, b / 255];
	const max = Math.max(R, G, B);
	const span = max - Math.min(R, G, B);
	let h = 0;
	if (span > 0) {
		if (max === R) h = ((G - B) / span) % 6;
		else if (max === G) h = (B - R) / span + 2;
		else h = (R - G) / span + 4;
	}
	return [(h * 60 + 360) % 360, max === 0 ? 0 : span / max, max];
}

function hsvToRgb(h: number, s: number, v: number): Omit<Rgba, "a"> {
	const at = (n: number) => {
		const k = (n + h / 60) % 6;
		return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
	};
	return { r: at(5), g: at(3), b: at(1) };
}

const toLinear = (c: number) => {
	const n = c / 255;
	return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => 255 * clamp(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055, 0, 1);

// Björn Ottosson's OKLab matrices, sRGB in and out; a colour past sRGB is clipped
function rgbToOklab(r: number, g: number, b: number): Triple {
	const [R, G, B] = [toLinear(r), toLinear(g), toLinear(b)];
	const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
	const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
	const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
	return [
		0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
		1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
		0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
	];
}

function oklabToRgb(L: number, a: number, b: number): Omit<Rgba, "a"> {
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return {
		r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
		g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
		b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
	};
}

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

const opaque = ({ r, g, b }: Rgba) => formatColour({ r, g, b, a: 1 }, "rgb");

/** what sits under a colour that lets light through */
const CHECKER =
	"repeating-conic-gradient(var(--color-surface-raised) 0% 25%, var(--color-line-strong) 0% 50%) 50% / 8px 8px";

const HUES = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360].map((h) => `hsl(${h} 100% 50%)`).join(", ")})`;

/** a colour painted over the checker, so its alpha shows */
function Chip({ paint, className }: { paint: string; className?: string }) {
	return (
		<span
			aria-hidden="true"
			className={cn("block shrink-0 rounded-xs border border-line-strong", className)}
			style={{ background: `linear-gradient(${paint}, ${paint}), ${CHECKER}` }}
		/>
	);
}

/** the ring every strip and square wears where it is held */
const THUMB =
	"pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary shadow-float";

/**
 * Hue, saturation and value as the picker's own, made for the value it last
 * wrote, so dragging through grey or black keeps the hue it was on; any other
 * value (typed, a swatch, an undo) reads fresh, keeping the hue grey has none of.
 */
function useHsv(value: string, colour: Rgba) {
	const [held, setHeld] = useState<{ for: string; hsv: Triple }>(() => ({
		for: value,
		hsv: rgbToHsv(colour.r, colour.g, colour.b),
	}));
	let hsv = held.hsv;
	if (held.for !== value) {
		const [h, s, v] = rgbToHsv(colour.r, colour.g, colour.b);
		hsv = [s === 0 || v === 0 ? held.hsv[0] : h, v === 0 ? held.hsv[1] : s, v];
	}
	const put = (next: Triple, written: string) => setHeld({ for: written, hsv: next });
	return [hsv, put] as const;
}

export interface ColourPickerProps extends TuneProps<string> {
	/** an alpha strip and field */
	alpha?: boolean | undefined;
	/** colours offered to try on */
	swatches?: readonly string[] | undefined;
}

/**
 * A colour open in place: saturation and value on a square, hue and alpha on
 * strips under it, the format it is read and written in, its channels to type,
 * and the swatches offered. A change is written in the format shown, which
 * starts as the value's own. One height whichever format is shown.
 */
export function ColourPicker({ value, onTune, disabled = false, alpha = false, swatches = [] }: ColourPickerProps) {
	const parsed = parseColour(value);
	const colour = parsed?.colour ?? BLACK;
	const [format, setFormat] = useState<ColourFormat>(parsed?.format ?? "hex");
	const [hsv, putHsv] = useHsv(value, colour);
	const tune = { value, onTune };
	const write = (next: Rgba) => formatColour(next, format);
	const fromHsv = (next: Triple): string => {
		const written = write({ ...hsvToRgb(...next), a: colour.a });
		putHsv(next, written);
		return written;
	};
	const pure = `hsl(${hsv[0]} 100% 50%)`;
	const swatch = useTryOn(tune);
	const commit = (next: Rgba) => {
		const written = write(next);
		if (written !== value) onTune(written, "commit");
	};
	return (
		<div className={cn("flex flex-col gap-2", disabled && "pointer-events-none opacity-40")}>
			{/* the square and the strips are the pointer's; the channel fields are the keys' */}
			<div
				aria-hidden="true"
				onPointerDown={(event) =>
					tuneDrag(event, tune, ({ x, y, rect }) =>
						fromHsv([hsv[0], clamp(x / rect.width, 0, 1), clamp(1 - y / rect.height, 0, 1)]),
					)
				}
				className="relative h-32 cursor-crosshair touch-none rounded-sm"
				style={{
					background: `linear-gradient(to top, black, transparent), linear-gradient(to right, white, ${pure})`,
				}}
			>
				<span
					className={THUMB}
					style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%`, background: opaque(colour) }}
				/>
			</div>
			<Strip
				label="hue"
				share={hsv[0] / 360}
				background={HUES}
				fill={pure}
				onPointerDown={(event) =>
					tuneDrag(event, tune, ({ x, rect }) => fromHsv([clamp(x / rect.width, 0, 0.9999) * 360, hsv[1], hsv[2]]))
				}
			/>
			{alpha ? (
				<Strip
					label="alpha"
					share={colour.a}
					background={`linear-gradient(to right, transparent, ${opaque(colour)}), ${CHECKER}`}
					fill={write(colour)}
					onPointerDown={(event) =>
						tuneDrag(event, tune, ({ x, rect }) =>
							write({ ...colour, a: Math.round(clamp(x / rect.width, 0, 1) * 100) / 100 }),
						)
					}
				/>
			) : null}
			<SegmentedControl
				size="sm"
				label="format"
				value={format}
				onValueChange={(next) => setFormat(next as ColourFormat)}
				className="w-full"
			>
				{(["hex", "rgb", "hsl", "oklch"] as const).map((one) => (
					<Segment key={one} value={one} className="flex-1 justify-center uppercase">
						{one}
					</Segment>
				))}
			</SegmentedControl>
			<div className="flex h-control-xs items-center gap-1">
				{format === "hex" ? (
					<ColourText
						label="hex"
						value={formatColour({ ...colour, a: 1 }, "hex")}
						onCommit={(typed) => {
							const next = parseColour(typed)?.colour;
							if (next !== undefined) commit({ ...next, a: alpha && next.a < 1 ? next.a : colour.a });
						}}
						className="flex-1"
					/>
				) : (
					channelsOf(colour, format).map((n, i) => (
						<NumberField
							key={CHANNELS[format].names[i]}
							label={CHANNELS[format].names[i]}
							prefix={CHANNELS[format].names[i]}
							value={Number(trim(n, CHANNELS[format].digits[i]!))}
							step={CHANNELS[format].step[i]}
							onValueChange={(typed) => {
								const triple: Triple = [...channelsOf(colour, format)];
								triple[i] = typed;
								commit(fromChannels(format, triple, colour.a));
							}}
							className="min-w-0 flex-1"
						/>
					))
				)}
				{alpha ? (
					<NumberField
						label="alpha"
						prefix="A"
						unit="%"
						value={Math.round(colour.a * 100)}
						onValueChange={(typed) => commit({ ...colour, a: clamp(typed, 0, 100) / 100 })}
						className="w-16 shrink-0"
					/>
				) : null}
			</div>
			{swatches.length === 0 ? null : (
				<div className="flex h-5 flex-wrap items-center gap-1.5 overflow-hidden" onPointerLeave={swatch.leave}>
					{swatches.map((offered) => {
						const written = write(parseColour(offered)?.colour ?? BLACK);
						return (
							<button
								key={offered}
								type="button"
								aria-label={offered}
								title={offered}
								aria-pressed={written === value}
								onPointerEnter={() => swatch.try(written)}
								onClick={() => swatch.pick(written)}
								className="focus-ring rounded-full p-0.5 transition-[scale] duration-fast ease-out hover:scale-110 aria-pressed:ring-1 aria-pressed:ring-primary"
							>
								<Chip paint={offered} className="size-3.5 rounded-full" />
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

/** one channel's strip (hue, alpha), pressed and dragged */
function Strip({
	label,
	share,
	background,
	fill,
	onPointerDown,
}: {
	label: string;
	share: number;
	background: string;
	fill: string;
	onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
}) {
	return (
		<div
			aria-hidden="true"
			title={label}
			onPointerDown={onPointerDown}
			className="relative mx-1.5 h-3 cursor-pointer touch-none rounded-full"
			style={{ background }}
		>
			<span className={cn(THUMB, "top-1/2")} style={{ left: `${share * 100}%`, background: fill }} />
		</div>
	);
}

/**
 * A colour typed as text: committed on Enter or blur when it reads as a
 * colour and differs, put back on Escape.
 */
export function ColourText({
	value,
	onCommit,
	label,
	className,
}: {
	value: string;
	onCommit: (typed: string) => void;
	label: string;
	className?: string | undefined;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	// read by blur, which Escape's own blur reaches before the cleared draft renders
	const typed = useRef<string | null>(null);
	const finish = (commit: boolean) => {
		const held = typed.current;
		typed.current = null;
		setDraft(null);
		if (commit && held !== null && held.trim() !== value && parseColour(held) !== undefined) onCommit(held.trim());
	};
	return (
		<TextField
			size="xs"
			tone="quiet"
			mono
			label={label}
			value={draft ?? value}
			onValueChange={(next) => {
				typed.current = next;
				setDraft(next);
			}}
			inputProps={{
				onFocus: (event) => event.target.select(),
				onBlur: () => finish(true),
				onKeyDown: (event) => {
					if (event.key !== "Enter" && event.key !== "Escape") return;
					event.preventDefault();
					event.stopPropagation();
					finish(event.key === "Enter");
					event.currentTarget.blur();
				},
			}}
			className={className}
		/>
	);
}

/** A colour at rest: its swatch and its value as written. */
export function ColourPreview({ value }: { value: string }) {
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<Chip paint={value} className="size-3.5" />
			<span className="truncate text-primary type-value">{value}</span>
		</span>
	);
}

/* ---------------------------------------------------------- gradient -- */

export interface GradientStop {
	colour: string;
	/** percent along the line */
	at: number;
}

export interface Gradient {
	/** degrees, as CSS reads them: 0 up, 90 right */
	angle: number;
	stops: GradientStop[];
}

const TOWARD: Record<string, number> = {
	top: 0,
	"right top": 45,
	right: 90,
	"bottom right": 135,
	bottom: 180,
	"bottom left": 225,
	left: 270,
	"left top": 315,
};

const TURNS: Record<string, number> = { deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 };

/** A CSS linear-gradient(): its angle, and its stops with every position filled in. */
export function parseGradient(text: string): Gradient | undefined {
	const call = /^linear-gradient\(([\s\S]*)\)$/i.exec(text.trim());
	if (call === null) return undefined;
	const parts = splitOutside(call[1]!, (char) => char === ",");
	let angle = 180;
	const toward = /^to\s+(.+)$/i.exec(parts[0] ?? "");
	const turned = /^(-?[\d.]+)(deg|turn|rad|grad)$/i.exec(parts[0] ?? "");
	if (toward !== null) angle = TOWARD[toward[1]!.toLowerCase().split(/\s+/).sort().join(" ")] ?? Number.NaN;
	else if (turned !== null) angle = Number(turned[1]) * TURNS[turned[2]!.toLowerCase()]!;
	if (toward !== null || turned !== null) parts.shift();
	if (!Number.isFinite(angle) || parts.length < 2) return undefined;
	const read = parts.map((part) => {
		const placed = /^(.*\S)\s+(-?[\d.]+)%$/.exec(part);
		return placed === null ? { colour: part, at: undefined } : { colour: placed[1]!, at: Number(placed[2]) };
	});
	read[0]!.at ??= 0;
	read[read.length - 1]!.at ??= 100;
	// a stop with no position sits evenly between the placed ones around it
	const stops = read.map(({ colour, at }, i) => {
		if (at !== undefined) return { colour, at };
		let before = i - 1;
		while (read[before]!.at === undefined) before--;
		const after = i + read.slice(i).findIndex((one) => one.at !== undefined);
		const [from, to] = [read[before]!.at!, read[after]!.at!];
		return { colour, at: from + ((to - from) * (i - before)) / (after - before) };
	});
	return { angle: ((angle % 360) + 360) % 360, stops };
}

export function formatGradient({ angle, stops }: Gradient): string {
	const placed = [...stops].sort((a, b) => a.at - b.at).map((stop) => `${stop.colour} ${trim(stop.at, 1)}%`);
	return `linear-gradient(${trim(angle, 1)}deg, ${placed.join(", ")})`;
}

/** the colour a gradient shows at `at`: what a stop added there starts as */
function colourAt({ stops }: Gradient, at: number, format: ColourFormat): string {
	const after = stops.find((stop) => stop.at >= at) ?? stops[stops.length - 1]!;
	const before = [...stops].reverse().find((stop) => stop.at <= at) ?? stops[0]!;
	const [a, b] = [parseColour(before.colour)?.colour, parseColour(after.colour)?.colour];
	if (a === undefined || b === undefined) return before.colour;
	const t = after.at === before.at ? 0 : (at - before.at) / (after.at - before.at);
	const mix = (p: number, q: number) => p + (q - p) * t;
	return formatColour({ r: mix(a.r, b.r), g: mix(a.g, b.g), b: mix(a.b, b.b), a: mix(a.a, b.a) }, format);
}

/** what an editor shows for a value it cannot read: the value, untouched */
export function Unreadable({ value }: { value: string }) {
	return <p className="truncate text-secondary type-value">{value}</p>;
}

/**
 * A linear gradient open in place: a bar with its stops riding on it. Drag a
 * stop along; press the bar to add one in the colour under it and keep
 * dragging; Delete takes the selected stop away while more than two are left.
 * Under the bar the angle, then the selected stop's colour. One height
 * whatever the number of stops.
 */
export function GradientEditor({ value, onTune, disabled = false }: TuneProps<string>) {
	const [selected, setSelected] = useState(0);
	const bar = useRef<HTMLDivElement>(null);
	const gradient = parseGradient(value);
	if (gradient === undefined) return <Unreadable value={value} />;
	const index = Math.min(selected, gradient.stops.length - 1);
	const stop = gradient.stops[index]!;
	const tune = { value, onTune };
	// the stops stay in the bar's order, so the selection is the place the held stop lands in
	const hold = (event: ReactPointerEvent<HTMLElement>, base: GradientStop[], held: GradientStop) => {
		const rect = bar.current?.getBoundingClientRect();
		if (rect === undefined) return;
		tuneDrag(event, tune, ({ dx }) => {
			const at = Math.round(clamp(((event.clientX + dx - rect.left) / rect.width) * 100, 0, 100));
			const moved = { ...held, at };
			const stops = base.map((one) => (one === held ? moved : one)).sort((a, b) => a.at - b.at);
			setSelected(stops.indexOf(moved));
			return formatGradient({ ...gradient, stops });
		});
	};
	return (
		<div className={cn("flex flex-col gap-2", disabled && "pointer-events-none opacity-40")}>
			<div className="relative mx-1.5 h-7">
				<div
					ref={bar}
					onPointerDown={(event) => {
						const rect = event.currentTarget.getBoundingClientRect();
						const at = Math.round(clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100));
						const added = { colour: colourAt(gradient, at, parseColour(stop.colour)?.format ?? "hex"), at };
						hold(event, [...gradient.stops, added], added);
					}}
					className="absolute inset-0 cursor-copy touch-none rounded-sm border border-line-strong"
					style={{ background: `${formatGradient({ ...gradient, angle: 90 })}, ${CHECKER}` }}
				/>
				{gradient.stops.map((one, i) => (
					<button
						// biome-ignore lint/suspicious/noArrayIndexKey: a stop is its place on the bar
						key={i}
						type="button"
						aria-label={`stop at ${trim(one.at, 1)}%`}
						aria-pressed={i === index}
						onFocus={() => setSelected(i)}
						onPointerDown={(event) => {
							event.stopPropagation();
							event.currentTarget.focus({ preventScroll: true });
							hold(event, gradient.stops, one);
						}}
						onKeyDown={(event) => {
							if ((event.key !== "Delete" && event.key !== "Backspace") || gradient.stops.length <= 2) return;
							event.preventDefault();
							event.stopPropagation();
							setSelected(Math.max(0, i - 1));
							onTune(
								formatGradient({ ...gradient, stops: gradient.stops.filter((other) => other !== one) }),
								"commit",
							);
						}}
						className={cn(
							"absolute top-1/2 h-5.5 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-xs border-2 border-primary shadow-float outline-none",
							"transition-[height] duration-fast ease-out focus-visible:outline-2 focus-visible:outline-line-focus focus-visible:outline-solid",
							"aria-pressed:z-10 aria-pressed:h-6.5",
						)}
						style={{ left: `${one.at}%`, background: one.colour }}
					/>
				))}
			</div>
			<div className="flex h-control-xs items-center gap-1">
				<NumberField
					label="angle"
					prefix="∠"
					unit="°"
					value={Number(trim(gradient.angle, 1))}
					onValueChange={(angle) =>
						onTune(formatGradient({ ...gradient, angle: ((angle % 360) + 360) % 360 }), "commit")
					}
					className="w-20 shrink-0"
				/>
				<span className="ml-auto truncate pr-1 text-tertiary type-detail">
					stop {index + 1} of {gradient.stops.length}
				</span>
			</div>
			<ColourPicker
				alpha
				value={stop.colour}
				onTune={(colour, phase) =>
					onTune(
						formatGradient({
							...gradient,
							stops: gradient.stops.map((one) => (one === stop ? { ...one, colour } : one)),
						}),
						phase,
					)
				}
			/>
		</div>
	);
}

/** A gradient at rest: its bar, its angle and how many stops it has. */
export function GradientPreview({ value }: { value: string }) {
	const gradient = parseGradient(value);
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<span
				aria-hidden="true"
				className="h-3.5 w-7 shrink-0 rounded-xs border border-line-strong"
				style={{ background: value }}
			/>
			{gradient === undefined ? null : (
				<>
					<span className="text-primary tabular-nums type-value">{trim(gradient.angle, 1)}°</span>
					<span className="truncate text-tertiary type-detail">{gradient.stops.length} stops</span>
				</>
			)}
		</span>
	);
}

/* ----------------------------------------------------------- choices -- */

interface ChoicesProps extends TuneProps<string> {
	options: readonly KnobChoice[];
}

/**
 * A select's list, as the menu family draws it, in a float the caller places
 * beside its row. Hover tries an option on; a press commits it.
 */
export function OptionList({ value, onTune, options }: ChoicesProps) {
	const choice = useTryOn({ value, onTune });
	return (
		<Menu role="listbox" onPointerLeave={choice.leave}>
			{options.map(optionOf).map((option) => (
				<MenuItem
					key={option.value}
					role="option"
					aria-selected={option.value === value}
					checked={option.value === value}
					label={option.label ?? option.value}
					onPointerEnter={() => choice.try(option.value)}
					onClick={() => choice.pick(option.value)}
				/>
			))}
		</Menu>
	);
}

/**
 * The options as pictures, three to a row, opened in place: pictures and
 * image knobs. Hover tries one on; a press commits it.
 */
export function PictureGrid({ value, onTune, options, disabled = false }: ChoicesProps) {
	const choice = useTryOn({ value, onTune });
	return (
		<div
			onPointerLeave={choice.leave}
			className={cn("grid grid-cols-3 gap-1.5", disabled && "pointer-events-none opacity-40")}
		>
			{options.map(optionOf).map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={option.value === value}
					onPointerEnter={() => choice.try(option.value)}
					onClick={() => choice.pick(option.value)}
					className="group/tile focus-ring flex min-w-0 flex-col gap-1 rounded-xs text-left"
				>
					<Thumbnail
						src={option.image}
						aria-selected={option.value === value}
						className="aspect-4/3 w-full group-hover/tile:border-line-strong"
					/>
					<span className="truncate text-secondary type-detail group-aria-pressed/tile:text-primary">
						{option.label ?? option.value}
					</span>
				</button>
			))}
		</div>
	);
}

/** A picture choice at rest: the chosen option's thumb and its name. */
export function PicturePreview({ value, options }: { value: string; options: readonly KnobChoice[] }) {
	const shown = options.map(optionOf).find((option) => option.value === value);
	return (
		<span className="flex min-w-0 items-center gap-1.5">
			<Thumbnail src={shown?.image} className="h-4 w-5.5" />
			<span className="truncate text-primary type-value">{shown?.label ?? shown?.value}</span>
		</span>
	);
}

/** the search over a popover list, and what it found */
function useFound(options: readonly KnobOption[], words: (option: KnobOption) => string) {
	const [query, setQuery] = useState("");
	const q = query.trim().toLowerCase();
	const found = q === "" ? options : options.filter((option) => words(option).toLowerCase().includes(q));
	const search = (
		<div className="shrink-0 p-1.5 pb-1">
			<SearchField size="sm" hotkey="" placeholder="Search" value={query} onValueChange={setQuery} />
		</div>
	);
	return { found, search };
}

/**
 * The icons as small glyphs in a float the caller places beside its row, a
 * search over them by name. Hover tries one on; a press commits it.
 */
export function IconGrid({ value, onTune, options }: ChoicesProps) {
	const choice = useTryOn({ value, onTune });
	const { found, search } = useFound(options.map(optionOf), (option) => `${option.value} ${option.label ?? ""}`);
	return (
		<Popover pad="none" className="w-rail overflow-hidden">
			{search}
			<ScrollArea className="h-48 px-1.5 pb-1.5" onPointerLeave={choice.leave}>
				<div className="grid grid-cols-6 gap-1">
					{found.map((option) => (
						<button
							key={option.value}
							type="button"
							aria-label={option.label ?? option.value}
							title={option.label ?? option.value}
							aria-pressed={option.value === value}
							onPointerEnter={() => choice.try(option.value)}
							onClick={() => choice.pick(option.value)}
							className={cn(
								"focus-ring flex aspect-square items-center justify-center rounded-sm text-secondary",
								"transition-colors duration-fast ease-out hover:bg-state-hover-raised hover:text-primary",
								"aria-pressed:bg-state-selected-strong aria-pressed:text-primary",
							)}
						>
							{option.image === undefined ? (
								<span className="truncate type-detail">{option.label ?? option.value}</span>
							) : (
								<img src={option.image} alt="" draggable={false} className="size-4.5 object-contain" />
							)}
						</button>
					))}
				</div>
			</ScrollArea>
		</Popover>
	);
}

/**
 * The families on offer, each name set in itself, in a float the caller
 * places beside its row, a search over them. Hover tries one on; a press
 * commits it.
 */
export function FontList({ value, onTune, options }: TuneProps<string> & { options: readonly string[] }) {
	const choice = useTryOn({ value, onTune });
	const { found, search } = useFound(
		options.map((name) => ({ value: name })),
		(option) => option.value,
	);
	return (
		<Popover pad="none" className="w-rail overflow-hidden">
			{search}
			<ScrollArea role="listbox" className="flex h-72 flex-col px-1 pb-1" onPointerLeave={choice.leave}>
				{found.map(({ value: name }) => (
					<button
						key={name}
						type="button"
						role="option"
						aria-selected={name === value}
						onPointerEnter={() => choice.try(name)}
						onClick={() => choice.pick(name)}
						className={cn(
							"focus-ring-inset flex h-row-roomy w-full shrink-0 items-center gap-2 rounded-sm pr-2 pl-2 text-left text-primary",
							"transition-colors duration-fast ease-out hover:bg-state-hover-raised",
						)}
					>
						<span className="flex size-3 shrink-0">
							{name === value ? <CheckIcon className="size-3" /> : null}
						</span>
						<span className="min-w-0 flex-1 truncate type-heading" style={{ fontFamily: name }}>
							{name}
						</span>
					</button>
				))}
			</ScrollArea>
		</Popover>
	);
}

/** A font at rest: its name, set in it. */
export function FontPreview({ value }: { value: string }) {
	return (
		<span className="truncate text-primary type-control" style={{ fontFamily: value }}>
			{value}
		</span>
	);
}

/**
 * The weights on offer and no others, each drawn in itself, opened in place.
 * Hover tries one on; a press commits it.
 */
export function WeightPicker({
	value,
	onTune,
	weights,
	disabled = false,
}: TuneProps<number> & { weights: readonly number[] }) {
	const choice = useTryOn({ value, onTune });
	return (
		<div
			onPointerLeave={choice.leave}
			className={cn(
				"grid h-14 auto-cols-fr grid-flow-col rounded-sm border border-line-default p-px",
				disabled && "pointer-events-none opacity-40",
			)}
		>
			{weights.map((weight) => (
				<button
					key={weight}
					type="button"
					aria-pressed={weight === value}
					onPointerEnter={() => choice.try(weight)}
					onClick={() => choice.pick(weight)}
					className={cn(
						"focus-ring flex min-w-0 flex-col items-center justify-center gap-1 rounded-xs text-secondary",
						"transition-colors duration-fast ease-out hover:bg-state-hover-raised hover:text-primary",
						"aria-pressed:bg-state-selected-strong aria-pressed:text-primary",
					)}
				>
					<span className="type-page" style={{ fontWeight: weight }}>
						Ag
					</span>
					<span className="tabular-nums type-detail">{weight}</span>
				</button>
			))}
		</div>
	);
}
