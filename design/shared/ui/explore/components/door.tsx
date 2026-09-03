import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "shared/lib/utils";
import { CARD_H, CARD_W, Scaled, TvarsoCheckout, type VariationId } from "shared/ui/demo/tvarso-checkout";
import { LibraryFace, TOKEN_COUNT, TVARSO_FILES, TVARSO_PAGES, TVARSO_PARTS } from "shared/ui/demo/tvarso-library";
import { FrameBody, LAID, RAIL_FRAMES, Rail, Tint } from "shared/ui/explore/components/library-frames";
import { CanvasChrome, type LitAs, type PageRow } from "shared/ui/spool/canvas-chrome";
import { ArrowIcon, FAINT, LABEL, VALUE } from "shared/ui/spool/properties-fields";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * The door to the library, in both directions
 * ([spool-cloud#32](https://github.com/liamvinberg/spool-cloud/issues/32)).
 *
 * Three takes share this file and differ in one thing: where the `library` row
 * stands in the pages rail. Each take has two states. The take itself is the
 * library page open, `Button` held, which is `library-frames` as decided. Its
 * `--held` state is the booking page with `Button` held inside `checkout`: the
 * reach rings the same button in every other frame on screen, the rail dots
 * every frame that renders it, the `library` row lights the way the finder
 * lights an owning page, and the origin line under the crumb is a button.
 * Press it and you are on the library page with `Button` held; `Esc` there
 * takes you back. That line already stands in the shipped rail
 * ([spool-cloud#30](https://github.com/liamvinberg/spool-cloud/issues/30)), so
 * the door costs no new surface.
 */

export type Where = "listed" | "head" | "foot";
type View = "library" | "booking";

const LIBRARY_ROW = { name: "library", frames: RAIL_FRAMES, face: <LibraryFace /> } as const;

/** the rail with the library row where the take puts it */
function pagesFor(where: Where, view: View, litAs: LitAs): readonly PageRow[] {
	const onLibrary = view === "library";
	const library: PageRow = {
		...LIBRARY_ROW,
		active: onLibrary,
		open: onLibrary,
		lit: !onLibrary,
		litAs,
		...(where === "head" ? { ruled: true } : {}),
		...(where === "foot" ? { foot: true } : {}),
	};
	const pages: PageRow[] = TVARSO_PAGES.map((page) => ({
		name: page.name,
		frames: page.frames,
		active: !onLibrary && page.name === "booking",
		open: !onLibrary && page.name === "booking",
	}));
	return where === "head" ? [library, ...pages] : [...pages, library];
}

const BUTTON = TVARSO_FILES.flatMap((file) => file.parts).find((part) => part.name === "Button");
const RENDERS = BUTTON?.used ?? [];

export function DoorCanvas({ where, start, litAs = "surface" }: { where: Where; start: View; litAs?: LitAs }) {
	const [view, setView] = useState<View>(start);

	useEffect(() => {
		if (view !== "library" || start !== "booking") return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setView("booking");
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [view, start]);

	const pages = pagesFor(where, view, litAs);
	return view === "library" ? <LibraryView pages={pages} /> : <BookingView pages={pages} onDoor={() => setView("library")} />;
}

/* ---------- the library page, Button held ---------- */

const K = 0.66;

function LibraryView({ pages }: { pages: readonly PageRow[] }) {
	const held = LAID.frames.find((frame) => frame.id === "Button") ?? null;
	const none = () => {};
	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom={`${Math.round(K * 100)}%`}>
			<CanvasChrome pages={pages} selected="Button" tool="select" rail={<Rail frame={held} />}>
				<div className="relative h-full w-full overflow-clip">
					<div
						className="absolute top-0 left-0 h-0 w-0"
						style={{ transform: `translate(32px, 96px) scale(${K})`, transformOrigin: "0 0", "--ik": 1 / K } as React.CSSProperties}
					>
						{LAID.families.map((family) => (
							<Tint key={family.file} family={family} />
						))}
						{LAID.frames.map((frame) => (
							<FrameBody
								key={frame.id}
								frame={frame}
								k={K}
								held={frame.id === "Button"}
								over={false}
								onDown={none}
								onOver={none}
								onOut={none}
							/>
						))}
					</div>
					<span className="pointer-events-none absolute top-6 left-8 flex items-baseline gap-2 font-mono text-base text-text/70 leading-base">
						src/ui
						<span className="text-2xs text-muted/40 leading-3">
							{TVARSO_PARTS} components · {TOKEN_COUNT} tokens
						</span>
					</span>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/* ---------- the booking page, Button held inside checkout ---------- */

const SCALE = 0.46;
const GAP = 36;
const TOP = 112;
const LEFT = 38;

const ON_CANVAS: readonly { name: string; variation: VariationId }[] = [
	{ name: "checkout", variation: "card" },
	{ name: "checkout--swish", variation: "swish" },
	{ name: "checkout--invoice", variation: "invoice" },
	{ name: "checkout--empty", variation: "empty" },
];

const HELD = "checkout";

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

function BookingView({ pages, onDoor }: { pages: readonly PageRow[]; onDoor: () => void }) {
	const field = useRef<HTMLDivElement>(null);
	const buttons = useRef(new Map<string, HTMLElement>());
	const [rects, setRects] = useState<ReadonlyMap<string, Rect>>(new Map());

	const measure = useCallback(() => {
		const root = field.current;
		if (root === null) return;
		const origin = root.getBoundingClientRect();
		const next = new Map<string, Rect>();
		for (const [name, el] of buttons.current) {
			const rect = el.getBoundingClientRect();
			next.set(name, { x: rect.left - origin.left, y: rect.top - origin.top, w: rect.width, h: rect.height });
		}
		setRects(next);
	}, []);

	useLayoutEffect(() => {
		measure();
		const root = field.current;
		if (root === null) return;
		const watcher = new ResizeObserver(measure);
		watcher.observe(root);
		return () => watcher.disconnect();
	}, [measure]);

	const onScreen = rects.size;

	return (
		<SpoolShell activeTab="tvarso" tabs={["tvarso"]} zoom={`${Math.round(SCALE * 100)}%`}>
			<CanvasChrome
				pages={pages}
				selected={HELD}
				tool="select"
				holding={RENDERS}
				rail={<DoorRail onScreen={onScreen} onDoor={onDoor} />}
			>
				<div ref={field} className="relative h-full w-full overflow-clip">
					{ON_CANVAS.map((frame, index) => {
						const held = frame.name === HELD;
						return (
							<div
								key={frame.name}
								className="absolute flex flex-col gap-1.5"
								style={{ left: LEFT + index * (CARD_W * SCALE + GAP), top: TOP }}
							>
								<span className={cn("font-mono text-sm leading-4", held ? "text-thread" : "text-muted")}>{frame.name}</span>
								<div className="relative">
									<Scaled scale={SCALE} className="rounded-md">
										<Probe
											name={frame.name}
											onButton={(el) => {
												if (el === null) buttons.current.delete(frame.name);
												else buttons.current.set(frame.name, el);
											}}
										>
											<TvarsoCheckout variation={frame.variation} />
										</Probe>
									</Scaled>
									{held ? <span className="pointer-events-none absolute -inset-px rounded-[7px] border border-thread/70" /> : null}
								</div>
							</div>
						);
					})}

					{/* the marks, drawn in the viewport so they are 1px whatever the frame's scale */}
					{[...rects.entries()].map(([name, rect]) =>
						name === HELD ? <Held key={name} rect={rect} /> : <Reach key={name} rect={rect} />,
					)}
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/** finds the one button in a demo card and hands it up, so the ring lands on the element and not the frame */
function Probe({ name, onButton, children }: { name: string; onButton: (el: HTMLElement | null) => void; children: ReactNode }) {
	const box = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const root = box.current;
		if (root === null) return;
		onButton(root.querySelector("button"));
		return () => onButton(null);
	}, [onButton]);
	return (
		<div ref={box} data-probe={name} className="contents">
			{children}
		</div>
	);
}

/** the held element: the selection ring and its handles, the canvas's own */
function Held({ rect }: { rect: Rect }) {
	const grown = { x: rect.x - 2, y: rect.y - 2, w: rect.w + 4, h: rect.h + 4 };
	return (
		<div className="pointer-events-none absolute" style={{ left: grown.x, top: grown.y, width: grown.w, height: grown.h }}>
			<span className="absolute inset-0 rounded-[3px] border border-thread" />
			{[
				["-left-[3px]", "-top-[3px]"],
				["-right-[3px]", "-top-[3px]"],
				["-left-[3px]", "-bottom-[3px]"],
				["-right-[3px]", "-bottom-[3px]"],
			].map(([x, y]) => (
				<span key={`${x}${y}`} className={cn("absolute h-[6px] w-[6px] rounded-[1px] border border-thread bg-bg", x, y)} />
			))}
			<span className="absolute bottom-full left-0 whitespace-nowrap pb-1 font-mono text-2xs text-thread leading-3">Button</span>
		</div>
	);
}

/** the same element in another frame on screen: the reach mark from spool-cloud#30 */
function Reach({ rect }: { rect: Rect }) {
	return (
		<span
			className="pointer-events-none absolute rounded-[3px] border border-thread/70"
			style={{ left: rect.x - 2, top: rect.y - 2, width: rect.w + 4, height: rect.h + 4 }}
		/>
	);
}

/* ---------- the rail, with the door under the crumb ---------- */

const CRUMB: readonly { name: string; shared?: boolean }[] = [
	{ name: "checkout" },
	{ name: "PayBar" },
	{ name: "Button", shared: true },
];

function DoorRail({ onScreen, onDoor }: { onScreen: number; onDoor: () => void }) {
	return (
		<div className="flex h-full min-h-0 flex-col bg-bg">
			<div className="flex h-9 shrink-0 items-center gap-1 border-border border-b px-2.5">
				{CRUMB.map((step, index) => (
					<span key={step.name} className="flex min-w-0 items-center gap-1">
						{index === 0 ? null : <span className="text-muted/40">/</span>}
						<span className={cn("truncate", VALUE, step.shared === true ? "text-thread" : index === CRUMB.length - 1 ? "text-text" : "text-muted")}>
							{step.name}
						</span>
					</span>
				))}
			</div>

			{/* the origin line the shipped rail already says, now a button: press it and you are on the library page with Button held */}
			<div className="flex flex-col border-border border-b px-1.5 py-1.5">
				<button
					type="button"
					onClick={onDoor}
					className={cn(
						"group flex h-7 w-full cursor-pointer items-center gap-2 rounded-xs px-1 text-left transition-colors duration-150 hover:bg-surface",
					)}
				>
					<span className={cn("min-w-0 flex-1 truncate text-text", VALUE)}>src/ui/button.tsx:12</span>
					<span className="flex items-center text-muted/60 transition-colors group-hover:text-text">
						<ArrowIcon />
					</span>
				</button>
				<span className={cn("px-1 pt-0.5", FAINT)}>
					rendered by {RENDERS.length} frames · {onScreen} on screen
				</span>
			</div>

			{/* the fields, as the shipped rail draws them; nothing here is new */}
			<Stub name="text" reason="button.tsx">
				<StubRow name="label" value="Pay 128 kr" />
			</Stub>
			<Stub name="colour" reason="tokens.css">
				<StubRow name="bg" value="sea" swatch="#0F5D4A" />
				<StubRow name="text" value="paper" swatch="#FBFBF9" />
			</Stub>
			<Stub name="size">
				<StubRow name="h" value="44" unit="px" />
				<StubRow name="radius" value="10" unit="px" />
			</Stub>
		</div>
	);
}

function Stub({ name, reason, children }: { name: string; reason?: string; children: ReactNode }) {
	return (
		<div className="border-border-raised border-t">
			<div className="flex h-6 items-center gap-2 px-2.5">
				<span className={cn("shrink-0 text-muted/70", LABEL)}>{name}</span>
				{reason === undefined ? null : <span className={cn("ml-auto min-w-0 truncate", FAINT)}>{reason}</span>}
			</div>
			<div className="flex flex-col pb-1.5">{children}</div>
		</div>
	);
}

function StubRow({ name, value, unit, swatch }: { name: string; value: string; unit?: string; swatch?: string }) {
	return (
		<div className="flex h-7 items-center gap-2 px-2.5">
			<span className={cn("w-14 shrink-0 text-muted", LABEL)}>{name}</span>
			<span className="flex min-w-0 flex-1 items-center gap-2 rounded-xs border border-transparent px-1.5 hover:border-border hover:bg-surface">
				{swatch === undefined ? null : <span className="h-3 w-3 shrink-0 rounded-[2px] border border-border-raised" style={{ background: swatch }} />}
				<span className={cn("truncate text-text", VALUE)}>{value}</span>
				{unit === undefined ? null : <span className={cn("ml-auto", FAINT)}>{unit}</span>}
			</span>
		</div>
	);
}
