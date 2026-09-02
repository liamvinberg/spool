import { cn } from "shared/lib/utils";
import { CanvasChrome, type PageRow } from "shared/ui/spool-canvas-chrome";
import { INK, LINE, MUTED, PAPER } from "shared/ui/tvarso-checkout";
import {
	ICONS,
	type LibPart,
	LibraryFace,
	TOKEN_COUNT,
	TVARSO_FILES,
	TVARSO_PAGES,
	TVARSO_PARTS,
	TVARSO_TOKENS,
	Well,
} from "shared/ui/tvarso-library";
import { SpoolShell } from "shared/ui/spool-shell";

/**
 * Shape C read as a field: the same claim, on a canvas instead of a page
 * ([spool-cloud#29](https://github.com/liamvinberg/spool-cloud/issues/29)).
 *
 * **The component is the unit, so the component is the object.** Twenty three of
 * them lie loose on the library's own canvas, each one drawn at the size it
 * actually is, with its name and its count under it. Nothing is in a list and
 * nothing is in a box, so nothing has to be given an order: `Card` is bigger
 * than `Badge` here because it is bigger than `Badge`.
 *
 * **The file is proximity.** A file that exports one component leaves no trace
 * beyond the grey filename under it, which is what a one-export file deserves.
 * A file that exports several is a huddle: `checkout-parts.tsx` sits as five
 * things within reach of each other and `icons.tsx` as ten small ones, each
 * hugging a barely-there tint with the file's name in the corner. Move a member
 * out of the tint and it is still that file's, so the tint is a reading of the
 * folder and never a container you can drop into.
 *
 * **Tokens are not components, so they are one object.** Everything else on this
 * field is a thing a frame renders; a token is a thing a component reads. It
 * lands as one sheet of Tvärsö's paper, the whole of `tokens.css` on it, rather
 * than as sixteen loose chips pretending to be components.
 *
 * `Button` is held: the ring and the four handles are the canvas's own, because
 * on a field the answer to "can I move this" has to be the answer the canvas
 * already gives. The hand tool is up for the same reason.
 */

const HELD = "Button";
const HOVERED = "Card";

const PAGES: readonly PageRow[] = [
	...TVARSO_PAGES.map((page) => ({ name: page.name, frames: page.frames })),
	{
		name: "library",
		frames: TVARSO_FILES.map((file) => file.file).concat("tokens.css"),
		active: true,
		open: true,
		face: <LibraryFace />,
	},
];

/* ---------- what the field holds ---------- */

const PARTS = new Map(TVARSO_FILES.flatMap((file) => file.parts.map((part) => [part.name, part] as const)));

function part(name: string): LibPart {
	const found = PARTS.get(name);
	if (found === undefined) throw new Error(`no component named ${name}`);
	return found;
}

interface Placed {
	readonly name: string;
	/** the file, drawn under the name only where the file is invisible otherwise */
	readonly file?: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** the eight one-export files, spread over the left of the field */
const LOOSE: readonly Placed[] = [
	{ name: "Button", file: "button.tsx", x: 48, y: 88, w: 252, h: 64 },
	{ name: "Card", file: "card.tsx", x: 330, y: 70, w: 212, h: 134 },
	{ name: "TextField", file: "text-field.tsx", x: 60, y: 232, w: 222, h: 88 },
	{ name: "Badge", file: "badge.tsx", x: 318, y: 268, w: 244, h: 58 },
	{ name: "Avatar", file: "avatar.tsx", x: 46, y: 424, w: 152, h: 64 },
	{ name: "Checkbox", file: "checkbox.tsx", x: 300, y: 438, w: 202, h: 80 },
	{ name: "PriceRow", file: "price-row.tsx", x: 52, y: 622, w: 238, h: 84 },
	{ name: "Notice", file: "notice.tsx", x: 298, y: 630, w: 252, h: 98 },
];

/** checkout-parts.tsx, five things within reach of each other */
const HUDDLE: readonly Placed[] = [
	{ name: "Masthead", x: 598, y: 92, w: 258, h: 60 },
	{ name: "TripRow", x: 584, y: 196, w: 258, h: 78 },
	{ name: "LineItems", x: 612, y: 314, w: 236, h: 80 },
	{ name: "TotalRow", x: 592, y: 434, w: 222, h: 50 },
	{ name: "PayBar", x: 604, y: 536, w: 258, h: 106 },
];

/** icons.tsx, ten small ones */
const CONSTELLATION: readonly { x: number; y: number }[] = [
	{ x: 928, y: 92 },
	{ x: 1010, y: 86 },
	{ x: 1080, y: 96 },
	{ x: 922, y: 172 },
	{ x: 1004, y: 178 },
	{ x: 1076, y: 166 },
	{ x: 934, y: 250 },
	{ x: 1012, y: 244 },
	{ x: 1082, y: 256 },
	{ x: 1010, y: 328 },
];

export default function LibraryFieldFrame() {
	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom="68%">
			<CanvasChrome pages={PAGES} tool="hand" rail={null} railWidth={0}>
				<div className="relative h-full w-full overflow-clip">
					<Tint x={562} y={56} w={336} h={630} label="checkout-parts.tsx" count={5} />
					<Tint x={912} y={56} w={264} h={356} label="icons.tsx" count={10} />

					<div className="absolute top-7 left-10 flex items-baseline gap-3">
						<span className="font-mono text-base text-text/80 leading-base">src/ui</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">
							{TVARSO_PARTS} components · {TOKEN_COUNT} tokens
						</span>
					</div>

					{LOOSE.map((placed) => (
						<LooseObject key={placed.name} placed={placed} />
					))}
					{HUDDLE.map((placed) => (
						<LooseObject key={placed.name} placed={placed} />
					))}
					{ICONS.map((icon, index) => (
						<IconObject key={icon.name} icon={icon} at={CONSTELLATION[index]!} />
					))}
					<TokenSheet />
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- the file, as a place rather than a container ---------- */

function Tint({ x, y, w, h, label, count }: { x: number; y: number; w: number; h: number; label: string; count: number }) {
	return (
		<div
			className="absolute"
			style={{ left: x, top: y, width: w, height: h, background: "rgba(255,255,255,0.022)", borderRadius: 26 }}
		>
			<div className="flex items-baseline gap-2 pt-2.5 pl-4">
				<span className="font-mono text-2xs text-muted/50 leading-3">{label}</span>
				<span className="font-mono text-2xs text-muted/25 leading-3">{count}</span>
			</div>
		</div>
	);
}

/* ---------- one component, loose ---------- */

function LooseObject({ placed }: { placed: Placed }) {
	const drawn = part(placed.name);
	const held = placed.name === HELD;
	const hovered = placed.name === HOVERED;
	return (
		<div className="absolute" style={{ left: placed.x, top: placed.y, width: placed.w }}>
			<div className="relative">
				<Well part={drawn} width={placed.w} height={placed.h} scaleReadout={false} />
				{hovered ? (
					<span className="pointer-events-none absolute inset-[-4px] rounded-lg border border-border-raised" />
				) : null}
				{held ? <Held /> : null}
			</div>
			<div className="flex items-baseline gap-2 pt-2">
				<span className={cn("font-mono text-sm leading-sm", held ? "text-text" : "text-text/90")}>
					{placed.name}
				</span>
				{placed.file === undefined ? null : (
					<span className="font-mono text-2xs text-muted/35 leading-3">{placed.file}</span>
				)}
				<span className="ml-auto shrink-0 font-mono text-2xs text-muted/55 leading-3">{drawn.frames}</span>
			</div>
		</div>
	);
}

/** the canvas's own answer to "can I move this": a ring and four handles */
function Held() {
	return (
		<span className="pointer-events-none absolute inset-[-6px]">
			<span className="absolute inset-0 rounded-[10px] border border-thread" />
			{[
				{ left: -4, top: -4 },
				{ right: -4, top: -4 },
				{ left: -4, bottom: -4 },
				{ right: -4, bottom: -4 },
			].map((corner, index) => (
				<span
					key={index}
					className="absolute h-[7px] w-[7px] rounded-[2px] border border-thread bg-bg"
					style={corner}
				/>
			))}
		</span>
	);
}

/* ---------- one icon, loose ---------- */

function IconObject({ icon, at }: { icon: (typeof ICONS)[number]; at: { x: number; y: number } }) {
	return (
		<div className="absolute" style={{ left: at.x, top: at.y }}>
			<div
				className="flex h-[46px] w-[46px] items-center justify-center rounded-md border"
				style={{ background: PAPER, borderColor: LINE, color: INK }}
			>
				<icon.Icon className="h-5 w-5" />
			</div>
			<div className="flex items-baseline gap-1.5 whitespace-nowrap pt-1.5">
				<span className="font-mono text-2xs text-text/85 leading-3">{icon.name}</span>
				<span className="font-mono text-2xs text-muted/45 leading-3">{icon.frames}</span>
			</div>
		</div>
	);
}

/* ---------- tokens.css, one object ---------- */

const SHEET_X = 912;
const SHEET_Y = 448;
const SHEET_W = 264;
const SHEET_H = 306;

function TokenSheet() {
	const colour = TVARSO_TOKENS.find((group) => group.kind === "colour")!;
	const type = TVARSO_TOKENS.find((group) => group.kind === "type")!;
	const radius = TVARSO_TOKENS.find((group) => group.kind === "radius")!;
	const space = TVARSO_TOKENS.find((group) => group.kind === "space")!;
	return (
		<div className="absolute" style={{ left: SHEET_X, top: SHEET_Y, width: SHEET_W }}>
			<div
				className="flex flex-col gap-3 overflow-clip rounded-md border p-3.5 font-[Instrument_Sans] antialiased"
				style={{ width: SHEET_W, height: SHEET_H, background: PAPER, borderColor: LINE, color: INK }}
			>
				<div className="flex flex-col gap-1.5">
					{colour.tokens.map((token) => (
						<div key={token.name} className="flex items-center gap-2.5">
							<span
								className="h-[18px] w-[18px] shrink-0 rounded-[4px] border"
								style={{ background: token.swatch, borderColor: LINE }}
							/>
							<span className="flex-1 text-[12px] leading-none">{token.name}</span>
							<span className="text-[11px] leading-none" style={{ color: MUTED }}>
								{token.value}
							</span>
							<span className="w-4 text-right text-[11px] leading-none" style={{ color: MUTED }}>
								{token.used}
							</span>
						</div>
					))}
				</div>
				<div className="h-px w-full shrink-0" style={{ background: LINE }} />
				<div className="flex flex-col gap-2">
					{type.tokens.slice(0, 3).map((token) => (
						<div key={token.name} className="flex items-baseline gap-2.5">
							<span className="flex-1 truncate leading-none" style={{ fontSize: sampleSize(token) }}>
								{token.sample}
							</span>
							<span className="text-[11px] leading-none" style={{ color: MUTED }}>
								{token.value}
							</span>
						</div>
					))}
				</div>
				<div className="h-px w-full shrink-0" style={{ background: LINE }} />
				<div className="flex items-center gap-3">
					{radius.tokens.map((token) => (
						<span
							key={token.name}
							className="h-[26px] w-[26px] shrink-0 border"
							style={{
								borderColor: LINE,
								background: PAPER,
								borderRadius: `${Math.min(26, token.radius ?? 4)}px 0 0 0`,
							}}
						/>
					))}
					<span className="ml-auto flex items-center gap-3">
						{space.tokens.map((token) => (
							<span key={token.name} className="flex items-center" style={{ gap: token.gap }}>
								<span className="h-[13px] w-[4px] rounded-[1px]" style={{ background: MUTED }} />
								<span className="h-[13px] w-[4px] rounded-[1px]" style={{ background: MUTED }} />
							</span>
						))}
					</span>
				</div>
			</div>
			<div className="flex items-baseline gap-2 pt-2">
				<span className="font-mono text-sm text-text/90 leading-sm">tokens.css</span>
				<span className="ml-auto shrink-0 font-mono text-2xs text-muted/55 leading-3">{TOKEN_COUNT}</span>
			</div>
		</div>
	);
}

function sampleSize(token: { value: string }): number {
	const parsed = Number.parseInt(token.value, 10);
	return Number.isNaN(parsed) ? 13 : Math.min(16, parsed);
}
