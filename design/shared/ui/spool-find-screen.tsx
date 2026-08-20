import { useState } from "react";
import { FRAMES, type FrameRow, pageCounts } from "../lib/frame-find";
import type { Mark } from "../lib/unseen-model";
import { cn } from "../lib/utils";
import { CanvasChrome, type PageRow } from "./spool-canvas-chrome";
import { type FindRows, FindPalette } from "./spool-find-palette";
import { SpoolShell } from "./spool-shell";

/**
 * `spool-canvas` again, with one thing changed: the project open in it is spool's
 * own `design/` canvas, and `/` has been pressed.
 *
 * The project had to change with the proposal. A palette that filters 88 frames
 * cannot be argued over a project with three, and the Pages rail is the whole
 * problem statement once it is drawn honestly: `agent` is one collapsed row
 * reading `55`, sorted alphabetically (`src/daemon/projection.ts:218-220`), and the
 * frame you want is somewhere inside it.
 *
 * The field behind the scrim is the real `app` page at 24%: the same six frames at
 * the same coordinates their `frame.json` files carry, plus the row of
 * `spool-canvas--find-*` along the bottom, which is these frames. Threads are
 * toggled off, so nothing is missing.
 *
 * The scrim stops at the rails on purpose. It covers the canvas because the canvas
 * is what Enter is about to move, and it leaves the Pages rail at full strength
 * because the rail is answering at the same time: the page holding the picked row
 * lights as you arrow, which is `PageRow.lit`, already built for something outside
 * that rail pointing at one of its rows.
 *
 * Nothing is selected, so the Inspector says so. Pressing `/` is not something you
 * do to a selection.
 */

interface Plate {
	readonly name: string;
	readonly shape: "canvas" | "empty" | "page" | "player";
	/** the frame's own x, y, w and h, scaled by the 24% the zoom readout claims */
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

/** where the camera happens to be, in the same scaled units */
const CAMERA = { x: -40, y: 60 };

const FIELD: readonly Plate[] = [
	{ name: "spool-home", shape: "page", x: 0, y: -42, w: 346, h: 300 },
	{ name: "spool-canvas", shape: "canvas", x: 418, y: 0, w: 346, h: 216 },
	{ name: "spool-player", shape: "player", x: 835, y: 0, w: 346, h: 216 },
	{ name: "spool-empty-project", shape: "empty", x: 0, y: 312, w: 346, h: 216 },
	{ name: "spool-canvas--menu", shape: "canvas", x: 418, y: 312, w: 346, h: 216 },
	{ name: "spool-system", shape: "page", x: 835, y: 312, w: 326, h: 334 },
	{ name: "spool-canvas--find-dim", shape: "canvas", x: 0, y: 624, w: 346, h: 216 },
	{ name: "spool-canvas--find-tail", shape: "canvas", x: 418, y: 624, w: 346, h: 216 },
	{ name: "spool-canvas--find-split", shape: "canvas", x: 835, y: 624, w: 346, h: 216 },
];

/** the frames of one page, as the rail sorts them (`projection.ts:218`) */
function framesOn(page: string): readonly string[] {
	return FRAMES.filter((row) => row.page === page)
		.map((row) => row.name)
		.sort((a, b) => a.localeCompare(b));
}

/** the unseen frames of one page, so the rail and the palette read the same record */
function unseenOn(unseen: Readonly<Record<string, Mark>>, page: string): Record<string, Mark> {
	const mine: Record<string, Mark> = {};
	for (const row of FRAMES) {
		const mark = unseen[row.name];
		if (row.page === page && mark !== undefined) mine[row.name] = mark;
	}
	return mine;
}

export function SpoolFindScreen({
	rows,
	query,
	homeTarget,
	unseen,
}: {
	rows: FindRows;
	query?: string | undefined;
	/** the brand lockup's walk, named by the frame so the graph reads it as a literal */
	homeTarget?: string | undefined;
	/** frames nobody has looked at, shown in both the palette and the rail behind it */
	unseen?: Readonly<Record<string, Mark>> | undefined;
}) {
	const [pick, setPick] = useState<FrameRow | null>(null);

	const pages: readonly PageRow[] = pageCounts().map(({ page }) => ({
		name: page,
		frames: framesOn(page),
		active: page === "app",
		open: page === "app",
		lit: pick?.page === page,
		unseen: unseen === undefined ? undefined : unseenOn(unseen, page),
	}));

	return (
		<SpoolShell activeTab="spool" tabs={["kaffe", "spool"]} homeTarget={homeTarget} zoom="24%" arrowsOn={false}>
			<CanvasChrome pages={pages} tool="select">
				{FIELD.map((plate) => (
					<Miniature key={plate.name} plate={plate} />
				))}
				<FindPalette rows={rows} query={query} onPick={setPick} unseen={unseen} />
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * One frame on the field at 24%, which for a spool screen is a bar, two rails and
 * whatever is between them. Four shapes cover the `app` page and nothing here
 * pretends to be a screenshot: this is what a frame looks like when it is a
 * quarter of its size and behind a scrim.
 */
function Miniature({ plate }: { plate: Plate }) {
	return (
		<div className="absolute flex flex-col gap-1" style={{ left: plate.x + CAMERA.x, top: plate.y + CAMERA.y }}>
			<span className="truncate font-mono text-2xs text-muted/45 leading-3" style={{ width: plate.w }}>
				{plate.name}
			</span>
			<div
				className="flex flex-col overflow-hidden rounded-md border border-border-raised bg-surface"
				style={{ width: plate.w, height: plate.h }}
			>
				<div className="h-[5%] shrink-0 border-border-raised border-b bg-raised" />
				{plate.shape === "page" ? (
					<div className="flex min-h-0 flex-1 flex-col gap-[6px] px-[11%] pt-[9%]">
						{[0, 1, 2, 3].map((row) => (
							<div key={row} className="h-[9px] shrink-0 rounded-xs bg-raised" />
						))}
					</div>
				) : (
					<div className="flex min-h-0 flex-1">
						<div className="w-[17%] shrink-0 border-border-raised border-r bg-raised" />
						<div className="relative min-w-0 flex-1">
							{plate.shape === "canvas" ? (
								<>
									<Pane className="top-[14%] left-[9%] h-[50%] w-[26%]" />
									<Pane className="top-[26%] left-[45%] h-[50%] w-[26%]" />
								</>
							) : plate.shape === "player" ? (
								<Pane className="top-[12%] left-[35%] h-[70%] w-[30%]" />
							) : (
								<Pane className="top-[38%] left-[28%] h-[16%] w-[44%]" />
							)}
						</div>
						<div className="w-[21%] shrink-0 border-border-raised border-l bg-raised" />
					</div>
				)}
			</div>
		</div>
	);
}

function Pane({ className }: { className: string }) {
	return <div className={cn("absolute rounded-xs border border-border-raised bg-raised", className)} />;
}
