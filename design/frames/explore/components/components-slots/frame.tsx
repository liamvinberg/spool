import { CanvasChrome, type PageRow } from "shared/ui/spool/canvas-chrome";
import {
	BARE,
	ComponentFace,
	DEMOS,
	type Demo,
	FILES,
	Slot,
	Specimen,
	demosOf,
	fitScale,
} from "shared/ui/explore/components/components";
import { SpoolShell } from "shared/ui/spool/shell";

/**
 * An exploration of the components page as a field, with the holes left in it (#189).
 *
 * The argument: **this is a canvas, so a specimen sits on the ground at its own
 * size and a file with nothing to draw keeps its place anyway.** The other two
 * takes put the un-exampled files somewhere else — a manifest, a paragraph — and
 * both of them make twenty missing pictures easy to not look at. Here the missing
 * picture is a box the size of the picture, in folder order, saying the one file
 * that would fill it. Fourteen filled against twenty empty is the honest shape of
 * this library, and it is the whole reason to have the page at all.
 *
 * So this is also the sparse state, undramatised: no illustration, no call to
 * action, no plate over the middle of the screen. The instruction is written
 * twenty times because there are twenty places it applies, each one naming its own
 * file, and it disappears one slot at a time as demos get written. A project with
 * nothing at all in `shared/ui/` draws the same field with no cells in it and the
 * one mono line at the top saying `0 files`.
 *
 * The rail marking: the row is **docked against the bottom of the rail**, under a
 * hairline, below the list rather than in it. The pages above are folders you write
 * frames into; this one is a readout of what is already there, and the bottom of a
 * panel is where this product already keeps readouts. It still takes the thread
 * spine when it is what you are looking at, and it still counts what it holds.
 *
 * True size until the field says no. Nothing is normalised: `Caret` is eight
 * pixels wide here because it is eight pixels wide, and `SpoolEmptyScreen` is a
 * whole 1440 screen scaled with the percentage said out loud, the way the canvas
 * says its zoom.
 */

/**
 * The field packs into columns rather than rows, and that is forced rather than
 * chosen: a row of cells all as tall as the tallest one puts a 14px `ThreadMark`
 * at the bottom of 460px of nothing. Columns close the gaps, and reading a folder
 * down a column before across is the order a file list is read in anyway.
 */
const COLS = 4;
const CELL = 185;
const CELL_H = 360;

const PAGES: readonly PageRow[] = [
	{ name: "app", frames: ["menu", "cart", "receipt"] },
	{ name: "site", frames: [] },
	{ name: "directing", frames: [] },
	{
		name: "components",
		frames: FILES.map((file) => file.name),
		active: true,
		face: <ComponentFace />,
		foot: true,
	},
];

export default function SpoolComponentsSlotsFrame() {
	return (
		<SpoolShell activeTab="spool" tabs={["kaffe", "spool"]} zoom="100%">
			<CanvasChrome pages={PAGES} tool="hand">
				<div className="h-full w-full overflow-clip px-7 pt-6">
					<div className="flex items-baseline gap-3 pb-6">
						<span className="font-mono text-sm text-text leading-sm">shared/ui</span>
						<span className="font-mono text-2xs text-muted/45 leading-3">
							{FILES.length} files · {DEMOS.length} demos · {BARE.length} slots · read only
						</span>
					</div>
					<div style={{ columnCount: COLS, columnGap: 32 }}>
						{FILES.map((file) => {
							const demos = demosOf(file.name);
							if (demos.length === 0) return <SlotCell key={file.name} file={file.name} />;
							return demos.map((demo, index) => (
								<DemoCell key={`${file.name}-${index}`} demo={demo} />
							));
						})}
					</div>
				</div>
			</CanvasChrome>
		</SpoolShell>
	);
}

/**
 * One demo, drawn the way a frame is drawn out on the field: its name on a mono
 * line above it, and then the thing itself on the canvas with nothing around it.
 * No well and no card, because a specimen on a canvas is not an entry in a
 * catalogue — it is the component, standing where you can see it.
 */
function DemoCell({ demo }: { demo: Demo }) {
	const scale = fitScale(demo, CELL, CELL_H);
	return (
		<div className="mb-8 flex break-inside-avoid flex-col gap-2">
			{/* the scale rides in the name line rather than over the specimen: with no
			    well under it, a readout in the corner lands on the component itself, and
			    half these components have a readout of their own in that exact corner */}
			<div className="flex min-w-0 items-baseline gap-1.5 font-mono leading-4">
				<span className="shrink-0 text-sm text-text leading-sm">{demo.of}</span>
				<span className="min-w-0 truncate text-2xs text-muted/45 leading-3">{demo.example}</span>
				{scale === 1 ? null : (
					<span className="ml-auto shrink-0 text-2xs text-muted/30 leading-3">{Math.round(scale * 100)}%</span>
				)}
			</div>
			<Specimen demo={demo} box={CELL} tall={Math.round(demo.h * scale)} readout="off" />
		</div>
	);
}

function SlotCell({ file }: { file: string }) {
	return (
		<div className="mb-8 flex break-inside-avoid flex-col gap-2">
			<span className="truncate font-mono text-sm text-muted/40 leading-sm">{file}</span>
			<Slot file={file} tall={96} />
		</div>
	);
}
